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
import { createWechatScanScene, getWechatScanStatus } from '../lib/wechatLogin'
import { generateNextUid } from '../lib/uidGenerator'

const router = Router()

// POST /api/auth/register
// 注册：自动分配 UID，设置密码和昵称
// email 字段保留用于系统兼容，但不作为登录凭据（用户无需感知）
router.post('/register', authLimiter, validate({
  body: z.object({
    password: z.string().min(6).max(128),
    nickname: z.string().min(1).max(32).optional(),
  }),
}), async (req, res, next) => {
  try {
    const { password, nickname } = req.body
    const hashed = await bcrypt.hash(password, 10)
    const uid = await generateNextUid()
    // 用 UID 生成一个内部邮箱占位符（保持数据库唯一约束兼容）
    const internalEmail = `uid_${uid}@local`
    const user = await prisma.user.create({
      data: {
        uid,
        email: internalEmail,
        password: hashed,
        nickname: nickname || `用户${uid}`,
      },
    })
    // 新用户免费额度：从站点配置读取（可在后台可视化调整）
    const freeTokens = Math.max(0, await cfgNum('login.new_user_tokens', 1000))
    await prisma.userQuota.create({
      data: {
        userId: user.id,
        totalTokens: freeTokens,
        usedTokens: 0,
        remainingTokens: freeTokens,
        planId: 'free',
      },
    })
    const token = signToken({ userId: user.id, uid: user.uid, email: user.email, role: user.role })
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
      },
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/login — 仅 UID 登录
router.post('/login', authLimiter, validate({
  body: z.object({
    uid: z.string().regex(/^\d+$/, 'UID 必须是数字'),
    password: z.string().min(1).max(128),
  }),
}), async (req, res, next) => {
  try {
    const { uid, password } = req.body

    const user = await prisma.user.findUnique({
      where: { uid: parseInt(uid, 10) },
    })

    if (!user) {
      return res.status(401).json({ error: 'UID 或密码错误' })
    }
    if (!user.password) {
      return res.status(401).json({ error: '该账号未设置密码，请联系管理员' })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'UID 或密码错误' })
    }
    if (!user.enabled) {
      return res.status(403).json({ error: '账号已被关闭，请联系管理员' })
    }
    const token = signToken({ userId: user.id, uid: user.uid, email: user.email, role: user.role })
    res.json({
      token,
      user: {
        id: user.id,
        uid: user.uid,
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
      select: { id: true, uid: true, nickname: true, avatar: true, bio: true, role: true },
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
      select: { id: true, uid: true, nickname: true, avatar: true, bio: true, role: true },
    })
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// PUT /api/auth/password — 修改密码（需验证旧密码）
router.put('/password', authRequired, validate({
  body: z.object({
    oldPassword: z.string().min(1).max(128),
    newPassword: z.string().min(6).max(128),
  }),
}), async (req, res, next) => {
  try {
    const { oldPassword, newPassword } = req.body
    const userId = req.user!.userId

    // 1. 查找用户并验证旧密码
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    })
    if (!user) return res.status(404).json({ error: '用户不存在' })

    // 无密码的账号（如第三方登录用户）不能设置密码
    if (!user.password) {
      return res.status(400).json({ error: '当前账号未设置密码，请联系管理员' })
    }

    const valid = await bcrypt.compare(oldPassword, user.password)
    if (!valid) {
      return res.status(400).json({ error: '旧密码不正确' })
    }

    // 2. 新密码不能和旧密码相同
    if (oldPassword === newPassword) {
      return res.status(400).json({ error: '新密码不能与旧密码相同' })
    }

    // 3. 哈希并更新
    const hashed = await bcrypt.hash(newPassword, 10)
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    })

    res.json({ ok: true, message: '密码修改成功' })
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
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  const url = `/uploads/${req.file.filename}`
  res.json({ url })
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
