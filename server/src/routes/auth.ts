import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authRequired, UNIQUE_SUPERADMIN_EMAIL } from '../middleware/auth'
import { upload, validateUploadedFiles } from '../middleware/upload'
import { authLimiter } from '../middleware/rate-limit'
import { validate, z } from '../middleware/validate'
import { cfgNum } from '../lib/siteConfig'
import { moderateUpload, cleanupUploadedFile } from '../lib/moderation'
import { sendEmailCode, verifyEmailCodeAndLogin } from '../lib/emailCode'
import { createWechatScanScene, getWechatScanStatus } from '../lib/wechatLogin'
import { generateNextUid } from '../lib/uidGenerator'

const router = Router()

// POST /api/auth/register
router.post('/register', authLimiter, validate({
  body: z.object({
    email: z.string().email().max(255),
    password: z.string().min(6).max(128),
    nickname: z.string().min(1).max(32).optional(),
  }),
}), async (req, res, next) => {
  try {
    const { email, password, nickname } = req.body
    // 唯一超级管理员不变量：禁止外部注册占用系统保留邮箱 admin@manktv.com
    // （否则会导致后续 seed 失败 / 真实超管无法创建，破坏唯一性约束）
    if (String(email).trim().toLowerCase() === UNIQUE_SUPERADMIN_EMAIL.toLowerCase()) {
      return res.status(403).json({ error: `系统保留邮箱(${UNIQUE_SUPERADMIN_EMAIL})不可注册` })
    }
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return res.status(409).json({ error: '该邮箱已注册' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const uid = await generateNextUid()
    const user = await prisma.user.create({
      data: {
        uid,
        email,
        password: hashed,
        nickname: nickname || email.split('@')[0],
      },
    })
    // 新用户免费额度：从站点配置读取（可在后台可视化调整）
    const freeTokens = Math.max(0, await cfgNum('login.new_user_tokens', 100_000))
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        totalTokens: freeTokens,
        usedTokens: 0,
        remainingTokens: freeTokens,
        planId: 'free',
      },
    })
    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/login — 支持邮箱 或 UID 登录
router.post('/login', authLimiter, validate({
  body: z.object({
    account: z.string().min(1).max(255), // 邮箱 或 UID
    password: z.string().min(1).max(128),
  }),
}), async (req, res, next) => {
  try {
    const { account, password } = req.body

    // 判断是 UID（纯数字）还是邮箱
    const isUid = /^\d+$/.test(account)
    const user = isUid
      ? await prisma.user.findUnique({ where: { uid: parseInt(account, 10) } })
      : await prisma.user.findUnique({ where: { email: account } })

    if (!user) {
      return res.status(401).json({ error: '账号或密码错误' })
    }
    if (!user.password) {
      return res.status(401).json({ error: '该账号未设置密码，请使用验证码或微信登录' })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: '账号或密码错误' })
    }
    if (!user.enabled) {
      return res.status(403).json({ error: '账号已被关闭，请联系管理员' })
    }
    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        email: user.email,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/logout
router.post('/logout', (_req, res) => {
  res.json({ ok: true })
})

// GET /api/auth/me
router.get('/me', authRequired, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, uid: true, email: true, nickname: true, avatar: true, bio: true, role: true },
    })
    if (!user) return res.status(404).json({ error: '用户不存在' })
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// PUT /api/auth/profile
router.put('/profile', authRequired, async (req, res, next) => {
  try {
    const { nickname, bio } = req.body
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: {
        ...(nickname !== undefined && { nickname }),
        ...(bio !== undefined && { bio }),
      },
      select: { id: true, email: true, nickname: true, avatar: true, bio: true, role: true },
    })
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/avatar
router.post('/avatar', authRequired, upload.single('avatar'), validateUploadedFiles, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/auth/avatar',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.reason, moderation: mod.result })
  }
  const url = `/uploads/${req.file.filename}`
  res.json({ url })
})

// ============================================================
// 邮箱验证码登录（163 SMTP）
// ============================================================

// POST /api/auth/email/send-code — 发送验证码
router.post('/email/send-code', authLimiter, validate({
  body: z.object({
    email: z.string().email().max(255),
  }),
}), async (req, res) => {
  const { email } = req.body
  const result = await sendEmailCode(email)
  if (!result.ok) {
    return res.status(400).json({ error: result.error })
  }
  res.json({ ok: true, message: '验证码已发送' })
})

// POST /api/auth/email/login — 验证码登录（自动注册新用户）
router.post('/email/login', authLimiter, validate({
  body: z.object({
    email: z.string().email().max(255),
    code: z.string().length(6),
  }),
}), async (req, res) => {
  const { email, code } = req.body
  const result = await verifyEmailCodeAndLogin(email, code)
  if (!result.ok) {
    return res.status(400).json({ error: result.error })
  }
  res.json({ token: result.token, user: result.user })
})

// ============================================================
// 微信公众号扫码登录
// ============================================================

// GET /api/auth/wechat/qrcode — 获取扫码二维码
router.get('/wechat/qrcode', async (req, res) => {
  const scene = await createWechatScanScene()
  res.json(scene)
})

// GET /api/auth/wechat/status/:sceneId — 轮询扫码状态
router.get('/wechat/status/:sceneId', async (req, res) => {
  const { sceneId } = req.params
  const result = await getWechatScanStatus(sceneId)
  res.json(result)
})

export default router
