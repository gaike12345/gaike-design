import { Router } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { signToken } from '../lib/jwt'
import { authRequired } from '../middleware/auth'
import { upload } from '../middleware/upload'

const router = Router()

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, nickname } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }
    const exists = await prisma.user.findUnique({ where: { email } })
    if (exists) {
      return res.status(409).json({ error: '该邮箱已注册' })
    }
    const hashed = await bcrypt.hash(password, 10)
    const user = await prisma.user.create({
      data: {
        email,
        password: hashed,
        nickname: nickname || email.split('@')[0],
      },
    })
    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role },
    })
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ error: '邮箱和密码不能为空' })
    }
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: '邮箱或密码错误' })
    }
    const token = signToken({ userId: user.id, email: user.email, role: user.role })
    res.json({
      token,
      user: { id: user.id, email: user.email, nickname: user.nickname, avatar: user.avatar, role: user.role },
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
      select: { id: true, email: true, nickname: true, avatar: true, bio: true, role: true },
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
router.post('/avatar', authRequired, upload.single('avatar'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  const url = `/uploads/${req.file.filename}`
  res.json({ url })
})

export default router
