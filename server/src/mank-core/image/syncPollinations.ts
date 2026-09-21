/**
 * Pollinations 图片模型参数同步器
 *
 *  从 https://gen.pollinations.ai/models 拉取所有图片模型（category=image）的真实参数能力
 *  （input_modalities / max_reference_images / resolutions / flat_rate / pricing 等），
 *  构建符合 ImageModelConfig.config schema 的 JSON，写入 DB AIModel 表对应模型的 config 字段。
 *
 *  同步原则：
 *  - 仅更新 config 字段；不动 costTokens / displayName / desc / tag（保护管理员手动设置）
 *  - 严格按 Pollinations API 返回字段填充；community 模型无字段则 config 为空对象（前端隐藏对应参数项）
 *  - 反向匹配：用 forwardMap 把本地 DB 名映射到 Pollinations 全名
 *
 *  对应前端：web/src/config/imageModels.ts
 *  对应前端隐藏逻辑：web/src/components/canvas/UnifiedNodes.tsx ImageSettingsPanel
 *  对应 provider 别名表：server/src/mank-core/image/providers/pollinations.ts MODEL_NAME_ALIASES
 */

import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { invalidateImageModelCache } from './imageModels'

const log = logger.child('syncPollinationsImage')

const POLLINATIONS_MODELS_URL = 'https://gen.pollinations.ai/models'

/**
 * Pollinations API 返回的图片模型原始结构（仅取我们关心的字段）
 */
interface PollinationsImageModel {
  name: string                                   // canonical id, e.g. "black-forest-labs/flux.2-max"
  aliases: string[]                              // e.g. ["flux", "flux-schnell"]
  category: string                               // "image"
  publisher: string                              // e.g. "Black Forest Labs"
  community: boolean
  pricing: {
    currency: string                             // "pollen"
    completionImageTokens?: string               // pollen/张（flat_rate 模型）
    promptImageTokens?: string                   // pollen/张（参考图输入）
    promptTextTokens?: string                    // pollen/token（非 flat_rate 模型）
  }
  pricing_default_label?: string                 // 默认分辨率标签
  input_modalities: string[]                     // ["text"] 或 ["text", "image"]
  output_modalities: string[]                    // ["image"]
  supported_endpoints: string[]                  // ["/image/{prompt}", "/v1/images/generations", ...]
  max_reference_images?: number                  // 最大参考图数量
  resolutions?: string[]                         // 支持的分辨率预设（如 ["1k","2k"]），大多数模型无此字段
  capabilities: string[]                         // 能力标签（图片模型通常为空）
  flat_rate?: boolean                            // 是否按张计费（true=按张，false=按 token）
  paid_only?: boolean                            // 是否仅付费可用
  alpha?: boolean                                // 是否 alpha 阶段
  title?: string                                 // 显示名
  description?: string                           // 描述
}

/**
 * 同步结果
 */
export interface SyncImageResult {
  synced: number                                 // 成功更新 config 字段的模型数
  skipped: number                                // DB 模型未在 Pollinations 找到匹配的模型数
  notFound: string[]                             // 未匹配的 DB 模型名列表
  errors: Array<{ name: string; error: string }> // 同步失败的模型及错误信息
}

/**
 * 本地名 → Pollinations 名 正向映射表
 *
 * 来源：server/src/mank-core/image/providers/pollinations.ts 中的 MODEL_NAME_ALIASES（反向映射）
 * 这里覆盖更广的别名集合，确保 DB 中各种命名形式都能匹配到 Pollinations 模型
 *
 * 注意：DB 中大部分图片模型已经是 publisher/model 全名格式（如 "black-forest-labs/flux.1-schnell"），
 * 这些不需要映射，直接匹配。本表仅处理短名/别名形式。
 */
function buildForwardMap(): Map<string, string> {
  const forwardMap: Record<string, string> = {
    // 前端产品名
    'lib-image': 'black-forest-labs/flux.1-schnell',
    'general-pro': 'black-forest-labs/flux.1-schnell',
    'general-v2': 'black-forest-labs/flux.1-schnell',
    'style-v82': 'black-forest-labs/flux.1-schnell',
    'style-v81': 'black-forest-labs/flux.1-schnell',
    'seedream-5p': 'bytedance/seedream-5.0-pro',
    'qwen-3': 'qwen/qwen-image-3',

    // sdxl 系列
    'sdxl': 'community/CloudCompile/sdxl-lightning',
    'sdxl-lightning': 'community/CloudCompile/sdxl-lightning',
    'sdxl-turbo': 'community/CloudCompile/sdxl-lightning',
    'sdxl-base': 'community/CloudCompile/sdxl-lightning',

    // Flux 家族
    'flux': 'black-forest-labs/flux.1-schnell',
    'flux-schnell': 'black-forest-labs/flux.1-schnell',
    'flux.1-schnell': 'black-forest-labs/flux.1-schnell',
    'flux-1-schnell': 'black-forest-labs/flux.1-schnell',
    'flux-2-flex': 'black-forest-labs/flux.2-flex',
    'flux.2-flex': 'black-forest-labs/flux.2-flex',
    'flux-2-pro': 'black-forest-labs/flux.2-pro',
    'flux-klein': 'black-forest-labs/flux.2-klein-4b',
    'flux-2-klein-4b': 'black-forest-labs/flux.2-klein-4b',

    // Bytedance Seedream 家族
    'seedream': 'bytedance/seedream-4.0',
    'seedream-pro': 'bytedance/seedream-4.5',
    'seedream-5-pro': 'bytedance/seedream-5.0-pro',
    'seedream-5.0-pro': 'bytedance/seedream-5.0-pro',
    'seedream5': 'bytedance/seedream-5.0-lite',
    'seedream-5-lite': 'bytedance/seedream-5.0-lite',

    // Qwen 家族
    'qwen-image': 'qwen/qwen-image',
    'qwen-image-3': 'qwen/qwen-image-3',

    // Ideogram 家族
    'ideogram-v4-quality': 'ideogram-ai/ideogram-v4-quality',
    'ideogram-v4-turbo': 'ideogram-ai/ideogram-v4-turbo',
    'ideogram-v4-balanced': 'ideogram-ai/ideogram-v4-balanced',

    // Gemini Nano Banana 家族
    'nanobanana': 'google/gemini-2.5-flash-image',
    'nanobanana-pro': 'google/gemini-3-pro-image',
    'nanobanana-2': 'google/gemini-3.1-flash-image',
    'nanobanana2': 'google/gemini-3.1-flash-image',
    'nanobanana-lite': 'google/gemini-3.1-flash-lite-image',

    // OpenAI GPT Image 家族
    'gpt-image': 'openai/gpt-image-1-mini',
    'gpt-image-1-mini': 'openai/gpt-image-1-mini',
    'gpt-image-1.5': 'openai/gpt-image-1.5',
    'gpt-image-2': 'openai/gpt-image-2',

    // Grok Imagine 家族
    'grok-imagine': 'x-ai/grok-imagine-image',
    'grok-imagine-pro': 'x-ai/grok-imagine-image-quality',
    'grok-aurora': 'x-ai/grok-imagine-image-quality',

    // Alibaba Wan 家族
    'wan-image': 'alibaba/wan-2.7-image',
    'wan2.7-image': 'alibaba/wan-2.7-image',
    'wan-image-pro': 'alibaba/wan-2.7-image-pro',

    // 其他
    'dreamshaper': 'lykon/dreamshaper-8-lcm',
    'sana': 'lykon/dreamshaper-8-lcm',
    'kontext': 'black-forest-labs/flux.1-kontext-pro',
    'nova-canvas': 'amazon/nova-canvas-v1',
  }
  return new Map(Object.entries(forwardMap))
}

// ============== 标准比例与分辨率 ==============

/**
 * 标准比例配置
 *
 * Pollinations 图片 API 不暴露每个模型支持的比例，但所有模型都接受 width/height 参数。
 * 因此给所有模型配置标准 5 比例。管理员可手动调整某些模型只支持单一比例。
 */
const STANDARD_RATIOS = [
  { id: '1:1', label: '1:1', w: 1024, h: 1024 },
  { id: '3:4', label: '3:4', w: 832, h: 1104 },
  { id: '4:3', label: '4:3', w: 1104, h: 832 },
  { id: '16:9', label: '16:9', w: 1280, h: 720 },
  { id: '9:16', label: '9:16', w: 720, h: 1280 },
]

/**
 * 标准分辨率配置
 *
 * 大多数 Pollinations 图片模型不暴露 resolutions 字段，但接受任意 width/height。
 * 给标准 2 档分辨率（1K / 2K）。
 * 对于有显式 resolutions 字段的模型（如 grok-imagine-image-2.0），使用 API 返回的值。
 */
const STANDARD_RESOLUTIONS = [
  { id: '1k', label: '1K', quality: '1024px', desc: '标准清晰度', multiplier: 1 },
  { id: '2k', label: '2K', quality: '2048px', desc: '高清细节', multiplier: 2 },
]

/**
 * 分辨率 ID → 配置 映射表
 */
const RESOLUTION_MAP: Record<string, { id: string; label: string; quality: string; desc: string; multiplier: number }> = {
  '1k': { id: '1k', label: '1K', quality: '1024px', desc: '标准清晰度', multiplier: 1 },
  '2k': { id: '2k', label: '2K', quality: '2048px', desc: '高清细节', multiplier: 2 },
  '4k': { id: '4k', label: '4K', quality: '4096px', desc: '超高清', multiplier: 4 },
}

/**
 * quality 参数选项（仅对支持 quality 的模型有效）
 * 来源：Pollinations API docs — quality 参数枚举值
 */
const QUALITY_OPTIONS = [
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
  { id: 'hd', label: 'HD' },
]

// ============== 按模型能力分类（来源：Pollinations API docs） ==============
// 文档：https://gen.pollinations.ai/docs#tag/image — Generate Image 章节明确标注了每个参数的模型支持范围

/**
 * 支持 seed 参数的图片模型
 * 来源：docs — "Supported by: flux.1-schnell, z-image-turbo, seedream-4.0, flux.2-klein-4b. Other models ignore this parameter."
 */
const SEED_SUPPORTED_MODELS = new Set([
  'black-forest-labs/flux.1-schnell',
  'tongyi-mai/z-image-turbo',
  'bytedance/seedream-4.0',
  'black-forest-labs/flux.2-klein-4b',
])

/**
 * 支持 quality 参数的图片模型
 * 来源：docs — "Supported by gptimage, gptimage-large, gpt-image-2, and grok-imagine-image-2.0."
 * gptimage = openai/gpt-image-1-mini, gptimage-large = openai/gpt-image-1.5
 * 新增 gpt-image-2.5 系列（flare/sunburst）也支持 quality（同系列模型）
 */
const QUALITY_SUPPORTED_MODELS = new Set([
  'openai/gpt-image-1-mini',       // gptimage
  'openai/gpt-image-1.5',          // gptimage-large
  'openai/gpt-image-2',            // gpt-image-2
  'openai/gpt-image-2.5-flare',    // 新系列，同支持
  'openai/gpt-image-2.5-sunburst', // 新系列，同支持
  'x-ai/grok-imagine-image-2.0',
])

/**
 * 支持 transparent 参数的图片模型
 * 来源：docs — "Only supported by gptimage and gptimage-large."
 */
const TRANSPARENT_SUPPORTED_MODELS = new Set([
  'openai/gpt-image-1-mini',       // gptimage
  'openai/gpt-image-1.5',          // gptimage-large
])

/**
 * 需要 16 像素对齐的图片模型
 * 来源：docs — "flux-2-pro, flux-2-flex, and microsoft/mai-image-2.5-flash require multiples of 16"
 */
const WIDTH_MULTIPLE_16_MODELS = new Set([
  'black-forest-labs/flux.2-pro',
  'black-forest-labs/flux.2-flex',
  'microsoft/mai-image-2.5-flash',
])

/**
 * 为单个 Pollinations 图片模型构建 config JSON
 *
 * 严格按 Pollinations API 返回字段 + 文档标注的参数支持范围填充；
 * 空字段则空数组/默认值（前端会按 config 真实能力隐藏对应参数项）
 */
function buildConfig(model: PollinationsImageModel): Record<string, unknown> {
  const inputModalities = model.input_modalities || []
  const supportsImageToImage = inputModalities.includes('image')
  const maxReferenceImages = model.max_reference_images ?? 0

  // 分辨率：使用 Pollinations resolutions 字段；无则用标准 2 档
  let resolutions: Array<{ id: string; label: string; quality: string; desc: string; multiplier: number }>
  if (model.resolutions && model.resolutions.length > 0) {
    resolutions = model.resolutions.map(r => RESOLUTION_MAP[r] || {
      id: r,
      label: r.toUpperCase(),
      quality: r,
      desc: '',
      multiplier: r === '2k' ? 2 : (r === '4k' ? 4 : 1),
    })
  } else {
    resolutions = STANDARD_RESOLUTIONS
  }

  // widthMultiple: 仅 flux.2-pro/flux.2-flex/mai-image-2.5-flash 需要 16 对齐，其他默认 8
  const widthMultiple = WIDTH_MULTIPLE_16_MODELS.has(model.name) ? 16 : 8

  // 按模型能力设置 features（来源：Pollinations API docs 参数说明）
  const supportsSeed = SEED_SUPPORTED_MODELS.has(model.name)
  const supportsQuality = QUALITY_SUPPORTED_MODELS.has(model.name)
  const supportsTransparent = TRANSPARENT_SUPPORTED_MODELS.has(model.name)

  // 计费信息
  const completionImageTokens = parseFloat(model.pricing?.completionImageTokens || '0')
  const flatRate = model.flat_rate ?? true

  return {
    ratios: STANDARD_RATIOS,
    defaultRatio: '1:1',
    resolutions,
    defaultResolution: resolutions[0]?.id || '1k',
    maxBatch: 4,
    widthMultiple,
    features: {
      negativePrompt: true,
      seed: supportsSeed,
      enhance: true,
      imageToImage: supportsImageToImage,
      maxReferenceImages,
      quality: supportsQuality,
      qualityOptions: supportsQuality ? QUALITY_OPTIONS : [],
      transparent: supportsTransparent,
    },
    // 原始字段保留（调试用，且方便未来按需扩展）
    _pollinations: {
      name: model.name,
      publisher: model.publisher,
      community: model.community,
      flatRate,
      paidOnly: model.paid_only ?? false,
      alpha: model.alpha ?? false,
      completionImageTokens: completionImageTokens || null,
      pricingDefaultLabel: model.pricing_default_label ?? null,
      inputModalities,
      supportedEndpoints: model.supported_endpoints || [],
    },
  }
}

/**
 * 主同步函数
 *
 * 流程：
 * 1. 拉取 Pollinations /models 列表，过滤 category=image
 * 2. 构建正向映射表（本地 DB name → Pollinations name）
 * 3. 查询 DB 所有图片模型
 * 4. 对每个 DB 模型，按 name 匹配 Pollinations 模型（先 name 精确匹配，再 alias 匹配，再 forwardMap）
 * 5. 构建 config JSON，写入 DB
 * 6. 清缓存
 */
export async function syncImageModelsFromPollinations(): Promise<SyncImageResult> {
  const result: SyncImageResult = { synced: 0, skipped: 0, notFound: [], errors: [] }

  // 1. 拉取 Pollinations 元数据
  let polModels: PollinationsImageModel[]
  try {
    const resp = await fetch(POLLINATIONS_MODELS_URL, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30_000),
    })
    if (!resp.ok) {
      throw new Error(`Pollinations /models 返回 ${resp.status}`)
    }
    const allModels = await resp.json() as PollinationsImageModel[]
    polModels = allModels.filter(m => m.category === 'image')
    log.info(`从 Pollinations 拉取 ${polModels.length} 个图片模型（总计 ${allModels.length} 个模型）`)
  } catch (e: any) {
    log.error(`拉取 Pollinations 图片模型失败: ${e.message}`)
    throw new Error(`拉取 Pollinations 图片模型失败: ${e.message}`)
  }

  // 2. 构建正向映射表（本地 DB name → Pollinations name）
  const forwardMap = buildForwardMap()

  // 3. 查询 DB 所有图片模型
  const dbModels = await prisma.aIModel.findMany({
    where: { type: 'image' },
    select: { id: true, name: true, config: true },
  })
  log.info(`DB 中图片模型 ${dbModels.length} 个`)

  // 4. 逐个 DB 模型匹配 Pollinations 模型并写入 config
  for (const dbModel of dbModels) {
    try {
      // 匹配优先级：
      //   1) forwardMap[dbModel.name] → Pollinations name 精确匹配
      //   2) DB name 直接匹配 Pollinations name（如 DB name 就是 "black-forest-labs/flux.1-schnell"）
      //   3) DB name 匹配 Pollinations aliases
      //   4) DB name 大小写不敏感匹配 Pollinations name
      let polModel: PollinationsImageModel | undefined
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
        // 大小写不敏感匹配
        const lowerName = dbModel.name.toLowerCase()
        polModel = polModels.find(m => m.name.toLowerCase() === lowerName)
        if (!polModel) {
          polModel = polModels.find(m => Array.isArray(m.aliases) && m.aliases.some(a => a.toLowerCase() === lowerName))
        }
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
      log.info(`已同步图片模型 "${dbModel.name}" → Pollinations "${polModel.name}"`)
    } catch (e: any) {
      result.errors.push({ name: dbModel.name, error: e.message })
      log.error(`同步图片模型 "${dbModel.name}" 失败: ${e.message}`)
    }
  }

  // 6. 清缓存
  invalidateImageModelCache()

  log.info(`图片模型同步完成: 成功 ${result.synced}，跳过 ${result.skipped}，错误 ${result.errors.length}`)
  if (result.notFound.length > 0) {
    log.warn(`未匹配的 DB 模型: ${result.notFound.join(', ')}`)
  }

  return result
}
