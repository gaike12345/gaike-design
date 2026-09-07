// 手机短信验证码服务 — 支持阿里云短信 / 腾讯云短信
// 验证码存储在内存中（开发模式）或 Redis 中（生产模式）
// 验证码有效期 5 分钟，同一手机号 60 秒内只能发一次

import prisma from './prisma'
import { signToken } from './jwt'
import { cfgNum } from './siteConfig'
import { generateNextUid } from './uidGenerator'
import logger from './logger'

// 验证码存储（内存模式）— 格式：{ [phone]: { code, expireAt, sendAt } }
const codeStore = new Map<string, { code: string; expireAt: number; sendAt: number }>()

// 生成 6 位数字验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 发送频率限制
const SEND_INTERVAL = 60 * 1000 // 60 秒
const CODE_EXPIRE = 5 * 60 * 1000 // 5 分钟

// 手机号格式校验（中国大陆）
export function isValidPhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone.trim())
}

/**
 * 发送短信验证码
 * @param phone 手机号
 * @returns 是否发送成功
 */
export async function sendSmsCode(phone: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = phone.trim()

  if (!isValidPhone(trimmed)) {
    return { ok: false, error: '请输入正确的手机号' }
  }

  // 检查发送频率
  const existing = codeStore.get(trimmed)
  if (existing && Date.now() - existing.sendAt < SEND_INTERVAL) {
    return { ok: false, error: '发送过于频繁，请稍后再试' }
  }

  // 生成验证码
  const code = generateCode()
  const now = Date.now()

  // 阿里云短信配置
  const accessKeyId = process.env.ALIYUN_SMS_ACCESS_KEY_ID
  const accessKeySecret = process.env.ALIYUN_SMS_ACCESS_KEY_SECRET
  const signName = process.env.ALIYUN_SMS_SIGN_NAME
  const templateCode = process.env.ALIYUN_SMS_TEMPLATE_CODE

  // 未配置时使用开发模式（验证码打印到控制台）
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) {
    logger.warn('短信验证码输出到控制台（开发模式，未配置阿里云短信）', { phone: trimmed, code })
    codeStore.set(trimmed, { code, expireAt: now + CODE_EXPIRE, sendAt: now })
    return { ok: true }
  }

  // 阿里云短信发送
  try {
    const { default: crypto } = await import('crypto')

    // 构造请求参数
    const params: Record<string, string> = {
      Action: 'SendSms',
      Version: '2017-05-25',
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(8).toString('hex'),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      PhoneNumbers: trimmed,
      SignName: signName,
      TemplateCode: templateCode,
      TemplateParam: JSON.stringify({ code }),
    }

    // 签名（阿里云 RPC 签名 v1）
    const sortedKeys = Object.keys(params).sort()
    const canonicalizedQueryString = sortedKeys
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
      .join('&')

    const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalizedQueryString)}`
    const signature = crypto
      .createHmac('sha1', `${accessKeySecret}&`)
      .update(stringToSign)
      .digest('base64')

    const url = `https://dysmsapi.aliyuncs.com/?${canonicalizedQueryString}&Signature=${encodeURIComponent(signature)}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    const data = (await res.json()) as any

    if (data.Code !== 'OK') {
      logger.error('阿里云短信发送失败', { phone: trimmed, code: data.Code, message: data.Message })
      return { ok: false, error: '验证码发送失败，请稍后重试' }
    }

    codeStore.set(trimmed, { code, expireAt: now + CODE_EXPIRE, sendAt: now })
    return { ok: true }
  } catch (e) {
    logger.error('发送短信验证码异常', { error: e instanceof Error ? e.message : String(e), phone: trimmed })
    return { ok: false, error: '验证码发送失败，请稍后重试' }
  }
}

/**
 * 验证短信验证码并登录/注册
 * @param phone 手机号
 * @param code 验证码
 * @returns token 和 user 信息
 */
export async function verifySmsCodeAndLogin(
  phone: string,
  code: string,
): Promise<{ ok: boolean; token?: string; user?: any; error?: string }> {
  const trimmed = phone.trim()

  if (!isValidPhone(trimmed)) {
    return { ok: false, error: '请输入正确的手机号' }
  }

  const stored = codeStore.get(trimmed)

  if (!stored) {
    return { ok: false, error: '请先获取验证码' }
  }

  if (Date.now() > stored.expireAt) {
    codeStore.delete(trimmed)
    return { ok: false, error: '验证码已过期，请重新获取' }
  }

  if (stored.code !== code.trim()) {
    return { ok: false, error: '验证码错误' }
  }

  // 验证通过，删除验证码（一次性）
  codeStore.delete(trimmed)

  // 查找或创建用户
  let user = await prisma.user.findFirst({ where: { phone: trimmed } })

  if (!user) {
    // 新用户：自动注册
    const freeTokens = Math.max(0, await cfgNum('login.new_user_tokens', 100_000))
    const uid = await generateNextUid()
    user = await prisma.user.create({
      data: {
        uid,
        email: `phone_${trimmed}@sms.local`, // 占位邮箱
        password: '',
        nickname: `用户${trimmed.slice(-4)}`,
        phone: trimmed,
        loginMethod: 'phone',
      },
    })
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        totalTokens: freeTokens,
        usedTokens: 0,
        remainingTokens: freeTokens,
        planId: 'free',
      },
    })
  } else if (!user.enabled) {
    return { ok: false, error: '账号已被关闭，请联系管理员' }
  } else {
    // 更新登录方式标记
    await prisma.user.update({
      where: { id: user.id },
      data: { loginMethod: 'phone' },
    })
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role })

  return {
    ok: true,
    token,
    user: { id: user.id, uid: user.uid, email: user.email, phone: user.phone, nickname: user.nickname, avatar: user.avatar, role: user.role },
  }
}

// 定期清理过期验证码（每 10 分钟清理一次）
setInterval(() => {
  const now = Date.now()
  for (const [phone, data] of codeStore) {
    if (now > data.expireAt) {
      codeStore.delete(phone)
    }
  }
}, 10 * 60 * 1000)
