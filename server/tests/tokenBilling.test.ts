/**
 * tokenBilling.ts 单元测试
 *
 * 覆盖：
 *   1. applyMargin / reverseMargin —— 毛利率百分比 核心公式
 *   2. calcVideoBaseTokens / calcImageBaseTokens / calcTextBaseTokens —— 基础成本积分
 *   3. resolveCostTokensFromPollinations —— 全管道 baseTokens + costTokens
 *   4. pollenFromBaseTokens / pollenFromCostTokens —— 反向推算
 *   5. 边界条件：margin=0 / 极小值向上取整 / 零输入 / ratioOverride
 */
import { describe, it, expect } from 'vitest'
import {
  POLLINATIONS_TOKEN_RATIO,
  DEFAULT_MARGIN_PERCENT,
  applyMargin,
  reverseMargin,
  calcVideoBaseTokens,
  calcImageBaseTokens,
  calcTextBaseTokens,
  resolveCostTokensFromPollinations,
  pollenFromBaseTokens,
  pollenFromCostTokens,
} from '../src/mank-core/billing/tokenBilling'

// ------------------------------------------------------------------
// 常量
// ------------------------------------------------------------------
describe('tokenBilling 常量', () => {
  it('POLLINATIONS_TOKEN_RATIO 默认 10', () => {
    expect(POLLINATIONS_TOKEN_RATIO).toBe(10)
  })
  it('DEFAULT_MARGIN_PERCENT = 0（无溢价）', () => {
    expect(DEFAULT_MARGIN_PERCENT).toBe(0)
  })
})

// ------------------------------------------------------------------
// applyMargin / reverseMargin
// ------------------------------------------------------------------
describe('applyMargin(baseTokens, marginPercent)', () => {
  it('margin=0 → 无溢价，原样返回', () => {
    expect(applyMargin(10, 0)).toBe(10)
    expect(applyMargin(1, 0)).toBe(1)
  })
  it('margin=50 → 加价 50%（用户要求的场景）', () => {
    expect(applyMargin(10, 50)).toBe(15)
    expect(applyMargin(100, 50)).toBe(150)
  })
  it('margin=100 → 加价 100%（翻倍）', () => {
    expect(applyMargin(10, 100)).toBe(20)
  })
  it('margin=200 → 加价 200%（3 倍）', () => {
    expect(applyMargin(10, 200)).toBe(30)
  })
  it('结果向上取整（ceil）', () => {
    // 7 × 1.5 = 10.5 → ceil = 11
    expect(applyMargin(7, 50)).toBe(11)
    // 3 × 1.1 = 3.3 → ceil = 4
    expect(applyMargin(3, 10)).toBe(4)
  })
  it('baseTokens=0 → 永远返回 0', () => {
    expect(applyMargin(0, 50)).toBe(0)
    expect(applyMargin(0, 999)).toBe(0)
  })
  it('margin=null/undefined/负数 → 视为 0', () => {
    // @ts-expect-error 测试边界
    expect(applyMargin(10, null)).toBe(10)
    // @ts-expect-error
    expect(applyMargin(10, undefined)).toBe(10)
    expect(applyMargin(10, -5)).toBe(10)
  })
})

describe('reverseMargin(costTokens, marginPercent)', () => {
  it('margin=0 → 原样返回', () => {
    expect(reverseMargin(15, 0)).toBe(15)
  })
  it('margin=50 → 反推 base', () => {
    // 15 / 1.5 = 10
    expect(reverseMargin(15, 50)).toBe(10)
    // 150 / 1.5 = 100
    expect(reverseMargin(150, 50)).toBe(100)
  })
  it('baseTokens 向上取整后的反推误差在 ±1 以内', () => {
    // applyMargin(7, 50) = 11
    // reverseMargin(11, 50) = round(11/1.5) = round(7.33) = 7 ✓
    const forward = applyMargin(7, 50)
    expect(reverseMargin(forward, 50)).toBe(7)

    // applyMargin(3, 10) = 4
    // reverseMargin(4, 10) = round(4/1.1) = round(3.63) = 4 ← 有 1 误差，可接受
    const f2 = applyMargin(3, 10)
    const r2 = reverseMargin(f2, 10)
    expect(Math.abs(r2 - 3)).toBeLessThanOrEqual(1)
  })
  it('costTokens=0 → 返回 0', () => {
    expect(reverseMargin(0, 50)).toBe(0)
  })
})

// ------------------------------------------------------------------
// calcVideoBaseTokens
// ------------------------------------------------------------------
describe('calcVideoBaseTokens — video 模型基础成本', () => {
  it('wan-2.6: 0.1 pollen/s × 5s × 10 = 5', () => {
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.1,
      defaultDurationSeconds: 5,
    })).toBe(5)
  })
  it('seedance-2.0: 0.18 pollen/s × 5s × 10 = 9', () => {
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.18,
      defaultDurationSeconds: 5,
    })).toBe(9)
  })
  it('nova-reel: 0.08 pollen/s × 6s × 10 = ceil(4.8) = 5', () => {
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.08,
      defaultDurationSeconds: 6,
    })).toBe(5)
  })
  it('seedance-2.5: 0.1028 pollen/s × 4s × 10 = ceil(4.112) = 5', () => {
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.1028,
      defaultDurationSeconds: 4,
    })).toBe(5)
  })
  it('极小值: 0.00625 × 5 × 10 = ceil(0.3125) = 1（至少收 1）', () => {
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.00625,
      defaultDurationSeconds: 5,
    })).toBe(1)
  })
  it('零/负输入 → 0', () => {
    expect(calcVideoBaseTokens({ pollenPerSecond: 0, defaultDurationSeconds: 5 })).toBe(0)
    expect(calcVideoBaseTokens({ pollenPerSecond: 0.1, defaultDurationSeconds: 0 })).toBe(0)
    expect(calcVideoBaseTokens({ pollenPerSecond: -1, defaultDurationSeconds: 5 })).toBe(0)
  })
  it('ratioOverride 覆盖全局比率', () => {
    // 0.1 × 5 × 100 = 50
    expect(calcVideoBaseTokens({
      pollenPerSecond: 0.1,
      defaultDurationSeconds: 5,
      ratioOverride: 100,
    })).toBe(50)
  })
})

// ------------------------------------------------------------------
// calcImageBaseTokens
// ------------------------------------------------------------------
describe('calcImageBaseTokens — image 模型基础成本', () => {
  it('flux.2-flex: 0.0375 pollen/图 × 10 = ceil(0.375) = 1', () => {
    expect(calcImageBaseTokens({ completionImageTokens: 0.0375 })).toBe(1)
  })
  it('ideogram-v4-quality: 0.1 pollen/图 × 10 = 1', () => {
    expect(calcImageBaseTokens({ completionImageTokens: 0.1 })).toBe(1)
  })
  it('较高成本模型: 2 pollen/图 × 10 = 20', () => {
    expect(calcImageBaseTokens({ completionImageTokens: 2 })).toBe(20)
  })
  it('零/负输入 → 0', () => {
    expect(calcImageBaseTokens({ completionImageTokens: 0 })).toBe(0)
    expect(calcImageBaseTokens({ completionImageTokens: -1 })).toBe(0)
  })
})

// ------------------------------------------------------------------
// calcTextBaseTokens
// ------------------------------------------------------------------
describe('calcTextBaseTokens — text 模型基础成本', () => {
  it('prompt+completion 合计', () => {
    // 0.5 + 1.5 = 2 pollen × 10 = 20
    expect(calcTextBaseTokens({
      promptTextTokens: 0.5,
      completionTextTokens: 1.5,
    })).toBe(20)
  })
  it('都为 0 → 0', () => {
    expect(calcTextBaseTokens({ promptTextTokens: 0, completionTextTokens: 0 })).toBe(0)
  })
})

// ------------------------------------------------------------------
// resolveCostTokensFromPollinations — 全管道
// ------------------------------------------------------------------
describe('resolveCostTokensFromPollinations — 全管道', () => {
  it('video 模型: baseTokens + costTokens(含 margin=50)', () => {
    const info = {
      id: 'alibaba/wan-2.6',
      pricing: {
        currency: 'pollen' as const,
        completionVideoSeconds: '0.1',
      },
    }
    const r = resolveCostTokensFromPollinations(info, 5, 50)
    expect(r.pollenConsumed).toBeCloseTo(0.5)      // 0.1 × 5s
    expect(r.baseTokens).toBe(5)                     // ceil(0.5 × 10)
    expect(r.costTokens).toBe(8)                     // ceil(5 × 1.5) = 8
    expect(r.billingUnit).toBe('per-second')
  })

  it('video 模型: margin=0 → costTokens = baseTokens', () => {
    const info = {
      id: 'alibaba/wan-2.6',
      pricing: { currency: 'pollen' as const, completionVideoSeconds: '0.1' },
    }
    const r = resolveCostTokensFromPollinations(info, 5, 0)
    expect(r.baseTokens).toBe(5)
    expect(r.costTokens).toBe(5)
  })

  it('image 模型: baseTokens + costTokens(含 margin=100)', () => {
    const info = {
      id: 'black-forest-labs/flux.2-flex',
      pricing: { currency: 'pollen' as const, completionImageTokens: '0.0375' },
    }
    const r = resolveCostTokensFromPollinations(info, 0, 100)
    expect(r.baseTokens).toBe(1)                     // ceil(0.0375 × 10) = 1
    expect(r.costTokens).toBe(2)                     // ceil(1 × 2.0) = 2
    expect(r.billingUnit).toBe('per-image')
  })

  it('pricing 为 null → 全 0', () => {
    const r = resolveCostTokensFromPollinations({ id: 'x' }, 5, 50)
    expect(r).toEqual({ baseTokens: 0, costTokens: 0, pollenConsumed: 0, billingUnit: 'unknown' })
  })

  it('pollination/s 为 0 → costTokens=0, billingUnit 走 unknown 分支', () => {
    const info = {
      id: 'zero-model',
      pricing: { currency: 'pollen' as const, completionVideoSeconds: '0' },
    }
    const r = resolveCostTokensFromPollinations(info, 5, 50)
    expect(r.costTokens).toBe(0)
    // videoRate = 0 不满足 > 0，跳过 video 分支 → 走不到 image/text → unknown
    expect(r.billingUnit).toBe('unknown')
  })
})

// ------------------------------------------------------------------
// 反向推算
// ------------------------------------------------------------------
describe('反向推算: pollenFromBaseTokens / pollenFromCostTokens', () => {
  it('pollenFromBaseTokens', () => {
    // 5 积分成本 / 10 = 0.5 pollen
    expect(pollenFromBaseTokens(5)).toBe(0.5)
  })
  it('pollenFromCostTokens — 需要先反 margin', () => {
    // costTokens=15, margin=50% → base=10 → pollen=1
    expect(pollenFromCostTokens(15, 50)).toBe(1)
    // costTokens=10, margin=0 → base=10 → pollen=1
    expect(pollenFromCostTokens(10, 0)).toBe(1)
  })
  it('ratioOverride 生效', () => {
    expect(pollenFromBaseTokens(100, 100)).toBe(1)  // 100/100
  })
})

// ------------------------------------------------------------------
// 用户场景集成：wan-2.6 + 不同 margin
// ------------------------------------------------------------------
describe('用户场景: wan-2.6 视频模型 不同 margin 下的售价', () => {
  const wanVideoInfo = {
    id: 'alibaba/wan-2.6',
    pricing: { currency: 'pollen' as const, completionVideoSeconds: '0.1' },
  }

  it('margin=0  → 成本价: 5 积分/次', () => {
    const r = resolveCostTokensFromPollinations(wanVideoInfo, 5, 0)
    expect(r.baseTokens).toBe(5)
    expect(r.costTokens).toBe(5)
  })
  it('margin=50 → 加价 50%: 8 积分/次', () => {
    const r = resolveCostTokensFromPollinations(wanVideoInfo, 5, 50)
    expect(r.baseTokens).toBe(5)
    expect(r.costTokens).toBe(8)  // ceil(5 × 1.5) = 8
  })
  it('margin=100 → 翻倍: 10 积分/次', () => {
    const r = resolveCostTokensFromPollinations(wanVideoInfo, 5, 100)
    expect(r.costTokens).toBe(10)
  })
  it('margin=200 → 3 倍: 15 积分/次', () => {
    const r = resolveCostTokensFromPollinations(wanVideoInfo, 5, 200)
    expect(r.costTokens).toBe(15)
  })
})
