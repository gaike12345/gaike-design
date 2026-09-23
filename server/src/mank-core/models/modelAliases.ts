/**
 * Pollinations 模型名映射表 — 单一来源（single source of truth）
 *
 * 之前同一份（或同一份的超集）映射散落在 6 处，靠注释约定"手工同步"：
 *   - billing/pollinationsSync.ts   MODEL_ID_ALIASES（官方 ID → 内部 ID，16 条）
 *   - admin/admin.route.ts          ALIASES（上表的逐字复制副本，16 条）
 *   - video/providers/pollinations.ts  MODEL_NAME_MAP（内部名 → 官方名，22 条）
 *   - video/syncPollinations.ts     buildForwardMap（上表超集，31 条）
 *   - image/providers/pollinations.ts  MODEL_NAME_ALIASES（短名 → 全名，50 条）
 *   - image/syncPollinations.ts     buildForwardMap（上表逐字复制，50 条）
 *
 * 合并语义（snapshot 由 server/tests/modelAliases.test.ts 锁定）：
 *   - video 官方 ID 表与 video 名表互为逆映射，唯一例外 grok-video-pro（已知矛盾，
 *     合并前即存在，两侧现状逐字保留；详见测试内注释，修复需产品决策）
 *   - video 名表取两份的超集：provider 侧既有 22 条的值全部不变，多出的恒等条目
 *     只会把原本裸传给 Pollinations 的短名正确映射为官方全名（严格改进）
 *   - image 名表两份逐字相同，合并零行为差异
 *
 * 维护说明：
 *   - key: 我们系统内部可能使用的名字（DB seed、前端、旧配置）
 *   - value: Pollinations API 认可的模型全名
 *   - 已经是全名的输入由调用方（resolveModelName 等）直接放行
 *   - 数据来源：https://gen.pollinations.ai/models（2026-09 实时核对）
 */

// ============================================================
// video：Pollinations 官方模型 ID → 平台内部 ID
// （pollinationsSync 定价同步 / admin video-benchmark 对比共用）
// ============================================================
export const POLLINATIONS_VIDEO_ID_ALIASES: Record<string, string> = {
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
  // 以下模型 Pollinations 有但我们暂未正式接入
  'alibaba/wan-2.6': 'wan-2.6',
  'alibaba/happyhorse-1.1': 'happyhorse',
  'x-ai/grok-imagine-video': 'grok-video',
  'x-ai/grok-imagine-video-1.5': 'grok-video-pro',
}

// ============================================================
// video：平台内部名（DB name）→ Pollinations 官方全名（超集 32 条）
// （video provider 请求构造 / video sync 正向匹配共用）
// ============================================================
export const POLLINATIONS_VIDEO_NAME_MAP: Record<string, string> = {
  // 阿里 Wan 系列
  'wan-fast': 'alibaba/wan-2.2-fast',
  'wan-2.2-fast': 'alibaba/wan-2.2-fast',
  'wan-pro': 'alibaba/wan-2.7',
  'wan-2.7': 'alibaba/wan-2.7',
  'wan-3.0': 'alibaba/wan-3.0',
  'wan': 'alibaba/wan-2.6',
  'wan-2.6': 'alibaba/wan-2.6',
  'happyhorse': 'alibaba/happyhorse-1.1',
  'happyhorse-1.1': 'alibaba/happyhorse-1.1',

  // 字节 Seedance 系列
  'seedance': 'bytedance/seedance-2.0',
  'seedance-pro': 'bytedance/seedance-1-pro-fast',
  'seedance-1-pro-fast': 'bytedance/seedance-1-pro-fast',
  'seedance-2.0': 'bytedance/seedance-2.0',
  'seedance-2.5': 'bytedance/seedance-2.5',
  'seedance-2.0-fast': 'bytedance/seedance-2.0-fast',
  'seedance-2.0-mini': 'bytedance/seedance-2.0-mini',

  // Pruna
  'p-video': 'prunaai/p-video',
  'pruna-video': 'prunaai/p-video',

  // Google
  'veo': 'google/veo-3.1-fast',
  'veo-3.1-fast': 'google/veo-3.1-fast',
  'gemini-omni': 'google/gemini-omni-1.1-flash',
  'gemini-omni-1.1-flash': 'google/gemini-omni-1.1-flash',

  // MiniMax
  'minimax-h3': 'minimax/minimax-h3',
  'minimax-h3-turbo': 'minimax/minimax-h3-max-turbo',

  // xAI Grok
  'grok-video-pro': 'x-ai/grok-imagine-video',
  'grok-video': 'x-ai/grok-imagine-video',
  'grok-imagine-video': 'x-ai/grok-imagine-video',
  'grok-video-1.5': 'x-ai/grok-imagine-video-1.5',
  'grok-imagine-video-1.5': 'x-ai/grok-imagine-video-1.5',

  // Amazon
  'nova-reel': 'amazon/nova-reel-v1',
  'nova-reel-v1': 'amazon/nova-reel-v1',
}

// ============================================================
// video：模型默认时长（Pollinations video pricing 以 pollen/秒 计，
// 换算总额需要标准时长；billing 同步与 admin benchmark 对比共用）
// ============================================================
export const POLLINATIONS_VIDEO_DEFAULT_DURATION: Record<string, number> = {
  'seedance-2.5': 4,
  'nova-reel': 6,
}
export const VIDEO_DEFAULT_DURATION_SECONDS = 5 // 大多数 video 模型默认 5 秒

export function defaultVideoDurationSeconds(internalId: string): number {
  return POLLINATIONS_VIDEO_DEFAULT_DURATION[internalId] ?? VIDEO_DEFAULT_DURATION_SECONDS
}

// ============================================================
// image：短名/产品名/旧名 → Pollinations 官方全名（50 条）
// （image provider 请求规范化 / image sync 正向匹配共用）
// ============================================================
export const POLLINATIONS_IMAGE_NAME_MAP: Record<string, string> = {
  // -------- 前端产品模型名（imageApi.ts MODEL_TO_POLLINATIONS 用） --------
  'lib-image': 'black-forest-labs/flux.1-schnell',
  'general-pro': 'black-forest-labs/flux.1-schnell',
  'general-v2': 'black-forest-labs/flux.1-schnell',
  'style-v82': 'black-forest-labs/flux.1-schnell',
  'style-v81': 'black-forest-labs/flux.1-schnell',
  'seedream-5p': 'bytedance/seedream-5.0-pro',
  'qwen-3': 'qwen/qwen-image-3',

  // -------- sdxl 系列（Pollinations 已移除 sdxl 名字，用社区替代） --------
  'sdxl': 'community/CloudCompile/sdxl-lightning',
  'sdxl-lightning': 'community/CloudCompile/sdxl-lightning',
  'sdxl-turbo': 'community/CloudCompile/sdxl-lightning',
  'sdxl-base': 'community/CloudCompile/sdxl-lightning',

  // -------- Flux 家族 --------
  'flux': 'black-forest-labs/flux.1-schnell',
  'flux-schnell': 'black-forest-labs/flux.1-schnell',
  'flux.1-schnell': 'black-forest-labs/flux.1-schnell',
  'flux-1-schnell': 'black-forest-labs/flux.1-schnell',
  'flux-2-flex': 'black-forest-labs/flux.2-flex',
  'flux.2-flex': 'black-forest-labs/flux.2-flex',
  'flux-2-pro': 'black-forest-labs/flux.2-pro',
  'flux-klein': 'black-forest-labs/flux.2-klein-4b',
  'flux-2-klein-4b': 'black-forest-labs/flux.2-klein-4b',

  // -------- Bytedance Seedream 家族 --------
  'seedream': 'bytedance/seedream-4.0',
  'seedream-pro': 'bytedance/seedream-4.5',
  'seedream-5-pro': 'bytedance/seedream-5.0-pro',
  'seedream-5.0-pro': 'bytedance/seedream-5.0-pro',
  'seedream5': 'bytedance/seedream-5.0-lite',
  'seedream-5-lite': 'bytedance/seedream-5.0-lite',

  // -------- Qwen 家族 --------
  'qwen-image': 'qwen/qwen-image',
  'qwen-image-3': 'qwen/qwen-image-3',

  // -------- Ideogram 家族 --------
  'ideogram-v4-quality': 'ideogram-ai/ideogram-v4-quality',
  'ideogram-v4-turbo': 'ideogram-ai/ideogram-v4-turbo',
  'ideogram-v4-balanced': 'ideogram-ai/ideogram-v4-balanced',

  // -------- Gemini Nano Banana 家族 --------
  'nanobanana': 'google/gemini-2.5-flash-image',
  'nanobanana-pro': 'google/gemini-3-pro-image',
  'nanobanana-2': 'google/gemini-3.1-flash-image',
  'nanobanana2': 'google/gemini-3.1-flash-image',
  'nanobanana-lite': 'google/gemini-3.1-flash-lite-image',

  // -------- OpenAI GPT Image 家族 --------
  'gpt-image': 'openai/gpt-image-1-mini',
  'gpt-image-1-mini': 'openai/gpt-image-1-mini',
  'gpt-image-1.5': 'openai/gpt-image-1.5',
  'gpt-image-2': 'openai/gpt-image-2',

  // -------- Grok Imagine 家族 --------
  'grok-imagine': 'x-ai/grok-imagine-image',
  'grok-imagine-pro': 'x-ai/grok-imagine-image-quality',
  'grok-aurora': 'x-ai/grok-imagine-image-quality',

  // -------- Alibaba Wan 家族 --------
  'wan-image': 'alibaba/wan-2.7-image',
  'wan2.7-image': 'alibaba/wan-2.7-image',
  'wan-image-pro': 'alibaba/wan-2.7-image-pro',

  // -------- 其他 --------
  'dreamshaper': 'lykon/dreamshaper-8-lcm',
  'sana': 'lykon/dreamshaper-8-lcm',
  'kontext': 'black-forest-labs/flux.1-kontext-pro',
  'nova-canvas': 'amazon/nova-canvas-v1',
}
