/**
 * 用户管理服务层 — 从 routes/admin.ts 提取
 */

import bcrypt from 'bcryptjs'
import prisma from '../../mank-infra/database/prisma'
import { addTokens } from '../../mank-core/billing/tokenService'
import { cfgNum } from '../../mank-infra/config/siteConfig'
import { generateNextUid } from '../auth/uidGenerator'
import logger from '../../mank-infra/logging/logger'
import {
  isStrictlyAbove, roleAssignableBy, preventSuperadminSelfDemotion,
  UNIQUE_SUPERADMIN_EMAIL, canSeeRole,
} from '../../mank-infra/middleware/auth'
import {
  BusinessError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
} from '../../mank-common/errors'

// ───────────────────── 用户列表 ─────────────────────

export async function listUsers(operatorRole: string | undefined, role?: string, keyword?: string) {
  logger.info('SERVICE_LIST_USERS_ENTRY', { operatorRole, role, keyword })
  const visibleRoles = operatorRole === 'superadmin'
    ? ['user', 'admin', 'superadmin']
    : ['user', 'admin']

  const where: any = {}
  if (role && visibleRoles.includes(role)) {
    where.role = role
  } else {
    where.role = { in: visibleRoles }
  }
  if (keyword) {
    where.OR = [
      { email: { contains: keyword } },
      { nickname: { contains: keyword } },
    ]
  }

  const result = await prisma.user.findMany({
    where,
    select: {
      id: true, uid: true, email: true, nickname: true, avatar: true, bio: true,
      role: true, enabled: true, createdAt: true, updatedAt: true,
      _count: { select: { works: true, comments: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
  logger.info('SERVICE_LIST_USERS_EXIT', { count: result.length })
  return result
}

// ───────────────────── 用户详情 ─────────────────────

export async function getUserDetail(operatorRole: string | undefined, targetId: string) {
  logger.info('SERVICE_GET_USER_DETAIL_ENTRY', { operatorRole, targetId })
  const targetBrief = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } })
  if (!targetBrief) throw new NotFoundError('用户不存在')
  if (!canSeeRole(operatorRole, targetBrief.role)) {
    throw new ForbiddenError('无权查看该用户')
  }

  const [user, quota, recentGenerations, tasks, usageStats] = await Promise.all([
    prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true, email: true, nickname: true, avatar: true, bio: true,
        role: true, enabled: true, createdAt: true, updatedAt: true,
        _count: { select: { works: true, comments: true, likes: true } },
      },
    }),
    prisma.userQuota.findUnique({ where: { userId: targetId } }),
    prisma.generationLog.findMany({
      where: { userId: targetId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.userTask.findMany({
      where: { userId: targetId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.generationLog.aggregate({
      where: { userId: targetId },
      _sum: { tokensUsed: true },
      _count: { _all: true },
    }),
  ])

  if (!user) throw new NotFoundError('用户不存在')

  const result = {
    user,
    quota,
    recentGenerations,
    tasks,
    usageStats: {
      totalGenerations: usageStats._count._all,
      totalTokensUsed: usageStats._sum.tokensUsed ?? 0,
    },
  }
  logger.info('SERVICE_GET_USER_DETAIL_EXIT', { targetId, totalGenerations: result.usageStats.totalGenerations })
  return result
}

// ───────────────────── 修改角色 ─────────────────────

export async function updateUserRole(
  operatorId: string, operatorEmail: string | null, operatorRole: string,
  targetId: string, newRole: string,
) {
  logger.info('SERVICE_UPDATE_USER_ROLE_ENTRY', { operatorId, targetId, newRole })
  const VALID_ROLES = ['user', 'admin', 'superadmin']
  if (!VALID_ROLES.includes(newRole)) {
    throw new BusinessError('非法的角色值（合法：user / admin）')
  }

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, email: true, role: true } })
  if (!target) throw new NotFoundError('用户不存在')

  const assignable = roleAssignableBy(target.email, newRole)
  if (!assignable.ok) throw new BusinessError(assignable.error!)

  const demotionOk = preventSuperadminSelfDemotion(operatorEmail ?? undefined, target.email, newRole)
  if (!demotionOk.ok) throw new BusinessError(demotionOk.error!)

  if (!isStrictlyAbove(operatorRole, target.role)) {
    const selfNoOp = operatorEmail === UNIQUE_SUPERADMIN_EMAIL && target.email === UNIQUE_SUPERADMIN_EMAIL && newRole === 'superadmin'
    if (!selfNoOp) throw new ForbiddenError('无权修改同级或更高级用户的角色')
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: targetId },
      data: { role: newRole },
      select: { id: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true, updatedAt: true },
    })
    const supers = await tx.user.findMany({ where: { role: 'superadmin' }, select: { id: true, email: true } })
    if (supers.length > 1) {
      throw Object.assign(new Error('唯一性校验失败：存在多个超级管理员（已回滚）'), { status: 400 })
    }
    if (supers.length === 1 && supers[0].email !== UNIQUE_SUPERADMIN_EMAIL) {
      throw Object.assign(new Error(`唯一性校验失败：超级管理员必须是 ${UNIQUE_SUPERADMIN_EMAIL}（已回滚）`), { status: 400 })
    }
    return row
  })

  logger.info('ADMIN_UPDATE_USER_ROLE', { operatorId, operatorEmail, targetId: target.id, targetEmail: target.email, from: target.role, to: newRole, ok: true })
  return updated
}

// ───────────────────── 创建用户 ─────────────────────

export interface CreateUserDTO {
  operatorId: string
  operatorEmail: string | null
  operatorRole: string
  email: string
  password: string
  nickname?: string
  role?: string
}

export async function createUser(dto: CreateUserDTO) {
  const { operatorId, operatorEmail, operatorRole, email, password, nickname, role } = dto
  logger.info('SERVICE_CREATE_USER_ENTRY', { operatorId, email, nickname, role })
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) throw new ConflictError('该邮箱已注册')

  let targetRole = (role && typeof role === 'string') ? role : 'user'
  if (targetRole === 'superadmin') {
    const selfBootstrap = operatorEmail === UNIQUE_SUPERADMIN_EMAIL && email === UNIQUE_SUPERADMIN_EMAIL
    if (!selfBootstrap) {
      throw new BusinessError(`系统唯一超级管理员约束生效：${UNIQUE_SUPERADMIN_EMAIL}，不能为其他账号授予 superadmin`)
    }
  } else {
    const VALID_ROLES = ['user', 'admin']
    if (!VALID_ROLES.includes(targetRole)) throw new BusinessError('非法的角色值（合法：user / admin）')
    if (operatorRole !== 'superadmin' && targetRole === 'admin') {
      throw new ForbiddenError('无权创建管理员账号')
    }
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const uid = await generateNextUid()
  const newUser = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        uid, email, password: hashedPassword,
        nickname: nickname || email.split('@')[0],
        role: targetRole,
      },
      select: { id: true, uid: true, email: true, nickname: true, avatar: true, bio: true, role: true, createdAt: true },
    })
    const supers = await tx.user.findMany({ where: { role: 'superadmin' }, select: { id: true, email: true } })
    if (supers.length > 1) throw Object.assign(new Error('唯一性校验失败：存在多个超级管理员（已回滚）'), { status: 400 })
    if (supers.length === 1 && supers[0].email !== UNIQUE_SUPERADMIN_EMAIL) {
      throw Object.assign(new Error(`唯一性校验失败：超级管理员必须是 ${UNIQUE_SUPERADMIN_EMAIL}（已回滚）`), { status: 400 })
    }
    return u
  })

  const plan = (newUser.role === 'superadmin' || newUser.role === 'admin') ? 'enterprise' : 'free'
  const totalTokens = await cfgNum('login.new_user_tokens', 100000)
  const adminTokens = newUser.role === 'user' ? totalTokens : 999_999_999
  await prisma.userQuota.create({
    data: { userId: newUser.id, planId: plan, totalTokens: adminTokens, usedTokens: 0, remainingTokens: adminTokens },
  })

  logger.info('ADMIN_CREATE_USER', { operatorId, operatorEmail, newUser: { id: newUser.id, email: newUser.email, role: newUser.role }, ok: true })
  return newUser
}

// ───────────────────── 充值 ─────────────────────

export async function rechargeUser(targetId: string, amount: number, operatorId: string, operatorEmail: string | null) {
  logger.info('SERVICE_RECHARGE_USER_ENTRY', { targetId, amount, operatorId })
  if (!amount || amount <= 0) throw new BusinessError('充值金额必须为正整数')

  const target = await prisma.user.findUnique({ where: { id: targetId } })
  if (!target) throw new NotFoundError('用户不存在')

  let quota = await prisma.userQuota.findUnique({ where: { userId: targetId } })
  if (!quota) {
    quota = await prisma.userQuota.create({
      data: { userId: targetId, totalTokens: 100000, usedTokens: 0, remainingTokens: 100000, planId: 'free' },
    })
  }

  const addResult = await addTokens({
    userId: targetId, amount, type: 'admin_adjust',
    relatedType: 'admin', relatedId: operatorId,
    reason: `管理员充值，操作人: ${operatorEmail || operatorId}`,
  })

  const updated = await prisma.userQuota.update({
    where: { userId: targetId },
    data: { totalTokens: { increment: amount } },
  })

  await prisma.paymentOrder.create({
    data: { userId: targetId, amount: 0, tokens: amount, payMethod: 'admin_recharge', status: 'completed' },
  })

  const result = { ok: true, newTotal: updated.totalTokens, newRemaining: addResult.remaining, added: amount }
  logger.info('SERVICE_RECHARGE_USER_EXIT', { targetId, amount, newTotal: result.newTotal })
  return result
}

// ───────────────────── 启禁用 ─────────────────────

export async function setUserEnabled(operatorId: string, operatorRole: string | undefined, targetId: string, enabled: boolean) {
  logger.info('SERVICE_SET_USER_ENABLED_ENTRY', { operatorId, targetId, enabled })
  if (typeof enabled !== 'boolean') throw new BusinessError('enabled 必须是 boolean')
  if (operatorId === targetId) throw new BusinessError('不能修改自己')

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { role: true } })
  if (!target) throw new NotFoundError('用户不存在')
  if (!isStrictlyAbove(operatorRole, target.role)) throw new ForbiddenError('不能操作同级或更高级别的用户')

  const updated = await prisma.user.update({ where: { id: targetId }, data: { enabled } })
  logger.info('SERVICE_SET_USER_ENABLED_EXIT', { targetId, enabled: updated.enabled })
  return { ok: true, enabled: updated.enabled }
}

// ───────────────────── 修改用户信息 ─────────────────────

export async function updateUserInfo(
  operatorId: string, operatorRole: string | undefined,
  targetId: string, data: { nickname?: string; email?: string; bio?: string; avatar?: string },
) {
  logger.info('SERVICE_UPDATE_USER_INFO_ENTRY', { operatorId, targetId, fields: Object.keys(data) })
  if (data.nickname === undefined && data.email === undefined && data.bio === undefined && data.avatar === undefined) {
    throw new BusinessError('至少提供一个要修改的字段（nickname/email/bio/avatar）')
  }
  if (operatorId === targetId) throw new BusinessError('不能修改自己，请前往设置页')

  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true, role: true, email: true } })
  if (!target) throw new NotFoundError('用户不存在')
  if (!isStrictlyAbove(operatorRole, target.role)) throw new ForbiddenError('只能修改下级用户信息')

  if (data.email !== undefined && data.email.trim() === UNIQUE_SUPERADMIN_EMAIL && target.email !== UNIQUE_SUPERADMIN_EMAIL) {
    throw new BusinessError(`不能把其他账号邮箱改为系统保留邮箱 ${UNIQUE_SUPERADMIN_EMAIL}`)
  }

  if (data.email !== undefined && data.email !== target.email) {
    const exist = await prisma.user.findUnique({ where: { email: data.email } })
    if (exist) throw new ConflictError('该邮箱已被占用')
  }

  const updateData: any = {}
  if (data.nickname !== undefined) updateData.nickname = data.nickname.trim() || target.email.split('@')[0]
  if (data.email !== undefined) updateData.email = data.email.trim()
  if (data.bio !== undefined) updateData.bio = data.bio
  if (data.avatar !== undefined) updateData.avatar = data.avatar

  const result = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: { id: true, email: true, nickname: true, avatar: true, bio: true, role: true, enabled: true, createdAt: true, updatedAt: true },
  })
  logger.info('SERVICE_UPDATE_USER_INFO_EXIT', { targetId })
  return result
}

// ───────────────────── 修改套餐 ─────────────────────

export async function updateUserPlan(targetId: string, planId?: string, totalTokens?: number) {
  logger.info('SERVICE_UPDATE_USER_PLAN_ENTRY', { targetId, planId, totalTokens })
  if (!planId && totalTokens === undefined) throw new BusinessError('planId 或 totalTokens 至少提供一个')

  const quota = await prisma.userQuota.findUnique({ where: { userId: targetId } })
  if (!quota) throw new NotFoundError('用户额度不存在')

  const data: any = {}
  if (planId) data.planId = planId
  if (totalTokens !== undefined && totalTokens >= 0) {
    const delta = totalTokens - quota.totalTokens
    data.totalTokens = totalTokens
    data.remainingTokens = { increment: delta }
  }

  const result = { ok: true, quota: await prisma.userQuota.update({ where: { userId: targetId }, data }) }
  logger.info('SERVICE_UPDATE_USER_PLAN_EXIT', { targetId, planId, totalTokens })
  return result
}

// ───────────────────── 删除用户 ─────────────────────

export async function deleteUser(
  operatorId: string, operatorEmail: string | null, operatorRole: string,
  targetId: string, password: string,
) {
  logger.info('SERVICE_DELETE_USER_ENTRY', { operatorId, targetId })
  if (!password || typeof password !== 'string') throw new BusinessError('请提供操作者登录密码确认')

  const operatorRecord = await prisma.user.findUnique({ where: { id: operatorId }, select: { password: true, role: true } })
  if (!operatorRecord) throw new AuthError('操作者不存在')
  const pwdOk = await bcrypt.compare(password, operatorRecord.password)
  if (!pwdOk) throw new AuthError('操作者密码错误')

  if (String(operatorId) === String(targetId)) throw new BusinessError('超级管理员不能删除自己的账号')

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, email: true, nickname: true, role: true, createdAt: true },
  })
  if (!target) throw new NotFoundError('用户不存在')

  if (!isStrictlyAbove(operatorRole, target.role)) throw new ForbiddenError('无权删除同级或更高级别的用户')

  const [works, comments, likes, projects, tasks, payments, subscriptions, generations] = await Promise.all([
    prisma.work.count({ where: { userId: targetId } }),
    prisma.comment.count({ where: { userId: targetId } }),
    prisma.like.count({ where: { userId: targetId } }),
    prisma.project.count({ where: { userId: targetId } }),
    prisma.userTask.count({ where: { userId: targetId } }),
    prisma.paymentOrder.count({ where: { userId: targetId } }),
    prisma.subscription.count({ where: { userId: targetId } }),
    prisma.generationLog.count({ where: { userId: targetId } }),
  ])

  await prisma.$transaction(async (tx) => {
    await tx.like.deleteMany({ where: { userId: targetId } })
    await tx.comment.deleteMany({ where: { userId: targetId } })
    await tx.userTask.deleteMany({ where: { userId: targetId } })
    await tx.paymentOrder.deleteMany({ where: { userId: targetId } })
    await tx.subscription.deleteMany({ where: { userId: targetId } })
    await tx.generationLog.deleteMany({ where: { userId: targetId } })
    await tx.userQuota.deleteMany({ where: { userId: targetId } })
    await tx.project.deleteMany({ where: { userId: targetId } })
    await tx.work.deleteMany({ where: { userId: targetId } })
    await tx.user.delete({ where: { id: targetId } })
  })

  const audit = {
    op: 'ADMIN_DELETE_USER', at: new Date().toISOString(),
    operatorId, operatorRole, operatorEmail,
    targetId: target.id, targetEmail: target.email, targetNickname: target.nickname,
    targetRole: target.role, targetCreatedAt: target.createdAt,
    affected: { works, comments, likes, projects, tasks, payments, subscriptions, generations },
  }
  logger.info('ADMIN_DELETE_USER', audit)

  return {
    ok: true, id: target.id, email: target.email, nickname: target.nickname, role: target.role,
    affected: audit.affected,
  }
}
