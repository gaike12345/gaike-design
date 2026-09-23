/**
 * modelAliases.ts 快照测试 — 模型名映射单点锁定
 *
 * 覆盖:
 *   1. video 官方 ID → 内部 ID 表内容快照（16 条）
 *   2. video 内部名 → 官方名 表内容快照（32 条超集）
 *   3. image 短名 → 官方全名 表内容快照（50 条）
 *   4. 不变量：video ID 表与名表互为逆映射（官方 ID ↔ 内部 ID）
 *   5. 不变量：名表/ID 表无空值、无重复 key 冲突（Record 字面量由 TS 保证，此处防运行时污染）
 *   6. defaultVideoDurationSeconds — seedance-2.5=4 / nova-reel=6 / 其他=5
 */
import { describe, it, expect } from 'vitest'
import {
  POLLINATIONS_VIDEO_ID_ALIASES,
  POLLINATIONS_VIDEO_NAME_MAP,
  POLLINATIONS_VIDEO_DEFAULT_DURATION,
  VIDEO_DEFAULT_DURATION_SECONDS,
  POLLINATIONS_IMAGE_NAME_MAP,
  defaultVideoDurationSeconds,
} from '../src/mank-core/models/modelAliases'

describe('modelAliases 模型名映射单点', () => {
  // ------------------------------------------------------------------
  // 快照：内容被逐条锁定，任何手工改动都会在此暴露（防止 6 处副本时代的手工失同步复发）
  // ------------------------------------------------------------------
  it('video 官方ID→内部ID 表快照（16 条）', () => {
    expect(POLLINATIONS_VIDEO_ID_ALIASES).toEqual({
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
      'alibaba/wan-2.6': 'wan-2.6',
      'alibaba/happyhorse-1.1': 'happyhorse',
      'x-ai/grok-imagine-video': 'grok-video',
      'x-ai/grok-imagine-video-1.5': 'grok-video-pro',
    })
  })

  it('video 内部名→官方名 表快照（31 条超集）', () => {
    expect(POLLINATIONS_VIDEO_NAME_MAP).toEqual({
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
    })
  })

  it('image 短名→官方全名 表快照（50 条）', () => {
    expect(POLLINATIONS_IMAGE_NAME_MAP).toEqual({
      'lib-image': 'black-forest-labs/flux.1-schnell',
      'general-pro': 'black-forest-labs/flux.1-schnell',
      'general-v2': 'black-forest-labs/flux.1-schnell',
      'style-v82': 'black-forest-labs/flux.1-schnell',
      'style-v81': 'black-forest-labs/flux.1-schnell',
      'seedream-5p': 'bytedance/seedream-5.0-pro',
      'qwen-3': 'qwen/qwen-image-3',
      'sdxl': 'community/CloudCompile/sdxl-lightning',
      'sdxl-lightning': 'community/CloudCompile/sdxl-lightning',
      'sdxl-turbo': 'community/CloudCompile/sdxl-lightning',
      'sdxl-base': 'community/CloudCompile/sdxl-lightning',
      'flux': 'black-forest-labs/flux.1-schnell',
      'flux-schnell': 'black-forest-labs/flux.1-schnell',
      'flux.1-schnell': 'black-forest-labs/flux.1-schnell',
      'flux-1-schnell': 'black-forest-labs/flux.1-schnell',
      'flux-2-flex': 'black-forest-labs/flux.2-flex',
      'flux.2-flex': 'black-forest-labs/flux.2-flex',
      'flux-2-pro': 'black-forest-labs/flux.2-pro',
      'flux-klein': 'black-forest-labs/flux.2-klein-4b',
      'flux-2-klein-4b': 'black-forest-labs/flux.2-klein-4b',
      'seedream': 'bytedance/seedream-4.0',
      'seedream-pro': 'bytedance/seedream-4.5',
      'seedream-5-pro': 'bytedance/seedream-5.0-pro',
      'seedream-5.0-pro': 'bytedance/seedream-5.0-pro',
      'seedream5': 'bytedance/seedream-5.0-lite',
      'seedream-5-lite': 'bytedance/seedream-5.0-lite',
      'qwen-image': 'qwen/qwen-image',
      'qwen-image-3': 'qwen/qwen-image-3',
      'ideogram-v4-quality': 'ideogram-ai/ideogram-v4-quality',
      'ideogram-v4-turbo': 'ideogram-ai/ideogram-v4-turbo',
      'ideogram-v4-balanced': 'ideogram-ai/ideogram-v4-balanced',
      'nanobanana': 'google/gemini-2.5-flash-image',
      'nanobanana-pro': 'google/gemini-3-pro-image',
      'nanobanana-2': 'google/gemini-3.1-flash-image',
      'nanobanana2': 'google/gemini-3.1-flash-image',
      'nanobanana-lite': 'google/gemini-3.1-flash-lite-image',
      'gpt-image': 'openai/gpt-image-1-mini',
      'gpt-image-1-mini': 'openai/gpt-image-1-mini',
      'gpt-image-1.5': 'openai/gpt-image-1.5',
      'gpt-image-2': 'openai/gpt-image-2',
      'grok-imagine': 'x-ai/grok-imagine-image',
      'grok-imagine-pro': 'x-ai/grok-imagine-image-quality',
      'grok-aurora': 'x-ai/grok-imagine-image-quality',
      'wan-image': 'alibaba/wan-2.7-image',
      'wan2.7-image': 'alibaba/wan-2.7-image',
      'wan-image-pro': 'alibaba/wan-2.7-image-pro',
      'dreamshaper': 'lykon/dreamshaper-8-lcm',
      'sana': 'lykon/dreamshaper-8-lcm',
      'kontext': 'black-forest-labs/flux.1-kontext-pro',
      'nova-canvas': 'amazon/nova-canvas-v1',
    })
  })

  // ------------------------------------------------------------------
  // 不变量：video ID 表 ↔ 名表 互为逆映射
  // 已知矛盾（合并前 4 处副本即存在，此处逐字保留现状并显式锁定）：
  //   ID 表:  x-ai/grok-imagine-video-1.5 → grok-video-pro（billing 认为内部 grok-video-pro 指 1.5）
  //   名表:  grok-video-pro → x-ai/grok-imagine-video（provider 实发基础版；DB _pollinations.name 亦为基础版）
  //   后果：billing 会把官方 1.5 定价写到 DB 行 grok-video-pro，而用户请求该行实际生成基础版。
  //   修复需产品决策（grok-video-pro 指 1.5 还是基础版、grok-video/grok-video-pro 双行冗余），
  //   不在本收敛 commit 范围内。
  // ------------------------------------------------------------------
  const KNOWN_INVERSE_CONFLICTS = new Set(['x-ai/grok-imagine-video-1.5'])

  it('video ID 表的每个官方 ID 都能从名表逆映射回来（除已知矛盾 grok-video-pro 外）', () => {
    for (const [officialId, internalId] of Object.entries(POLLINATIONS_VIDEO_ID_ALIASES)) {
      if (KNOWN_INVERSE_CONFLICTS.has(officialId)) continue
      expect(POLLINATIONS_VIDEO_NAME_MAP[internalId], `名表[内部ID=${internalId}] 应回官方ID=${officialId}`).toBe(officialId)
    }
  })

  it('已知矛盾对显式锁定（改动任何一侧必须先意识到这里）', () => {
    expect(POLLINATIONS_VIDEO_ID_ALIASES['x-ai/grok-imagine-video-1.5']).toBe('grok-video-pro')
    expect(POLLINATIONS_VIDEO_NAME_MAP['grok-video-pro']).toBe('x-ai/grok-imagine-video')
  })

  it('ID 表与名表条数哨兵（防意外增删）', () => {
    expect(Object.keys(POLLINATIONS_VIDEO_ID_ALIASES)).toHaveLength(16)
    expect(Object.keys(POLLINATIONS_VIDEO_NAME_MAP)).toHaveLength(31)
    expect(Object.keys(POLLINATIONS_IMAGE_NAME_MAP)).toHaveLength(50)
  })

  it('映射值均为非空字符串', () => {
    for (const table of [POLLINATIONS_VIDEO_ID_ALIASES, POLLINATIONS_VIDEO_NAME_MAP, POLLINATIONS_IMAGE_NAME_MAP]) {
      for (const [k, v] of Object.entries(table)) {
        expect(v, `key=${k}`).toBeTruthy()
        expect(typeof v, `key=${k}`).toBe('string')
      }
    }
  })

  // ------------------------------------------------------------------
  // 默认时长
  // ------------------------------------------------------------------
  it('defaultVideoDurationSeconds — seedance-2.5=4 / nova-reel=6 / 其他=5', () => {
    expect(defaultVideoDurationSeconds('seedance-2.5')).toBe(4)
    expect(defaultVideoDurationSeconds('nova-reel')).toBe(6)
    expect(defaultVideoDurationSeconds('seedance-2.0')).toBe(VIDEO_DEFAULT_DURATION_SECONDS)
    expect(defaultVideoDurationSeconds('wan-fast')).toBe(VIDEO_DEFAULT_DURATION_SECONDS)
    expect(defaultVideoDurationSeconds('')).toBe(VIDEO_DEFAULT_DURATION_SECONDS)
    expect(POLLINATIONS_VIDEO_DEFAULT_DURATION).toEqual({ 'seedance-2.5': 4, 'nova-reel': 6 })
  })
})
