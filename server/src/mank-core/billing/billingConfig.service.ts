/**
 * billingConfig.service.ts — 动态汇率 & 账单配置
 *
 * 把 POLLINATIONS_TOKEN_RATIO 从代码常量升级为 DB 可配置项。
 * 运营总览 → 换算链路 手动设置 ratio 时，所有 Pollinations 模型的积分消耗会自动上浮。
 *
 * 存储: SiteConfig { group: 'pricing', key: 'pollinations.token_ratio', value: '10' }
 * 缓存: 内存 60s TTL（与 modelCost 的 30s 配合，ratio 缓存略长减少 DB 压力）
 *
 * 级联: setTokenRatio → cascadeRatioChange → 遍历 Pollinations 模型重算 costTokens
 *
 * 公式（ratio 变化时，margin 不变，baseTokens 按 pollen 反推）:
 *   oldBase = reverseMargin(oldCostTokens, margin)
 *   pollen  = oldBase / oldRatio
 *   newBase = ceil(pollen × newRatio)
 *   newCost = applyMargin(newBase, margin)
 */
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { invalidateModelCostCache } from './modelCost'
import { invalidateImageModelCache } from '../image/imageModels'
import { clearVideoModelCache } from '../video/videoModels'
import {
  POLLINATIONS_TOKEN_RATIO as DEFAULT_RATIO,
  reverseMargin,
  applyMargin,
} from './tokenBilling'



// ------------------------------------------------------------------
// 内存缓存
// ------------------------------------------------------------------
const RATIO_CACHE_TTL_MS = 60 * 1000
let cachedRatio: number | null = null
let cachedAt = 0
let refreshing = false

export function __clearRatioCache() { cachedRatio = null; cachedAt = 0 }

// ------------------------------------------------------------------
// 读取: SiteConfig → fallback → 常量 10
// ------------------------------------------------------------------

/**
 * 获取当前 Pollinations 汇率（1 pollen = N 积分）
 * 优先读 SiteConfig 数据库，60s TTL 内存缓存
 */
export async function getTokenRatio(): Promise<number> {
  const now = Date.now()
  if (cachedRatio !== null && now - cachedAt < RATIO_CACHE_TTL_MS) {
    return cachedRatio
  }
  if (refreshing) return cachedRatio ?? DEFAULT_RATIO
  refreshing = true
  try {
    const row = await prisma.siteConfig.findFirst({
      where: { group: 'pricing', key: 'pollinations.token_ratio' },
    })
    if (row) {
      const n = Number(row.value)
      if (Number.isFinite(n) && n > 0) {
        cachedRatio = n
        cachedAt = now
        logger.info('BillingConfig: 从 SiteConfig 读取 token_ratio', { value: n })
        return n
      }
    }
    // 没配置 → 用默认值，不写回 DB（seed 会负责初始化）
    cachedRatio = DEFAULT_RATIO
    cachedAt = now
    logger.info('BillingConfig: SiteConfig 未配置 token_ratio，使用默认值', { default: DEFAULT_RATIO })
    return DEFAULT_RATIO
  } catch (e: any) {
    // DB 异常 → fallback 到常量，不崩溃
    logger.warn('BillingConfig: 读取 SiteConfig 失败，fallback 到默认值', { error: e?.message })
    cachedRatio = DEFAULT_RATIO
    cachedAt = now
    return DEFAULT_RATIO
  } finally {
    refreshing = false
  }
}

/** 同步版本（返回内存缓存或默认值，不触发 DB 读）— 给非 async 调用点用 */
export function getTokenRatioSync(): number {
  if (cachedRatio !== null && Date.now() - cachedAt < RATIO_CACHE_TTL_MS) return cachedRatio
  return DEFAULT_RATIO
}

// ------------------------------------------------------------------
// 设置: SiteConfig + 级联重算
// ------------------------------------------------------------------

export interface RatioChangeResult {
  oldRatio: number
  newRatio: number
  modelChecked: number
  modelUpdated: number
  modelSkipped: number
  details: Array<{ id: string; name: string; oldCost: number; newCost: number; margin: number }>
}

/**
 * 调整全局汇率，并级联重算所有 Pollinations 模型的 costTokens
 *
 * 安全:
 *   - ratio 必须 > 0
 *   - 写 SiteConfig 时加 audit log（SiteConfigAuditLog）
 *   - 每个模型按 pollen 反推再乘新 ratio，margin 不变
 *   - 如果某模型反推的 pollen ≤ 0（数据脏），跳过并计入 skipped
 *
 * @param newRatio 新汇率（1 pollen = N 积分）
 * @param operator 操作者 userId（审计用）
 */
export async function setTokenRatio(newRatio: number, operator?: string): Promise<RatioChangeResult> {
  if (!Number.isFinite(newRatio) || newRatio <= 0) {
    throw new Error('汇率必须是 > 0 的数字')
  }

  const oldRatio = await getTokenRatio()
  if (Math.abs(oldRatio - newRatio) < 0.001) {
    return { oldRatio, newRatio, modelChecked: 0, modelUpdated: 0, modelSkipped: 0, details: [] }
  }

  logger.info('BillingConfig: 调整 Pollinations 汇率', { oldRatio, newRatio, operator })

  // 1. 写 SiteConfig + 审计日志
  await prisma.$transaction([
    prisma.siteConfig.upsert({
      where: { group_key: { group: 'pricing', key: 'pollinations.token_ratio' } },
      update: {
        value: String(newRatio),
        label: 'Pollinations pollen→积分 汇率',
        description: '运营总览 / 换算链路设置：1 pollen = N 积分。修改后所有 Pollinations 模型积分消耗自动按比例上浮。',
        controlType: 'number',
        config: JSON.stringify({ min: 1, max: 1000, step: 1 }),
      },
      create: {
        group: 'pricing',
        key: 'pollinations.token_ratio',
        value: String(newRatio),
        label: 'Pollinations pollen→积分 汇率',
        description: '运营总览 / 换算链路设置：1 pollen = N 积分。修改后所有 Pollinations 模型积分消耗自动按比例上浮。',
        controlType: 'number',
        sort: 10,
      },
    }),
    prisma.siteConfigAuditLog.create({
      data: {
        group: 'pricing',
        key: 'pollinations.token_ratio',
        oldValue: String(oldRatio),
        newValue: String(newRatio),
        operator: operator ?? null,
        action: 'UPDATE',
      },
    }),
  ])

  // 2. 级联重算所有 Pollinations 模型
  const result = await cascadeRatioChange(oldRatio, newRatio)

  // 3. 刷新内存缓存
  cachedRatio = newRatio
  cachedAt = Date.now()

  // 4. 让三路运行时缓存也失效（扣费 + 图片模型列表 + 视频模型列表）
  invalidateModelCostCache()
  invalidateImageModelCache()
  clearVideoModelCache()

  return result
}

// ------------------------------------------------------------------
// 级联重算核心
// ------------------------------------------------------------------

/**
 * 遍历所有 Pollinations provider 下的模型，用新 ratio 重算 costTokens
 *
 * 公式:
 *   pollen  = reverseMargin(oldCost, margin) / oldRatio   // 反推真实 pollen 消耗
 *   newBase = ceil(pollen × newRatio)                      // 新 ratio 下的成本积分
 *   newCost = applyMargin(newBase, margin)                 // 加毛利率得到新售价
 *
 * 注意：pollen 是 Pollinations 官方成本，是客观不变的；ratio 和 margin 才是平台定价参数
 */
export async function cascadeRatioChange(
  oldRatio: number,
  newRatio: number,
): Promise<RatioChangeResult> {
  const POLL_PROVIDER_NAMES = ['pollinations', 'pollinations-video', 'Pollinations', 'Pollinations Video']

  const models = await prisma.aIModel.findMany({
    where: { provider: { name: { in: POLL_PROVIDER_NAMES } } },
    include: { provider: true },
  })

  const details: RatioChangeResult['details'] = []
  let updated = 0
  let skipped = 0

  for (const m of models) {
    const margin = m.margin ?? 0
    const oldCost = m.costTokens
    const base = reverseMargin(oldCost, margin)
    const pollen = base / oldRatio

    if (!isFinite(pollen) || pollen <= 0) {
      logger.warn('BillingConfig: 跳过模型，反推 pollen 异常', {
        model: m.name, oldCost, margin, base, oldRatio,
      })
      skipped++
      continue
    }

    const newBase = Math.ceil(pollen * newRatio)
    const newCost = applyMargin(newBase, margin)

    if (newCost !== oldCost) {
      await prisma.aIModel.update({
        where: { id: m.id },
        data: { costTokens: newCost },
      })
      updated++
      details.push({ id: m.id, name: m.name, oldCost, newCost, margin })
    } else {
      skipped++
    }
  }

  logger.info('BillingConfig: 汇率变更级联完成', {
    oldRatio, newRatio, checked: models.length, updated, skipped,
  })

  return {
    oldRatio, newRatio,
    modelChecked: models.length,
    modelUpdated: updated,
    modelSkipped: skipped,
    details,
  }
}

// ------------------------------------------------------------------
// 给 pollinationsSync / getPollinationsBalance 等调用方的便捷方法
// ------------------------------------------------------------------

/**
 * 重置为默认汇率（运营误操作时用）
 */
export async function resetTokenRatio(operator?: string): Promise<RatioChangeResult> {
  return setTokenRatio(DEFAULT_RATIO, operator)
}
