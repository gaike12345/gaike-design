/**
 * Pollinations 视频模型参数同步器
 *
 *  从 https://gen.pollinations.ai/video/models 拉取所有视频模型的真实参数能力
 *  （resolutions / durations / video_capabilities 等），构建符合 VideoModelConfig.config
 *  schema 的 JSON，写入 DB AIModel 表对应模型的 config 字段。
 *
 *  同步原则：
 *  - 仅更新 config 字段；不动 costTokens / displayName / desc / tag（保护管理员手动设置）
 *  - 严格按 Pollinations API 返回字段填充；community 模型无字段则 config 为空对象（前端隐藏对应参数项）
 *  - 反向匹配：用 MODEL_NAME_MAP 把 Pollinations 新名（如 prunaai/p-video）映射回本地旧名（p-video）
 *
 *  对应前端：web/src/config/videoModels.ts
 *  对应前端隐藏逻辑：web/src/components/canvas/UnifiedNodes.tsx
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { clearVideoModelCache } from './videoModels'

const log = logger.child('syncPollinationsVideo')

const POLLINATIONS_VIDEO_MODELS_URL = 'https://gen.pollinations.ai/video/models'

/**
 * Pollinations API 返回的视频模型原始结构（仅取我们关心的字段）
 */
interface PollinationsVideoModel {
  name: string                                  // canonical id, e.g. "prunaai/p-video"
  aliases: string[]                             // e.g. ["p-video", "pruna-video"]
  resolutions?: string[]                        // e.g. ["720p", "1080p"] — 无字段表示模型不支持 resolution 参数
  min_duration?: number
  max_duration?: number
  default_duration?: number
  allowed_durations?: number[]                  // 离散枚举（如 [5,10,15]）
  duration_step?: number                        // 步长（如 nova-reel 的 6 秒步长）
  video_capabilities?: string[]                 // start_frame / end_frame / audio_output / reference_images / reference_videos / reference_audios
  pricing_default_label?: string                // 默认分辨率标签（如 "720p"）
  pricing?: {
    completionVideoSeconds?: string             // pollen/秒
  }
}

/**
 * 同步结果
 */
export interface SyncVideoResult {
  synced: number                                // 成功更新 config 字段的模型数
  skipped: number                               // DB 模型未在 Pollinations 找到匹配的模型数
  notFound: string[]                            // 未匹配的 DB 模型名列表
  errors: Array<{ name: string; error: string }>// 同步失败的模型及错误信息
}

/**
 * 本地名 → Pollinations 名 映射表
 *
 * 来源：server/src/mank-core/video/providers/pollinations.ts 中的 MODEL_NAME_MAP（正向映射）
 * 这里覆盖更广的别名集合，确保 DB 中各种命名形式都能匹配到 Pollinations 模型
 */
function buildForwardMap(): Map<string, string> {
  const forwardMap: Record<string, string> = {
    'wan-fast': 'alibaba/wan-2.2-fast',
    'wan-2.2-fast': 'alibaba/wan-2.2-fast',
    'wan-pro': 'alibaba/wan-2.7',
    'wan-2.7': 'alibaba/wan-2.7',
    'wan-3.0': 'alibaba/wan-3.0',
    'wan': 'alibaba/wan-2.6',
    'wan-2.6': 'alibaba/wan-2.6',
    'happyhorse': 'alibaba/happyhorse-1.1',
    'happyhorse-1.1': 'alibaba/happyhorse-1.1',
    'seedance': 'bytedance/seedance-2.0',
    'seedance-pro': 'bytedance/seedance-1-pro-fast',
    'seedance-1-pro-fast': 'bytedance/seedance-1-pro-fast',
    'seedance-2.0': 'bytedance/seedance-2.0',
    'seedance-2.5': 'bytedance/seedance-2.5',
    'seedance-2.0-fast': 'bytedance/seedance-2.0-fast',
    'seedance-2.0-mini': 'bytedance/seedance-2.0-mini',
    'p-video': 'prunaai/p-video',
    'pruna-video': 'prunaai/p-video',
    'veo': 'google/veo-3.1-fast',
    'veo-3.1-fast': 'google/veo-3.1-fast',
    'gemini-omni': 'google/gemini-omni-1.1-flash',
    'gemini-omni-1.1-flash': 'google/gemini-omni-1.1-flash',
    'minimax-h3': 'minimax/minimax-h3',
    'minimax-h3-turbo': 'minimax/minimax-h3-max-turbo',
    'grok-video-pro': 'x-ai/grok-imagine-video',
    'grok-video': 'x-ai/grok-imagine-video',
    'grok-imagine-video': 'x-ai/grok-imagine-video',
    'grok-video-1.5': 'x-ai/grok-imagine-video-1.5',
    'grok-imagine-video-1.5': 'x-ai/grok-imagine-video-1.5',
    'nova-reel': 'amazon/nova-reel-v1',
    'nova-reel-v1': 'amazon/nova-reel-v1',
  }
  return new Map(Object.entries(forwardMap))
}

/**
 * 构建 durations 数组
 *
 * 优先级：
 * 1. allowed_durations（离散枚举，如 [4,6,8]）— 直接转为 4s/6s/8s
 * 2. min_duration + max_duration（范围）— 按 step 生成离散选项
 *    - duration_step 存在 → 用 step（如 nova-reel step=6）
 *    - 否则 step=1（默认每秒可选，但前端 UI 上太多选项可能拥挤，限制最多 6 个选项）
 * 3. 都没有 → 返回空数组（前端会隐藏时长参数项）
 */
function buildDurations(model: PollinationsVideoModel): Array<{ id: string; label: string; value: number }> {
  const durations: number[] = []

  if (model.allowed_durations && model.allowed_durations.length > 0) {
    durations.push(...model.allowed_durations)
  } else if (typeof model.min_duration === 'number' && typeof model.max_duration === 'number') {
    const step = typeof model.duration_step === 'number' && model.duration_step > 0 ? model.duration_step : 1
    for (let d = model.min_duration; d <= model.max_duration; d += step) {
      durations.push(d)
      // 限制最多 8 个选项（避免范围太大导致 UI 拥挤）
      if (durations.length >= 8) break
    }
  }

  return Array.from(new Set(durations)).sort((a, b) => a - b).map(d => ({
    id: `${d}s`,
    label: `${d}秒`,
    value: d,
  }))
}

/**
 * 为单个 Pollinations 模型构建 config JSON
 *
 * 严格按 Pollinations API 返回字段填充；空字段则空数组/默认值（前端会按 config 真实能力隐藏对应参数项）
 */
function buildConfig(model: PollinationsVideoModel): Record<string, unknown> {
  const capabilities = model.video_capabilities || []
  const resolutions = (model.resolutions || []).map(r => ({
    id: r,
    label: r,
    multiplier: 1,
  }))
  const durations = buildDurations(model)
  const defaultDuration = model.default_duration || 5
  const defaultResolution = model.pricing_default_label || model.resolutions?.[0] || '720p'
  const completionVideoSeconds = parseFloat(model.pricing?.completionVideoSeconds || '0')
  const baseCostPerSecond = Math.round(completionVideoSeconds * 1000) // pollen/秒 → tokens/秒（1 pollen = 1000 tokens）

  return {
    durations,
    defaultDuration: `${defaultDuration}s`,
    resolutions,
    defaultResolution,
    ratios: ['16:9', '9:16'],   // Pollinations API 不返回 ratios；保留默认（provider URL 支持 aspectRatio 参数）
    defaultRatio: '16:9',
    supportsImg2Video: capabilities.includes('start_frame'),
    supportsAudio: capabilities.includes('audio_output'),
    supportsEndFrame: capabilities.includes('end_frame'),
    supportsReferenceImages: capabilities.includes('reference_images'),
    supportsReferenceVideos: capabilities.includes('reference_videos'),
    supportsReferenceAudios: capabilities.includes('reference_audios'),
    baseCostPerSecond,
    // 原始字段保留（调试用，且方便未来按需扩展）
    _pollinations: {
      name: model.name,
      minDuration: model.min_duration ?? null,
      maxDuration: model.max_duration ?? null,
      allowedDurations: model.allowed_durations ?? null,
      durationStep: model.duration_step ?? null,
      pricingDefaultLabel: model.pricing_default_label ?? null,
      completionVideoSeconds: completionVideoSeconds || null,
    },
  }
}

/**
 * 主同步函数
 *
 * 流程：
 * 1. 拉取 Pollinations /video/models 列表
 * 2. 构建 Pollinations name/aliases → 本地名 反向映射表
 * 3. 查询 DB 所有视频模型
 * 4. 对每个 DB 模型，按 name 匹配 Pollinations 模型（先 name 精确匹配，再 alias 匹配）
 * 5. 构建 config JSON，写入 DB
 * 6. 清缓存
 */
export async function syncVideoModelsFromPollinations(): Promise<SyncVideoResult> {
  const result: SyncVideoResult = { synced: 0, skipped: 0, notFound: [], errors: [] }

  // 1. 拉取 Pollinations 元数据
  let polModels: PollinationsVideoModel[]
  try {
    const resp = await fetch(POLLINATIONS_VIDEO_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) {
      throw new Error(`Pollinations /video/models 返回 ${resp.status}`)
    }
    polModels = await resp.json() as PollinationsVideoModel[]
    log.info(`从 Pollinations 拉取 ${polModels.length} 个视频模型`)
  } catch (e: any) {
    log.error(`拉取 Pollinations 视频模型失败: ${e.message}`)
    throw new Error(`拉取 Pollinations 视频模型失败: ${e.message}`)
  }

  // 2. 构建正向映射表（本地 DB name → Pollinations name）
  const forwardMap = buildForwardMap()

  // 3. 查询 DB 所有视频模型
  const dbModels = await prisma.aIModel.findMany({
    where: { type: 'video' },
    select: { id: true, name: true, config: true },
  })
  log.info(`DB 中视频模型 ${dbModels.length} 个`)

  // 4. 逐个 DB 模型匹配 Pollinations 模型并写入 config
  for (const dbModel of dbModels) {
    try {
      // 匹配优先级：
      //   1) forwardMap[dbModel.name] → Pollinations name 精确匹配
      //   2) DB name 直接匹配 Pollinations name（如 DB name 就是 "minimax/minimax-h3-max-turbo"）
      //   3) DB name 匹配 Pollinations aliases
      let polModel: PollinationsVideoModel | undefined
      const expectedPolName = forwardMap.get(dbModel.name)

      if (expectedPolName) {
        polModel = polModels.find(m => m.name === expectedPolName)
      }
      if (!polModel) {
        polModel = polModels.find(m => m.name === dbModel.name)
      }
      if (!polModel) {
        polModel = polModels.find(m => Array.isArray(m.aliases) && m.aliases.includes(dbModel.name))
      }

      if (!polModel) {
        result.skipped++
        result.notFound.push(dbModel.name)
        log.warn(`DB 模型 "${dbModel.name}" 未在 Pollinations 找到匹配，跳过`)
        continue
      }

      // 5. 构建 config 并写入 DB
      const config = buildConfig(polModel)
      await prisma.aIModel.update({
        where: { id: dbModel.id },
        data: { config: JSON.stringify(config) },
      })
      result.synced++
      log.info(`已同步 DB 模型 "${dbModel.name}" ← Pollinations "${polModel.name}"`)
    } catch (e: any) {
      result.errors.push({ name: dbModel.name, error: e.message })
      log.error(`同步 DB 模型 "${dbModel.name}" 失败: ${e.message}`)
    }
  }

  // 6. 清缓存
  clearVideoModelCache()
  log.info(`同步完成：成功 ${result.synced}，跳过 ${result.skipped}，失败 ${result.errors.length}`)

  return result
}
