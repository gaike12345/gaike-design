/**
 * Pollinations 官方定价同步服务
 *
 * 每周自动从 https://gen.pollinations.ai/v1/models 拉取官方定价
 * 同步数据库 AIModel 的 costTokens
 *
 * 积分制度（currency boundary redesign 2026-09）:
 *   Pollinations 官方以 pollen 计费（$1 ≈ 1 pollen）
 *   平台向用户以"积分"计费，换算比例 1 pollen = POLLINATIONS_TOKEN_RATIO（默认 10）
 *
 *   costTokens = ceil(Pollinations 官方 pollen 消耗 × 10)
 *
 *   margin 语义: costTokens / pollen 消耗（即"当前模型的售价倍率"）
 *     所有模型初始 margin = POLLINATIONS_TOKEN_RATIO / 1 = 10
 *     管理员可以在默认 10:1 基础上单独调高（如稀缺模型 ×15）或调低（折扣）
 *     pollinationsSync 已有模型时使用模型自身的 margin，不覆盖
 *
 * 可靠性设计（scheduled-job-reliability）:
 * - 幂等: 每次同步写入 PollinationsSyncLog，UPSERT AIModel
 * - 防重叠: isSyncing boolean 标记，跳过并发调用
 * - 漏跑检测: 启动时检查 lastSyncAt，> 8 天自动补跑
 * - 追赶策略: 跳过式补跑，不补历史
 * - 完成证据: PollinationsSyncLog 记录 start/end/status/diff
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import {
  POLLINATIONS_TOKEN_RATIO as RATIO_CONSTANT,
  DEFAULT_MARGIN_PERCENT,
  resolveCostTokensFromPollinations,
  PollinationsModelInfo,
  PollinationsPricing,
  PollinationsVideoPricing,
  PollinationsImageSimplePricing,
  PollinationsImageComplexPricing,
  ResolvedCostTokens,
} from './tokenBilling'
import { getTokenRatio } from './billingConfig.service'

export const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/models'
export const POLLINATIONS_BALANCE_API = 'https://gen.pollinations.ai/account/balance'
export const POLLINATIONS_PROFILE_API = 'https://gen.pollinations.ai/account/profile'
export const SYNC_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000 // 7 天
export const MISSED_RUN_THRESHOLD_MS = 8 * 24 * 60 * 60 * 1000 // 8 天以上视为漏跑

// Pollinations 官方 video 模型 ID → 我们的内部 ID 映射
// 有些模型有别名，需要统一到我们的 FALLBACK_VIDEO_MODELS.id
const MODEL_ID_ALIASES: Record<string, string> = {
  'bytedance/seedance-1-pro-fast': 'seedance-pro',
  'bytedance/seedance-2.0-fast': 'seedance-2.0-fast',
  'bytedance/seedance-2.0-mini': 'seedance-2.0-mini',
  'bytedance/seedance-2.5': 'seedance-2.5',
  'bytedance/seedance-2.0': 'seedance-2.0',
  'alibaba/wan-2.2-fast': 'wan-fast',
  'alibaba/wan-2.7': 'wan-pro',
  'alibaba/wan-3.0': 'wan-3.0',
  'prunaai/p-video': 'p-video',
  'google/veo-3.1-fast': 'veo',
  'minimax/minimax-h3': 'minimax-h3',
  'amazon/nova-reel-v1': 'nova-reel',
  // 以下模型 Pollinations 有但我们暂未接入
  'alibaba/wan-2.6': 'wan-2.6',
  'alibaba/happyhorse-1.1': 'happyhorse',
  'x-ai/grok-imagine-video': 'grok-video',
  'x-ai/grok-imagine-video-1.5': 'grok-video-pro',
}

// 模型默认时长（Pollinations video pricing 以 pollen/秒 为粒度，我们需要标准时长换算）
const DEFAULT_DURATION_SECONDS = (internalId: string): number => {
  if (internalId === 'seedance-2.5') return 4
  if (internalId === 'nova-reel') return 6
  return 5 // 大多数 video 模型默认 5 秒
}

/**
 * 查找/创建 Pollinations 对应的 AIProvider。
 * 历史兼容：seed.ts 里有 pollinations（小写 image）+ pollinations-video（小写连字符 video），
 *          旧 sync 可能创建了大写 Pollinations。此函数统一处理三种命名。
 */
async function resolvePollinationsProvider(modelType: 'video' | 'image'): Promise<{ id: string; name: string }> {
  // 按 modelType 优先匹配 seed.ts 的命名（最常见）
  const preferredNames = modelType === 'video'
    ? ['pollinations-video', 'Pollinations-video', 'Pollinations Video', 'Pollinations']
    : ['pollinations', 'Pollinations', 'Pollinations-video']

  // 先 findFirst 找到第一个存在的
  for (const name of preferredNames) {
    const existing = await prisma.aIProvider.findFirst({ where: { name } })
    if (existing) return { id: existing.id, name: existing.name }
  }

  // 都没找到 → 创建一个（对齐 seed.ts 命名规范）
  const newName = modelType === 'video' ? 'pollinations-video' : 'pollinations'
  const created = await prisma.aIProvider.create({
    data: {
      name: newName,
      displayName: modelType === 'video' ? 'Pollinations Video' : 'Pollinations',
      type: modelType,
      baseUrl: modelType === 'video' ? 'https://gen.pollinations.ai/video/' : 'https://gen.pollinations.ai/image/',
    },
  })
  logger.warn('Pollinations provider 不存在，自动创建', { name: newName, type: modelType })
  return { id: created.id, name: created.name }
}

let isSyncing = false

export interface SyncResult {
  status: 'success' | 'failed' | 'partial'
  modelsChecked: number
  modelsUpdated: number
  modelsAdded: number
  modelsRemoved: number
  diff: Array<{ modelId: string; label: string; oldCost: number | null; newCost: number; change: string }>
  ratio: number      // POLLINATIONS_TOKEN_RATIO（1 pollen = N 积分）
  defaultMargin: number
  errorMessage?: string
  startedAt: Date
  endedAt?: Date
}

// 类型守卫：替代 `as any` 访问 union 类型的 pricing 字段
function isVideoPricing(p: PollinationsPricing): p is PollinationsVideoPricing {
  return p !== null && p !== undefined && typeof (p as PollinationsVideoPricing).completionVideoSeconds === 'string'
}
function isImagePricing(p: PollinationsPricing): p is PollinationsImageSimplePricing | PollinationsImageComplexPricing {
  return p !== null && p !== undefined && typeof (p as PollinationsImageSimplePricing).completionImageTokens === 'string'
}

/**
 * 从 Pollinations /v1/models 拉取所有模型官方定价
 * 覆盖 video（completionVideoSeconds）+ image（completionImageTokens）两类
 * text 模型暂不同步（不在 AIModel 表管理范围内）
 */
async function fetchPollinationsModels(timeoutMs = 30_000): Promise<PollinationsModelInfo[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(POLLINATIONS_API, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { data: PollinationsModelInfo[] }
    // 只保留 video + image 模型（text 模型不在 AIModel 表范围）
    return (data.data || []).filter((m) => {
      if (!m.pricing) return false
      return isVideoPricing(m.pricing) || isImagePricing(m.pricing)
    })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 根据 Pollinations API 返回的模型信息解析 costTokens
 * 统一入口，覆盖 video/image 两种模型类型
 * durationSec: video 模型的标准时长（秒），image 模型忽略
 */
function resolveCostFromPollinations(info: PollinationsModelInfo, durationSec: number): ResolvedCostTokens {
  return resolveCostTokensFromPollinations(info, durationSec, undefined)
}

/**
 * 核心同步函数
 */
export async function syncPollinationsPricing(trigger: 'cron' | 'manual' | 'catchup' = 'manual'): Promise<SyncResult> {
  // 防重叠
  if (isSyncing) {
    logger.warn('Pollinations 同步已在进行中，跳过本次调用', { trigger })
    return {
      status: 'failed',
      modelsChecked: 0,
      modelsUpdated: 0,
      modelsAdded: 0,
      modelsRemoved: 0,
      diff: [],
      ratio: RATIO_CONSTANT,
      defaultMargin: 0,
      errorMessage: 'sync_already_running',
      startedAt: new Date(),
    }
  }
  isSyncing = true

  const ratio = await getTokenRatio()  // 1 pollen = N 积分（动态汇率，从 SiteConfig 读）
  const defaultMargin = 0  // 全局默认毛利率 0%（无溢价）
  const startedAt = new Date()
  let logId: string | null = null
  const diff: SyncResult['diff'] = []

  // 创建同步日志
  try {
    const log = await prisma.pollinationsSyncLog.create({
      data: {
        trigger,
        status: 'failed',
        startedAt,
        pollenFxRate: ratio,  // 保留旧字段名（DB schema 兼容），值改为新的 ratio
        modelsChecked: 0,
        modelsUpdated: 0,
        modelsAdded: 0,
        modelsRemoved: 0,
      },
    })
    logId = log.id
  } catch (e) {
    logger.error('无法创建 PollinationsSyncLog（可能表不存在）', { error: e instanceof Error ? e.message : String(e) })
  }

  try {
    logger.info('开始 Pollinations 定价同步（margin 语义升级: 倍率 → 百分比）', {
      trigger, ratio, defaultMargin,
    })

    // 1. 拉取官方数据（覆盖 video + image 两类模型）
    const official = await fetchPollinationsModels()
    logger.info('Pollinations 官方返回模型', { count: official.length })

    // 2. 查询我们数据库里已有的 Pollinations 模型（video + image）
    //    历史兼容：seed.ts 里 pollinations + pollinations-video，旧 sync 可能建了大写 Pollinations
    const POLLINATIONS_PROVIDER_NAMES = ['pollinations', 'pollinations-video', 'Pollinations', 'Pollinations Video']
    const ourModels = await prisma.aIModel.findMany({
      where: { provider: { name: { in: POLLINATIONS_PROVIDER_NAMES } } },
      include: { provider: true },
    })

    // 3. 遍历官方模型，计算目标 costTokens 并更新
    let updated = 0
    let added = 0
    const knownOfficialIds = new Set<string>()

    for (const om of official) {
      // 3.1 video 模型走别名映射，image 模型直接用官方 ID
      const internalId = MODEL_ID_ALIASES[om.id] ?? om.id
      knownOfficialIds.add(internalId)

      // 3.2 计算默认时长（video 模型需要，image 模型 resolve 时会忽略）
      const defaultDurSec = DEFAULT_DURATION_SECONDS(internalId)

      // 3.3 统一入口: Pollinations pricing → costTokens
      const resolved = resolveCostFromPollinations(om, defaultDurSec)
      if (resolved.costTokens <= 0) {
        logger.debug('跳过 costTokens=0 的模型', { id: om.id, billingUnit: resolved.billingUnit })
        continue
      }

      // 3.4 margin 同步策略（2026-09 v2: margin 语义改为"百分比"）
      //     - margin = 毛利率百分比（0 = 无溢价，50 = 加价 50%）
      //     - costTokens = ceil(baseTokens × (1 + margin/100))
      //     - 默认 margin = 0（无溢价）
      //     - 保护逻辑：只有 margin > 0（管理员手动设了溢价）才保留，否则统一 0
      //     - 历史遗留值（如 10/5/2/1 等旧倍率值）视为"未初始化"，清零
      const our = ourModels.find((m) => m.name === internalId)

      // DB 里已有的 margin：如果 > 0 说明管理员设过溢价，保留；否则用默认 0
      const existingMarginPercent = (our && our.margin && our.margin > 0)
        ? our.margin   // 管理员溢价，保留
        : 0            // 无溢价（无论是初始值还是旧倍率遗留）

      // 用 DB 的 margin 算新 costTokens
      const newCost = resolveCostTokensFromPollinations(om, defaultDurSec, existingMarginPercent, ratio).costTokens

      // 目标 margin: 管理员设的保留，否则 0
      const newMargin = existingMarginPercent > 0 ? existingMarginPercent : defaultMargin

      const modelType = isVideoPricing(om.pricing) ? 'video' : 'image'

      if (!our) {
        // 新增模型
        try {
          // 按模型类型找到正确的 provider（video → pollinations-video, image → pollinations）
          const provider = await resolvePollinationsProvider(modelType)
          await prisma.aIModel.create({
            data: {
              name: internalId,
              displayName: om.title || internalId,
              type: modelType,
              providerId: provider.id,
              costTokens: newCost,
              margin: newMargin,
              status: 'active',
              desc: om.description || null,
            },
          })
          diff.push({
            modelId: internalId,
            label: om.title || internalId,
            oldCost: null,
            newCost,
            change: `+新增(${resolved.billingUnit === 'per-second' ? 'video' : 'image'})`,
          })
          added++
          logger.info('新增 Pollinations 模型', {
            modelId: internalId, costTokens: newCost, margin: newMargin,
            pollenConsumed: resolved.pollenConsumed, billingUnit: resolved.billingUnit,
          })
        } catch (e) {
          logger.error('新增模型失败', { modelId: internalId, error: e instanceof Error ? e.message : String(e) })
        }
      } else {
        // 已有模型：costTokens 或 margin 变了都要更新
        // 注意：迁移脚本会先把历史遗留的旧倍率 margin 清零，
        //      所以到 sync 这里，oldMargin 要么是管理员设的 > 0，要么是 0
        const oldCost = our.costTokens
        const oldMargin = our.margin
        const needsCostUpdate = our.costTokens !== newCost
        // margin 变了就更新（0→0 不变，管理员设了→保留不变，旧倍率残留→清零变）
        const needsMarginSync = Math.abs(oldMargin - newMargin) > 0.001
        const needsUpdate = needsCostUpdate || needsMarginSync

        if (needsUpdate) {
          const updateData: Record<string, unknown> = { costTokens: newCost }
          if (needsMarginSync) updateData.margin = newMargin
          await prisma.aIModel.update({ where: { id: our.id }, data: updateData })

          // 变化描述
          const parts: string[] = []
          if (needsCostUpdate) {
            parts.push(newCost > oldCost
              ? `cost ↑${Math.round((newCost - oldCost) / Math.max(1, oldCost) * 100)}%`
              : `cost ↓${Math.round((oldCost - newCost) / Math.max(1, oldCost) * 100)}%`)
          }
          if (needsMarginSync) {
            parts.push(`margin ${oldMargin ?? 'null'}→${newMargin}`)
          }

          diff.push({
            modelId: internalId,
            label: our.displayName,
            oldCost,
            newCost,
            change: parts.join(' | ') || '同步',
          })
          updated++
          logger.info('Pollinations 定价/毛利率变更', {
            modelId: internalId, oldCost, newCost, oldMargin, newMargin,
          })
        }
      }
    }

    // 4. 检测下架（我们数据库里有、但官方 catalog 里没了的 Pollinations 模型）
    // 修改：只记录告警，不再自动写 status='disabled'
    // 原因：sync 在 cron/catchup/重启 时都可能触发,会误伤人工治理脚本遗留的旧 ID 模型
    //       或运营手动新增的未在 MODEL_ID_ALIASES 映射表中的模型
    //       状态字段是 DB 持久态,缓存失效也恢复不了,只能人工逐个重新启用
    // 修复策略：仅 warn,把决策权交还给人(管理员可在管理后台手动禁用)
    let removed = 0
    for (const our of ourModels) {
      if (!knownOfficialIds.has(our.name)) {
        // Pollinations 官方 catalog 找不到了 → 仅记录告警，不动 status
        try {
          diff.push({
            modelId: our.name,
            label: our.displayName,
            oldCost: our.costTokens,
            newCost: our.costTokens,
            change: '↓未在官方目录(已跳过禁用,请人工确认)',
          })
          removed++
          logger.warn('Pollinations 模型未在官方目录,但已跳过自动禁用(保留当前 status)', {
            modelId: our.name,
            currentStatus: our.status,
            tip: '如需下架请在管理后台手动禁用',
          })
        } catch (e) {
          logger.error('记录下架告警失败', { modelId: our.name, error: e instanceof Error ? e.message : String(e) })
        }
      }
    }

    const status: SyncResult['status'] = updated + added + removed === 0 ? 'success' : diff.length > 0 ? 'partial' : 'success'
    const endedAt = new Date()

    // 更新日志
    if (logId) {
      await prisma.pollinationsSyncLog.update({
        where: { id: logId },
        data: {
          status,
          endedAt,
          modelsChecked: official.length,
          modelsUpdated: updated,
          modelsAdded: added,
          modelsRemoved: removed,
          diffJson: diff.length > 0 ? JSON.stringify(diff) : null,
        },
      })
    }

    const result: SyncResult = {
      status,
      modelsChecked: official.length,
      modelsUpdated: updated,
      modelsAdded: added,
      modelsRemoved: removed,
      diff,
      ratio,
      defaultMargin,
      startedAt,
      endedAt,
    }

    logger.info('Pollinations 定价同步完成', {
      trigger,
      status,
      checked: result.modelsChecked,
      updated,
      added,
      removed,
      diffCount: diff.length,
    })

    return result
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    logger.error('Pollinations 定价同步失败', { trigger, error: errMsg })

    if (logId) {
      await prisma.pollinationsSyncLog.update({
        where: { id: logId },
        data: { status: 'failed', endedAt: new Date(), errorMessage: errMsg },
      })
    }

    return {
      status: 'failed',
      modelsChecked: 0,
      modelsUpdated: 0,
      modelsAdded: 0,
      modelsRemoved: 0,
      diff: [],
      ratio: RATIO_CONSTANT,
      defaultMargin: 0,
      errorMessage: errMsg,
      startedAt,
      endedAt: new Date(),
    }
  } finally {
    isSyncing = false
  }
}

/**
 * 获取最近一次同步状态
 */
export async function getLastSyncStatus() {
  const last = await prisma.pollinationsSyncLog.findFirst({
    orderBy: { createdAt: 'desc' },
  })
  return last
}

/**
 * 获取同步历史（最近 20 条）
 */
export async function getSyncHistory(limit = 20) {
  return prisma.pollinationsSyncLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}

/**
 * 漏跑检测 — 启动时检查是否需要立即补跑
 */
export async function runMissedRunCheck(): Promise<void> {
  try {
    const last = await getLastSyncStatus()
    const now = Date.now()
    if (!last) {
      logger.info('Pollinations 从未同步过，立即执行首次同步')
      void syncPollinationsPricing('catchup')
      return
    }
    const lastTime = last.createdAt.getTime()
    if (now - lastTime > MISSED_RUN_THRESHOLD_MS) {
      const days = Math.round((now - lastTime) / (24 * 60 * 60 * 1000))
      logger.warn('Pollinations 同步漏跑检测触发', { daysSinceLastSync: days, lastSync: last.createdAt })
      void syncPollinationsPricing('catchup')
    } else {
      const days = Math.round((now - lastTime) / (24 * 60 * 60 * 1000))
      logger.info('Pollinations 同步状态正常', { daysSinceLastSync: days, lastSync: last.createdAt })
    }
  } catch (e) {
    logger.error('Pollinations 漏跑检测失败', { error: e instanceof Error ? e.message : String(e) })
  }
}

/**
 * 计算下次定时运行时间（每周一 03:00 Asia/Shanghai）
 */
export function getNextMonday3AM(): number {
  const now = new Date()
  const target = new Date(now)
  target.setHours(3, 0, 0, 0) // 凌晨 3 点
  const day = now.getDay() // 0=周日, 1=周一, ...
  const daysUntilMonday = day === 1 ? 0 : (8 - day) % 7
  target.setDate(now.getDate() + daysUntilMonday)
  // 如果今天周一但已过 3 点 → 下一个周一
  if (target.getTime() <= now.getTime()) {
    target.setDate(target.getDate() + 7)
  }
  return target.getTime()
}

// ───────────────────── 账户余额查询 ─────────────────────

// Pollinations 充值定价基准
// 官方定价：$1 ≈ 1 pollen（来源：pollinations.ai 官网、everydev.ai、tooljunction.io）
// 历史值：1.5 pollen/$（来自早期 beta 促销价 $10→15 pollen，已失效）
// 回滚：将下方常量改回 1.5 即可恢复旧换算
const DEFAULT_POLLEN_PER_USD = 1

// USD → CNY 汇率（默认 7.2 作为安全网回退值）
// 实际运行时优先从公开汇率 API 动态获取（见 fetchUsdToCny），失败时回退到此常量
// 也可通过 USD_TO_CNY_RATE 环境变量强制覆盖（适合离线/调试场景）
const DEFAULT_USD_TO_CNY = 7.2

// ===== 动态 USD→CNY 汇率获取（1 小时 TTL，单 flight 防止 stampede）=====
// 数据源：frankfurter.app（欧洲央行数据，免费、无需 API Key、无频率限制）
// 失败回退：DEFAULT_USD_TO_CNY 常量或环境变量 USD_TO_CNY_RATE
let usdToCnyCache: { value: number; fetchedAt: number; source: string } | null = null
const FX_CACHE_MS = 60 * 60 * 1000  // 1 小时
let inFlight: Promise<number> | null = null

export async function fetchUsdToCny(): Promise<{ value: number; source: string }> {
  const envOverride = Number(process.env.USD_TO_CNY_RATE)
  if (Number.isFinite(envOverride) && envOverride > 0) {
    return { value: envOverride, source: 'env' }
  }
  if (usdToCnyCache && Date.now() - usdToCnyCache.fetchedAt < FX_CACHE_MS) {
    return { value: usdToCnyCache.value, source: usdToCnyCache.source }
  }
  if (!inFlight) {
    inFlight = (async (): Promise<number> => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 8000)
      try {
        const res = await fetch('https://api.frankfurter.app/latest?from=USD&to=CNY', {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { rates?: { CNY?: number } }
        const cny = data?.rates?.CNY
        if (cny === undefined || !Number.isFinite(cny) || cny <= 0) throw new Error('invalid rate')
        usdToCnyCache = { value: cny, fetchedAt: Date.now(), source: 'frankfurter' }
        return cny
      } catch (e) {
        logger.warn('动态 USD→CNY 汇率获取失败，回退到默认常量', {
          error: e instanceof Error ? e.message : String(e),
          fallback: DEFAULT_USD_TO_CNY,
        })
        usdToCnyCache = { value: DEFAULT_USD_TO_CNY, fetchedAt: Date.now(), source: 'fallback' }
        return DEFAULT_USD_TO_CNY
      } finally {
        clearTimeout(timer)
        inFlight = null
      }
    })()
  }
  const value = await inFlight
  return { value, source: usdToCnyCache?.source ?? 'unknown' }
}

export interface PollinationsAccountInfo {
  balance: number | null
  packBalance: number | null        // PAID（付费购买，唯一不会自动恢复的余额）
  tierBalance: number | null        // QUEST（免费 Tier，按小时自动恢复）
  tier: string | null
  nextResetAt: string | null
  githubUsername: string | null
  ratio: number  // 1 pollen = N 积分（平台内部汇率，默认 10）
  balanceInTokens: number | null
  packBalanceInTokens: number | null
  tierBalanceInTokens: number | null
  apiKeyConfigured: boolean
  fetchedAt: string
  error?: string
  // 换算公式：帮助管理员理解美元充值 → 人民币积分的链路
  pollenPerUsd: number              // Pollinations 购买汇率（pollen/$）
  usdToCny: number                  // 当前美元兑人民币汇率
  usdToCnySource: string            // 汇率来源标识：'frankfurter'（实时）| 'env'（环境变量）| 'fallback'（常量回退）
  tokensPerCny: number              // ¥1 能兑换多少我们的积分
  packBalanceInUsd: number | null   // PAID 余额等值美元
  packBalanceInCny: number | null   // PAID 余额等值人民币
  // 规范化双向换算链路（用于运营总览展示）
  usdToPollen: number               // 1 USD = N pollen（等于 pollenPerUsd）
  usdToTokens: number               // 1 USD = N 积分（pollenPerUsd × fxRate）
  cnyToUsd: number                  // 1 CNY = N USD（1/usdToCny）
  cnyToPollen: number               // 1 CNY = N pollen（cnyToUsd × pollenPerUsd）
  cnyToTokens: number               // 1 CNY = N 积分（等于 tokensPerCny）
}

/**
 * 查询 Pollinations 账户余额（pollen）
 * 缓存 60 秒，避免高频调用外部 API
 */
let balanceCache: { data: PollinationsAccountInfo; fetchedAt: number } | null = null
const BALANCE_CACHE_MS = 60_000

export async function getPollinationsBalance(forceRefresh = false): Promise<PollinationsAccountInfo> {
  const ratio = await getTokenRatio()  // 动态汇率
  const apiKey = process.env.POLLINATIONS_API_KEY || ''
  const apiKeyConfigured = !!apiKey
  const now = Date.now()

  // 汇率配置（优先从公开 API 动态获取，失败时回退到常量；环境变量 USD_TO_CNY_RATE 强制覆盖）
  const pollenPerUsd = Number(process.env.POLLEN_PER_USD) || DEFAULT_POLLEN_PER_USD
  const { value: usdToCny, source: usdToCnySource } = await fetchUsdToCny()
  const tokensPerCny = Math.round((pollenPerUsd * ratio) / usdToCny) // ¥1 → 多少积分

  // 规范化双向换算链路（保留足够精度避免显示链断链）
  const usdToPollen = pollenPerUsd                                 // 1 USD = N pollen
  const usdToTokens = Math.round(pollenPerUsd * ratio)             // 1 USD = N 积分
  const cnyToUsd = 1 / usdToCny                                    // 1 CNY = N USD
  const cnyToPollen = Math.round((cnyToUsd * pollenPerUsd) * 10000) / 10000  // 1 CNY = N pollen（保留 4 位，避免 0.14 → 140 ≠ 139 的精度断链）
  const cnyToTokens = tokensPerCny                                 // 1 CNY = N 积分

  // 命中缓存且非强制刷新
  if (!forceRefresh && balanceCache && now - balanceCache.fetchedAt < BALANCE_CACHE_MS) {
    return balanceCache.data
  }

  // 未配置 API Key → 返回 placeholder
  if (!apiKeyConfigured) {
    const placeholder: PollinationsAccountInfo = {
      balance: null,
      packBalance: null,
      tierBalance: null,
      tier: null,
      nextResetAt: null,
      githubUsername: null,
      ratio,
      balanceInTokens: null,
      packBalanceInTokens: null,
      tierBalanceInTokens: null,
      apiKeyConfigured: false,
      fetchedAt: new Date().toISOString(),
      error: 'POLLINATIONS_API_KEY not configured',
      pollenPerUsd,
      usdToCny,
      usdToCnySource,
      tokensPerCny,
      packBalanceInUsd: null,
      packBalanceInCny: null,
      usdToPollen,
      usdToTokens,
      cnyToUsd,
      cnyToPollen,
      cnyToTokens,
    }
    balanceCache = { data: placeholder, fetchedAt: now }
    return placeholder
  }

  // 并行查询 balance 和 profile（profile 即使 balance 失败也能返回部分信息）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10_000)

  try {
    const headers = { Authorization: `Bearer ${apiKey}` }
    const [balanceRes, profileRes] = await Promise.all([
      fetch(POLLINATIONS_BALANCE_API, { headers, signal: controller.signal }).catch(() => null),
      fetch(POLLINATIONS_PROFILE_API, { headers, signal: controller.signal }).catch(() => null),
    ])

    // 解析 profile（即使 balance 失败也能拿到 tier/githubUsername）
    let tier: string | null = null
    let nextResetAt: string | null = null
    let githubUsername: string | null = null
    if (profileRes && profileRes.ok) {
      try {
        const profileData = (await profileRes.json()) as {
          tier?: string
          nextResetAt?: string | null
          githubUsername?: string | null
        }
        tier = profileData.tier ?? null
        nextResetAt = profileData.nextResetAt ?? null
        githubUsername = profileData.githubUsername ?? null
      } catch { /* profile 解析失败忽略 */ }
    }

    // 解析 balance — API 返回 { balance: total, accountBalance: { total, tier, paid } }
    let balance: number | null = null
    let packBalance: number | null = null
    let tierBalance: number | null = null
    let balanceError: string | undefined
    if (balanceRes) {
      if (balanceRes.ok) {
        try {
          const balanceData = (await balanceRes.json()) as {
            balance: number
            accountBalance?: { total: number; tier: number; paid: number }
          }
          balance = typeof balanceData.balance === 'number' ? balanceData.balance : null
          if (balanceData.accountBalance) {
            packBalance = typeof balanceData.accountBalance.paid === 'number' ? balanceData.accountBalance.paid : null
            tierBalance = typeof balanceData.accountBalance.tier === 'number' ? balanceData.accountBalance.tier : null
          }
        } catch { /* balance 解析失败 */ }
      } else {
        balanceError = balanceRes.status === 403
          ? 'HTTP 403 — API Key 缺少 account:balance 权限，请到 enter.pollinations.ai 后台为该 Secret Key 勾选 account 权限后重新生成'
          : `balance API HTTP ${balanceRes.status}`
      }
    } else {
      balanceError = 'balance API 请求失败（网络超时或被拒绝）'
    }

    const result: PollinationsAccountInfo = {
      balance,
      packBalance,
      tierBalance,
      tier,
      nextResetAt,
      githubUsername,
      ratio,
      balanceInTokens: balance !== null ? Math.round(balance * ratio) : null,
      packBalanceInTokens: packBalance !== null ? Math.round(packBalance * ratio) : null,
      tierBalanceInTokens: tierBalance !== null ? Math.round(tierBalance * ratio) : null,
      apiKeyConfigured: true,
      fetchedAt: new Date().toISOString(),
      error: balanceError,
      pollenPerUsd,
      usdToCny,
      usdToCnySource,
      tokensPerCny,
      packBalanceInUsd: packBalance !== null ? packBalance / pollenPerUsd : null,
      packBalanceInCny: packBalance !== null ? (packBalance / pollenPerUsd) * usdToCny : null,
      usdToPollen,
      usdToTokens,
      cnyToUsd,
      cnyToPollen,
      cnyToTokens,
    }

    balanceCache = { data: result, fetchedAt: now }
    if (balanceError) {
      logger.warn('Pollinations 账户余额查询部分失败', { error: balanceError, tier, githubUsername })
    } else {
      logger.info('Pollinations 账户余额查询成功', { balance, tier, balanceInTokens: result.balanceInTokens })
    }
    return result
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e)
    logger.error('Pollinations 账户余额查询失败', { error: errMsg })

    const failed: PollinationsAccountInfo = {
      balance: null,
      packBalance: null,
      tierBalance: null,
      tier: null,
      nextResetAt: null,
      githubUsername: null,
      ratio,
      balanceInTokens: null,
      packBalanceInTokens: null,
      tierBalanceInTokens: null,
      apiKeyConfigured: true,
      fetchedAt: new Date().toISOString(),
      error: errMsg,
      pollenPerUsd,
      usdToCny,
      usdToCnySource,
      tokensPerCny,
      packBalanceInUsd: null,
      packBalanceInCny: null,
      usdToPollen,
      usdToTokens,
      cnyToUsd,
      cnyToPollen,
      cnyToTokens,
    }
    // 失败也缓存 30 秒，避免高频重试
    balanceCache = { data: failed, fetchedAt: now - BALANCE_CACHE_MS / 2 }
    return failed
  } finally {
    clearTimeout(timer)
  }
}
