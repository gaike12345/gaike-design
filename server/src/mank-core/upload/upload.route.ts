import { Router } from 'express'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import { authRequired } from '../../mank-infra/middleware/auth'
import { upload, validateUploadedFiles } from '../../mank-infra/middleware/upload'
import { authLimiter } from '../../mank-infra/middleware/rate-limit'
import { moderateUpload, cleanupUploadedFile } from '../moderation/moderation'
import logger from '../../mank-infra/logging/logger'

const router = Router()

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

// URL → 本地文件 下载：用于 image-from-url 接口
// 限制 20MB 防止 OOM；仅允许 image/* MIME
async function downloadImageFromUrl(
  url: string,
): Promise<{ filePath: string; filename: string; mimetype: string; size: number }> {
  const ctrl = new AbortController()
  // 外部图片（如 Pollinations）可能需要排队生成，15s 太短导致 abort；放宽到 30s
  const timeout = setTimeout(() => ctrl.abort(), 30000)
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'mank-tv-server/upload-proxy' },
    })
    if (!resp.ok) throw new Error(`上游返回 ${resp.status}`)
    const cl = Number(resp.headers.get('content-length') || 0)
    if (cl > 20 * 1024 * 1024) throw new Error('文件超过 20MB 限制')
    const mime = resp.headers.get('content-type') || 'image/jpeg'
    if (!mime.startsWith('image/')) throw new Error('URL 不是图片类型')
    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/jpg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    }
    const ext = extMap[mime] || '.jpg'
    const filename = crypto.randomBytes(16).toString('hex') + ext
    const filePath = path.join(UPLOAD_DIR, filename)
    const buf = Buffer.from(await resp.arrayBuffer())
    if (buf.length > 20 * 1024 * 1024) throw new Error('文件超过 20MB 限制')
    if (buf.length === 0) throw new Error('下载内容为空')
    await fs.writeFile(filePath, buf)
    return { filePath, filename, mimetype: mime, size: buf.length }
  } finally {
    clearTimeout(timeout)
  }
}

// 上传接口：强制登录 + 速率限制（防止上传滥用刷盘）
router.use(authRequired)
router.use(authLimiter)

// POST /api/upload/image — 通用图片上传
/**
 * @openapi
 * /upload/image:
 *   post:
 *     tags: [文件上传]
 *     summary: 通用图片上传
 *     description: 上传图片文件到服务器，返回访问 URL。需登录，附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 图片文件
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
 *                   description: 图片访问路径
 *                   example: /uploads/abc123.png
 *       400:
 *         description: 未上传文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/image', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_UPLOAD_IMAGE', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/image',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({ url: `/uploads/${req.file.filename}` })
})

// POST /api/upload/file — 通用文件上传
/**
 * @openapi
 * /upload/file:
 *   post:
 *     tags: [文件上传]
 *     summary: 通用文件上传
 *     description: 上传任意文件到服务器，返回 URL 及文件元信息。需登录，附带内容审核。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: 待上传文件
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
 *                   description: 文件访问路径
 *                 size:
 *                   type: integer
 *                   description: 文件大小（字节）
 *                 mime:
 *                   type: string
 *                   description: MIME 类型
 *                 originalName:
 *                   type: string
 *                   description: 原始文件名
 *       400:
 *         description: 未上传文件
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/file', upload.single('file'), validateUploadedFiles, async (req, res) => {
  logger.info('CTRL_UPLOAD_FILE', { userId: req.user?.userId })
  if (!req.file) return res.status(400).json({ error: '未上传文件' })
  // 内容审核：文件名 + 文本内容
  const mod = await moderateUpload(req.file, {
    endpoint: '/api/upload/file',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(req.file.path)
    return res.status(403).json({ error: mod.safeReason })
  }
  res.json({
    url: `/uploads/${req.file.filename}`,
    size: req.file.size,
    mime: req.file.mimetype,
    originalName: req.file.originalname,
  })
})

// POST /api/upload/image-from-url — 从 URL 下载图片到服务器
// 用于外部图片拖入画布后的 img2img 场景：
// 浏览器拖入的外部 URL 可能被 Pollinations 无法访问（CORS/hotlink/auth），
// 此接口在服务端下载图片并存储到 /uploads/，返回本服务器公网 URL。
/**
 * @openapi
 * /upload/image-from-url:
 *   post:
 *     tags: [文件上传]
 *     summary: 从 URL 下载图片
 *     description: 在服务端下载外部图片 URL 到本服务器 /uploads/，返回本服务器公网 URL。用于外部图片拖入画布后的 img2img 场景。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [url]
 *             properties:
 *               url:
 *                 type: string
 *                 description: 外部图片 URL（http/https）
 *     responses:
 *       200:
 *         description: 下载成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   description: 本服务器图片路径
 *                   example: /uploads/abc123.png
 *       400:
 *         description: URL 无效或下载失败
 *       401:
 *         description: 未登录
 *       403:
 *         description: 内容审核未通过
 */
router.post('/image-from-url', async (req, res) => {
  const { url } = req.body || {}
  if (!url || typeof url !== 'string' || !/^https?:\/\//.test(url)) {
    return res.status(400).json({ error: 'url 参数无效' })
  }
  logger.info('CTRL_UPLOAD_IMAGE_FROM_URL', { userId: req.user?.userId, url: url.slice(0, 100) })

  let downloaded: { filePath: string; filename: string; mimetype: string; size: number } | undefined
  try {
    downloaded = await downloadImageFromUrl(url)
  } catch (e) {
    logger.warn('image-from-url 下载失败', { url: url.slice(0, 100), error: (e as Error).message })
    return res.status(400).json({ error: `图片下载失败：${(e as Error).message}` })
  }

  // 构造类 multer file 对象，复用 moderateUpload 审核流程
  const fakeFile = {
    fieldname: 'file',
    originalname: downloaded.filename,
    encoding: '7bit',
    mimetype: downloaded.mimetype,
    destination: UPLOAD_DIR,
    filename: downloaded.filename,
    path: downloaded.filePath,
    size: downloaded.size,
  } as Express.Multer.File

  const mod = await moderateUpload(fakeFile, {
    endpoint: '/api/upload/image-from-url',
    userId: req.user!.userId,
  })
  if (!mod.passed) {
    void cleanupUploadedFile(downloaded.filePath)
    return res.status(403).json({ error: mod.safeReason })
  }

  res.json({ url: `/uploads/${downloaded.filename}` })
})

export default router