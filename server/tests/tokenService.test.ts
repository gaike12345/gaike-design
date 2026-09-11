import { describe, it, expect, vi, beforeEach } from 'vitest'

// vi.hoisted 保证 mock 变量在 vi.mock 工厂函数执行前就已初始化
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    $transaction: vi.fn(),
    userQuota: {
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    tokenTransaction: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    userTask: {
      updateMany: vi.fn(),
    },
  },
}))

vi.mock('../src/mank-infra/database/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/mank-infra/logging/logger', () => ({
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

import {
  deductTokens,
  settleTokens,
  refundTokens,
  addTokens,
  settleByTxId,
  refundByTxId,
  linkTransactionToTask,
  refundStalePendingTasks,
} from '../src/mank-core/billing/tokenService'

describe('TokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('deductTokens', () => {
    it('amount <= 0 时应直接返回成功', async () => {
      const result = await deductTokens({ userId: 'u1', amount: 0 })
      expect(result.success).toBe(true)
      expect(mockPrisma.userQuota.updateMany).not.toHaveBeenCalled()
    })

    it('积分不足时应返回失败', async () => {
      mockPrisma.userQuota.updateMany.mockResolvedValue({ count: 0 })

      const result = await deductTokens({ userId: 'u1', amount: 100 })

      expect(result.success).toBe(false)
      expect(result.message).toBe('积分不足')
    })

    it('积分充足时应成功扣减并写流水', async () => {
      mockPrisma.userQuota.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.userQuota.findUnique.mockResolvedValue({
        remainingTokens: 900,
        totalTokens: 1000,
        usedTokens: 0,
      })
      mockPrisma.tokenTransaction.create.mockResolvedValue({ id: 'tx-1' })

      const result = await deductTokens({
        userId: 'u1',
        amount: 100,
        relatedType: 'generation',
        relatedId: 'gen-1',
        modelId: 'sdxl',
        reason: '测试扣费',
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('tx-1')
      expect(result.remaining).toBe(900)

      // 验证原子扣减调用
      expect(mockPrisma.userQuota.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', remainingTokens: { gte: 100 } },
        data: { remainingTokens: { decrement: 100 } },
      })

      // 验证流水写入
      expect(mockPrisma.tokenTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1',
          type: 'deduct',
          status: 'pending',
          amount: -100,
          balanceBefore: 1000,
          balanceAfter: 900,
          relatedId: 'gen-1',
          modelId: 'sdxl',
        }),
      })
    })

    it('异常时应返回失败并记录日志', async () => {
      mockPrisma.userQuota.updateMany.mockRejectedValue(new Error('DB连接失败'))

      const result = await deductTokens({ userId: 'u1', amount: 50 })

      expect(result.success).toBe(false)
      expect(result.message).toBe('积分扣减失败')
    })
  })

  describe('settleTokens', () => {
    it('找不到待结算流水时应跳过', async () => {
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(null)

      await settleTokens({ userId: 'u1', relatedId: 'gen-1' })

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('应正确结算并累加 usedTokens', async () => {
      const pendingTx = {
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        relatedType: 'generation',
        relatedId: 'gen-1',
        modelId: 'sdxl',
        provider: 'pollinations',
      }
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(pendingTx)
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb({
          tokenTransaction: { update: vi.fn(), create: vi.fn() },
          userQuota: { update: vi.fn().mockResolvedValue({ remainingTokens: 900 }) },
        })
      })

      await settleTokens({ userId: 'u1', relatedId: 'gen-1' })

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })

    it('实际消耗 < 预扣时应退还差额', async () => {
      const pendingTx = {
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        relatedType: 'generation',
        relatedId: 'gen-1',
        modelId: 'sdxl',
        provider: 'pollinations',
      }
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(pendingTx)
      const mockTx = {
        tokenTransaction: { update: vi.fn(), create: vi.fn() },
        userQuota: { update: vi.fn().mockResolvedValue({ remainingTokens: 950 }) },
      }
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(mockTx)
      })

      await settleTokens({
        userId: 'u1',
        relatedId: 'gen-1',
        actualAmount: 50, // 预扣100，实际50，应退50
      })

      // 应该有退还流水写入
      expect(mockTx.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'refund',
            amount: 50,
          }),
        }),
      )
    })
  })

  describe('refundTokens', () => {
    it('找不到待退还流水时应跳过', async () => {
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(null)

      await refundTokens({ userId: 'u1', relatedId: 'gen-1' })

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('应正确退还积分并标记流水', async () => {
      const pendingTx = {
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        relatedType: 'generation',
        relatedId: 'gen-1',
        modelId: 'sdxl',
        provider: 'pollinations',
      }
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(pendingTx)
      const mockTx = {
        tokenTransaction: {
          update: vi.fn(),
          create: vi.fn(),
        },
        userQuota: {
          update: vi.fn().mockResolvedValue({ remainingTokens: 1000 }),
        },
      }
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(mockTx)
      })

      await refundTokens({ userId: 'u1', relatedId: 'gen-1', reason: '生成失败' })

      // 原流水应标记为 refunded
      expect(mockTx.tokenTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1' },
          data: { status: 'refunded' },
        }),
      )

      // 应写退还流水
      expect(mockTx.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'refund',
            status: 'completed',
            amount: 100,
            reason: '生成失败',
          }),
        }),
      )
    })
  })

  describe('addTokens', () => {
    it('amount <= 0 时应直接返回成功', async () => {
      const result = await addTokens({ userId: 'u1', amount: 0, type: 'recharge' })
      expect(result.success).toBe(true)
    })

    it('应通过 createTransaction 增加积分', async () => {
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        const result = await cb({
          userQuota: {
            findUnique: vi.fn().mockResolvedValue({ remainingTokens: 1000 }),
            update: vi.fn().mockResolvedValue({ remainingTokens: 1100 }),
          },
          tokenTransaction: {
            create: vi.fn().mockResolvedValue({ id: 'tx-add' }),
          },
        })
        return result
      })

      const result = await addTokens({
        userId: 'u1',
        amount: 100,
        type: 'recharge',
        reason: '充值100积分',
      })

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(1100)
    })
  })

  describe('settleByTxId', () => {
    it('空 txId 应直接返回', async () => {
      await settleByTxId('')
      expect(mockPrisma.tokenTransaction.findUnique).not.toHaveBeenCalled()
    })

    it('流水不存在时应跳过', async () => {
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue(null)

      await settleByTxId('tx-1')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('流水状态非 pending 应跳过', async () => {
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'settled',
        type: 'deduct',
      })

      await settleByTxId('tx-1')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('应正确结算 pending 流水', async () => {
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        status: 'pending',
        type: 'deduct',
      })
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb({
          tokenTransaction: { update: vi.fn() },
          userQuota: { update: vi.fn() },
        })
      })

      await settleByTxId('tx-1')

      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
    })
  })

  describe('refundByTxId', () => {
    it('空 txId 应直接返回', async () => {
      await refundByTxId('')
      expect(mockPrisma.tokenTransaction.findUnique).not.toHaveBeenCalled()
    })

    it('流水状态非 pending 应跳过', async () => {
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        status: 'refunded',
        type: 'deduct',
      })

      await refundByTxId('tx-1')

      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('应正确退还并写退还流水', async () => {
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        status: 'pending',
        type: 'deduct',
        relatedType: 'generation',
        relatedId: 'gen-1',
        modelId: 'sdxl',
        provider: 'pollinations',
      })
      const mockTx = {
        tokenTransaction: { update: vi.fn(), create: vi.fn() },
        userQuota: { update: vi.fn().mockResolvedValue({ remainingTokens: 1000 }) },
      }
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb(mockTx)
      })

      await refundByTxId('tx-1', '测试退还')

      expect(mockTx.tokenTransaction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-1' },
          data: { status: 'refunded' },
        }),
      )
      expect(mockTx.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'refund',
            status: 'completed',
            amount: 100,
            reason: '测试退还',
          }),
        }),
      )
    })
  })

  describe('linkTransactionToTask', () => {
    it('空参数应直接返回', async () => {
      await linkTransactionToTask('', 'task-1')
      expect(mockPrisma.tokenTransaction.update).not.toHaveBeenCalled()

      await linkTransactionToTask('tx-1', '')
      expect(mockPrisma.tokenTransaction.update).not.toHaveBeenCalled()
    })

    it('应更新流水关联到任务', async () => {
      mockPrisma.tokenTransaction.update.mockResolvedValue({ id: 'tx-1' })

      await linkTransactionToTask('tx-1', 'task-1')

      expect(mockPrisma.tokenTransaction.update).toHaveBeenCalledWith({
        where: { id: 'tx-1' },
        data: { relatedId: 'task-1', relatedType: 'task' },
      })
    })
  })

  describe('refundStalePendingTasks', () => {
    it('无超时流水应返回0', async () => {
      mockPrisma.tokenTransaction.findMany.mockResolvedValue([])

      const result = await refundStalePendingTasks({ maxAgeMinutes: 30 })

      expect(result.refunded).toBe(0)
      expect(result.totalAmount).toBe(0)
    })

    it('应退还超时任务并标记失败', async () => {
      const staleTxs = [
        { id: 'tx-1', userId: 'u1', amount: -100, relatedId: 'task-1', modelId: 'sdxl', provider: 'pollinations' },
        { id: 'tx-2', userId: 'u2', amount: -50, relatedId: 'task-2', modelId: 'wan', provider: 'pollinations' },
      ]
      mockPrisma.tokenTransaction.findMany.mockResolvedValue(staleTxs)

      // 模拟 refundTokens 的 findFirst → 找到流水
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue({
        id: 'tx-1',
        userId: 'u1',
        amount: -100,
        relatedType: 'task',
        relatedId: 'task-1',
        modelId: 'sdxl',
        provider: 'pollinations',
      })
      mockPrisma.$transaction.mockImplementation(async (cb) => {
        await cb({
          tokenTransaction: { update: vi.fn(), create: vi.fn() },
          userQuota: { update: vi.fn().mockResolvedValue({ remainingTokens: 1000 }) },
        })
      })
      mockPrisma.userTask.updateMany.mockResolvedValue({ count: 1 })

      const result = await refundStalePendingTasks({ maxAgeMinutes: 30 })

      expect(result.refunded).toBe(2)
      expect(result.totalAmount).toBe(150)
    })
  })
})
