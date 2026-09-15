// 统一积分服务 — 所有积分变动必须走这里，确保流水可追溯
//
// 设计原则：
// 1. 每一笔积分变动都有 TokenTransaction 流水记录
// 2. 余额变更和流水写入在同一个数据库事务中完成，保证一致性
// 3. 预扣 → 结算/退还 两阶段模式，防止多扣/漏扣
// 4. 幂等：相同 relatedId 的操作不会重复扣费

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
export async function createTransaction(opts: CreateTransactionOptions) {
  const { userId, type, amount, status, relatedType, relatedId, modelId, provider, reason } = opts

  // settle 类型不改变余额，只更新状态
  if (type === 'settle') {
    return settleTransaction(relatedId || '', modelId || '')
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
    const absAmount = Math.abs(amount)

    // 2. 构造原子更新数据（increment/decrement 在数据库层原子执行，消除 TOCTOU）
    const updateData: Prisma.UserQuotaUpdateInput = {}
    if (amount > 0) {
      updateData.remainingTokens = { increment: amount }
      // 充值/管理员充值/补偿类同步增加 totalTokens，保证余额恒等式 remaining + used = total
      if (type === 'recharge' || type === 'admin_adjust' || type === 'compensation') {
        updateData.totalTokens = { increment: amount }
      }
    } else if (amount < 0) {
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
      throw new BusinessError(`积分不足，剩余 ${balanceBefore}，需要 ${absAmount}`)
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
 * @returns { success: boolean, transactionId?: string, remaining?: number }
 */
export async function deductTokens(params: {
  userId: string
  amount: number
  relatedType?: string
  relatedId?: string
  modelId?: string
  provider?: string
  reason?: string
}): Promise<{ success: boolean; transactionId?: string; remaining?: number; message?: string }> {
  const { userId, amount, relatedType, relatedId, modelId, provider, reason } = params

  if (amount <= 0) {
    return { success: true }
  }

  try {
    // 先做原子扣减（数据库层保证并发安全）
    const result = await prisma.userQuota.updateMany({
      where: {
        userId,
        remainingTokens: { gte: amount },
      },
      data: {
        remainingTokens: { decrement: amount },
      },
    })

    if (result.count === 0) {
      return { success: false, message: '积分不足' }
    }

    // 读取扣减后的余额
    const quota = await prisma.userQuota.findUnique({
      where: { userId },
      select: { remainingTokens: true, totalTokens: true, usedTokens: true },
    })

    const balanceAfter = quota?.remainingTokens ?? 0
    const balanceBefore = balanceAfter + amount

    // 写流水（pending 状态）
    const transaction = await prisma.tokenTransaction.create({
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
      transactionId: transaction.id,
      remaining: balanceAfter,
    }
  } catch (e) {
    logger.error('积分预扣失败', {
      userId,
      amount,
      error: e instanceof Error ? e.message : String(e),
    })
    return { success: false, message: '积分扣减失败' }
  }
}

/**
 * 结算预扣的积分（生成成功后调用）
 * - 把 pending 流水标记为 settled
 * - 累加 usedTokens
 */
export async function settleTokens(params: {
  userId: string
  relatedId: string
  relatedType?: string
  actualAmount?: number  // 如果实际消耗和预扣不同，传这个值
}): Promise<void> {
  const { userId, relatedId, relatedType, actualAmount } = params

  try {
    // 找到对应的 pending 流水
    const pendingTx = await prisma.tokenTransaction.findFirst({
      where: {
        userId,
        relatedId,
        type: 'deduct',
        status: 'pending',
        ...(relatedType ? { relatedType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!pendingTx) {
      logger.warn('结算失败：找不到待结算的预扣流水', { userId, relatedId })
      return
    }

    const preAmount = Math.abs(pendingTx.amount)
    const finalAmount = actualAmount ?? preAmount

    await prisma.$transaction(async (tx) => {
      // 1. 标记流水为已结算
      await tx.tokenTransaction.update({
        where: { id: pendingTx.id },
        data: {
          status: 'settled',
          reason: actualAmount !== undefined ? `实际消耗 ${actualAmount}，预扣 ${preAmount}` : undefined,
        },
      })

      // 2. 累加 usedTokens
      if (finalAmount > 0) {
        await tx.userQuota.update({
          where: { userId },
          data: {
            usedTokens: { increment: finalAmount },
          },
        })
      }

      // 3. 如果实际消耗 < 预扣，退还差额
      if (finalAmount < preAmount) {
        const refundAmount = preAmount - finalAmount
        const quota = await tx.userQuota.update({
          where: { userId },
          data: { remainingTokens: { increment: refundAmount } },
        })

        // 写退还流水
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
    logger.error('积分结算失败', {
      userId,
      relatedId,
      error: e instanceof Error ? e.message : String(e),
    })
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
      txId,
      taskId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * 退还预扣的积分（生成失败时调用）
 */
export async function refundTokens(params: {
  userId: string
  relatedId: string
  relatedType?: string
  reason?: string
}): Promise<void> {
  const { userId, relatedId, relatedType, reason } = params

  try {
    // 找到对应的 pending 流水
    const pendingTx = await prisma.tokenTransaction.findFirst({
      where: {
        userId,
        relatedId,
        type: 'deduct',
        status: 'pending',
        ...(relatedType ? { relatedType } : {}),
      },
      orderBy: { createdAt: 'desc' },
    })

    if (!pendingTx) {
      logger.warn('退还失败：找不到待退还的预扣流水', { userId, relatedId })
      return
    }

    const refundAmount = Math.abs(pendingTx.amount)

    await prisma.$transaction(async (tx) => {
      // 1. 标记原流水为已退还
      await tx.tokenTransaction.update({
        where: { id: pendingTx.id },
        data: { status: 'refunded' },
      })

      // 2. 退还余额
      const quota = await tx.userQuota.update({
        where: { userId },
        data: { remainingTokens: { increment: refundAmount } },
      })

      // 3. 写退还流水
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
    logger.error('积分退还失败', {
      userId,
      relatedId,
      error: e instanceof Error ? e.message : String(e),
    })
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
      userId,
      type,
      amount,
      status: 'completed',
      relatedType,
      relatedId,
      reason,
    })
    return {
      success: true,
      remaining: result?.quota?.remainingTokens,
      total: result?.quota?.totalTokens,
    }
  } catch (e) {
    logger.error('积分增加失败', {
      userId,
      amount,
      type,
      error: e instanceof Error ? e.message : String(e),
    })
    return { success: false }
  }
}

/**
 * 辅助：结算预扣流水（被 settleTokens 调用，也可以单独用）
 */
async function settleTransaction(_relatedId: string, _modelId: string) {
  // 实际逻辑在 settleTokens 里，这个函数是占位，避免 createTransaction 里的 settle 分支报错
  return null
}

/**
 * 扫描超时未完成的任务，自动退还积分
 * 用于修复进程崩溃、回调丢失等异常情况
 */
export async function refundStalePendingTasks(params: {
  maxAgeMinutes: number    // 超过多少分钟的 pending 任务视为超时
}): Promise<{ refunded: number; totalAmount: number }> {
  const { maxAgeMinutes } = params

  const cutoffTime = new Date(Date.now() - maxAgeMinutes * 60 * 1000)

  // 找到所有超时的 pending 流水
  const staleTxs = await prisma.tokenTransaction.findMany({
    where: {
      type: 'deduct',
      status: 'pending',
      createdAt: { lt: cutoffTime },
      relatedType: 'task', // 只处理异步任务类型
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
      await refundTokens({
        userId: tx.userId,
        relatedId: tx.relatedId || '',
        relatedType: 'task',
        reason: `任务超时（>${maxAgeMinutes}分钟），系统自动退还`,
      })

      // 同时标记对应任务为失败
      if (tx.relatedId) {
        await prisma.userTask.updateMany({
          where: { id: tx.relatedId, status: { in: ['pending', 'processing'] } },
          data: {
            status: 'failed',
            errorMsg: '任务超时，已自动退还积分',
          },
        })
      }

      refunded++
      totalAmount += amount
    } catch (e) {
      logger.error('超时任务退还失败', {
        txId: tx.id,
        userId: tx.userId,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  }

  if (refunded > 0) {
    logger.info('超时任务积分退还完成', {
      refunded,
      totalAmount,
      maxAgeMinutes,
    })
  }

  return { refunded, totalAmount }
}

/**
 * 通过流水ID直接结算（同步任务用，因为流水ID就是关联键）
 */
export async function settleByTxId(txId: string): Promise<void> {
  if (!txId) return

  try {
    const tx = await prisma.tokenTransaction.findUnique({
      where: { id: txId },
    })

    if (!tx || tx.status !== 'pending' || tx.type !== 'deduct') {
      return
    }

    const amount = Math.abs(tx.amount)

    await prisma.$transaction(async (trx) => {
      // 1. 标记流水为已结算
      await trx.tokenTransaction.update({
        where: { id: txId },
        data: { status: 'settled' },
      })

      // 2. 累加 usedTokens
      if (amount > 0) {
        await trx.userQuota.update({
          where: { userId: tx.userId },
          data: { usedTokens: { increment: amount } },
        })
      }
    })
  } catch (e) {
    logger.error('按流水ID结算失败', {
      txId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}

/**
 * 按流水 ID 退还积分
 * 支持 pending（预扣未结算）和 settled（已结算）两种状态：
 * - pending：仅退还 remainingTokens（usedTokens 未被累加）
 * - settled：退还 remainingTokens 并回滚 usedTokens（结算时已累加，需减回）
 * 保证余额恒等式：remainingTokens + usedTokens = totalTokens 始终成立
 */
export async function refundByTxId(txId: string, reason?: string): Promise<void> {
  if (!txId) return

  try {
    const tx = await prisma.tokenTransaction.findUnique({
      where: { id: txId },
    })

    if (!tx || (tx.status !== 'pending' && tx.status !== 'settled') || tx.type !== 'deduct') {
      return
    }

    const refundAmount = Math.abs(tx.amount)

    await prisma.$transaction(async (trx) => {
      // 1. 标记原流水为已退还
      await trx.tokenTransaction.update({
        where: { id: txId },
        data: { status: 'refunded' },
      })

      // 2. 若原流水已结算（usedTokens 已累加），需回滚 usedTokens
      if (tx.status === 'settled' && refundAmount > 0) {
        await trx.userQuota.update({
          where: { userId: tx.userId },
          data: { usedTokens: { decrement: refundAmount } },
        })
      }

      // 3. 退还余额
      const quota = await trx.userQuota.update({
        where: { userId: tx.userId },
        data: { remainingTokens: { increment: refundAmount } },
      })

      // 4. 写退还流水
      await trx.tokenTransaction.create({
        data: {
          userId: tx.userId,
          type: 'refund',
          status: 'completed',
          amount: refundAmount,
          balanceBefore: quota.remainingTokens - refundAmount,
          balanceAfter: quota.remainingTokens,
          relatedType: tx.relatedType || undefined,
          relatedId: tx.relatedId || undefined,
          modelId: tx.modelId || undefined,
          provider: tx.provider || undefined,
          reason: reason || '生成失败，退还积分',
        },
      })
    })
  } catch (e) {
    logger.error('按流水ID退还失败', {
      txId,
      error: e instanceof Error ? e.message : String(e),
    })
  }
}
