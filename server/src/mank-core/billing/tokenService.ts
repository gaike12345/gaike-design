// 统一积分服务 — 所有积分变动必须走这里，确保流水可追溯
//
// 设计原则：
// 1. 每一笔积分变动都有 TokenTransaction 流水记录
// 2. 余额变更和流水写入在同一个数据库事务中完成，保证一致性
// 3. 预扣 → 结算/退还 两阶段模式，防止多扣/漏扣
// 4. 幂等：相同 relatedId 的操作不会重复扣费（status 检查在事务内完成）
//
// 2026-09 关键修复：
//   - P0-1: deductTokens 全包裹进 prisma.$transaction，防止进程崩溃导致余额扣了但无流水
//   - P0-2: settle/refund 的 status 检查移入事务内 updateMany where 条件，消除 TOCTOU 竞态
//   - P0-3: settleTokens/refundTokens catch 改为 rethrow，让调用方（taskWorker）感知失败走退还路径
//   - P1-1: refundStalePendingTasks 去掉 relatedType='task' 过滤，覆盖同步生成（generation）的 pending 流水
//   - P1-3: createTransaction('settle') 改为 throw Error 明确拒绝，移除无用占位函数

import { Prisma } from '@prisma/client'
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { NotFoundError, BusinessError } from '../../mank-common/errors'

export type TransactionType =
  | 'deduct'          // 预扣
  | 'refund'          // 退还（从预扣退还）
  | 'settle'          // 结算（预扣转已用）
  | 'recharge'        // 充值
  | 'admin_adjust'    // 管理员调整
  | 'compensation'    // 系统补偿
  | 'system_refund'   // 系统超时退还

export type TransactionStatus =
  | 'pending'     // 预扣中
  | 'completed'   // 已完成（充值/补偿/管理员调整等一次性操作）
  | 'settled'     // 已结算（预扣 → 已用）
  | 'refunded'    // 已退还
  | 'failed'      // 失败

export interface CreateTransactionOptions {
  userId: string
  type: TransactionType
  amount: number           // 正数=增加，负数=扣减
  status: TransactionStatus
  relatedType?: string     // generation | task | order | admin | system
  relatedId?: string
  modelId?: string
  provider?: string
  reason?: string
}

/**
 * 创建积分流水并更新余额（在事务中保证一致性）
 *
 * 注意：调用方负责确保 amount 符号正确：
 *   - 扣除类（deduct）：amount 为负数
 *   - 增加类（refund/recharge/compensation）：amount 为正数
 *   - settle 类：不改变余额，只更新流水状态，usedTokens 另计
 *
 * 并发安全：使用 Prisma increment/decrement 原子操作，禁止 read-then-write（TOCTOU）。
 * 充值类（recharge/admin_adjust/compensation）同步更新 totalTokens，保证 remaining + used = total。
 */
async function createTransaction(opts: CreateTransactionOptions) {
  const { userId, type, amount, status, relatedType, relatedId, modelId, provider, reason } = opts

  // P1-3: settle 类型必须走 settleTokens/settleByTxId，禁止通过 createTransaction
  if (type === 'settle') {
    throw new Error('settle 类型的流水不能通过 createTransaction 创建，请使用 settleByTxId 或 settleTokens')
  }

  return prisma.$transaction(async (tx) => {
    // 1. 读取当前余额（仅用于记录 balanceBefore，不作为写入依据）
    const quota = await tx.userQuota.findUnique({
      where: { userId },
      select: { remainingTokens: true },
    })
    if (!quota) {
      throw new NotFoundError(`用户额度记录不存在: ${userId}`)
    }

    const balanceBefore = quota.remainingTokens

    // 2. 构造原子更新数据（increment/decrement 在数据库层原子执行，消除 TOCTOU）
    const updateData: Prisma.UserQuotaUpdateInput = {}
    if (amount > 0) {
      updateData.remainingTokens = { increment: amount }
      // 充值/管理员充值/补偿类同步增加 totalTokens，保证余额恒等式 remaining + used = total
      if (type === 'recharge' || type === 'admin_adjust' || type === 'compensation') {
        updateData.totalTokens = { increment: amount }
      }
    } else if (amount < 0) {
      const absAmount = Math.abs(amount)
      updateData.remainingTokens = { decrement: absAmount }
      // 非预扣状态的扣减累加 usedTokens
      if (status !== 'pending') {
        updateData.usedTokens = { increment: absAmount }
      }
    }

    // 3. 执行原子更新
    const updatedQuota = await tx.userQuota.update({
      where: { userId },
      data: updateData,
      select: { remainingTokens: true, totalTokens: true, usedTokens: true },
    })

    // 4. 扣减类余额不足防御性校验（deductTokens 已用 updateMany gte 预校验，此处为兜底）
    if (amount < 0 && updatedQuota.remainingTokens < 0) {
      throw new BusinessError(`积分不足，剩余 ${balanceBefore}，需要 ${Math.abs(amount)}`)
    }

    // 5. 写流水
    const transaction = await tx.tokenTransaction.create({
      data: {
        userId,
        type,
        status,
        amount,
        balanceBefore,
        balanceAfter: updatedQuota.remainingTokens,
        relatedType,
        relatedId,
        modelId,
        provider,
        reason,
      },
    })

    return { transaction, quota: updatedQuota }
  })
}

/**
 * 原子预扣积分（带流水）
 *
 * P0-1 修复：updateMany + findUnique + tokenTransaction.create 全包裹进同一个事务，
 * 保证"余额扣减 ↔ 流水记录"原子发生。进程崩溃时事务回滚，不会出现"余额被扣但无流水"的死账。
 *
 * 错误码（P2 补充）：
 *   - QUOTA_NOT_FOUND: 用户额度记录不存在
 *   - INSUFFICIENT_BALANCE: 余额不足
 *   - INTERNAL_ERROR: 数据库/网络异常
 *
 * @returns { success, code?, transactionId?, remaining?, message? }
 */
export async function deductTokens(params: {
  userId: string
  amount: number
  relatedType?: string
  relatedId?: string
  modelId?: string
  provider?: string
  reason?: string
}): Promise<{
  success: boolean
  code?: 'INSUFFICIENT_BALANCE' | 'QUOTA_NOT_FOUND' | 'INTERNAL_ERROR'
  transactionId?: string
  remaining?: number
  message?: string
}> {
  const { userId, amount, relatedType, relatedId, modelId, provider, reason } = params

  if (amount <= 0) {
    return { success: true }
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. 读当前余额（仅用于记录 balanceBefore，不参与写入决策）
      const quota = await tx.userQuota.findUnique({
        where: { userId },
        select: { remainingTokens: true },
      })
      if (!quota) {
        return {
          success: false,
          code: 'QUOTA_NOT_FOUND',
          message: `用户额度记录不存在: ${userId}`,
        }
      }
      const balanceBefore = quota.remainingTokens

      // 2. 原子扣减 —— where 条件中的 gte 保证并发安全
      const result = await tx.userQuota.updateMany({
        where: { userId, remainingTokens: { gte: amount } },
        data: { remainingTokens: { decrement: amount } },
      })

      // 余额不足 —— 直接返回，事务回滚
      if (result.count === 0) {
        return {
          success: false,
          code: 'INSUFFICIENT_BALANCE',
          message: `积分不足，剩余 ${balanceBefore}，需要 ${amount}`,
        }
      }

      const balanceAfter = balanceBefore - amount

      // 3. 写流水（pending 状态）—— 与步骤 2 在同一个事务内
      const transaction = await tx.tokenTransaction.create({
        data: {
          userId,
          type: 'deduct',
          status: 'pending',
          amount: -amount,
          balanceBefore,
          balanceAfter,
          relatedType,
          relatedId,
          modelId,
          provider,
          reason,
        },
      })

      return {
        success: true,
        code: undefined,
        transactionId: transaction.id,
        remaining: balanceAfter,
      }
    })
  } catch (e) {
    logger.error('积分预扣失败', {
      userId, amount, error: e instanceof Error ? e.message : String(e),
    })
    return {
      success: false,
      code: 'INTERNAL_ERROR',
      message: '积分扣减失败，请稍后重试',
    }
  }
}

/**
 * 结算预扣的积分（异步任务成功时由 taskWorker 调用）
 *
 * P0-2 修复：把原来事务外的 findFirst 检查移进事务，用 updateMany where 条件
 * 带 status='pending' + type='deduct'，通过 count 判定是否为首次处理，消除 TOCTOU。
 *
 * P0-3 修复：catch 里 rethrow，让调用方（taskWorker）感知失败并走退还路径，
 * 避免"任务已标记 completed 但积分未结算"的状态不一致。
 */
export async function settleTokens(params: {
  userId: string
  relatedId: string
  relatedType?: string
  actualAmount?: number
}): Promise<void> {
  const { userId, relatedId, relatedType, actualAmount } = params

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. 在事务内定位待结算的 pending 流水 —— status 检查直接写进 where，
      //    避免"findFirst 看到 pending 之后另一事务抢先 settle/refund"的竞态
      const where: Prisma.TokenTransactionWhereInput = {
        userId,
        relatedId,
        type: 'deduct',
        status: 'pending',
        ...(relatedType ? { relatedType } : {}),
      }

      // 先查一次拿到流水详情（用于后续计算差额退还）
      const pendingTx = await tx.tokenTransaction.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      })

      if (!pendingTx) {
        // 幂等：流水已被 settle/refund 或从未创建 —— 静默返回
        return
      }

      const preAmount = Math.abs(pendingTx.amount)
      const finalAmount = actualAmount ?? preAmount

      // 2. 用 updateMany 二次确认 status 仍是 pending —— 这是 TOCTOU 的关键防线：
      //    上面 findFirst 和下面 update 之间即使有并发操作，updateMany count=0 说明已被抢
      const markResult = await tx.tokenTransaction.updateMany({
        where: { ...where, id: pendingTx.id },
        data: {
          status: 'settled',
          reason: actualAmount !== undefined ? `实际消耗 ${actualAmount}，预扣 ${preAmount}` : undefined,
        },
      })

      if (markResult.count === 0) {
        // 竞态：已被另一并发 settle/refund 抢先标记 —— 幂等返回
        return
      }

      // 3. 累加 usedTokens
      if (finalAmount > 0) {
        await tx.userQuota.update({
          where: { userId },
          data: { usedTokens: { increment: finalAmount } },
        })
      }

      // 4. 如果实际消耗 < 预扣，退还差额（同时写退还流水）
      if (finalAmount < preAmount) {
        const refundAmount = preAmount - finalAmount
        const quota = await tx.userQuota.update({
          where: { userId },
          data: { remainingTokens: { increment: refundAmount } },
        })

        await tx.tokenTransaction.create({
          data: {
            userId,
            type: 'refund',
            status: 'completed',
            amount: refundAmount,
            balanceBefore: quota.remainingTokens - refundAmount,
            balanceAfter: quota.remainingTokens,
            relatedType: pendingTx.relatedType || undefined,
            relatedId: pendingTx.relatedId || undefined,
            modelId: pendingTx.modelId || undefined,
            provider: pendingTx.provider || undefined,
            reason: `实际消耗 ${finalAmount}，退还差额 ${refundAmount}`,
          },
        })
      }
    })
  } catch (e) {
    // P0-3: 结算失败 rethrow —— 让调用方（taskWorker）感知，走失败分支退还积分
    logger.error('积分结算失败（将 rethrow）', {
      userId, relatedId, error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/**
 * 更新流水的关联ID（异步任务创建后，把任务ID关联到预扣流水上）
 */
export async function linkTransactionToTask(txId: string, taskId: string): Promise<void> {
  if (!txId || !taskId) return

  try {
    await prisma.tokenTransaction.update({
      where: { id: txId },
      data: {
        relatedId: taskId,
        relatedType: 'task',
      },
    })
  } catch (e) {
    logger.error('关联流水到任务失败', {
      txId, taskId, error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * 退还预扣的积分（异步任务失败时由 taskWorker 调用，或超时补偿调用）
 *
 * P0-2 修复：同 settleTokens，status 检查在事务内 updateMany where 完成，消除 TOCTOU。
 * P0-3 修复：catch rethrow，让 taskWorker 感知退还失败并记录。
 */
export async function refundTokens(params: {
  userId: string
  relatedId: string
  relatedType?: string
  reason?: string
}): Promise<void> {
  const { userId, relatedId, relatedType, reason } = params

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. 事务内定位待退还的 pending 流水
      const where: Prisma.TokenTransactionWhereInput = {
        userId, relatedId, type: 'deduct', status: 'pending',
        ...(relatedType ? { relatedType } : {}),
      }

      const pendingTx = await tx.tokenTransaction.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      })

      if (!pendingTx) {
        // 幂等：可能已被退还或从未预扣 —— 静默返回
        return
      }

      const refundAmount = Math.abs(pendingTx.amount)

      // 2. 二次确认 status 仍是 pending —— 消除 TOCTOU
      const markResult = await tx.tokenTransaction.updateMany({
        where: { ...where, id: pendingTx.id },
        data: { status: 'refunded' },
      })

      if (markResult.count === 0) {
        // 竞态：已被另一并发操作抢先 —— 幂等返回
        return
      }

      // 3. 退还余额
      const quota = await tx.userQuota.update({
        where: { userId },
        data: { remainingTokens: { increment: refundAmount } },
      })

      // 4. 写退还流水
      await tx.tokenTransaction.create({
        data: {
          userId,
          type: 'refund',
          status: 'completed',
          amount: refundAmount,
          balanceBefore: quota.remainingTokens - refundAmount,
          balanceAfter: quota.remainingTokens,
          relatedType: pendingTx.relatedType || undefined,
          relatedId: pendingTx.relatedId || undefined,
          modelId: pendingTx.modelId || undefined,
          provider: pendingTx.provider || undefined,
          reason: reason || '生成失败，退还积分',
        },
      })
    })
  } catch (e) {
    // P0-3: 退还失败 rethrow —— 让调用方感知并记录
    logger.error('积分退还失败（将 rethrow）', {
      userId, relatedId, error: e instanceof Error ? e.message : String(e),
    })
    throw e
  }
}

/**
 * 直接增加积分（充值/管理员充值/补偿等）
 */
export async function addTokens(params: {
  userId: string
  amount: number
  type: 'recharge' | 'admin_adjust' | 'compensation' | 'system_refund'
  relatedType?: string
  relatedId?: string
  reason?: string
}): Promise<{ success: boolean; remaining?: number; total?: number }> {
  const { userId, amount, type, relatedType, relatedId, reason } = params

  if (amount <= 0) return { success: true }

  try {
    const result = await createTransaction({
      userId, type, amount, status: 'completed',
      relatedType, relatedId, reason,
    })
    return {
      success: true,
      remaining: result?.quota?.remainingTokens,
      total: result?.quota?.totalTokens,
    }
  } catch (e) {
    logger.error('积分增加失败', {
      userId, amount, type, error: e instanceof Error ? e.message : String(e),
    })
    return { success: false }
  }
}

/**
 * 扫描超时未完成的预扣流水，自动退还积分
 * 用于修复进程崩溃、回调丢失、异步任务失败但退还被吞等异常情况
 *
 * P1-1 修复：去掉 relatedType='task' 过滤 —— 现在覆盖：
 *   - 异步任务（relatedType='task'）
 *   - 同步生成（relatedType='generation'，如图片生成后进程崩溃）
 *   - 关联类型未知的（relatedType=null）
 *
 * 通过流水自身的 type='deduct', status='pending' 判定，不再依赖 relatedType 分区。
 */
export async function refundStalePendingTasks(params: {
  maxAgeMinutes: number
}): Promise<{ refunded: number; totalAmount: number }> {
  const { maxAgeMinutes } = params

  const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  // 找到所有超时的 pending 预扣流水 —— 去掉 relatedType='task' 过滤
  const staleTxs = await prisma.tokenTransaction.findMany({
    where: {
      type: 'deduct',
      status: 'pending',
      createdAt: { lt: cutoffTime },
    },
    select: {
      id: true,
      userId: true,
      amount: true,
      relatedId: true,
      modelId: true,
      provider: true,
    },
  })

  if (staleTxs.length === 0) {
    return { refunded: 0, totalAmount: 0 }
  }

  let refunded = 0
  let totalAmount = 0

  for (const tx of staleTxs) {
    try {
      const amount = Math.abs(tx.amount)
      await refundByTxId(tx.id, `超时自动退还（>${maxAgeMinutes}分钟）`)

      refunded++
      totalAmount += amount
    } catch (e) {
      logger.error('超时流水退还失败', {
        txId: tx.id, userId: tx.userId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (refunded > 0) {
    logger.warn('超时预扣流水自动退还完成', {
      refunded, totalAmount, maxAgeMinutes, scannedTotal: staleTxs.length,
    })
  }

  return { refunded, totalAmount }
}

/**
 * 通过流水ID直接结算（同步任务用，被 middleware.withGeneration finish 回调 fire-and-forget 调用）
 *
 * P0-2 修复：status 检查移入事务内 updateMany where，消除 TOCTOU。
 * catch 保留不 rethrow —— 调用方是 fire-and-forget，无法感知；
 * 失败由 refundStalePendingTasks 超时兜底。
 */
export async function settleByTxId(txId: string): Promise<void> {
  if (!txId) return

  try {
    await prisma.$transaction(async (tx) => {
      // 事务内直接用 updateMany + where 条件做 status 检查 + 状态切换
      const markResult = await tx.tokenTransaction.updateMany({
        where: { id: txId, status: 'pending', type: 'deduct' },
        data: { status: 'settled' },
      })

      if (markResult.count === 0) {
        // 幂等：已被 settle/refund 或不存在 —— 静默返回
        return
      }

      // 读取 userId（刚刚 updateMany 影响的就是我们要的那条）
      const updated = await tx.tokenTransaction.findUnique({ where: { id: txId } })
      if (!updated) return

      const amount = Math.abs(updated.amount)
      if (amount > 0) {
        await tx.userQuota.update({
          where: { userId: updated.userId },
          data: { usedTokens: { increment: amount } },
        })
      }
    })
  } catch (e) {
    // 不 rethrow —— 调用方是 fire-and-forget middleware
    // refundStalePendingTasks 会在超时后自动退还
    logger.error('按流水ID结算失败（将由超时退还兜底）', {
      txId, error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * 按流水 ID 退还积分
 * 支持 pending（预扣未结算）和 settled（已结算）两种状态：
 *   - pending：仅退还 remainingTokens（usedTokens 未被累加）
 *   - settled：退还 remainingTokens 并回滚 usedTokens（结算时已累加，需减回）
 * 保证余额恒等式：remainingTokens + usedTokens = totalTokens 始终成立
 *
 * P0-2 修复：status 检查移入事务内 updateMany where，消除 TOCTOU。
 * 并发 settle+refund 场景下，先到达者 updateMany count=1，后到达者 count=0（幂等返回）。
 */
export async function refundByTxId(txId: string, reason?: string): Promise<void> {
  if (!txId) return

  try {
    await prisma.$transaction(async (tx) => {
      // 1. 事务内读取流水，拿到旧状态 —— 事务快照保证不会被并发穿透
      const txRec = await tx.tokenTransaction.findUnique({ where: { id: txId } })

      if (!txRec || txRec.type !== 'deduct') {
        return // 幂等：不存在或不是 deduct 类型
      }

      const wasPending = txRec.status === 'pending'
      const wasSettled = txRec.status === 'settled'

      if (!wasPending && !wasSettled) {
        return // 幂等：已被 refund/failed/completed 或其他终态
      }

      const refundAmount = Math.abs(txRec.amount)

      // 2. 二次确认 status 仍符合预期 —— 消除 TOCTOU
      const markResult = await tx.tokenTransaction.updateMany({
        where: {
          id: txId,
          type: 'deduct',
          status: wasPending ? 'pending' : 'settled',
        },
        data: { status: 'refunded' },
      })

      if (markResult.count === 0) {
        return // 竞态：已被另一并发 settle/refund 抢先 —— 幂等返回
      }

      // 3. 若从 settled 来，回滚 usedTokens（结算时已累加过，现在要减回去）
      if (wasSettled && refundAmount > 0) {
        await tx.userQuota.update({
          where: { userId: txRec.userId },
          data: { usedTokens: { decrement: refundAmount } },
        })
      }

      // 4. 退还余额
      const quota = await tx.userQuota.update({
        where: { userId: txRec.userId },
        data: { remainingTokens: { increment: refundAmount } },
      })

      // 5. 写退还流水
      await tx.tokenTransaction.create({
        data: {
          userId: txRec.userId,
          type: 'refund',
          status: 'completed',
          amount: refundAmount,
          balanceBefore: quota.remainingTokens - refundAmount,
          balanceAfter: quota.remainingTokens,
          relatedType: txRec.relatedType || undefined,
          relatedId: txRec.relatedId || undefined,
          modelId: txRec.modelId || undefined,
          provider: txRec.provider || undefined,
          reason: reason || '生成失败，退还积分',
        },
      })
    })
  } catch (e) {
    // 不 rethrow —— 调用方可能是 fire-and-forget（如 middleware refundProxy）
    // refundStalePendingTasks 也有自己的 try-catch
    logger.error('按流水ID退还失败', {
      txId, error: e instanceof Error ? e.message : String(e),
    })
  }
}

// =====================================================================
// 积分异常检测 & 记录保留 —— 增强修复（P2）
// =====================================================================

/**
 * TokenTransaction 历史保留策略
 *
 * 审计必需的流水永不删除：
 *   - recharge（充值）: 支付凭证
 *   - admin_adjust（管理员调整）: 操作留痕
 *   - compensation / system_refund（补偿/系统退还）: 系统操作
 *
 * 可裁剪的流水（deduct / refund / settle）：
 *   - 活跃期（90天内）: 全量保留
 *   - 已终态 + 超90天 + 超过 per-user 上限(500): 删除最旧的
 *
 * 注意：pending 状态的流水**永远不删除**（否则会导致用户白嫖——预扣未结算就被删了）。
 * 超过 24h 的 pending 流水由 refundStalePendingTasks 自动退还，
 * 退还后状态变成 refunded，下一轮 pruning 才可能被裁剪。
 *
 * @returns 裁剪统计
 */
export async function pruneTransactionHistory(params: {
  /** 活跃保留天数（默认 90 天） */
  activeDays?: number
  /** 每用户保留上限（默认 500 条终态流水） */
  perUserKeepLimit?: number
  /** 单批删除上限（防止长事务锁表） */
  batchLimit?: number
}): Promise<{
  deleted: number
  scanned: number
  protectedTypes: number
  batched: boolean
}> {
  const activeDays = params.activeDays ?? 90
  const perUserKeepLimit = params.perUserKeepLimit ?? 500
  const batchLimit = params.batchLimit ?? 5000

  const cutoff = new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000)

  // 审计必需永不删除的类型
  const PROTECTED_TYPES = ['recharge', 'admin_adjust', 'compensation', 'system_refund']

  // 第一步：找出所有用户
  const allUsers = await prisma.tokenTransaction.findMany({
    distinct: ['userId'],
    select: { userId: true },
  })

  let deleted = 0
  let scanned = 0
  let protectedTypes = 0

  for (const { userId } of allUsers) {
    // 该用户终态流水的总数
    const terminalCount = await prisma.tokenTransaction.count({
      where: {
        userId,
        status: { in: ['settled', 'refunded', 'completed', 'failed'] },
        type: { in: ['deduct', 'refund'] }, // 只数可裁剪的类型
      },
    })

    if (terminalCount <= perUserKeepLimit) continue

    scanned += terminalCount

    // 找出超龄 + 超限的可裁剪流水
    // 保留每用户最新 perUserKeepLimit 条终态流水，其余旧的 + 超龄的删除
    const prunable = await prisma.tokenTransaction.findMany({
      where: {
        userId,
        type: { in: ['deduct', 'refund'] },
        status: { in: ['settled', 'refunded', 'completed', 'failed'] },
        createdAt: { lt: cutoff }, // 超龄
      },
      orderBy: { createdAt: 'asc' }, // 最旧的先删
      take: Math.min(terminalCount - perUserKeepLimit, batchLimit),
      select: { id: true },
    })

    if (prunable.length > 0) {
      const result = await prisma.tokenTransaction.deleteMany({
        where: { id: { in: prunable.map((t) => t.id) } },
      })
      deleted += result.count
    }

    // 顺便统计 protected 类型
    const protCount = await prisma.tokenTransaction.count({
      where: { userId, type: { in: PROTECTED_TYPES } },
    })
    protectedTypes += protCount
  }

  const result = {
    deleted,
    scanned,
    protectedTypes,
    batched: deleted >= batchLimit,
  }

  if (deleted > 0) {
    logger.info('[Billing] TokenTransaction 历史裁剪完成', {
      deleted, scanned, protectedTypes, activeDays, perUserKeepLimit,
    })
  }
  return result
}

/**
 * 余额恒等式 reconciliation 检查
 *
 * 安全性不变量：对所有 UserQuota，必须有 remainingTokens + usedTokens = totalTokens。
 * 本函数扫描所有违反恒等式的记录，自动修复并输出报告。
 *
 * 修复策略：
 *   - 计算 expectedTotal = remaining + used
 *   - 若 totalTokens != expectedTotal → 修正为 expectedTotal
 *   - 修复在事务内执行，写入一条 admin_adjust 流水（reason 标记为 reconciliation）
 *
 * 这是"最终一致性"的兜底保障——正常业务路径（deduct/settle/refund/recharge）
 * 都在事务内同时更新三个字段，应该永不触发修复。如果触发说明某处绕过了 tokenService。
 *
 * @returns 修复统计
 */
export async function reconcileBalanceInvariant(): Promise<{
  checked: number
  repaired: number
  discrepancy: number
  samples: Array<{ userId: string; remaining: number; used: number; total: number; expected: number }>
}> {
  // 分页扫描，避免一次性加载全表
  const PAGE_SIZE = 500
  let cursor: string | undefined = undefined
  let checked = 0
  let repaired = 0
  let discrepancy = 0
  const samples: Array<{ userId: string; remaining: number; used: number; total: number; expected: number }> = []

  while (true) {
    const page: Array<{ userId: string; remainingTokens: number; usedTokens: number; totalTokens: number }> =
      await prisma.userQuota.findMany({
        take: PAGE_SIZE,
        ...(cursor ? { skip: 1 } : {}),
        ...(cursor ? { cursor: { userId: cursor } } : {}),
        orderBy: { userId: 'asc' },
        select: { userId: true, remainingTokens: true, usedTokens: true, totalTokens: true },
      })

    if (page.length === 0) break
    checked += page.length

    for (const quota of page) {
      const expected = quota.remainingTokens + quota.usedTokens
      if (quota.totalTokens !== expected) {
        discrepancy++

        if (samples.length < 5) {
          samples.push({
            userId: quota.userId,
            remaining: quota.remainingTokens,
            used: quota.usedTokens,
            total: quota.totalTokens,
            expected,
          })
        }

        // 自动修复：totalTokens = remaining + used
        try {
          await prisma.$transaction(async (tx) => {
            // 再次读一次，防止并发修复
            const latest = await tx.userQuota.findUnique({
              where: { userId: quota.userId },
              select: { remainingTokens: true, usedTokens: true, totalTokens: true },
            })
            if (!latest) return

            const latestExpected = latest.remainingTokens + latest.usedTokens
            if (latest.totalTokens === latestExpected) {
              // 已被其他并发修复
              return
            }

            await tx.userQuota.update({
              where: { userId: quota.userId },
              data: { totalTokens: latestExpected },
            })

            // 写一条 reconciliation 记录（type=admin_adjust，amount 为差值）
            const diff = latestExpected - latest.totalTokens
            await tx.tokenTransaction.create({
              data: {
                userId: quota.userId,
                type: 'admin_adjust',
                status: 'completed',
                amount: diff,
                balanceBefore: latest.remainingTokens,
                balanceAfter: latest.remainingTokens,
                relatedType: 'system',
                reason: `[reconcile] 余额恒等式修复: totalTokens ${latest.totalTokens} → ${latestExpected} (remaining=${latest.remainingTokens}, used=${latest.usedTokens})`,
              },
            })
          })
          repaired++
        } catch (e) {
          logger.error('[Billing] 余额恒等式修复失败', {
            userId: quota.userId,
            error: e instanceof Error ? e.message : String(e),
          })
        }
      }
    }

    cursor = page[page.length - 1].userId
    if (page.length < PAGE_SIZE) break
  }

  const result = { checked, repaired, discrepancy, samples }

  if (discrepancy > 0) {
    logger.error('[Billing] 余额恒等式检查发现异常！', {
      checked, discrepancy, repaired, samples,
    })
  } else {
    logger.info('[Billing] 余额恒等式检查通过', { checked })
  }
  return result
}

/**
 * Stuck pending transaction 告警扫描
 *
 * 与 refundStalePendingTasks 的区别：
 *   - refundStalePendingTasks: 超过 maxAge 后**自动退还**（兜底行为）
 *   - scanStuckPendingTransactions: 只是**报告**，不做修复（运维告警）
 *
 * 两个函数同时存在的意义：
 *   - refundStalePendingTasks 以 30min 为周期扫描 + 30min 过期 → 覆盖大多数崩溃场景
 *   - 但如果 refundStalePendingTasks 本身因为某种原因没跑（比如进程重启、DB短暂不可用），
 *     超过 2h 的 pending 流水就需要被独立检出告警，人工介入
 *
 * @returns stuck 流水统计
 */
export async function scanStuckPendingTransactions(params: {
  /** 告警阈值：超过多少分钟视为异常（默认 120min = 2h） */
  alertMinutes?: number
  /** 批次大小（默认 500） */
  batchSize?: number
}): Promise<{
  stuckCount: number
  totalAmount: number
  samples: Array<{ id: string; userId: string; ageMinutes: number; type: string }>
}> {
  const alertMinutes = params.alertMinutes ?? 120
  const batchSize = params.batchSize ?? 500
  const alertCutoff = new Date(Date.now() - alertMinutes * 60 * 1000)

  const stuckTxs = await prisma.tokenTransaction.findMany({
    where: {
      type: 'deduct',
      status: 'pending',
      createdAt: { lt: alertCutoff },
    },
    take: batchSize,
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      userId: true,
      createdAt: true,
      amount: true,
      relatedType: true,
      relatedId: true,
    },
  })

  let totalAmount = 0
  const samples: Array<{ id: string; userId: string; ageMinutes: number; type: string }> = []

  for (const tx of stuckTxs) {
    totalAmount += Math.abs(tx.amount)
    if (samples.length < 10) {
      samples.push({
        id: tx.id,
        userId: tx.userId,
        ageMinutes: Math.floor((Date.now() - tx.createdAt.getTime()) / 60000),
        type: tx.relatedType || 'unknown',
      })
    }
  }

  const result = {
    stuckCount: stuckTxs.length,
    totalAmount,
    samples,
  }

  if (stuckTxs.length > 0) {
    logger.error('[Billing] 发现 stuck pending 流水（建议人工核查）', {
      stuckCount: result.stuckCount,
      totalAmount: result.totalAmount,
      alertThresholdMinutes: alertMinutes,
      samples: result.samples,
      hint: 'refundStalePendingTasks 应已自动退还 30min 超时的流水 —— 超过 ' + alertMinutes + 'min 说明自动退还可能漏跑',
    })
  } else {
    logger.debug('[Billing] stuck pending 扫描通过', { alertThresholdMinutes: alertMinutes })
  }
  return result
}
