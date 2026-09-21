/**
 * billingConfig.service.ts 单元测试 — 动态汇率级联变更
 *
 * 覆盖:
 *   1. getTokenRatio — SiteConfig 有值/没值/脏值 fallback
 *   2. setTokenRatio — 写入 SiteConfig + audit log + 级联重算
 *   3. cascadeRatioChange — pollinations 模型积分按比例上浮
 *   4. 非法 ratio 输入 — 抛出错误
 *   5. 级联公式 — 反推 pollen 保持不变，ratio 变则 costTokens 同比例变
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  getTokenRatio,
  setTokenRatio,
  cascadeRatioChange,
  getTokenRatioSync,
  resetTokenRatio,
  __clearRatioCache,
} from '../src/mank-core/billing/billingConfig.service'

// vi.hoisted 必须在所有 import 之前
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    siteConfig: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    siteConfigAuditLog: { create: vi.fn() },
    aIModel: { findMany: vi.fn(), update: vi.fn() },
    $transaction: vi.fn((fns: any[]) => Promise.all(fns)),
  },
}))

vi.mock('../src/mank-infra/database/prisma', () => ({ default: mockPrisma }))
vi.mock('../src/mank-infra/logging/logger', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) },
}))
vi.mock('../src/mank-core/billing/modelCost', () => ({ invalidateModelCostCache: vi.fn() }))

describe('billingConfig.service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 清理缓存
    vi.resetModules()
  })

  // ------------------------------------------------------------------
  // getTokenRatio
  // ------------------------------------------------------------------
  describe('getTokenRatio()', () => {
    beforeEach(() => { __clearRatioCache() })
    it('SiteConfig 有值 → 返回配置值', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: '50' })
      const r = await getTokenRatio()
      expect(r).toBe(50)
    })
    it('SiteConfig 没值 → fallback 默认 10', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue(null)
      const r = await getTokenRatio()
      expect(r).toBe(10)
    })
    it('SiteConfig 脏值（非数字/负数）→ fallback 默认 10', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: 'abc' })
      expect(await getTokenRatio()).toBe(10)

      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: '-1' })
      expect(await getTokenRatio()).toBe(10)
    })
    it('DB 报错 → fallback 默认 10（不崩溃）', async () => {
      mockPrisma.siteConfig.findFirst.mockRejectedValue(new Error('DB down'))
      const r = await getTokenRatio()
      expect(r).toBe(10)
    })
  })

  describe('getTokenRatioSync()', () => {
    it('无缓存时返回默认值 10', () => {
      expect(getTokenRatioSync()).toBe(10)
    })
  })

  // ------------------------------------------------------------------
  // setTokenRatio — 非法输入
  // ------------------------------------------------------------------
  describe('setTokenRatio() 输入验证', () => {
    beforeEach(() => { __clearRatioCache() })
    it('ratio=0 → 抛错', async () => {
      await expect(setTokenRatio(0)).rejects.toThrow(/必须是 > 0/)
    })
    it('ratio=-5 → 抛错', async () => {
      await expect(setTokenRatio(-5)).rejects.toThrow(/必须是 > 0/)
    })
    it('ratio=NaN → 抛错', async () => {
      await expect(setTokenRatio(NaN)).rejects.toThrow(/必须是 > 0/)
    })
  })

  // ------------------------------------------------------------------
  // setTokenRatio — SiteConfig + audit log 写入
  // ------------------------------------------------------------------
  describe('setTokenRatio() 写入 SiteConfig', () => {
    beforeEach(() => { __clearRatioCache() })
    it('正常写入 + 审计日志', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: '10' })
      mockPrisma.siteConfig.upsert.mockResolvedValue({})
      mockPrisma.siteConfigAuditLog.create.mockResolvedValue({})
      mockPrisma.aIModel.findMany.mockResolvedValue([])  // 空模型 = 级联也无事可做

      const result = await setTokenRatio(50, 'admin-1')

      // SiteConfig upsert
      expect(mockPrisma.siteConfig.upsert).toHaveBeenCalledTimes(1)
      const upsertCall = mockPrisma.siteConfig.upsert.mock.calls[0][0]
      expect(upsertCall.where.group_key.group).toBe('pricing')
      expect(upsertCall.where.group_key.key).toBe('pollinations.token_ratio')
      expect(upsertCall.update.value).toBe('50')

      // 审计日志
      expect(mockPrisma.siteConfigAuditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          group: 'pricing',
          key: 'pollinations.token_ratio',
          oldValue: '10',
          newValue: '50',
          operator: 'admin-1',
          action: 'UPDATE',
        }),
      })

      // 返回值
      expect(result.oldRatio).toBe(10)
      expect(result.newRatio).toBe(50)
      expect(result.modelChecked).toBe(0)
    })

    it('ratio 没变 → no-op', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: '10' })

      const result = await setTokenRatio(10)
      expect(result.modelChecked).toBe(0)
      expect(mockPrisma.siteConfig.upsert).not.toHaveBeenCalled()
    })
  })

  // ------------------------------------------------------------------
  // cascadeRatioChange — 级联重算公式
  // ------------------------------------------------------------------
  describe('cascadeRatioChange() — 级联公式验证', () => {
    beforeEach(() => { __clearRatioCache() })
    // 关键假设：pollen 是真实成本，不变；ratio 和 margin 才是平台定价参数
    // pollen = reverseMargin(oldCost, margin) / oldRatio
    // newCost = applyMargin(ceil(pollen * newRatio), margin)

    it('ratio 从 10 → 100: wan-2.6 base 5 + margin 0 → base 50 × 1 = 50', async () => {
      // old: cost=5, margin=0, ratio=10
      //   reverseMargin(5, 0) = 5
      //   pollen = 5 / 10 = 0.5
      // new: newBase = ceil(0.5 × 100) = 50
      //   newCost = applyMargin(50, 0) = 50
      mockPrisma.aIModel.findMany.mockResolvedValue([{
        id: 'm1', name: 'wan-2.6', costTokens: 5, margin: 0,
        provider: { name: 'pollinations-video' },
      }])
      mockPrisma.aIModel.update.mockResolvedValue({})

      const r = await cascadeRatioChange(10, 100)

      expect(r.modelChecked).toBe(1)
      expect(r.modelUpdated).toBe(1)
      expect(r.details[0]).toEqual({ id: 'm1', name: 'wan-2.6', oldCost: 5, newCost: 50, margin: 0 })
    })

    it('ratio 从 10 → 100: wan-2.6 base 5 + margin 50% → 新 base 50 × 1.5 = 75', async () => {
      // old: cost=8, margin=50, ratio=10 (8 = ceil(5 × 1.5))
      //   reverseMargin(8, 50) = round(8/1.5) = round(5.33) = 5 → pollen = 5/10 = 0.5
      // new: newBase = ceil(0.5 × 100) = 50
      //   newCost = applyMargin(50, 50) = ceil(50 × 1.5) = 75
      mockPrisma.aIModel.findMany.mockResolvedValue([{
        id: 'm1', name: 'wan-2.6', costTokens: 8, margin: 50,
        provider: { name: 'pollinations-video' },
      }])
      mockPrisma.aIModel.update.mockResolvedValue({})

      const r = await cascadeRatioChange(10, 100)

      expect(r.details[0].newCost).toBe(75)
    })

    it('ratio 从 10 → 5（下调）: 模型积分也相应减少', async () => {
      // old: cost=20, margin=100, ratio=10
      //   reverseMargin(20, 100) = 10 → pollen = 10/10 = 1
      // new: newBase = ceil(1 × 5) = 5 → newCost = applyMargin(5, 100) = 10
      mockPrisma.aIModel.findMany.mockResolvedValue([{
        id: 'm1', name: 'm', costTokens: 20, margin: 100,
        provider: { name: 'pollinations' },
      }])
      mockPrisma.aIModel.update.mockResolvedValue({})

      const r = await cascadeRatioChange(10, 5)
      expect(r.details[0].newCost).toBe(10)
    })

    it('pollen 反推异常的模型 → skipped', async () => {
      // costTokens=0 导致 reverseMargin=0 → pollen=0 → 跳过
      mockPrisma.aIModel.findMany.mockResolvedValue([{
        id: 'm1', name: 'dirty', costTokens: 0, margin: 0,
        provider: { name: 'pollinations' },
      }])

      const r = await cascadeRatioChange(10, 50)
      expect(r.modelChecked).toBe(1)
      expect(r.modelSkipped).toBe(1)
      expect(r.modelUpdated).toBe(0)
    })

    it('非 Pollinations provider 的模型 → 不处理', async () => {
      mockPrisma.aIModel.findMany.mockResolvedValue([])  // findMany 只返回 pollinations 的
      await cascadeRatioChange(10, 50)
      // 不会查 non-pollinations，不会更新
    })
  })

  // ------------------------------------------------------------------
  // resetTokenRatio
  // ------------------------------------------------------------------
  describe('resetTokenRatio()', () => {
    beforeEach(() => { __clearRatioCache() })
    it('调用 setTokenRatio(10)', async () => {
      mockPrisma.siteConfig.findFirst.mockResolvedValue({ value: '50' })
      mockPrisma.aIModel.findMany.mockResolvedValue([])

      const r = await resetTokenRatio('admin-1')
      expect(r.oldRatio).toBe(50)
      expect(r.newRatio).toBe(10)
    })
  })
})
