import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type JwtPayload } from '../lib/jwt'

// 扩展 Request 类型，携带已认证用户
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

// JWT 认证中间件 — 从 Authorization header 提取 token
export function authRequired(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: '未登录' })
  }
  const token = header.slice(7)
  const payload = verifyToken(token)
  if (!payload) {
    return res.status(401).json({ error: '登录已过期' })
  }
  req.user = payload
  next()
}

// 可选认证 — 有 token 则解析，无 token 也放行（用于公开接口区分登录状态）
export function authOptional(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    const token = header.slice(7)
    const payload = verifyToken(token)
    if (payload) req.user = payload
  }
  next()
}

// RBAC 角色校验中间件 — 限制访问的角色列表
// 用法：router.post('/', authRequired, requireRole('admin'), handler)
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: '未登录' })
    }
    const userRole = req.user.role || 'user'
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: '权限不足，需要 ' + roles.join(' 或 ') + ' 角色' })
    }
    next()
  }
}

// 超级管理员专属
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "未登录" })
  if (req.user.role !== "superadmin") return res.status(403).json({ error: "需要超级管理员权限" })
  next()
}
// 管理员及以上（admin + superadmin 均可）
export function requireAdminOrAbove(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: "未登录" })
  const r = req.user.role || "user"
  if (r !== "admin" && r !== "superadmin") return res.status(403).json({ error: "需要管理员权限" })
  next()
}