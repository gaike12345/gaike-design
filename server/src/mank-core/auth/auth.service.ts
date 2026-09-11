/**
 * 认证服务层 — 从 routes/auth.ts 提取
 * 将数据库操作和业务逻辑与路由层解耦
 */

import bcrypt from 'bcryptjs'
import prisma from '../../mank-infra/database/prisma'
import { signToken } from '../../mank-common/utils/jwt'
import { cfgNum } from '../../mank-infra/config/siteConfig'
import { generateNextUid } from './uidGenerator'
import { UNIQUE_SUPERADMIN_EMAIL } from '../../mank-infra/middleware/auth'
import logger from '../../mank-infra/logging/logger'
import {
  AuthError,
  BusinessError,
  ForbiddenError,
  NotFoundError,
} from '../../mank-common/errors'

export interface AuthUser {
  id: string
  uid: number
  nickname: string
  avatar: string | null
  role: string
}

export interface AuthResult {
  token: string
  user: AuthUser
}

/** 注册新用户 */
export async function registerUser(password: string, nickname?: string): Promise<AuthResult> {
  logger.info('SERVICE_REGISTER_USER_ENTRY', { nickname })
  const hashed = await bcrypt.hash(password, 10)
  const uid = await generateNextUid()
  const internalEmail = `uid_${uid}@local`

  const user = await prisma.user.create({
    data: {
      uid,
      email: internalEmail,
      password: hashed,
      nickname: nickname || `用户${uid}`,
    },
  })

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
  logger.info('SERVICE_REGISTER_USER_EXIT', { uid: user.uid, userId: user.id, freeTokens })
  return {
    token,
    user: { id: user.id, uid: user.uid, nickname: user.nickname, avatar: user.avatar, role: user.role },
  }
}

/** UID + 密码登录 */
export async function loginByUid(uid: number, password: string): Promise<AuthResult> {
  logger.info('SERVICE_LOGIN_BY_UID_ENTRY', { uid })
  const user = await prisma.user.findUnique({ where: { uid } })

  if (!user) throw new AuthError('UID 或密码错误')
  if (!user.password) throw new AuthError('该账号未设置密码，请联系管理员')

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) throw new AuthError('UID 或密码错误')
  if (!user.enabled) throw new ForbiddenError('账号已被关闭，请联系管理员')

  const token = signToken({ userId: user.id, uid: user.uid, email: user.email, role: user.role })
  logger.info('SERVICE_LOGIN_BY_UID_EXIT', { uid: user.uid, userId: user.id, role: user.role })
  return {
    token,
    user: { id: user.id, uid: user.uid, nickname: user.nickname, avatar: user.avatar, role: user.role },
  }
}

/** 获取当前用户信息 */
export async function getUserProfile(userId: string) {
  logger.info('SERVICE_GET_USER_PROFILE_ENTRY', { userId })
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, uid: true, nickname: true, avatar: true, bio: true, role: true },
  })
  if (!user) throw new NotFoundError('用户不存在')
  logger.info('SERVICE_GET_USER_PROFILE_EXIT', { userId, uid: user.uid })
  return user
}

/** 更新用户资料 */
export async function updateProfile(userId: string, data: { nickname?: string; bio?: string }) {
  logger.info('SERVICE_UPDATE_PROFILE_ENTRY', { userId, fields: Object.keys(data) })
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.nickname !== undefined && { nickname: data.nickname }),
      ...(data.bio !== undefined && { bio: data.bio }),
    },
    select: { id: true, uid: true, nickname: true, avatar: true, bio: true, role: true },
  })
  logger.info('SERVICE_UPDATE_PROFILE_EXIT', { userId, uid: updated.uid })
  return updated
}

/** 修改密码（需验证旧密码） */
export async function changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
  logger.info('SERVICE_CHANGE_PASSWORD_ENTRY', { userId })
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  })
  if (!user) throw new NotFoundError('用户不存在')
  if (!user.password) throw new BusinessError('当前账号未设置密码，请联系管理员')

  const valid = await bcrypt.compare(oldPassword, user.password)
  if (!valid) throw new BusinessError('旧密码不正确')

  if (oldPassword === newPassword) {
    throw new BusinessError('新密码不能与旧密码相同')
  }

  const hashed = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashed },
  })
  logger.info('SERVICE_CHANGE_PASSWORD_EXIT', { userId })
}

// AuthError 已迁移到 mank-common/errors.ts（统一异常分类体系）
// 规范第八章：异常分类拦截

/** 确保 superadmin 唯一性（防止非 admin@manktv.com 的账号持有 superadmin） */
export async function enforceUniqueSuperadmin(userId: string, newRole: string): Promise<void> {
  if (newRole === 'superadmin') {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
    if (user?.email !== UNIQUE_SUPERADMIN_EMAIL) {
      throw new ForbiddenError('仅系统预留邮箱可持有超级管理员角色')
    }
  }
}
