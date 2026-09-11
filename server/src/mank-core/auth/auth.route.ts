import { Router } from 'express'
import { authRequired } from '../../mank-infra/middleware/auth'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { authLimiter, passwordLimiter } from '../../mank-infra/middleware/rate-limit'
import { validate, z } from '../../mank-infra/middleware/validate'
import { moderateUpload, cleanupUploadedFile } from '../moderation/moderation'
import { createWechatScanScene, getWechatScanStatus } from './wechatLogin'
import {
  registerUser, loginByUid, getUserProfile, updateProfile, changePassword,
} from './auth.service'
import logger from '../../mank-infra/logging/logger'

// AuthError 已迁移到 mank-common/errors.ts
// catch 块中抛出的异常统一交给全局 errorHandler（mank-infra/middleware/error.ts）分类拦截

const router = Router()

// POST /api/auth/register
/**
 * @openapi
 * /auth/register:
 *   post:
 *     tags: [认证]
 *     summary: 用户注册
 *     description: 使用密码（及可选昵称）注册新账号，返回 JWT Token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               password:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 128
 *                 description: 用户密码（6-128 位）
 *                 example: "secure123"
 *               nickname:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 32
 *                 description: 用户昵称（可选，1-32 位）
 *                 example: "漫剧小达人"
 *     responses:
 *       200:
 *         description: 注册成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       400:
 *         description: 参数校验失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/register', authLimiter, validate({
  body: z.object({
    password: z.string().min(6).max(128),
    nickname: z.string().min(1).max(32).optional(),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_AUTH_REGISTER_POST', {})
  try {
    const { password, nickname } = req.body
    const result = await registerUser(password, nickname)
    res.json(result)
  } catch (e) {
    next(e)
  }
})

// POST /api/auth/login
/**
 * @openapi
 * /auth/login:
 *   post:
 *     tags: [认证]
 *     summary: UID 密码登录
 *     description: 使用 UID 和密码进行登录，返回 JWT Token
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [uid, password]
 *             properties:
 *               uid:
 *                 type: integer
 *                 description: 用户 UID
 *                 example: 10001
 *               password:
 *                 type: string
 *                 maxLength: 128
 *                 description: 用户密码
 *     responses:
 *       200:
 *         description: 登录成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResult'
 *       401:
 *         description: 认证失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       400:
 *         description: 参数校验失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/login', authLimiter, validate({
  body: z.object({
    uid: z.string().regex(/^\d+$/, 'UID 必须是数字'),
    password: z.string().min(1).max(128),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_AUTH_LOGIN_POST', { uid: req.body.uid })
  try {
    const { uid, password } = req.body
    const result = await loginByUid(parseInt(uid, 10), password)
    res.json(result)
  } catch (e) {
    // 异常统一交给全局 errorHandler 分类拦截并返回 ApiResponse
    next(e)
  }
})

// POST /api/auth/logout
/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [认证]
 *     summary: 退出登录
 *     description: 退出登录（前端清除 Token 即可，后端无状态）
 *     security: []
 *     responses:
 *       200:
 *         description: 退出成功
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Ok'
 */
router.post('/logout', (_req, res) => {
  logger.info('CTRL_AUTH_LOGOUT_POST', {})
  res.json({ ok: true })
})

// GET /api/auth/me
/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [认证]
 *     summary: 获取当前用户信息
 *     description: 获取当前登录用户的详细资料
 *     security: [{ BearerAuth: [] }]
 *     responses:
 *       200:
 *         description: 用户信息
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     uid:
 *                       type: integer
 *                     nickname:
 *                       type: string
 *                     avatar:
 *                       type: string
 *                       nullable: true
 *                     bio:
 *                       type: string
 *                       nullable: true
 *                     role:
 *                       type: string
 *                       enum: [user, admin, superadmin]
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/me', authRequired, async (req, res, next) => {
  logger.info('CTRL_AUTH_ME_GET', { userId: req.user!.userId })
  try {
    const user = await getUserProfile(req.user!.userId)
    res.json({ user })
  } catch (e) {
    // 异常统一交给全局 errorHandler 分类拦截并返回 ApiResponse
    next(e)
  }
})

// PUT /api/auth/profile
/**
 * @openapi
 * /auth/profile:
 *   put:
 *     tags: [认证]
 *     summary: 更新个人资料
 *     description: 更新当前登录用户的昵称和简介
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nickname:
 *                 type: string
 *                 description: 新昵称
 *                 example: "漫剧小达人"
 *               bio:
 *                 type: string
 *                 description: 个人简介
 *                 example: "热爱 AI 创作"
 *     responses:
 *       200:
 *         description: 更新成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     nickname:
 *                       type: string
 *                     bio:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/profile', authRequired, async (req, res, next) => {
  logger.info('CTRL_AUTH_PROFILE_PUT', { userId: req.user!.userId })
  try {
    const { nickname, bio } = req.body
    const user = await updateProfile(req.user!.userId, { nickname, bio })
    res.json({ user })
  } catch (e) {
    next(e)
  }
})

// PUT /api/auth/password
/**
 * @openapi
 * /auth/password:
 *   put:
 *     tags: [认证]
 *     summary: 修改密码
 *     description: 验证旧密码后设置新密码（6-128 位）
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [oldPassword, newPassword]
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 maxLength: 128
 *                 description: 当前密码
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *                 maxLength: 128
 *                 description: 新密码（6-128 位）
 *                 example: "newsecure123"
 *     responses:
 *       200:
 *         description: 密码修改成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "密码修改成功"
 *       400:
 *         description: 参数校验失败
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 旧密码错误或未登录
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.put('/password', authRequired, passwordLimiter, validate({
  body: z.object({
    oldPassword: z.string().min(1).max(128),
    newPassword: z.string().min(6).max(128),
  }),
}), async (req, res, next) => {
  logger.info('CTRL_AUTH_PASSWORD_PUT', { userId: req.user!.userId })
  try {
    const { oldPassword, newPassword } = req.body
    await changePassword(req.user!.userId, oldPassword, newPassword)
    res.json({ ok: true, message: '密码修改成功' })
  } catch (e) {
    // 异常统一交给全局 errorHandler 分类拦截并返回 ApiResponse
    next(e)
  }
})

// POST /api/auth/avatar
/**
 * @openapi
 * /auth/avatar:
 *   post:
 *     tags: [认证]
 *     summary: 上传头像
 *     description: 上传用户头像图片，经内容审核后返回访问 URL
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [avatar]
 *             properties:
 *               avatar:
 *                 type: file
 *                 description: 头像图片文件
 *     responses:
 *       200:
 *         description: 上传成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: 头像访问 URL
 *                   example: "/uploads/avatar-123.png"
 *       400:
 *         description: 未上传文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录或 Token 失效
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/avatar', authRequired, upload.single('avatar'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_AUTH_AVATAR_POST', { userId: req.user!.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
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

// GET /api/auth/wechat/qrcode
/**
 * @openapi
 * /auth/wechat/qrcode:
 *   get:
 *     tags: [认证]
 *     summary: 获取微信扫码登录二维码
 *     description: 创建一个微信扫码登录场景，返回场景 ID 和二维码图片 URL
 *     security: []
 *     responses:
 *       200:
 *         description: 二维码获取成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sceneId:
 *                   type: string
 *                   description: 扫码场景 ID
 *                   example: "scene_abc123"
 *                 qrCodeUrl:
 *                   type: string
 *                   description: 二维码图片 URL
 *                   example: "https://mp.weixin.qq.com/qrcode/scene_abc123"
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/wechat/qrcode', async (req, res, next) => {
  logger.info('CTRL_AUTH_WECHAT_QRCODE_GET', {})
  try {
    const scene = await createWechatScanScene()
    res.json(scene)
  } catch (e) {
    next(e)
  }
})

// GET /api/auth/wechat/status/:sceneId
/**
 * @openapi
 * /auth/wechat/status/{sceneId}:
 *   get:
 *     tags: [认证]
 *     summary: 查询微信扫码状态
 *     description: 根据场景 ID 轮询查询微信扫码登录状态
 *     security: []
 *     parameters:
 *       - in: path
 *         name: sceneId
 *         required: true
 *         schema:
 *           type: string
 *         description: 扫码场景 ID
 *     responses:
 *       200:
 *         description: 状态查询成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   enum: [waiting, scanned, confirmed, expired]
 *                   description: 扫码状态
 *                   example: "confirmed"
 *                 uid:
 *                   type: integer
 *                   description: 用户 UID（仅在 confirmed 状态返回）
 *                   example: 10001
 *       500:
 *         description: 服务器错误
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/wechat/status/:sceneId', async (req, res, next) => {
  logger.info('CTRL_AUTH_WECHAT_STATUS_GET', { sceneId: req.params.sceneId })
  try {
    const result = await getWechatScanStatus(req.params.sceneId)
    res.json(result)
  } catch (e) {
    next(e)
  }
})

export default router
