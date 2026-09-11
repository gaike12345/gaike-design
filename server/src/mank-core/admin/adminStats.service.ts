/**
 * 统计与日志服务层 — 从 routes/admin.ts 提取
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'

// ───────────────────── 平台总览统计 辅助函数 ─────────────────────

/** 将 7 日 generationLog groupBy 结果整理为日趋势图表数据 */
function buildDailyLogs7(
  rows: Array<{ createdAt: Date; _count: { _all: number }; _sum: { tokensUsed: number | null } }>,
  today: Date,
): Array<{ date: string; calls: number; tokens: number }> {
  const map = new Map<string, { calls: number; tokens: number }>()
  rows.forEach((r) => {
    const d = new Date(r.createdAt as any)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const cur = map.get(key) ?? { calls: 0, tokens: 0 }
    cur.calls += r._count._all
    cur.tokens += r._sum.tokensUsed ?? 0
    map.set(key, cur)
  })
  const out: Array<{ date: string; calls: number; tokens: number }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    const v = map.get(key) ?? { calls: 0, tokens: 0 }
    out.push({ date: key, calls: v.calls, tokens: v.tokens })
  }
  return out
}

/** 从聚合查询结果构建平台统计返回对象 */
function buildPlatformStatsResult(data: {
  totalUsers: number; totalWorks: number; totalComments: number
  totalLikesAgg: { _sum: { likesCount: number | null } }
  worksByType: Array<{ type: string; _count: { _all: number } }>
  usersByRole: Array<{ role: string; _count: { _all: number } }>
  activeModels: number
  totalQuotaAgg: { _sum: { totalTokens: number | null; usedTokens: number | null; remainingTokens: number | null } }
  todayNewUsers: number; ydayNewUsers: number; todayNewWorks: number
  aiTypeAgg: Array<{ type: string; _count: { _all: number }; _sum: { tokensUsed: number | null } }>
  dailyLogs7: Array<{ date: string; calls: number; tokens: number }>
}) {
  const worksByTypeMap: Record<string, number> = {}
  data.worksByType.forEach((item) => { worksByTypeMap[item.type] = item._count._all })

  const usersByRoleMap: Record<string, number> = {}
  data.usersByRole.forEach((item) => { usersByRoleMap[item.role] = item._count._all })

  const aiTypeMap: Record<string, { calls: number; tokens: number }> = {}
  data.aiTypeAgg.forEach((r) => {
    aiTypeMap[r.type] = { calls: r._count._all, tokens: r._sum.tokensUsed ?? 0 }
  })

  return {
    totalUsers: data.totalUsers, totalWorks: data.totalWorks, totalComments: data.totalComments,
    totalLikes: data.totalLikesAgg._sum.likesCount ?? 0,
    worksByType: worksByTypeMap,
    usersByRole: usersByRoleMap,
    activeModels: data.activeModels,
    totalQuota: {
      total: data.totalQuotaAgg._sum.totalTokens ?? 0,
      used: data.totalQuotaAgg._sum.usedTokens ?? 0,
      remaining: data.totalQuotaAgg._sum.remainingTokens ?? 0,
    },
    todayNewUsers: data.todayNewUsers, ydayNewUsers: data.ydayNewUsers, todayNewWorks: data.todayNewWorks,
    aiByType: aiTypeMap,
    last7Days: data.dailyLogs7,
  }
}

// ───────────────────── 平台总览统计 ─────────────────────

export async function getPlatformStats() {
  logger.info('SERVICE_GET_PLATFORM_STATS_ENTRY', {})
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const d7 = new Date(today); d7.setDate(d7.getDate() - 6)

  const [
    totalUsers, totalWorks, totalComments, totalLikesAgg,
    worksByType, usersByRole, activeModels, totalQuotaAgg,
    todayNewUsers, ydayNewUsers, todayNewWorks, aiTypeAgg, dailyLogs7,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.work.count(),
    prisma.comment.count(),
    prisma.work.aggregate({ _sum: { likesCount: true } }),
    prisma.work.groupBy({ by: ['type'], _count: { _all: true } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.aIModel.count({ where: { status: 'active' } }),
    prisma.userQuota.aggregate({ _sum: { totalTokens: true, usedTokens: true, remainingTokens: true } }),
    prisma.user.count({ where: { createdAt: { gte: today } } }),
    prisma.user.count({ where: { createdAt: { gte: yesterday, lt: today } } }),
    prisma.work.count({ where: { createdAt: { gte: today } } }),
    prisma.generationLog.groupBy({ by: ['type'], _count: { _all: true }, _sum: { tokensUsed: true } }),
    prisma.generationLog.groupBy({
      by: ['createdAt'], _count: { _all: true }, _sum: { tokensUsed: true },
      where: { createdAt: { gte: d7 } }, orderBy: { createdAt: 'asc' },
    }).then((rows) => buildDailyLogs7(rows, today)),
  ])

  const result = buildPlatformStatsResult({
    totalUsers, totalWorks, totalComments, totalLikesAgg,
    worksByType, usersByRole, activeModels, totalQuotaAgg,
    todayNewUsers, ydayNewUsers, todayNewWorks, aiTypeAgg, dailyLogs7,
  })
  logger.info('SERVICE_GET_PLATFORM_STATS_EXIT', { totalUsers, totalWorks, totalComments })
  return result
}

// ───────────────────── 生成记录查询 ─────────────────────

export async function getGenerationLogs(params: {
  type?: string; userId?: string; status?: string
  startDate?: string; endDate?: string
  page: number; pageSize: number
}) {
  const { type, userId, status, startDate, endDate, page, pageSize } = params
  logger.info('SERVICE_GET_GENERATION_LOGS_ENTRY', { type, userId, status, page, pageSize })

  const where: {
    type?: string; userId?: string; status?: string
    createdAt?: { gte?: Date; lte?: Date }
  } = {}
  if (type) where.type = type
  if (userId) where.userId = userId
  if (status) where.status = status
  if (startDate) where.createdAt = { gte: new Date(startDate) }
  if (endDate) where.createdAt = { ...where.createdAt, lte: new Date(endDate) }

  const [logs, total] = await Promise.all([
    prisma.generationLog.findMany({
      where, orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize, take: pageSize,
      include: { user: { select: { id: true, nickname: true, email: true, avatar: true } } },
    }),
    prisma.generationLog.count({ where }),
  ])

  const result = { logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) }
  logger.info('SERVICE_GET_GENERATION_LOGS_EXIT', { total, page, pageSize })
  return result
}

// ───────────────────── 全局生成统计 ─────────────────────

/** 从聚合查询结果构建生成统计返回对象 */
function buildGenerationStatsResult(data: {
  days: number
  byType: Array<{ type: string; _count: { _all: number }; _sum: { tokensUsed: number | null } }>
  byDay: Array<{ createdAt: Date; _count: { _all: number }; _sum: { tokensUsed: number | null } }>
  topUsers: Array<{ userId: string; _count: { _all: number }; _sum: { tokensUsed: number | null } }>
  topUserMap: Map<string, { id: string; nickname: string; email: string; avatar: string | null }>
  totalStats: { _count: { _all: number }; _sum: { tokensUsed: number | null } }
}) {
  const byTypeMap: Record<string, { count: number; tokens: number }> = {}
  data.byType.forEach((item) => {
    byTypeMap[item.type] = { count: item._count._all, tokens: item._sum.tokensUsed ?? 0 }
  })

  const byDayMap: Record<string, { count: number; tokens: number }> = {}
  data.byDay.forEach((item) => {
    const dayKey = new Date(item.createdAt).toISOString().slice(0, 10)
    if (!byDayMap[dayKey]) byDayMap[dayKey] = { count: 0, tokens: 0 }
    byDayMap[dayKey].count += item._count._all
    byDayMap[dayKey].tokens += item._sum.tokensUsed ?? 0
  })

  const topUsersWithInfo = data.topUsers.map((u) => ({
    ...data.topUserMap.get(u.userId),
    count: u._count?._all ?? 0,
    tokens: u._sum?.tokensUsed ?? 0,
  })).sort((a, b) => b.count - a.count)

  return {
    days: data.days,
    total: { count: data.totalStats._count._all, tokens: data.totalStats._sum.tokensUsed ?? 0 },
    byType: byTypeMap,
    byDay: byDayMap,
    topUsers: topUsersWithInfo,
  }
}

export async function getGenerationStats(days: number) {
  logger.info('SERVICE_GET_GENERATION_STATS_ENTRY', { days })
  const since = new Date()
  since.setDate(since.getDate() - days)

  const [byType, byDay, topUsers, totalStats] = await Promise.all([
    prisma.generationLog.groupBy({
      by: ['type'], where: { createdAt: { gte: since } },
      _count: { _all: true }, _sum: { tokensUsed: true },
    }),
    prisma.generationLog.groupBy({
      by: ['createdAt'], where: { createdAt: { gte: since } },
      _count: { _all: true }, _sum: { tokensUsed: true },
    }),
    prisma.generationLog.groupBy({
      by: ['userId'], where: { createdAt: { gte: since } },
      _count: { _all: true }, _sum: { tokensUsed: true },
      orderBy: { userId: 'desc' }, take: 10,
    }),
    prisma.generationLog.aggregate({
      where: { createdAt: { gte: since } },
      _count: { _all: true }, _sum: { tokensUsed: true },
    }),
  ])

  const topUserIds = topUsers.map((u) => u.userId)
  const topUserInfos = await prisma.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, nickname: true, email: true, avatar: true },
  })
  const topUserMap = new Map(topUserInfos.map((u) => [u.id, u]))

  const result = buildGenerationStatsResult({ days, byType, byDay, topUsers, topUserMap, totalStats })
  logger.info('SERVICE_GET_GENERATION_STATS_EXIT', { days, total: result.total })
  return result
}
