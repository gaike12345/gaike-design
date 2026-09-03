import multer from 'multer'
import path from 'path'
import crypto from 'crypto'
import fs from 'fs/promises'
import type { Request, Response, NextFunction } from 'express'
import logger from '../lib/logger'

const UPLOAD_DIR = process.env.UPLOAD_DIR || './uploads'

// 磁盘存储：文件名用 hash 防重复
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const name = crypto.randomBytes(16).toString('hex') + ext
    cb(null, name)
  },
})

// 允许的图片扩展名 → 对应魔数（文件头前几个字节）
const IMAGE_MAGIC: Record<string, Uint8Array[]> = {
  '.jpg':  [Uint8Array.from([0xFF, 0xD8, 0xFF])],
  '.jpeg': [Uint8Array.from([0xFF, 0xD8, 0xFF])],
  '.png':  [Uint8Array.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  '.gif':  [
    Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]), // GIF87a
    Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), // GIF89a
  ],
  '.webp': [Uint8Array.from([0x52, 0x49, 0x46, 0x46])], // RIFF 头，需进一步验证
}

const IMAGE_EXTENSIONS = new Set(Object.keys(IMAGE_MAGIC))

/**
 * 验证文件魔数是否与扩展名匹配
 * 防止恶意用户把脚本改名为图片上传
 */
async function verifyImageMagic(filePath: string, ext: string): Promise<boolean> {
  const magicSignatures = IMAGE_MAGIC[ext.toLowerCase()]
  if (!magicSignatures) return true // 非图片类型，跳过魔数检查

  const maxLen = Math.max(...magicSignatures.map((m) => m.length))
  let buf: Buffer
  try {
    const handle = await fs.open(filePath, 'r')
    try {
      const { bytesRead, buffer } = await handle.read(Buffer.alloc(maxLen), 0, maxLen, 0)
      buf = buffer.subarray(0, bytesRead)
    } finally {
      await handle.close()
    }
  } catch {
    return false
  }

  if (buf.length === 0) return false

  // webp 需要额外检查：前 4 字节 RIFF + 偏移 8-11 字节 WEBP
  if (ext.toLowerCase() === '.webp') {
    if (buf.length < 12) return false
    const riff = buf.slice(0, 4)
    const webp = buf.slice(8, 12)
    return riff.toString() === 'RIFF' && webp.toString() === 'WEBP'
  }

  return magicSignatures.some((sig) => {
    if (buf.length < sig.length) return false
    for (let i = 0; i < sig.length; i++) {
      if (buf[i] !== sig[i]) return false
    }
    return true
  })
}

// 限制 50MB（图像/音频/视频）
export const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = /\.(jpg|jpeg|png|gif|webp|mp3|wav|m4a|mp4|mov|pdf|txt|epub)$/i
    if (allowed.test(path.extname(file.originalname))) {
      cb(null, true)
    } else {
      cb(new Error('不支持的文件类型'))
    }
  },
})

/**
 * 上传内容验证中间件
 *
 * 在 multer 写入磁盘后、业务逻辑执行前，
 * 对图片文件做魔数校验，防止伪装成图片的恶意文件。
 * 校验不通过则删除文件并返回 400。
 */
export function validateUploadedFiles(req: Request, res: Response, next: NextFunction): void {
  const files = req.files
    ? Array.isArray(req.files)
      ? req.files
      : Object.values(req.files).flat()
    : req.file
      ? [req.file]
      : []

  if (files.length === 0) return next()

  const checks = files.map(async (file: Express.Multer.File) => {
    const ext = path.extname(file.originalname).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) return { ok: true, file }

    const valid = await verifyImageMagic(file.path, ext)
    return { ok: valid, file, ext }
  })

  Promise.all(checks)
    .then((results) => {
      const invalid = results.find((r) => !r.ok)
      if (invalid) {
        // 校验失败：删除所有已上传文件，返回错误
        Promise.all(
          results
            .filter((r) => r.file?.path)
            .map((r) => fs.unlink(r.file!.path).catch(() => {})),
        ).catch(() => {})

        logger.warn('上传文件魔数校验失败', {
          ext: invalid.ext,
          originalName: invalid.file?.originalname,
          size: invalid.file?.size,
          ip: req.ip,
        })

        res.status(400).json({ error: '文件内容与扩展名不匹配，请上传真实的图片文件' })
        return
      }
      next()
    })
    .catch(next)
}
