import jwt from 'jsonwebtoken'

// 启动时强制校验 JWT 密钥 — 不允许使用硬编码 fallback
const REQUIRED_SECRET = process.env.JWT_SECRET
if (!REQUIRED_SECRET || REQUIRED_SECRET.length < 16) {
  console.error('[FATAL] JWT_SECRET 环境变量未设置或长度不足 (最小 16 字符)')
  console.error('[FATAL] 请在 server/.env 中设置 JWT_SECRET=<随机长字符串>')
  process.exit(1)
}
const SECRET = REQUIRED_SECRET
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d'

export interface JwtPayload {
  userId: string
  email: string
  role: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions)
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload
  } catch {
    return null
  }
}
