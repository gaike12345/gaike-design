// UID 生成器 + 统一用户创建
//
// 核心不变量：每个账号有且仅有一个 UID，全局唯一，不可修改
// 并发安全：uid 字段 @unique + 事务内原子生成 + 冲突自动重试
//
// 所有创建用户的入口（注册 / 短信登录 / 邮箱登录 / 微信登录 / 管理员新建）
// 都必须通过 createUserWithUid() 创建，确保 UID 一致性。

import prisma from './prisma'

const START_UID = 100_000
const MAX_RETRIES = 5

export type UserRole = 'user' | 'admin' | 'superadmin'

export interface CreateUserInput {
  email?: string
  phone?: string | null
  password?: string
  nickname?: string
  avatar?: string | null
  role?: UserRole
  wechatOpenid?: string
}

export interface CreatedUser {
  id: string
  uid: number
  email: string | null
  phone: string | null
  nickname: string
  avatar: string | null
  role: string
  createdAt: Date
}

/**
 * 创建用户并分配全局唯一的 UID（并发安全）
 *
 * 机制：
 *   1. 在事务内查询 max(uid) + 1 作为新 UID
 *   2. 在同一事务内创建用户
 *   3. 若因并发导致唯一索引冲突（P2002），自动重试（最多 MAX_RETRIES 次）
 *   4. 数据库层 uid @unique 是最后一道防线，绝对不会产生重复
 *
 * @param data 用户数据
 * @returns 新创建的用户（含 uid）
 */
export async function createUserWithUid(data: CreateUserInput): Promise<CreatedUser> {
  let lastError: unknown = null

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const user = await prisma.$transaction(async (tx) => {
        // 1. 查询当前最大 UID
        const maxUser = await tx.user.findFirst({
          orderBy: { uid: 'desc' },
          select: { uid: true },
        })
        const nextUid = (maxUser?.uid ?? START_UID - 1) + 1

        // 2. 在同一事务内创建用户
        const userData: Record<string, unknown> = {
          uid: nextUid,
          nickname: data.nickname || (data.email ? data.email.split('@')[0] : `漫友${nextUid}`),
          avatar: data.avatar,
          role: data.role || 'user',
        }
        if (data.email) userData.email = data.email
        if (data.phone) userData.phone = data.phone
        if (data.password) userData.password = data.password
        if (data.wechatOpenid) userData.wechatOpenid = data.wechatOpenid

        const created = await tx.user.create({
          data: userData as any,
          select: {
            id: true,
            uid: true,
            email: true,
            phone: true,
            nickname: true,
            avatar: true,
            role: true,
            createdAt: true,
          },
        })

        return created
      })

      return user as CreatedUser
    } catch (e) {
      // 唯一索引冲突（Prisma P2002）— 并发时另一个请求抢走了这个 UID，重试
      const code = (e as any)?.code
      if (code === 'P2002' || String(e).includes('Unique constraint')) {
        lastError = e
        continue
      }
      throw e
    }
  }

  throw new Error(
    `创建用户失败：UID 分配重试 ${MAX_RETRIES} 次仍冲突，请检查是否有大量并发注册。` +
    (lastError ? ` 最后错误：${(lastError as Error).message}` : '')
  )
}

/**
 * 校验字符串是否为合法 UID 格式（6 位及以上纯数字）
 */
export function isValidUid(value: string): boolean {
  return /^\d{6,}$/.test(value)
}

/**
 * 兼容旧接口：单独生成下一个 UID
 * 注意：仅用于查询展示，不要用返回值去创建用户（会有 TOCTOU 竞态）
 * 创建用户请直接用 createUserWithUid()
 *
 * @deprecated 请使用 createUserWithUid() 替代
 */
export async function generateNextUid(): Promise<number> {
  const maxUser = await prisma.user.findFirst({
    orderBy: { uid: 'desc' },
    select: { uid: true },
  })
  return (maxUser?.uid ?? START_UID - 1) + 1
}
