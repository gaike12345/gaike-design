/**
 * 统计与日志服务层 — 从 routes/admin.ts 提取
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { getTokenRatioSync } from '../billing/billingConfig.service'

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

// ───────────────────── 毛利统计（差值对账） ─────────────────────

/**
 * 毛利统计 — 聚合 GenerationLog 中 status='success' 的差值数据
 * 筛选条件：status='success' AND tokensUsed>0（确保数据准确性）
 * 聚合维度：时间范围（days） × 模型（modelId） × 类型（type）
 * 指标：调用次数、用户支付积分总和、官方成本积分总和、毛利积分总和、毛利率%
 *
 * @param params.days 天数（默认 30）
 * @param params.modelId 可选：按模型筛选
 * @param params.type 可选：按类型筛选（image/video/audio/novel/comic）
 */
export async function getRevenueStats(params: {
  days?: number
  modelId?: string
  type?: string
} = {}) {
  const { days = 30, modelId, type } = params
  logger.info('SERVICE_GET_REVENUE_STATS_ENTRY', { days, modelId, type })

  const since = new Date()
  since.setDate(since.getDate() - days)
  since.setHours(0, 0, 0, 0)

  // 筛选条件：成功调用 + 有积分消耗 + 时间范围 + 可选模型/类型筛选
  const where: {
    status: string
    tokensUsed: { gt: number }
    createdAt: { gte: Date }
    modelId?: string
    type?: string
  } = {
    status: 'success',
    tokensUsed: { gt: 0 },
    createdAt: { gte: since },
  }
  if (modelId) where.modelId = modelId
  if (type) where.type = type

  const [totalAgg, byTypeAgg, byModelAgg, byDayAgg, topUsersAgg] = await Promise.all([
    prisma.generationLog.aggregate({
      where,
      _count: { _all: true },
      _sum: {
        tokensUsed: true,
        costTokens: true,
        revenueTokens: true,
      },
    }),
    prisma.generationLog.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
      _sum: {
        tokensUsed: true,
        costTokens: true,
        revenueTokens: true,
      },
    }),
    prisma.generationLog.groupBy({
      by: ['modelId'],
      where,
      _count: { _all: true },
      _sum: {
        tokensUsed: true,
        costTokens: true,
        revenueTokens: true,
      },
      orderBy: { modelId: 'asc' },
    }),
    prisma.generationLog.groupBy({
      by: ['createdAt'],
      where,
      _count: { _all: true },
      _sum: {
        tokensUsed: true,
        costTokens: true,
        revenueTokens: true,
      },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.generationLog.groupBy({
      by: ['userId'],
      where,
      _count: { _all: true },
      _sum: {
        tokensUsed: true,
        costTokens: true,
        revenueTokens: true,
      },
      orderBy: { userId: 'desc' },
      take: 10,
    }),
  ])

  // 整理按日数据
  const byDayMap: Record<string, { calls: number; revenue: number; tokens: number; cost: number }> = {}
  for (const r of byDayAgg) {
    const key = new Date(r.createdAt).toISOString().slice(0, 10)
    if (!byDayMap[key]) byDayMap[key] = { calls: 0, revenue: 0, tokens: 0, cost: 0 }
    byDayMap[key].calls += r._count._all
    byDayMap[key].revenue += r._sum.revenueTokens ?? 0
    byDayMap[key].tokens += r._sum.tokensUsed ?? 0
    byDayMap[key].cost += r._sum.costTokens ?? 0
  }

  // 整理按类型数据
  const byTypeMap: Record<string, { calls: number; revenue: number; tokens: number; cost: number; marginPct: number }> = {}
  for (const r of byTypeAgg) {
    const tokens = r._sum.tokensUsed ?? 0
    const cost = r._sum.costTokens ?? 0
    const revenue = r._sum.revenueTokens ?? 0
    byTypeMap[r.type] = {
      calls: r._count._all,
      revenue,
      tokens,
      cost,
      marginPct: tokens > 0 ? Math.round((revenue / tokens) * 1000) / 10 : 0,
    }
  }

  // 整理按模型数据
  const byModelArr = byModelAgg
    .filter((r) => r.modelId !== null)
    .map((r) => {
      const tokens = r._sum.tokensUsed ?? 0
      const cost = r._sum.costTokens ?? 0
      const revenue = r._sum.revenueTokens ?? 0
      return {
        modelId: r.modelId as string,
        calls: r._count._all,
        revenue,
        tokens,
        cost,
        marginPct: tokens > 0 ? Math.round((revenue / tokens) * 1000) / 10 : 0,
      }
    })
    .sort((a, b) => b.revenue - a.revenue)

  // 整理 Top 用户
  const topUserIds = topUsersAgg.map((u) => u.userId)
  const topUserInfos = await prisma.user.findMany({
    where: { id: { in: topUserIds } },
    select: { id: true, nickname: true, email: true, avatar: true },
  })
  const userMap = new Map(topUserInfos.map((u) => [u.id, u]))
  const topUsersWithInfo = topUsersAgg.map((u) => {
    const info = userMap.get(u.userId)
    const tokens = u._sum.tokensUsed ?? 0
    const cost = u._sum.costTokens ?? 0
    const revenue = u._sum.revenueTokens ?? 0
    return {
      ...info,
      calls: u._count?._all ?? 0,
      revenue,
      tokens,
      cost,
      marginPct: tokens > 0 ? Math.round((revenue / tokens) * 1000) / 10 : 0,
    }
  }).sort((a, b) => b.revenue - a.revenue)

  // 汇总
  const totalTokens = totalAgg._sum.tokensUsed ?? 0
  const totalCost = totalAgg._sum.costTokens ?? 0
  const totalRevenue = totalAgg._sum.revenueTokens ?? 0

  const result = {
    days,
    total: {
      calls: totalAgg._count._all,
      tokens: totalTokens,
      cost: totalCost,
      revenue: totalRevenue,
      marginPct: totalTokens > 0 ? Math.round((totalRevenue / totalTokens) * 1000) / 10 : 0,
    },
    byType: byTypeMap,
    byModel: byModelArr,
    byDay: byDayMap,
    topUsers: topUsersWithInfo,
  }
  logger.info('SERVICE_GET_REVENUE_STATS_EXIT', { total: result.total })
  return result
}

/**
 * 历史数据回填 — 为已有的 GenerationLog 记录反算 costTokens/marginAtCall/revenueTokens
 * 使用每条记录调用时的 AIModel.margin（如果模型不存在则用默认 2.0）
 * 一次性脚本，幂等：重复执行不会重复扣减
 */
export async function rebuildRevenueHistory() {
  logger.info('SERVICE_REBUILD_REVENUE_HISTORY_ENTRY', {})
  const BATCH = 500
  let processed = 0
  let updated = 0
  let cursor: string | undefined

  while (true) {
    const batch = await prisma.generationLog.findMany({
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      where: { revenueTokens: 0, tokensUsed: { gt: 0 }, status: 'success' },
      orderBy: { id: 'asc' },
      select: { id: true, userId: true, type: true, modelId: true, tokensUsed: true, createdAt: true },
    })
    if (batch.length === 0) break

    for (const log of batch) {
      processed++
      cursor = log.id

      // 读取模型当前的 margin（最佳近似：无历史快照则用当前值）
      let margin = 0
      let costTokens = 0
      if (log.modelId) {
        const model = await prisma.aIModel.findFirst({
          where: { name: log.modelId },
          select: { margin: true, costTokens: true },
        })
        if (model) {
          margin = model.margin ?? 0
          // 历史反算：成本 = 售价 / margin
          costTokens = Math.max(0, Math.round(log.tokensUsed / margin))
        }
      }
      const revenueTokens = Math.max(0, log.tokensUsed - costTokens)

      await prisma.generationLog.update({
        where: { id: log.id },
        data: { costTokens, marginAtCall: margin, revenueTokens },
      })
      updated++
    }
  }

  logger.info('SERVICE_REBUILD_REVENUE_HISTORY_EXIT', { processed, updated })
  return { processed, updated }
}
