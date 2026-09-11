import type { Request, Response, NextFunction } from 'express'
import { verifyToken, type JwtPayload } from '../../mank-common/utils/jwt'

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

// ===== 角色层级工具（需求1/2：层级可见性与修改权限） =====
// 层级：superadmin(3) > admin(2) > user(1)
export const ROLE_LEVEL: Record<string, number> = { user: 1, admin: 2, superadmin: 3 }
export const ASSIGNABLE_ROLES: Role[] = ['user', 'admin']
export type Role = 'user' | 'admin' | 'superadmin'

// ===== 安全不变量：超级管理员只能有一个（固定邮箱） =====
// 写一次原则：只有该邮箱的用户能持有 role=superadmin。任何 API/Seed/CLI 绕过该约束
// 都必须在服务端二次检查（事务内）而不是依赖前端 UI。
export const UNIQUE_SUPERADMIN_EMAIL = 'admin@manktv.com'

// 该角色是否被允许作为"写入目标"。superadmin 仅允许在目标邮箱 === UNIQUE_SUPERADMIN_EMAIL
// 时使用（用于 seed 幂等回写 / 修复数据），禁止作为"权限提升"的分配结果。
export function roleAssignableBy(targetEmail: string, newRole: string): { ok: true } | { ok: false; error: string } {
  if (newRole !== 'superadmin') {
    if (['user', 'admin'].includes(newRole)) return { ok: true }
    return { ok: false, error: `未知角色：${newRole}` }
  }
  // 只允许把唯一超管邮箱的账号恢复/保持为 superadmin；禁止分配给任意其他邮箱
  if (targetEmail !== UNIQUE_SUPERADMIN_EMAIL) {
    return { ok: false, error: `系统已启用唯一超级管理员约束：${UNIQUE_SUPERADMIN_EMAIL}，不能为其他账号授予 superadmin` }
  }
  return { ok: true }
}

// 禁止唯一超级管理员把自己降级为非 superadmin（否则会锁死）。服务端做幂等校验，
// 允许显式把 UNIQUE_SUPERADMIN_EMAIL 设回 superadmin（no-op 可通过）。
export function preventSuperadminSelfDemotion(operatorEmail: string | undefined, targetEmail: string, newRole: string): { ok: true } | { ok: false; error: string } {
  if (targetEmail === UNIQUE_SUPERADMIN_EMAIL && newRole !== 'superadmin' && operatorEmail === UNIQUE_SUPERADMIN_EMAIL) {
    return { ok: false, error: '唯一超级管理员不能把自己降级，请先指派新的唯一超级管理员（该操作被系统禁止，请联系供应商）' }
  }
  if (targetEmail === UNIQUE_SUPERADMIN_EMAIL && newRole !== 'superadmin') {
    return { ok: false, error: `唯一超级管理员账号(${UNIQUE_SUPERADMIN_EMAIL})不能被降级为 ${newRole}，否则系统锁死` }
  }
  return { ok: true }
}

// 获取角色层级数值
export function roleLevel(role: string | undefined): number {
  return ROLE_LEVEL[role || 'user'] ?? 0
}

// 判断操作者是否严格高于目标角色（可操作下级）
export function isStrictlyAbove(operatorRole: string | undefined, targetRole: string | undefined): boolean {
  return roleLevel(operatorRole) > roleLevel(targetRole)
}

// 判断操作者是否可以管理目标角色（含同级）——用于"不可见高于自身"
export function canSeeRole(operatorRole: string | undefined, targetRole: string | undefined): boolean {
  return roleLevel(operatorRole) >= roleLevel(targetRole)
}