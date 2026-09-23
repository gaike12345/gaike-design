// =====================================================================
// Token Billing —— 统一积分制度 & Pollinations 汇率换算
// =====================================================================
//
// 制度设计（2026-09 重新梳理，两个概念彻底分离）:
//
//   【汇率（常量，不可变）】POLLINATIONS_TOKEN_RATIO = 10
//     Pollinations 官方 pollen → 内部成本积分
//     baseTokens = ceil(pollenConsumed × 10)
//     含义：1 pollen = 10 积分（成本价）
//
//   【毛利率（百分比，可配置）】AIModel.margin，默认 0
//     用户支付价 = baseTokens × (1 + margin/100)
//     costTokens = ceil(baseTokens × (1 + margin/100))
//     例子：baseTokens=10, margin=0 → 10 积分；margin=50 → 15 积分
//
//  AIModel 字段语义:
//     costTokens: 用户支付价（售价，含毛利）
//     margin:     毛利率百分比（0 = 无溢价）
//
//  Pollinations 模型类型 × pricing 字段 × baseTokens 公式:
//     video:  ceil(completionVideoSeconds × durationSec × 10)
//     image:  ceil(completionImageTokens × 10)
//     text:   ceil((prompt+completion token pollen) × 10)
//
//  Sync 流程:
//     Pollinations API → 算 baseTokens → 读 DB 现有 margin → 算 costTokens
//     管理员改 margin → pollinationsSync 重算 → costTokens 自动更新
// =====================================================================

/**
 * Pollinations pollen → 内部成本积分 换算比例（全局常量）
 *
 * 1 pollen（Pollinations 官方计费单位）= N 积分（成本价）
 * 默认 10，可通过环境变量 POLLINATIONS_TOKEN_RATIO 覆盖。
 * 这个值是"成本汇率"，不是毛利率。
 */
export const POLLINATIONS_TOKEN_RATIO = (() => {
  const val = Number(process.env.POLLINATIONS_TOKEN_RATIO)
  return val > 0 ? val : 10
})()

/**
 * 全局默认毛利率（百分比），= 0 表示无溢价
 * Pollinations 模型默认用这个值，非 Pollinations 模型此字段仅作参考
 */
export const DEFAULT_MARGIN_PERCENT = 0

// ---------------------------------------------------------------------
// Pollinations pricing 字段解析（多态）
// ---------------------------------------------------------------------

export interface PollinationsVideoPricing {
  currency: 'pollen'
  completionVideoSeconds: string // pollen per second
}

export interface PollinationsImageSimplePricing {
  currency: 'pollen'
  completionImageTokens: string // pollen per image
}

export interface PollinationsImageComplexPricing {
  currency: 'pollen'
  promptTextTokens?: string
  promptCachedTokens?: string
  promptImageTokens?: string
  completionImageTokens?: string
}

export interface PollinationsTextPricing {
  currency: 'pollen'
  promptTextTokens?: string
  promptCachedTokens?: string
  completionTextTokens?: string
}

export type PollinationsPricing =
  | PollinationsVideoPricing
  | PollinationsImageSimplePricing
  | PollinationsImageComplexPricing
  | PollinationsTextPricing
  | null
  | undefined

export interface PollinationsModelInfo {
  id: string
  title?: string
  description?: string
  category?: 'text' | 'image' | 'video' | string
  pricing?: PollinationsPricing
  supported_endpoints?: string[]
}

// ---------------------------------------------------------------------
// 解析 & 数学工具
// ---------------------------------------------------------------------

function safeParseNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v))
  return isNaN(n) ? null : n
}

/** ceil 向上取整；值太小（<1）时至少收 1 积分 */
function safeCeil(n: number): number {
  if (!isFinite(n)) return 0
  const c = Math.ceil(n)
  return c < 0 ? 0 : c
}

/**
 * 应用毛利率
 * @param baseTokens 成本积分
 * @param marginPercent 毛利率百分比（如 0 / 50 / 100）
 * @returns ceil(baseTokens × (1 + marginPercent/100))
 */
export function applyMargin(baseTokens: number, marginPercent: number): number {
  if (baseTokens <= 0) return 0
  if (!marginPercent || marginPercent <= 0) return baseTokens
  return safeCeil(baseTokens * (1 + marginPercent / 100))
}

/**
 * 反向: 从售价反推成本
 * @param costTokens 用户支付价（含毛利）
 * @param marginPercent 毛利率
 * @returns costTokens / (1 + margin/100)，四舍五入
 */
export function reverseMargin(costTokens: number, marginPercent: number): number {
  if (costTokens <= 0) return 0
  if (!marginPercent || marginPercent <= 0) return costTokens
  return Math.max(1, Math.round(costTokens / (1 + marginPercent / 100)))
}

// ---------------------------------------------------------------------
// 核心: Pollinations pricing → baseTokens（成本积分）
// ---------------------------------------------------------------------
// 注：这些函数只算"成本"，不含毛利率。
//     最终售价 = applyMargin(baseTokens, AIModel.margin)

export interface VideoCostInput {
  modelInternalId?: string
  /** Pollinations 官方 pricing.completionVideoSeconds（pollen per second） */
  pollenPerSecond: number
  /** 该模型的标准生成时长（秒） */
  defaultDurationSeconds: number
  /** 覆盖全局汇率（管理后台单独调汇率时用，极少见） */
  ratioOverride?: number
}

/**
 * Video 模型 baseTokens（成本积分）
 *   pollenTotal = pollenPerSecond × defaultDurationSeconds
 *   baseTokens  = ceil(pollenTotal × POLLINATIONS_TOKEN_RATIO)
 */
export function calcVideoBaseTokens(input: VideoCostInput): number {
  if (input.pollenPerSecond <= 0 || input.defaultDurationSeconds <= 0) return 0
  const ratio = input.ratioOverride ?? POLLINATIONS_TOKEN_RATIO
  const pollenTotal = input.pollenPerSecond * input.defaultDurationSeconds
  return safeCeil(pollenTotal * ratio)
}

export interface ImageCostInput {
  completionImageTokens: number
  promptTextTokens?: number
  promptImageTokens?: number
  ratioOverride?: number
}

/**
 * Image 模型 baseTokens（每张图成本积分）
 * 注: prompt pollen 忽略（平台不知道用户 prompt 的精确长度）
 */
export function calcImageBaseTokens(input: ImageCostInput): number {
  const ratio = input.ratioOverride ?? POLLINATIONS_TOKEN_RATIO
  const pollenPerImage = input.completionImageTokens
  if (pollenPerImage <= 0) return 0
  return safeCeil(pollenPerImage * ratio)
}

export interface TextCostInput {
  promptTextTokens: number
  completionTextTokens: number
  ratioOverride?: number
}

export function calcTextBaseTokens(input: TextCostInput): number {
  if (input.promptTextTokens <= 0 && input.completionTextTokens <= 0) return 0
  const ratio = input.ratioOverride ?? POLLINATIONS_TOKEN_RATIO
  const pollenTotal = input.promptTextTokens + input.completionTextTokens
  return safeCeil(pollenTotal * ratio)
}

// ---------------------------------------------------------------------
// 全管道: Pollinations API → baseTokens + costTokens（含毛利）
// ---------------------------------------------------------------------

export interface ResolvedCostTokens {
  /** 内部成本积分（= ceil(pollen × 10)） */
  baseTokens: number
  /** 用户支付价（售价，含毛利）= applyMargin(baseTokens, marginPercent) */
  costTokens: number
  /** Pollinations 官方 pollen 消耗（原始值，用于日志/对账） */
  pollenConsumed: number
  /** 计费粒度 */
  billingUnit: 'per-second' | 'per-image' | 'per-call' | 'unknown'
}

/**
 * 完整管道: PollinationsModelInfo → ResolvedCostTokens
 *
 * @param info Pollinations API 返回的单条模型
 * @param defaultDuration 视频模型的标准时长（秒）。非视频模型忽略。
 * @param marginPercent 毛利率百分比。默认 0（无溢价）。
 * @returns baseTokens + costTokens(含毛利) + pollen + 计费粒度
 */
export function resolveCostTokensFromPollinations(
  info: PollinationsModelInfo,
  defaultDuration: number,
  marginPercent: number = 0,
  ratioOverride?: number,
): ResolvedCostTokens {
  const pricing = info.pricing
  if (!pricing) {
    return { baseTokens: 0, costTokens: 0, pollenConsumed: 0, billingUnit: 'unknown' }
  }

  // 1) video
  const videoRate = safeParseNum((pricing as PollinationsVideoPricing).completionVideoSeconds)
  if (videoRate !== null && videoRate > 0) {
    const pollen = videoRate * defaultDuration
    const base = calcVideoBaseTokens({
      pollenPerSecond: videoRate,
      defaultDurationSeconds: defaultDuration,
      ratioOverride,
    })
    return {
      baseTokens: base,
      costTokens: applyMargin(base, marginPercent),
      pollenConsumed: pollen,
      billingUnit: 'per-second',
    }
  }

  // 2) image
  const completionImgTokens = safeParseNum(
    (pricing as PollinationsImageSimplePricing | PollinationsImageComplexPricing).completionImageTokens,
  )
  if (completionImgTokens !== null && completionImgTokens > 0) {
    const promptImgTokens = safeParseNum(
      (pricing as PollinationsImageComplexPricing).promptImageTokens,
    ) ?? 0
    const promptTxtTokens = safeParseNum(
      (pricing as PollinationsImageComplexPricing).promptTextTokens,
    ) ?? 0
    const pollen = completionImgTokens + promptImgTokens + promptTxtTokens
    const base = calcImageBaseTokens({ completionImageTokens: completionImgTokens, ratioOverride })
    return {
      baseTokens: base,
      costTokens: applyMargin(base, marginPercent),
      pollenConsumed: pollen,
      billingUnit: 'per-image',
    }
  }

  // 3) text（估计）
  const promptTxtRate = safeParseNum((pricing as PollinationsTextPricing).promptTextTokens)
  const completionTxtRate = safeParseNum((pricing as PollinationsTextPricing).completionTextTokens)
  if ((promptTxtRate !== null && promptTxtRate > 0) || (completionTxtRate !== null && completionTxtRate > 0)) {
    const estPrompt = (promptTxtRate ?? 0) * 1000
    const estCompletion = (completionTxtRate ?? 0) * 500
    const pollen = estPrompt + estCompletion
    const base = safeCeil(pollen * (ratioOverride ?? POLLINATIONS_TOKEN_RATIO))
    return {
      baseTokens: base,
      costTokens: applyMargin(base, marginPercent),
      pollenConsumed: pollen,
      billingUnit: 'per-call',
    }
  }

  return { baseTokens: 0, costTokens: 0, pollenConsumed: 0, billingUnit: 'unknown' }
}

// ---------------------------------------------------------------------
// 反向工具: 售价/成本/pollen 互推
// ---------------------------------------------------------------------

/**
 * 给定 baseTokens（成本积分）反推 Pollinations 官方 pollen 消耗
 * pollen = baseTokens / POLLINATIONS_TOKEN_RATIO
 */
export function pollenFromBaseTokens(baseTokens: number, ratioOverride?: number): number {
  const ratio = ratioOverride ?? POLLINATIONS_TOKEN_RATIO
  if (ratio <= 0) return 0
  return baseTokens / ratio
}

/**
 * 给定 costTokens（用户支付价）+ margin 反推 pollen
 * pollen = reverseMargin(costTokens, margin) / POLLINATIONS_TOKEN_RATIO
 */
export function pollenFromCostTokens(
  costTokens: number,
  marginPercent: number = 0,
  ratioOverride?: number,
): number {
  const base = reverseMargin(costTokens, marginPercent)
  return pollenFromBaseTokens(base, ratioOverride)
}
