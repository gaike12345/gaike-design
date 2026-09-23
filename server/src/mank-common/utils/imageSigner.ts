/**
 * 图片 URL 签名/验签模块
 * 从 routes/image.ts 提取，消除 comic.ts → image.ts 跨路由导入
 *
 * v3: 无状态长时效签名（当前主路径）
 *   目标 URL base64url 编码进 query（r 参数）+ HMAC 验签，无服务端映射、无 TTL，
 *   服务器重启 / 长时间后签名仍有效；超长 URL（编码后 > 6000 字符）降级为短 ID 模式
 * v2: 短 ID 映射方案 —— 内存映射 + 2h TTL，重启/过期后历史图片全部失效（已废弃为主路径）
 */

import { createHmac, randomBytes } from 'crypto'

// 安全硬校验：所有环境必须配置图片签名密钥，禁止使用默认值
// 默认密钥公开后攻击者可伪造签名 URL，绕过 ALLOWED_HOSTS 白名单发动 SSRF
const IMAGE_SIGNING_SECRET = process.env.IMAGE_SIGNING_SECRET
if (!IMAGE_SIGNING_SECRET || IMAGE_SIGNING_SECRET.length < 16) {
  console.error('[FATAL] IMAGE_SIGNING_SECRET 环境变量未设置或长度不足 (最小 16 字符)')
  console.error('[FATAL] 请在 server/.env 中设置 IMAGE_SIGNING_SECRET=<随机强密钥>')
  process.exit(1)
}
const SIGNING_SECRET = IMAGE_SIGNING_SECRET
// 旧 Base64 兼容模式的短时效 TTL（历史存量签名）
const SIGN_TTL_MS = 2 * 60 * 60 * 1000
// 无状态签名 URL 最大长度：超过则降级为短 ID 模式（避免请求行超长触发 431）
const STATELESS_URL_MAX_CHARS = 6000
// 短 ID 降级模式的兜底 TTL（仅超长 URL 使用，依赖进程内存，重启后失效）
const FALLBACK_ID_TTL_MS = 7 * 24 * 60 * 60 * 1000

const ALLOWED_HOSTS = [
  'gen.pollinations.ai',
  'image.pollinations.ai',
  'video.pollinations.ai',
  'dashscope.aliyuncs.com',
  'dashscope-result.oss-cn-beijing.aliyuncs.com',
  'dashscope-result.oss-cn-hangzhou.aliyuncs.com',
]

// 安全：额外的白名单后缀（仅允许已知的阿里云 OSS region，防止任意 bucket 通配）
// 攻击者可注册自己的 OSS bucket 存放恶意图片，绕过白名单做 SSRF 探测
const ALLOWED_OSS_SUFFIXES = [
  '.oss-cn-beijing.aliyuncs.com',
  '.oss-cn-hangzhou.aliyuncs.com',
  '.oss-cn-shanghai.aliyuncs.com',
  '.oss-cn-shenzhen.aliyuncs.com',
]

// ==================== 短 ID 映射 ====================

interface SignedEntry {
  url: string
  userId?: string
  costTokens?: number
  txId?: string
  sig: string
  ts: number
}

// 内存 Map：id → 签名条目（仅超长 URL 降级时使用），兜底 TTL 7 天
const idMap = new Map<string, SignedEntry>()

// 定时清理降级短 ID 的过期条目（每 10 分钟）
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of idMap) {
    if (now - entry.ts > FALLBACK_ID_TTL_MS) {
      idMap.delete(id)
    }
  }
}, 10 * 60 * 1000).unref()

// 生成 16 字符 hex 短 ID
function generateId(): string {
  return randomBytes(8).toString('hex')
}

// ==================== 签名 ====================

/**
 * 签名图片 URL（v3：无状态长时效签名）
 * 目标 URL base64url 编码进 query（r 参数）+ HMAC 验签：
 * 无服务端映射、无过期时间，服务器重启 / 长时间后仍有效，
 * 修复旧方案（短 ID 内存映射 / Base64 模式均 2h TTL）导致画布历史图片全部失效的问题。
 * 注意：参数名必须用 r，不能用 u —— 画布 loadFromStorage 会把 ?u= 视为旧版失效数据清理。
 * 超长 URL（如超长 prompt 拼接的远程地址）编码后超过阈值时降级为短 ID 模式，避免请求行超长触发 431。
 */
export function signImageUrl(originalUrl: string, userId?: string, costTokens?: number, txId?: string): string {
  const ts = Date.now()
  const uid = userId || ''
  const cost = costTokens != null ? String(costTokens) : ''
  const tid = txId || ''
  const payload = `${ts}:${uid}:${cost}:${tid}:${originalUrl}`
  const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 16)

  // 主路径：无状态签名（本地 /uploads/ 与远程 URL 统一处理）
  const encodedUrl = Buffer.from(originalUrl, 'utf-8').toString('base64url')
  const params = new URLSearchParams({ r: encodedUrl, t: String(ts), s: sig })
  if (uid) params.set('uid', uid)
  if (cost) params.set('c', cost)
  if (tid) params.set('tx', tid)
  const signed = `/api/image/proxy?${params.toString()}`
  if (signed.length <= STATELESS_URL_MAX_CHARS) {
    return signed
  }

  // 兜底：超长 URL 走短 ID 映射（依赖内存，进程重启后失效，TTL 7 天）
  const id = generateId()
  idMap.set(id, {
    url: originalUrl,
    userId: uid || undefined,
    costTokens: costTokens,
    txId: tid || undefined,
    sig,
    ts,
  })
  return `/api/image/proxy?id=${id}`
}

// ==================== 验签（短 ID 模式） ====================

export function verifySignedId(id: string): { url: string; userId?: string; costTokens?: number; txId?: string } | null {
  const entry = idMap.get(id)
  if (!entry) return null

  // 过期检查（仅兜底模式使用，TTL 延长到 7 天）
  if (Date.now() - entry.ts > FALLBACK_ID_TTL_MS) {
    idMap.delete(id)
    return null
  }

  // 本地路径（/uploads/xxx）→ 跳过白名单校验（不发网络请求，无 SSRF 风险）
  if (entry.url.startsWith('/')) {
    return {
      url: entry.url,
      userId: entry.userId,
      costTokens: entry.costTokens,
      txId: entry.txId,
    }
  }

  // 远程 URL：白名单校验
  try {
    const urlObj = new URL(entry.url)
    const hostname = urlObj.hostname
    const exactMatch = ALLOWED_HOSTS.includes(hostname)
    const isAllowedOss = ALLOWED_OSS_SUFFIXES.some(suffix => hostname.endsWith(suffix))
    if (!exactMatch && !isAllowedOss) {
      return null
    }
  } catch {
    return null
  }

  return {
    url: entry.url,
    userId: entry.userId,
    costTokens: entry.costTokens,
    txId: entry.txId,
  }
}

// ==================== 验签（Base64 模式：无状态主路径 + 旧短时效兼容） ====================

type VerifiedSigned = { url: string; userId?: string; costTokens?: number; txId?: string }

/**
 * Base64 签名公共验签逻辑
 * @param maxAgeMs 签名有效期；null 表示无状态长时效（不过期）
 */
function verifySignedCommon(
  encodedUrl: string,
  ts: string,
  sig: string,
  uid: string | undefined,
  costStr: string | undefined,
  txId: string | undefined,
  maxAgeMs: number | null,
): VerifiedSigned | null {
  const timestamp = parseInt(ts, 10)
  if (isNaN(timestamp)) return null
  if (maxAgeMs != null && Date.now() - timestamp > maxAgeMs) return null

  let originalUrl: string
  try {
    originalUrl = Buffer.from(encodedUrl, 'base64url').toString('utf-8')
  } catch {
    return null
  }

  const uidPart = uid || ''
  const costPart = costStr || ''
  const tidPart = txId || ''
  const payload = `${ts}:${uidPart}:${costPart}:${tidPart}:${originalUrl}`
  const expectedSig = createHmac('sha256', SIGNING_SECRET)
    .update(payload)
    .digest('hex')
    .slice(0, 16)
  if (sig !== expectedSig) return null

  // 本地路径（/uploads/xxx）→ 跳过白名单校验
  if (originalUrl.startsWith('/')) {
    const costTokens = costStr ? parseInt(costStr, 10) : undefined
    return {
      url: originalUrl,
      userId: uid || undefined,
      costTokens: isNaN(costTokens!) ? undefined : costTokens,
      txId: txId || undefined,
    }
  }

  try {
    const urlObj = new URL(originalUrl)
    const hostname = urlObj.hostname
    // 精确匹配白名单 → 直接通过
    const exactMatch = ALLOWED_HOSTS.includes(hostname)
    // OSS 子域匹配：限制在已知 region 后缀内，防止任意 bucket 通配
    const isAllowedOss = ALLOWED_OSS_SUFFIXES.some(suffix => hostname.endsWith(suffix))
    if (!exactMatch && !isAllowedOss) {
      return null
    }
  } catch {
    return null
  }

  const costTokens = costStr ? parseInt(costStr, 10) : undefined
  return {
    url: originalUrl,
    userId: uid || undefined,
    costTokens: isNaN(costTokens!) ? undefined : costTokens,
    txId: txId || undefined,
  }
}

/**
 * v3 无状态长时效验签（当前主路径，r 参数）
 * 仅依赖 HMAC 验签，无服务端映射、无过期时间 —— 服务器重启 / 长时间后仍有效
 */
export function verifyStatelessUrl(
  encodedUrl: string,
  ts: string,
  sig: string,
  uid?: string,
  costStr?: string,
  txId?: string,
): VerifiedSigned | null {
  return verifySignedCommon(encodedUrl, ts, sig, uid, costStr, txId, null)
}

/**
 * 旧 Base64 短时效验签（仅向后兼容历史存量，签名 2h 过期）
 */
export function verifySignedUrl(
  encodedUrl: string,
  ts: string,
  sig: string,
  uid?: string,
  costStr?: string,
  txId?: string,
): VerifiedSigned | null {
  return verifySignedCommon(encodedUrl, ts, sig, uid, costStr, txId, SIGN_TTL_MS)
}
