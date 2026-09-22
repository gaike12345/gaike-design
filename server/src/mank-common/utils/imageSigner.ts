/**
 * 图片 URL 签名/验签模块
 * 从 routes/image.ts 提取，消除 comic.ts → image.ts 跨路由导入
 *
 * v2: 短 ID 映射方案
 *   signImageUrl 生成短 ID，存储 id → { url, userId, costTokens, txId } 映射
 *   proxy 端点用 id 查找，避免 Base64 编码的 URL 放在 query string 导致 431
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
const SIGN_TTL_MS = 2 * 60 * 60 * 1000

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

// 内存 Map：id → 签名条目，TTL 2 小时
const idMap = new Map<string, SignedEntry>()

// 定时清理过期条目（每 10 分钟）
setInterval(() => {
  const now = Date.now()
  for (const [id, entry] of idMap) {
    if (now - entry.ts > SIGN_TTL_MS) {
      idMap.delete(id)
    }
  }
}, 10 * 60 * 1000).unref()

// 生成 16 字符 hex 短 ID
function generateId(): string {
  return randomBytes(8).toString('hex')
}

// ==================== 签名（短 ID 模式） ====================

export function signImageUrl(originalUrl: string, userId?: string, costTokens?: number, txId?: string): string {
  const ts = Date.now()
  const uid = userId || ''
  const cost = costTokens != null ? String(costTokens) : ''
  const tid = txId || ''
  const payload = `${ts}:${uid}:${cost}:${tid}:${originalUrl}`
  const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 16)

  // 生成短 ID，存储映射
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

  // 过期检查
  if (Date.now() - entry.ts > SIGN_TTL_MS) {
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

// ==================== 验签（旧 Base64 模式，向后兼容） ====================

export function verifySignedUrl(
  encodedUrl: string,
  ts: string,
  sig: string,
  uid?: string,
  costStr?: string,
  txId?: string,
): { url: string; userId?: string; costTokens?: number; txId?: string } | null {
  const timestamp = parseInt(ts, 10)
  if (isNaN(timestamp)) return null
  if (Date.now() - timestamp > SIGN_TTL_MS) return null

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
