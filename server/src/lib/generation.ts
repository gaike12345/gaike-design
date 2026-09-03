import prisma from './prisma'
import logger from './logger'

// 生成日志 + 扣减额度的统一工具函数
export interface LogGenerationParams {
  userId: string
  type: string         // novel | image | comic | audio | video
  modelId?: string     // AI 模型名称
  provider?: string    // 供应商
  input?: string       // JSON: 输入参数摘要
  output?: string      // JSON: 输出结果摘要
  tokensUsed?: number  // token 消耗
  duration?: number    // 耗时(ms)
  status?: string      // success | failed | pending
  errorMsg?: string
}

export async function logGeneration(params: LogGenerationParams) {
  const {
    userId, type, modelId, provider, input, output,
    tokensUsed = 0, duration = 0, status = 'success', errorMsg,
  } = params

  // 1) 写生成日志
  const log = await prisma.generationLog.create({
    data: {
      userId, type, modelId, provider, input, output,
      tokensUsed, duration, status, errorMsg,
    },
  })

  // 2) 扣减用户额度（失败不扣）
  // 注意：实际预扣已在 withGeneration 中通过 atomicDeductQuota 完成，
  // 这里只在 success 时记录 usedTokens 增量；failed 时由 atomicRefundQuota 退还预扣
  return log
}

// 检查用户额度是否足够（只读，不扣）
export async function checkQuota(userId: string, requiredTokens: number): Promise<{ ok: boolean; remaining: number; message?: string }> {
  const quota = await prisma.userQuota.findUnique({ where: { userId } })
  if (!quota) {
    return { ok: false, remaining: 0, message: '用户额度记录不存在' }
  }
  if (quota.remainingTokens < requiredTokens) {
    return {
      ok: false,
      remaining: quota.remainingTokens,
      message: `额度不足，剩余 ${quota.remainingTokens} tokens，需要 ${requiredTokens} tokens`,
    }
  }
  return { ok: true, remaining: quota.remainingTokens }
}

/**
 * 原子预扣额度（解决 TOCTOU 竞态）
 *
 * 使用 Prisma 的 atomic increment 在数据库层一次性扣减，
 * 配合 where 条件 `remainingTokens >= requiredTokens` 保证并发安全：
 *  - 多个并发请求同时通过 checkQuota 后，只有第一个能成功 update（满足 where 条件），
 *    其余会因剩余额度已变化而不满足条件，update 影响 0 行 → 返回 false
 *  - 失败者提前返回 402，不会出现"超扣"
 *
 * @returns true=预扣成功；false=余额不足或并发抢扣失败
 */
export async function atomicDeductQuota(userId: string, requiredTokens: number): Promise<boolean> {
  if (requiredTokens <= 0) return true
  try {
    const result = await prisma.userQuota.updateMany({
      where: {
        userId,
        remainingTokens: { gte: requiredTokens },
      },
      data: {
        remainingTokens: { decrement: requiredTokens },
      },
    })
    return result.count > 0
  } catch {
    return false
  }
}

/**
 * 退还预扣额度（生成失败时调用）
 * 仅在 withGeneration 预扣后、响应失败时退还，保证不漏扣不多扣
 */
export async function atomicRefundQuota(userId: string, tokensToRefund: number): Promise<void> {
  if (tokensToRefund <= 0) return
  try {
    await prisma.userQuota.updateMany({
      where: { userId },
      data: {
        remainingTokens: { increment: tokensToRefund },
      },
    })
  } catch {
    // 退还失败仅记录日志，不影响主流程
    logger.error('额度退还失败', { userId, tokens: tokensToRefund })
  }
}

/**
 * 记录已使用额度（生成成功时调用，仅累加 usedTokens，不动 remainingTokens，因已预扣）
 */
export async function recordUsedTokens(userId: string, tokensUsed: number): Promise<void> {
  if (tokensUsed <= 0) return
  try {
    await prisma.userQuota.updateMany({
      where: { userId },
      data: {
        usedTokens: { increment: tokensUsed },
      },
    })
  } catch {
    logger.error('记录使用额度失败', { userId, tokens: tokensUsed })
  }
}
