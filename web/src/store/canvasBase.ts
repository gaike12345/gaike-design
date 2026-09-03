// 画布公共基础模块 — 类型、常量、工具函数
//
// 从 useUnifiedCanvasStore 提取的可复用逻辑，
// 包含：节点/端口/连接/视口类型定义、端口配置、尺寸常量、
//       工具函数（uid、snapToGrid、canConnect、normalizePortRef 等）
//
// 设计原则：
//   - 纯类型 + 纯函数，无副作用
//   - 不依赖 Zustand，可被任意画布 store 复用
//   - 组件也可直接引用类型和常量

import type { AspectRatio } from './useStudioStore'

// ==================== 类型定义 ====================

export type UnifiedNodeType =
  | 'image'
  | 'video'
  | 'audio'

export type UnifiedPortType =
  | 'text'
  | 'script'
  | 'image'
  | 'video'
  | 'audio'
  | 'negative'
  | 'params'

export interface UPort {
  id: string
  label: string
  type: UnifiedPortType
}

export type GenStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'
export type ImageStatus = 'loading' | 'done' | 'error'

export interface GenImage {
  id: string
  url: string
  prompt: string
  seed: number
  ratio: AspectRatio
  status: ImageStatus
  createdAt: number
}

export interface VideoResult {
  taskId: string
  url?: string
  status: GenStatus
  prompt: string
  type: 'text2video' | 'img2video'
  placeholder?: boolean
  createdAt: number
  thumbnail?: string
}

export interface AudioResult {
  url: string
  status: GenStatus
  text: string
  voice?: string
  placeholder?: boolean
}

export interface ScriptShot {
  id: string
  index: number
  duration: number
  scene: string
  shot: string
  camera: string
  dialogue: string
  prompt: string
}

export interface UnifiedNodeData {
  // text
  text?: string
  // script
  script?: string
  shots?: ScriptShot[]
  scriptStatus?: GenStatus
  // image
  imagePrompt?: string
  negativePrompt?: string
  imageResults?: GenImage[]
  imageStatus?: GenStatus
  imageModel?: string
  imageRatio?: AspectRatio | string
  imageCount?: number
  imageResolution?: string
  imageSteps?: number
  imageCfg?: number
  imageSampler?: string
  imageSeed?: number
  // video
  videoStatus?: GenStatus
  videoTaskId?: string
  videoResult?: VideoResult
  videoPrompt?: string
  videoModel?: string
  videoResolution?: string
  videoDuration?: string
  videoRatio?: string
  // audio
  audioText?: string
  audioVoice?: string
  audioResult?: AudioResult
  audioStatus?: GenStatus
  // negative
  negative?: string
  // params
  ratio?: AspectRatio
  steps?: number
  cfg?: number
  seed?: number | null
  batch?: number
  duration?: number
  resolution?: '720p' | '1080p'
  fps?: number
  // internal labels (display only)
  __label?: string
}

export interface UCanvasNode {
  id: string
  type: UnifiedNodeType
  position: { x: number; y: number }
  data: UnifiedNodeData
}

export interface UConnection {
  id: string
  source: { nodeId: string; portId: string }
  target: { nodeId: string; portId: string }
}

export interface UViewport {
  x: number
  y: number
  zoom: number
}

export interface UDragState {
  active: boolean
  fromPort: { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean } | null
  cursor: { x: number; y: number } | null
}

// ==================== 常量 ====================

export const UNODE_PORTS: Record<UnifiedNodeType, { inputs: UPort[]; outputs: UPort[] }> = {
  image: {
    inputs: [{ id: 'ref', label: '引用', type: 'image' }],
    outputs: [{ id: 'out', label: '图片', type: 'image' }],
  },
  video: {
    inputs: [{ id: 'ref', label: '引用', type: 'image' }],
    outputs: [{ id: 'out', label: '视频', type: 'video' }],
  },
  audio: {
    inputs: [{ id: 'ref', label: '引用', type: 'text' }],
    outputs: [{ id: 'out', label: '音频', type: 'audio' }],
  },
}

export const UNODE_SIZE: Record<UnifiedNodeType, { width: number; height: number }> = {
  image: { width: 440, height: 248 },
  video: { width: 320, height: 181 },
  audio: { width: 300, height: 126 },
}

export const UNODE_LABELS: Record<UnifiedNodeType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

export const GRID_SIZE = 24

export const IMAGE_MODELS = [
  { id: 'general-pro', name: 'General image Pro', tag: 'Pro', desc: '通用专业图片生成模型', duration: 50, isNew: false },
]

export const IMAGE_RESOLUTIONS = [
  { id: '1k', label: '1K', quality: '标准画质', desc: '快速预览' },
  { id: '2k', label: '2K', quality: '高清画质', desc: '推荐' },
  { id: '4k', label: '4K', quality: '超清画质', desc: '超高清' },
]

export const IMAGE_RATIOS = [
  { id: 'adapt', label: '自适应', w: 0, h: 0 },
  { id: '1:1', label: '1:1', w: 1, h: 1 },
  { id: '9:16', label: '9:16', w: 9, h: 16 },
  { id: '16:9', label: '16:9', w: 16, h: 9 },
  { id: '3:4', label: '3:4', w: 3, h: 4 },
  { id: '4:3', label: '4:3', w: 4, h: 3 },
  { id: '3:2', label: '3:2', w: 3, h: 2 },
  { id: '2:3', label: '2:3', w: 2, h: 3 },
  { id: '4:5', label: '4:5', w: 4, h: 5 },
  { id: '5:4', label: '5:4', w: 5, h: 4 },
  { id: '21:9', label: '21:9', w: 21, h: 9 },
]

export const VIDEO_MODELS = [
  { id: 'seedance', name: 'Seedance Pro', tag: '字节', desc: '文生/图生视频', duration: 30, isNew: false },
]

export const VIDEO_RESOLUTIONS = [
  { id: '720p', label: '720p', desc: '快速预览' },
  { id: '1080p', label: '1080p', desc: '推荐' },
  { id: '2k', label: '2K', desc: '超高清' },
]

export const VIDEO_DURATIONS = [
  { id: '5s', label: '5秒' },
  { id: '10s', label: '10秒' },
  { id: '15s', label: '15秒' },
  { id: '30s', label: '30秒' },
]

export const AUDIO_VOICES = [
  { id: 'nova', name: 'Nova', desc: '女声·温暖' },
]

// ==================== 工具函数 ====================

/** 生成唯一 ID */
export function uid(prefix: string): string {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  return prefix + '_' + id
}

/** 判断生成状态是否忙碌中 */
export function isBusy(s?: GenStatus): boolean {
  return s === 'queued' || s === 'running'
}

/** 生成随机种子 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1e9)
}

/** 吸附到网格 */
export function snapToGrid(value: number, gridSize = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

/**
 * 判断两个端口是否可以连接
 * 规则：
 *   - 必须一端输出一端输入
 *   - 同类型可连接（image→image, video→video, audio→audio）
 *   - audio → image/video 可连接（音频文本可作为视频/图片的引用输入）
 */
export function canConnect(
  from: { type: UnifiedPortType; isOutput: boolean },
  to: { type: UnifiedPortType; isOutput: boolean },
): boolean {
  if (from.isOutput === to.isOutput) return false
  const outType = from.isOutput ? from.type : to.type
  const inType = from.isOutput ? to.type : from.type
  if (outType === inType) return true
  if (outType === 'audio' && (inType === 'image' || inType === 'video')) return true
  return false
}

/**
 * 将虚拟端口或不存在的端口 ID 归一化为该节点该方向的第一个真实端口 ID
 * 同时返回该真实端口的 type，用于上层重新校验 canConnect
 */
export function normalizePortRef(
  nodeType: UnifiedNodeType,
  portId: string,
  isOutput: boolean,
): { portId: string; type: UnifiedPortType } | null {
  const list = isOutput ? UNODE_PORTS[nodeType].outputs : UNODE_PORTS[nodeType].inputs
  // 先找真实匹配
  const hit = list.find((p) => p.id === portId)
  if (hit) return { portId: hit.id, type: hit.type }
  // 找不到则返回第一个真实端口（虚拟端口 / 旧连线迁移 场景）
  const first = list[0]
  if (!first) return null
  return { portId: first.id, type: first.type }
}

/** 获取节点默认数据 */
export function defaultNodeData(type: UnifiedNodeType): UnifiedNodeData {
  switch (type) {
    case 'image':
      return { imageResults: [], imageStatus: 'idle', imageRatio: '16:9', imageResolution: '2k', imageCount: 1, imageSteps: 28, imageCfg: 7, imageModel: 'general-pro' }
    case 'video':
      return { videoStatus: 'idle', videoPrompt: '', videoModel: 'seedance', videoResolution: '1080p', videoDuration: '5s', videoRatio: '16:9' }
    case 'audio':
      return { audioText: '', audioVoice: 'nova', audioStatus: 'idle' }
  }
}

/** 视口平移 */
export function panViewport(vp: UViewport, dx: number, dy: number): UViewport {
  return { ...vp, x: vp.x + dx, y: vp.y + dy }
}

/** 视口缩放（以 cx, cy 为中心） */
export function zoomViewport(vp: UViewport, zoom: number, cx: number, cy: number): UViewport {
  const z = Math.min(2, Math.max(0.3, zoom))
  const { x, y, zoom: oldZoom } = vp
  return { x: cx - ((cx - x) * z) / oldZoom, y: cy - ((cy - y) * z) / oldZoom, zoom: z }
}

/** 轮询注册表管理 */
export class PollRegistry {
  private map = new Map<string, ReturnType<typeof setInterval>>()

  start(nodeId: string, fn: () => void, intervalMs: number): void {
    this.stop(nodeId)
    const id = setInterval(fn, intervalMs)
    this.map.set(nodeId, id)
  }

  stop(nodeId: string): void {
    const id = this.map.get(nodeId)
    if (id) { clearInterval(id); this.map.delete(nodeId) }
  }

  stopAll(): void {
    this.map.forEach((id) => clearInterval(id))
    this.map.clear()
  }

  has(nodeId: string): boolean {
    return this.map.has(nodeId)
  }
}
