/**
 * Pollinations 官方定价同步服务
 *
 * 每周自动从 https://gen.pollinations.ai/v1/models 拉取官方定价
 * 同步数据库 AIModel 的 costTokens
 *
 * 汇率: 1 pollen = 1000 积分（可通过 POLLINATIONS_FX_RATE 环境变量调整）
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

export const POLLINATIONS_API = 'https://gen.pollinations.ai/v1/models'
export const POLLINATIONS_BALANCE_API = 'https://gen.pollinations.ai/account/balance'
export const POLLINATIONS_PROFILE_API = 'https://gen.pollinations.ai/account/profile'
export const DEFAULT_FX_RATE = 1000 // 1 pollen = 1000 积分
export const DEFAULT_MARGIN = 2    // 2× 毛利倍率（最终售价 = 官方成本 × MARGIN）
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

let isSyncing = false

export interface SyncResult {
  status: 'success' | 'failed' | 'partial'
  modelsChecked: number
  modelsUpdated: number
  modelsAdded: number
  modelsRemoved: number
  diff: Array<{ modelId: string; label: string; oldCost: number | null; newCost: number; change: string }>
  fxRate: number
  margin: number
  errorMessage?: string
  startedAt: Date
  endedAt?: Date
}

/**
 * 从 Pollinations /v1/models 拉取所有 video 模型的官方定价
 */
async function fetchPollinationsVideoModels(timeoutMs = 30_000): Promise<PollinationsModel[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(POLLINATIONS_API, { signal: controller.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = (await res.json()) as { data: PollinationsModel[] }
    return (data.data || []).filter((m) => m.category === 'video' && m.pricing?.completionVideoSeconds)
  } finally {
    clearTimeout(timer)
  }
}

interface PollinationsModel {
  id: string
  category: string
  pricing?: {
    completionVideoSeconds?: string
  }
  aliases?: string[]
  title?: string
  description?: string
}

/**
 * 计算某个模型在标准时长下的 costTokens
 * costTokens = pollen/s × fxRate × defaultDurationSeconds × margin
 */
function calcCostTokens(pollenPerSec: number, fxRate: number, defaultDurationSec: number, margin: number): number {
  return Math.round(pollenPerSec * fxRate * defaultDurationSec * margin)
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
      fxRate: 0,
      margin: 0,
      errorMessage: 'sync_already_running',
      startedAt: new Date(),
    }
  }
  isSyncing = true

  const fxRate = Number(process.env.POLLINATIONS_FX_RATE) || DEFAULT_FX_RATE
  const margin = Number(process.env.POLLINATIONS_MARGIN) || DEFAULT_MARGIN
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
        pollenFxRate: fxRate,
        modelsChecked: 0,
        modelsUpdated: 0,
        modelsAdded: 0,
        modelsRemoved: 0,
      },
    })
    logId = log.id
  } catch (e) {
    logger.error('无法创建 PollinationsSyncLog（可能表不存在）', { error: e instanceof Error ? e.message : String(e) })
    // 即使日志创建失败，继续尝试同步
  }

  try {
    logger.info('开始 Pollinations 定价同步', { trigger, fxRate, margin })

    // 1. 拉取官方数据
    const official = await fetchPollinationsVideoModels()
    logger.info('Pollinations 官方返回 video 模型', { count: official.length })

    // 2. 查询我们数据库里已有的 video 模型
    const ourModels = await prisma.aIModel.findMany({
      where: { type: 'video' },
      include: { provider: true },
    })

    // 3. 遍历官方模型，计算目标 costTokens 并更新
    let updated = 0
    let added = 0
    const knownOfficialIds = new Set<string>()

    for (const om of official) {
      const internalId = MODEL_ID_ALIASES[om.id]
      if (!internalId) {
        // 不在我们的映射里，跳过（非 Pollinations 提供的模型、或我们暂未接入）
        continue
      }
      knownOfficialIds.add(internalId)

      const pollenPerSec = parseFloat(om.pricing!.completionVideoSeconds!)
      if (isNaN(pollenPerSec)) continue

      // 标准时长 = 我们给这个模型配的 defaultDuration
      // 简化: 默认取 5s，nova-reel 取 6s，seedance-2.5 取 4s
      const defaultDurSec = (() => {
        if (internalId === 'seedance-2.5') return 4
        if (internalId === 'nova-reel') return 6
        return 5
      })()

      const newCost = calcCostTokens(pollenPerSec, fxRate, defaultDurSec, margin)

      const our = ourModels.find((m) => m.name === internalId)
      if (!our) {
        // 新增模型 — 暂不自动创建数据库记录（需要管理员手动确认），仅记录 diff
        // 但可以考虑自动创建一条
        try {
          // 先找 Pollinations provider
          let provider = await prisma.aIProvider.findFirst({ where: { name: 'Pollinations' } })
          if (!provider) {
            provider = await prisma.aIProvider.create({
              data: { name: 'Pollinations', displayName: 'Pollinations', type: 'video', baseUrl: 'https://gen.pollinations.ai' },
            })
          }
          await prisma.aIModel.create({
            data: {
              name: internalId,
              displayName: om.title || internalId,
              type: 'video',
              providerId: provider.id,
              costTokens: newCost,
              status: 'active',
              desc: om.description || null,
            },
          })
          diff.push({
            modelId: internalId,
            label: om.title || internalId,
            oldCost: null,
            newCost,
            change: '+新增',
          })
          added++
          logger.info('新增 Pollinations video 模型到数据库', { modelId: internalId, costTokens: newCost })
        } catch (e) {
          logger.error('新增模型失败', { modelId: internalId, error: e instanceof Error ? e.message : String(e) })
        }
      } else if (our.costTokens !== newCost) {
        // 价格变了，更新
        const oldCost = our.costTokens
        await prisma.aIModel.update({
          where: { id: our.id },
          data: { costTokens: newCost },
        })
        diff.push({
          modelId: internalId,
          label: our.displayName,
          oldCost,
          newCost,
          change: newCost > oldCost ? `↑${((newCost - oldCost) / oldCost * 100).toFixed(0)}%` : `↓${((oldCost - newCost) / oldCost * 100).toFixed(0)}%`,
        })
        updated++
        logger.info('Pollinations 定价变更', { modelId: internalId, oldCost, newCost })
      }
    }

    // 4. 检测下架（我们数据库里有、但官方 catalog 里没了的模型）
    let removed = 0
    for (const our of ourModels) {
      if (!knownOfficialIds.has(our.name) && MODEL_ID_ALIASES[our.name] !== undefined) {
        // 这个模型在我们的映射表里但官方 catalog 找不到了
        // 软下架（标记 disabled）
        try {
          await prisma.aIModel.update({ where: { id: our.id }, data: { status: 'disabled' } })
          diff.push({
            modelId: our.name,
            label: our.displayName,
            oldCost: our.costTokens,
            newCost: our.costTokens,
            change: '↓下架',
          })
          removed++
          logger.warn('Pollinations 模型下架，已禁用', { modelId: our.name })
        } catch (e) {
          logger.error('禁用模型失败', { modelId: our.name, error: e instanceof Error ? e.message : String(e) })
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
      fxRate,
      margin,
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
      fxRate,
      margin,
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

// Pollinations 充值定价基准（取 $10-$20 档的平均汇率）
// $10 → 15 pollen, $20 → 30 pollen → 1.5 pollen/$
// 充值越多越划算（$100 → 200 pollen = 2.0/$），取中间档作为运营估算基准
const DEFAULT_POLLEN_PER_USD = 1.5

// USD → CNY 汇率（默认 7.2，可通过 USD_TO_CNY_RATE 环境变量覆盖）
const DEFAULT_USD_TO_CNY = 7.2

export interface PollinationsAccountInfo {
  balance: number | null
  packBalance: number | null        // PAID（付费购买，唯一不会自动恢复的余额）
  tierBalance: number | null        // QUEST（免费 Tier，按小时自动恢复）
  tier: string | null
  nextResetAt: string | null
  githubUsername: string | null
  fxRate: number
  balanceInTokens: number | null
  packBalanceInTokens: number | null
  tierBalanceInTokens: number | null
  apiKeyConfigured: boolean
  fetchedAt: string
  error?: string
  // 换算公式：帮助管理员理解美元充值 → 人民币积分的链路
  pollenPerUsd: number              // Pollinations 购买汇率（pollen/$）
  usdToCny: number                  // 当前美元兑人民币汇率
  tokensPerCny: number              // ¥1 能兑换多少我们的积分
  packBalanceInUsd: number | null   // PAID 余额等值美元
  packBalanceInCny: number | null   // PAID 余额等值人民币
}

/**
 * 查询 Pollinations 账户余额（pollen）
 * 缓存 60 秒，避免高频调用外部 API
 */
let balanceCache: { data: PollinationsAccountInfo; fetchedAt: number } | null = null
const BALANCE_CACHE_MS = 60_000

export async function getPollinationsBalance(forceRefresh = false): Promise<PollinationsAccountInfo> {
  const fxRate = Number(process.env.POLLINATIONS_FX_RATE) || DEFAULT_FX_RATE
  const apiKey = process.env.POLLINATIONS_API_KEY || ''
  const apiKeyConfigured = !!apiKey
  const now = Date.now()

  // 汇率配置（可通过环境变量覆盖）
  const pollenPerUsd = Number(process.env.POLLEN_PER_USD) || DEFAULT_POLLEN_PER_USD
  const usdToCny = Number(process.env.USD_TO_CNY_RATE) || DEFAULT_USD_TO_CNY
  const tokensPerCny = Math.round((pollenPerUsd * fxRate) / usdToCny) // ¥1 → 多少积分

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
      fxRate,
      balanceInTokens: null,
      packBalanceInTokens: null,
      tierBalanceInTokens: null,
      apiKeyConfigured: false,
      fetchedAt: new Date().toISOString(),
      error: 'POLLINATIONS_API_KEY not configured',
      pollenPerUsd,
      usdToCny,
      tokensPerCny,
      packBalanceInUsd: null,
      packBalanceInCny: null,
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
      fxRate,
      balanceInTokens: balance !== null ? Math.round(balance * fxRate) : null,
      packBalanceInTokens: packBalance !== null ? Math.round(packBalance * fxRate) : null,
      tierBalanceInTokens: tierBalance !== null ? Math.round(tierBalance * fxRate) : null,
      apiKeyConfigured: true,
      fetchedAt: new Date().toISOString(),
      error: balanceError,
      pollenPerUsd,
      usdToCny,
      tokensPerCny,
      packBalanceInUsd: packBalance !== null ? packBalance / pollenPerUsd : null,
      packBalanceInCny: packBalance !== null ? (packBalance / pollenPerUsd) * usdToCny : null,
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
      fxRate,
      balanceInTokens: null,
      packBalanceInTokens: null,
      tierBalanceInTokens: null,
      apiKeyConfigured: true,
      fetchedAt: new Date().toISOString(),
      error: errMsg,
      pollenPerUsd,
      usdToCny,
      tokensPerCny,
      packBalanceInUsd: null,
      packBalanceInCny: null,
    }
    // 失败也缓存 30 秒，避免高频重试
    balanceCache = { data: failed, fetchedAt: now - BALANCE_CACHE_MS / 2 }
    return failed
  } finally {
    clearTimeout(timer)
  }
}
