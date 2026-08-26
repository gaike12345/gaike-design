import multer from 'multer'
import path from 'path'
import crypto from 'crypto'

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
