// 邮箱验证码服务 — 使用 163 SMTP 发送
// 验证码存储在内存中（开发模式）或 Redis 中（生产模式）
// 验证码有效期 5 分钟，同一邮箱 60 秒内只能发一次

import prisma from './prisma'
import { signToken } from './jwt'
import { cfgNum } from './siteConfig'
import { generateNextUid } from './uidGenerator'
import logger from './logger'

// 验证码存储（内存模式）— 格式：{ [email]: { code, expireAt, sendAt } }
const codeStore = new Map<string, { code: string; expireAt: number; sendAt: number }>()

// 生成 6 位数字验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// 发送频率限制（秒）
const SEND_INTERVAL = 60 * 1000 // 60 秒
const CODE_EXPIRE = 5 * 60 * 1000 // 5 分钟

/**
 * 发送邮箱验证码
 * @param email 目标邮箱
 * @returns 是否发送成功
 */
export async function sendEmailCode(email: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = email.trim().toLowerCase()

  // 检查发送频率
  const existing = codeStore.get(trimmed)
  if (existing && Date.now() - existing.sendAt < SEND_INTERVAL) {
    return { ok: false, error: '发送过于频繁，请稍后再试' }
  }

  // 生成验证码
  const code = generateCode()
  const now = Date.now()

  // 163 SMTP 配置
  const smtpUser = process.env.SMTP_USER
  const smtpPass = process.env.SMTP_PASS // 163 邮箱授权码（不是登录密码）

  // 未配置 SMTP 时使用开发模式（验证码打印到控制台 + 直接返回 code）
  if (!smtpUser || !smtpPass) {
    logger.warn('邮箱验证码输出到控制台（开发模式，未配置 SMTP）', { email: trimmed, code })
    codeStore.set(trimmed, { code, expireAt: now + CODE_EXPIRE, sendAt: now })
    return { ok: true }
  }

  try {
    const nodemailer = await import('nodemailer')

    const transporter = nodemailer.createTransport({
      host: 'smtp.163.com',
      port: 465,
      secure: true,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    })

    const siteName = process.env.SITE_NAME || 'AI 漫剧圈'

    await transporter.sendMail({
      from: `${siteName} <${smtpUser}>`,
      to: trimmed,
      subject: `【${siteName}】您的登录验证码`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #7c3aed 0%, #06b6d4 100%); padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: white; margin: 0; font-size: 20px;">${siteName}</h2>
          </div>
          <div style="background: #fff; padding: 32px 24px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="color: #374151; font-size: 14px; margin: 0 0 16px 0;">您好，</p>
            <p style="color: #374151; font-size: 14px; margin: 0 0 20px 0;">您正在使用邮箱验证码登录，验证码为：</p>
            <div style="background: #f5f3ff; border: 1px solid #ddd6fe; border-radius: 8px; padding: 16px; text-align: center; margin-bottom: 20px;">
              <span style="font-size: 28px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${code}</span>
            </div>
            <p style="color: #6b7280; font-size: 12px; margin: 0;">验证码有效期 5 分钟，请勿泄露给他人。</p>
            <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0 0;">如非本人操作，请忽略此邮件。</p>
          </div>
        </div>
      `,
    })

    codeStore.set(trimmed, { code, expireAt: now + CODE_EXPIRE, sendAt: now })
    return { ok: true }
  } catch (e) {
    logger.error('发送邮箱验证码失败', { error: e instanceof Error ? e.message : String(e), email: trimmed })
    return { ok: false, error: '验证码发送失败，请稍后重试' }
  }
}

/**
 * 验证邮箱验证码并登录/注册
 * @param email 邮箱
 * @param code 验证码
 * @returns token 和 user 信息
 */
export async function verifyEmailCodeAndLogin(
  email: string,
  code: string,
): Promise<{ ok: boolean; token?: string; user?: any; error?: string }> {
  const trimmed = email.trim().toLowerCase()
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
  let user = await prisma.user.findUnique({ where: { email: trimmed } })

  if (!user) {
    // 新用户：自动注册
    const freeTokens = Math.max(0, await cfgNum('login.new_user_tokens', 100_000))
    const uid = await generateNextUid()
    user = await prisma.user.create({
      data: {
        uid,
        email: trimmed,
        password: '', // 邮箱验证码登录无密码
        nickname: trimmed.split('@')[0],
        loginMethod: 'email_code',
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
      data: { loginMethod: 'email_code' },
    })
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role })

  return {
    ok: true,
    token,
    user: { id: user.id, uid: user.uid, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role },
  }
}
