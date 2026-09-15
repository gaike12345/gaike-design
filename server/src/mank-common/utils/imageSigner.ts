/**
 * 图片 URL 签名/验签模块
 * 从 routes/image.ts 提取，消除 comic.ts → image.ts 跨路由导入
 */

import { createHmac } from 'crypto'

// 安全硬校验：生产环境必须配置图片签名密钥，禁止使用默认值
// 默认密钥公开后攻击者可伪造签名 URL，绕过 ALLOWED_HOSTS 白名单发动 SSRF
const IMAGE_SIGNING_SECRET = process.env.IMAGE_SIGNING_SECRET
if (process.env.NODE_ENV === 'production' && !IMAGE_SIGNING_SECRET) {
  console.error('[FATAL] 生产环境必须配置 IMAGE_SIGNING_SECRET（图片签名密钥，禁止使用默认值）')
  console.error('[FATAL] 请在 server/.env 中设置 IMAGE_SIGNING_SECRET=<随机强密钥>')
  process.exit(1)
}
const SIGNING_SECRET = IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod'
const SIGN_TTL_MS = 2 * 60 * 60 * 1000

const ALLOWED_HOSTS = [
  'gen.pollinations.ai',
  'image.pollinations.ai',
  'dashscope.aliyuncs.com',
  'dashscope-result.oss-cn-beijing.aliyuncs.com',
  'dashscope-result.oss-cn-hangzhou.aliyuncs.com',
]

export function signImageUrl(originalUrl: string, userId?: string, costTokens?: number, txId?: string): string {
  const ts = Date.now()
  const uid = userId || ''
  const cost = costTokens != null ? String(costTokens) : ''
  const tid = txId || ''
  const payload = `${ts}:${uid}:${cost}:${tid}:${originalUrl}`
  const sig = createHmac('sha256', SIGNING_SECRET).update(payload).digest('hex').slice(0, 16)
  const encoded = Buffer.from(originalUrl).toString('base64url')
  let qs = `u=${encoded}&t=${ts}&s=${sig}`
  if (uid) qs += `&uid=${encodeURIComponent(uid)}`
  if (cost) qs += `&c=${cost}`
  if (tid) qs += `&tx=${encodeURIComponent(tid)}`
  return `/api/image/proxy?${qs}`
}

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

  try {
    const urlObj = new URL(originalUrl)
    if (!ALLOWED_HOSTS.some(h => urlObj.hostname === h || urlObj.hostname.endsWith('.' + h))) {
      if (!urlObj.hostname.endsWith('.aliyuncs.com')) {
        return null
      }
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
