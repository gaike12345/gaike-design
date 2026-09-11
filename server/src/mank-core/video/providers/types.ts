/**
 * 视频生成 Provider 通用接口
 *
 *  所有视频供应商（Pollinations / 等）都实现此接口，
 *  分发层根据模型的 providerId 自动选择对应适配器。
 *
 *  注意：视频生成是同步阻塞的（HTTP 长连接等待 MP4 返回），
 *  上层通过 taskWorker 异步队列 + 进度上报来管理。
 */

export interface VideoGenerateParams {
  prompt: string
  model: string          // 模型名（如 wan-fast / seedance-pro / veo 等）
  duration: number       // 时长（秒）
  resolution?: string    // 分辨率：480p / 720p / 768p / 1080p / 2k / 4k
  aspectRatio?: string   // 比例：16:9 / 9:16
  seed?: number
  audio?: boolean        // 是否生成音频
  /** 首帧图 URL（图生视频） */
  image?: string
  /** 尾帧图 URL（部分模型支持） */
  endImage?: string
  /** 参考图 URL 数组（部分模型支持） */
  referenceImages?: string[]
  /** 参考视频 URL（部分模型支持） */
  referenceVideo?: string
  /** 风格 / 其他附加参数（从 model.config 读取） */
  extra?: Record<string, unknown>
}

export interface VideoResult {
  /** 视频直链（第三方 CDN/存储，或本地上传后的 URL） */
  url: string
  duration: number
  resolution?: string
  /** 是否生成了音频 */
  audio?: boolean
  /** 视频文件大小（字节，可选） */
  size?: number
  /** 是否为占位视频（无 API Key 时的降级） */
  placeholder?: boolean
  /** 供应商名（用于日志/调试） */
  provider: string
}

export interface VideoProvider {
  /** 供应商 ID（对应 AIProvider.name） */
  id: string

  /** 是否可用（API Key 配置了吗） */
  isAvailable(): boolean

  /**
   * 文生视频
   * 同步返回视频 URL（阻塞等待生成完成）
   */
  textToVideo(params: VideoGenerateParams): Promise<VideoResult>

  /**
   * 图生视频（可选，不支持的 provider 返回 "not_supported" 错误）
   */
  imageToVideo?(params: VideoGenerateParams & { image: string }): Promise<VideoResult>
}
