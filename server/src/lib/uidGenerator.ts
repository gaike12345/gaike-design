// UID 生成器 — 为新用户生成唯一递增的数字 UID
// 由于 SQLite 不支持非主键的 autoincrement，在应用层实现

import prisma from './prisma'

/**
 * 生成下一个可用的 UID
 * 使用事务确保并发安全
 */
export async function generateNextUid(): Promise<number> {
  // 查询当前最大 UID
  const maxUser = await prisma.user.findFirst({
    orderBy: { uid: 'desc' },
    select: { uid: true },
  })

  // 如果没有用户，从 100000 开始（6位数，看起来更正式）
  const nextUid = maxUser && maxUser.uid ? maxUser.uid + 1 : 100000

  return nextUid
}
