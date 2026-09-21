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
      updateMany: vi.fn(),
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
    child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
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

// 帮助函数：让 $transaction 调用回调并返回 tx
// 关键：tx 内部所有属性必须指向 mockPrisma 的同一个引用，这样外层设置的 mockResolvedValue
// 和事务内调用的才会命中同一个 vi.fn()
function setupTransactionMock() {
  const tx = {
    userQuota: mockPrisma.userQuota,
    tokenTransaction: mockPrisma.tokenTransaction,
    userTask: mockPrisma.userTask,
  }
  mockPrisma.$transaction.mockImplementation(async (cb: any) => await cb(tx))
  return tx
}

describe('TokenService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (cb: any) => {
      const mockTx = {
        userQuota: mockPrisma.userQuota,
        tokenTransaction: mockPrisma.tokenTransaction,
        userTask: mockPrisma.userTask,
      }
      return await cb(mockTx)
    })
  })

  describe('deductTokens (P0-1: 全事务包裹)', () => {
    it('amount <= 0 时应直接返回成功，不进事务', async () => {
      const result = await deductTokens({ userId: 'u1', amount: 0 })
      expect(result.success).toBe(true)
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('用户额度记录不存在应返回失败', async () => {
      setupTransactionMock()
      mockPrisma.userQuota.findUnique.mockResolvedValue(null)

      const result = await deductTokens({ userId: 'u1', amount: 100 })

      expect(result.success).toBe(false)
      expect(result.code).toBe('QUOTA_NOT_FOUND')
      expect(result.message).toMatch(/用户额度记录不存在/)
    })

    it('积分不足时应返回失败（事务回滚）', async () => {
      setupTransactionMock()
      mockPrisma.userQuota.findUnique.mockResolvedValue({ remainingTokens: 50 })
      mockPrisma.userQuota.updateMany.mockResolvedValue({ count: 0 })

      const result = await deductTokens({ userId: 'u1', amount: 100 })

      expect(result.success).toBe(false)
      expect(result.code).toBe('INSUFFICIENT_BALANCE')
      expect(result.message).toMatch(/积分不足/)
    })

    it('积分充足时应在事务内完成三步：读余额→原子扣减→写流水', async () => {
      setupTransactionMock()
      mockPrisma.userQuota.findUnique.mockResolvedValue({ remainingTokens: 1000 })
      mockPrisma.userQuota.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.tokenTransaction.create.mockResolvedValue({ id: 'tx-1' })

      const result = await deductTokens({
        userId: 'u1', amount: 100,
        relatedType: 'generation', relatedId: 'gen-1',
        modelId: 'sdxl', reason: '测试扣费',
      })

      expect(result.success).toBe(true)
      expect(result.transactionId).toBe('tx-1')
      expect(result.remaining).toBe(900)

      // 事务内三步调用验证
      expect(mockPrisma.userQuota.findUnique).toHaveBeenCalledWith({
        where: { userId: 'u1' }, select: { remainingTokens: true },
      })
      expect(mockPrisma.userQuota.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', remainingTokens: { gte: 100 } },
        data: { remainingTokens: { decrement: 100 } },
      })
      expect(mockPrisma.tokenTransaction.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'u1', type: 'deduct', status: 'pending',
          amount: -100, balanceBefore: 1000, balanceAfter: 900,
          relatedId: 'gen-1', modelId: 'sdxl',
        }),
      })
    })

    it('异常时应返回失败并记录日志', async () => {
      setupTransactionMock()
      mockPrisma.userQuota.findUnique.mockRejectedValue(new Error('DB连接失败'))

      const result = await deductTokens({ userId: 'u1', amount: 50 })

      expect(result.success).toBe(false)
      expect(result.code).toBe('INTERNAL_ERROR')
      expect(result.message).toMatch(/稍后重试/)
    })
  })

  describe('settleTokens (P0-2+P0-3: 事务内 TOCTOU 消除 + rethrow)', () => {
    it('找不到待结算流水时应静默返回（幂等）', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(null)

      await settleTokens({ userId: 'u1', relatedId: 'gen-1' })

      // 事务被调用但内部因为找不到流水直接 return
      expect(mockPrisma.tokenTransaction.findFirst).toHaveBeenCalled()
      expect(mockPrisma.tokenTransaction.updateMany).not.toHaveBeenCalled()
    })

    it('应正确结算 pending 流水并累加 usedTokens', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100,
        relatedType: 'generation', relatedId: 'gen-1',
        modelId: 'sdxl', provider: 'pollinations',
      })
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })

      await settleTokens({ userId: 'u1', relatedId: 'gen-1' })

      // 二次确认 updateMany 应被调用
      expect(mockPrisma.tokenTransaction.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          id: 'tx-1', status: 'pending', type: 'deduct',
        }),
        data: {
          status: 'settled',
          reason: undefined, // 无 actualAmount → 不写 reason
        },
      })
      expect(mockPrisma.userQuota.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { usedTokens: { increment: 100 } },
      })
    })

    it('actualAmount 小于预扣时应退还差额并写退还流水', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100,
        relatedType: 'generation', relatedId: 'gen-1',
        modelId: 'sdxl', provider: 'pollinations',
      })
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.userQuota.update
        .mockResolvedValueOnce({ usedTokens: 100 })   // usedTokens increment
        .mockResolvedValueOnce({ remainingTokens: 950 }) // 差额退还

      await settleTokens({
        userId: 'u1', relatedId: 'gen-1',
        actualAmount: 50, // 预扣 100，实际 50 → 退 50
      })

      // usedTokens 应累加 actualAmount（50），不是 preAmount（100）
      expect(mockPrisma.userQuota.update).toHaveBeenNthCalledWith(
        1, { where: { userId: 'u1' }, data: { usedTokens: { increment: 50 } } }
      )
      // 差额退还 + 退还流水
      expect(mockPrisma.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'refund', status: 'completed', amount: 50,
          }),
        }),
      )
    })

    it('settleTokens 失败应 rethrow（让 taskWorker 感知）', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockRejectedValue(new Error('DB error'))

      await expect(
        settleTokens({ userId: 'u1', relatedId: 'gen-1' })
      ).rejects.toThrow('DB error')
    })
  })

  describe('refundTokens (P0-2+P0-3)', () => {
    it('找不到待退还流水时应静默返回（幂等）', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue(null)

      await refundTokens({ userId: 'u1', relatedId: 'gen-1' })

      expect(mockPrisma.tokenTransaction.updateMany).not.toHaveBeenCalled()
    })

    it('应正确标记 refunded + 退还余额 + 写退还流水', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100,
        relatedType: 'generation', relatedId: 'gen-1',
        modelId: 'sdxl', provider: 'pollinations',
      })
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.userQuota.update.mockResolvedValue({ remainingTokens: 1000 })

      await refundTokens({ userId: 'u1', relatedId: 'gen-1', reason: '生成失败' })

      expect(mockPrisma.tokenTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'tx-1', status: 'pending', type: 'deduct',
          }),
          data: { status: 'refunded' },
        }),
      )
      expect(mockPrisma.userQuota.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { remainingTokens: { increment: 100 } },
      })
      expect(mockPrisma.tokenTransaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            type: 'refund', status: 'completed', amount: 100,
            reason: '生成失败',
          }),
        }),
      )
    })

    it('退还失败应 rethrow', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findFirst.mockRejectedValue(new Error('DB error'))

      await expect(
        refundTokens({ userId: 'u1', relatedId: 'gen-1' })
      ).rejects.toThrow('DB error')
    })
  })

  describe('addTokens', () => {
    it('amount <= 0 时应直接返回成功', async () => {
      const result = await addTokens({ userId: 'u1', amount: 0, type: 'recharge' })
      expect(result.success).toBe(true)
    })

    it('应通过 createTransaction 增加积分', async () => {
      setupTransactionMock()
      mockPrisma.userQuota.findUnique.mockResolvedValue({ remainingTokens: 1000 })
      mockPrisma.userQuota.update.mockResolvedValue({
        remainingTokens: 1100, totalTokens: 2100, usedTokens: 0,
      })
      mockPrisma.tokenTransaction.create.mockResolvedValue({ id: 'tx-add' })

      const result = await addTokens({
        userId: 'u1', amount: 100, type: 'recharge',
        reason: '充值100积分',
      })

      expect(result.success).toBe(true)
      expect(result.remaining).toBe(1100)
      expect(result.total).toBe(2100)
    })
  })

  describe('settleByTxId (P0-2: TOCTOU 消除)', () => {
    it('空 txId 应直接返回', async () => {
      await settleByTxId('')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('流水已不是 pending 时应事务内 updateMany count=0 → 静默返回', async () => {
      setupTransactionMock()
      // updateMany count=0 说明流水已被其他操作改过状态
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 0 })

      await settleByTxId('tx-already-settled')

      expect(mockPrisma.tokenTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'tx-already-settled', status: 'pending', type: 'deduct' },
          data: { status: 'settled' },
        }),
      )
      // 但后续的 usedTokens 累加不应执行
      expect(mockPrisma.userQuota.update).not.toHaveBeenCalled()
    })

    it('应正确结算 pending 流水并累加 usedTokens', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100, status: 'settled',
      })

      await settleByTxId('tx-1')

      expect(mockPrisma.userQuota.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { usedTokens: { increment: 100 } },
      })
    })

    it('结算失败不 rethrow（调用方是 fire-and-forget）', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.updateMany.mockRejectedValue(new Error('DB error'))

      // 不应抛异常
      await expect(settleByTxId('tx-1')).resolves.toBeUndefined()
    })
  })

  describe('refundByTxId (P0-2: TOCTOU 消除)', () => {
    it('空 txId 应直接返回', async () => {
      await refundByTxId('')
      expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    })

    it('流水已终态时应静默返回（幂等）', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100, status: 'refunded', type: 'deduct',
      })

      await refundByTxId('tx-1')

      expect(mockPrisma.tokenTransaction.updateMany).not.toHaveBeenCalled()
    })

    it('从 pending 退还：只加余额，不减 usedTokens', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100, status: 'pending', type: 'deduct',
      })
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.userQuota.update.mockResolvedValue({ remainingTokens: 1000 })
      mockPrisma.tokenTransaction.create.mockResolvedValue({ id: 'refund-tx' })

      await refundByTxId('tx-1', '测试退还')

      // updateMany 应锁死 pending 状态
      expect(mockPrisma.tokenTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'tx-1', status: 'pending', type: 'deduct',
          }),
          data: { status: 'refunded' },
        }),
      )
      // 只加余额，不应减 usedTokens（因为 wasPending=true）
      expect(mockPrisma.userQuota.update).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        data: { remainingTokens: { increment: 100 } },
      })
      // usedTokens update 不应被调用
      const allCalls = mockPrisma.userQuota.update.mock.calls
      const usedTokensDecrementCalled = allCalls.some(
        (c: any[]) => c[0].data && c[0].data.usedTokens
      )
      expect(usedTokensDecrementCalled).toBe(false)
    })

    it('从 settled 退还：应先减 usedTokens 再加余额', async () => {
      setupTransactionMock()
      mockPrisma.tokenTransaction.findUnique.mockResolvedValue({
        id: 'tx-1', userId: 'u1', amount: -100, status: 'settled', type: 'deduct',
      })
      mockPrisma.tokenTransaction.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.userQuota.update
        .mockResolvedValueOnce({ usedTokens: 100 })
        .mockResolvedValueOnce({ remainingTokens: 1000 })

      await refundByTxId('tx-1', '测试退还settled')

      // 锁死 settled 状态
      expect(mockPrisma.tokenTransaction.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: 'tx-1', status: 'settled', type: 'deduct',
          }),
          data: { status: 'refunded' },
        }),
      )
      // 先减 usedTokens
      expect(mockPrisma.userQuota.update).toHaveBeenNthCalledWith(
        1, { where: { userId: 'u1' }, data: { usedTokens: { decrement: 100 } } }
      )
      // 再加余额
      expect(mockPrisma.userQuota.update).toHaveBeenNthCalledWith(
        2, { where: { userId: 'u1' }, data: { remainingTokens: { increment: 100 } } }
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

  describe('refundStalePendingTasks (P1-1: 去掉 relatedType 过滤)', () => {
    it('无超时流水应返回 0', async () => {
      mockPrisma.tokenTransaction.findMany.mockResolvedValue([])

      const result = await refundStalePendingTasks({ maxAgeMinutes: 30 })

      expect(result.refunded).toBe(0)
      expect(result.totalAmount).toBe(0)
    })

    it('应退还所有超时 pending 流水（包括 generation 和 task 类型）', async () => {
      mockPrisma.tokenTransaction.findMany.mockResolvedValue([
        { id: 'tx-1', userId: 'u1', amount: -100, relatedId: 'gen-1', modelId: 'sdxl', provider: 'pollinations' },
        { id: 'tx-2', userId: 'u2', amount: -50, relatedId: 'task-2', modelId: 'wan', provider: 'pollinations' },
      ])

      // refundByTxId 内部自己管事务，这里直接 mock 掉
      mockPrisma.$transaction.mockResolvedValue(undefined)

      const result = await refundStalePendingTasks({ maxAgeMinutes: 30 })

      expect(result.refunded).toBe(2)
      expect(result.totalAmount).toBe(150)

      // 验证 findMany 的 where 条件里没有 relatedType 过滤
      expect(mockPrisma.tokenTransaction.findMany).toHaveBeenCalledWith({
        where: {
          type: 'deduct',
          status: 'pending',
          createdAt: expect.any(Object),
          // 关键：没有 relatedType: 'task' 或其他过滤
        },
        select: expect.any(Object),
      })
    })
  })
})
