/**
 * 图片生成 Provider 通用接口
 *
 *  所有图片供应商（Pollinations / 阿里云万相 / 等）都实现此接口，
 *  分发层根据模型的 providerId 自动选择对应适配器。
 */

export interface ImageGenerateParams {
  prompt: string
  model: string          // 模型名（如 flux / seedream / wanx-v1）
  width: number
  height: number
  seed?: number
  negativePrompt?: string
  /** 参考图 URL（图生图） */
  refImage?: string
  /** 风格 / 其他附加参数（从 model.config 读取） */
  extra?: Record<string, unknown>
}

export interface ImageResult {
  /** 图片直链（第三方 CDN/存储） */
  url: string
  width: number
  height: number
  seed?: number
  /** 是否为占位图（无 API Key 时的降级） */
  placeholder?: boolean
  /** 供应商名（用于日志/调试） */
  provider: string
}

export interface ImageProvider {
  /** 供应商 ID（对应 AIProvider.name） */
  id: string

  /** 是否可用（API Key 配置了吗） */
  isAvailable(): boolean

  /**
   * 文生图
   * 返回图片 URL（同步返回；异步供应商内部轮询等待完成）
   */
  textToImage(params: ImageGenerateParams): Promise<ImageResult>

  /**
   * 图生图（可选，不支持的 provider 返回 "not_supported" 错误）
   */
  imageToImage?(params: ImageGenerateParams & { refImage: string }): Promise<ImageResult>
}
