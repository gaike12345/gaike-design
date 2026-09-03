import { api } from './api'

export type EstimateKind =
  | 'image'
  | 'video'
  | 'video.i2v'
  | 'audio.tts'
  | 'audio.music'
  | 'comic.storyboard'
  | 'comic.generate'
  | 'comic.publish'

export interface EstimateParams {
  model?: string
  ratio?: string
  duration?: number
  img2video?: boolean
  voice?: string
  text?: string
  textLen?: number
  panels?: number
  count?: number
}

export interface EstimateCostResult {
  tokens: number
  kind: EstimateKind
}

/** 客户端 30 秒 TTL 缓存：避免每次选模型都重算 */
const TTL = 30_000
type CacheKey = string
const _cache = new Map<CacheKey, { value: number; ts: number }>()

function cacheKey(kind: EstimateKind, params: EstimateParams): CacheKey {
  const keys = Object.keys(params).sort()
  return JSON.stringify([kind, keys.map((k) => [k, params[k as keyof EstimateParams]])])
}

function getCached(key: CacheKey): number | undefined {
  const c = _cache.get(key)
  if (!c) return undefined
  if (Date.now() - c.ts > TTL) { _cache.delete(key); return undefined }
  return c.value
}
function setCached(key: CacheKey, v: number) { _cache.set(key, { value: v, ts: Date.now() }) }
export function clearEstimateCostCache() { _cache.clear() }

export async function estimateCost(
  kind: EstimateKind,
  params: EstimateParams,
  opts?: { force?: boolean },
): Promise<number> {
  const key = cacheKey(kind, params)
  if (!opts?.force) {
    const hit = getCached(key)
    if (hit !== undefined) return hit
  }
  try {
    const r = await api.post<EstimateCostResult>('/api/models/estimate-cost', { kind, params })
    const tokens = Number(r.tokens) || 0
    setCached(key, tokens)
    return tokens
  } catch (e) {
    // 出错不阻塞用户，返回 0（按钮不显示 cost 也不阻止点击）
    console.warn('[costEstimate] failed', kind, params, e)
    return 0
  }
}

/** 数字格式化：1234 → "1,234" */
export function formatTokensCompact(n: number): string {
  if (!Number.isFinite(n)) return '0'
  return Math.max(0, Math.round(n)).toLocaleString('zh-CN')
}
