// 统一创作画布 - 状态管理（合并图像+视频）
//
// 对标 LibTV：3 大基础节点 + 输出节点
// 节点类型：
//   image     - 图片生成（输出: image）
//   video     - 视频生成（输出: video）
//   audio     - 音频生成（输出: audio）
//
// 数据流：直接操作各节点内部配置，完成生产

import { create } from 'zustand'
import { api } from '../services/api'
import { buildImageUrl, buildRetryUrl, generateViaBackend } from '../services/imageApi'
import { useQuotaStore } from './useQuotaStore'
import type { AspectRatio } from './useStudioStore'

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

interface UDragState {
  active: boolean
  fromPort: { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean } | null
  cursor: { x: number; y: number } | null
}

const pollRegistry = new Map<string, ReturnType<typeof setInterval>>()

let nodeTypeCounters: Record<string, number> = {}

interface UnifiedCanvasState {
  nodes: UCanvasNode[]
  connections: UConnection[]
  viewport: UViewport
  drag: UDragState
  selectedNodeId: string | null

  setViewport: (v: Partial<UViewport>) => void
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number, cx: number, cy: number) => void
  resetViewport: () => void

  addNode: {
    (type: UnifiedNodeType, position?: { x: number; y: number }, dataOverride?: any, snapToGrid?: boolean): string
    (type: UnifiedNodeType, x: number, y: number, dataOverride?: any, snapToGrid?: boolean): string
  }
  removeNode: (id: string) => void
  updateNodeData: (id: string, patch: Partial<UnifiedNodeData>) => void
  moveNode: (id: string, x: number, y: number) => void
  selectNode: (id: string | null) => void

  addConnection: (c: Omit<UConnection, 'id'>) => void
  removeConnection: (id: string) => void

  startDrag: (from: NonNullable<UDragState['fromPort']>) => void
  moveDrag: (cursor: { x: number; y: number }) => void
  endDrag: (to: { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean } | null) => void

  runImageGen: (nodeId: string) => Promise<void>
  retryImage: (nodeId: string, imgId: string) => void
  clearImageResults: (nodeId: string) => void
  runVideoGen: (nodeId: string) => Promise<void>
  pollVideoTask: (nodeId: string) => Promise<void>
  runAudioGen: (nodeId: string) => Promise<void>
  runScriptGen: (nodeId: string) => Promise<void>

  loadDefaultWorkflow: () => void
  clearCanvas: () => void
  saveToStorage: () => void
  loadFromStorage: () => boolean
}

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

function defaultNodeData(type: UnifiedNodeType): UnifiedNodeData {
  switch (type) {
    case 'image':
      return { imageResults: [], imageStatus: 'idle', imageRatio: '16:9', imageResolution: '2k', imageCount: 1, imageSteps: 28, imageCfg: 7, imageModel: 'general-pro' }
    case 'video':
      return { videoStatus: 'idle', videoPrompt: '', videoModel: 'seedance', videoResolution: '1080p', videoDuration: '5s', videoRatio: '16:9' }
    case 'audio':
      return { audioText: '', audioVoice: 'nova', audioStatus: 'idle' }
  }
}

const NODE_LABEL_MAP: Record<UnifiedNodeType, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
}

export const UNODE_LABELS = NODE_LABEL_MAP

function uid(prefix: string) {
  const id = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID().replace(/-/g, '')
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
  return prefix + '_' + id
}

function isBusy(s?: GenStatus) {
  return s === 'queued' || s === 'running'
}

function randomSeed() {
  return Math.floor(Math.random() * 1e9)
}

function canConnect(
  from: { type: UnifiedPortType; isOutput: boolean },
  to: { type: UnifiedPortType; isOutput: boolean },
): boolean {
  if (from.isOutput === to.isOutput) return false
  const outType = from.isOutput ? from.type : to.type
  const inType = from.isOutput ? to.type : from.type
  // 允许同类型连接，或 audio → image/video 连接（音频可作为视频/图片的引用输入）
  if (outType === inType) return true
  if (outType === 'audio' && (inType === 'image' || inType === 'video')) return true
  return false
}

// 将虚拟端口(__vin__/__vout__)或不存在的端口id，归一化为该节点该方向的第一个真实端口id
// 同时返回该真实端口的 type，用于上层重新校验 canConnect
function normalizePortRef(
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

function stopPoll(nodeId: string) {
  const id = pollRegistry.get(nodeId)
  if (id) { clearInterval(id); pollRegistry.delete(nodeId) }
}

function stopAllPolls() {
  pollRegistry.forEach((id) => clearInterval(id))
  pollRegistry.clear()
}

export const GRID_SIZE = 24

export function snapToGrid(value: number, gridSize = GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize
}

export const useUnifiedCanvasStore = create<UnifiedCanvasState>((set, get) => ({
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  drag: { active: false, fromPort: null, cursor: null },
  selectedNodeId: null,

  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
  panBy: (dx, dy) =>
    set((s) => ({ viewport: { ...s.viewport, x: s.viewport.x + dx, y: s.viewport.y + dy } })),
  zoomTo: (zoom, cx, cy) =>
    set((s) => {
      const z = Math.min(2, Math.max(0.3, zoom))
      const { x, y, zoom: oldZoom } = s.viewport
      return { viewport: { x: cx - ((cx - x) * z) / oldZoom, y: cy - ((cy - y) * z) / oldZoom, zoom: z } }
    }),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),

  addNode: ((...args: any[]) => {
    // 重载 1: addNode(type, position?:{x,y}, dataOverride?, snapEnabled?)
    // 重载 2: addNode(type, x:number, y:number, dataOverride?, snapEnabled?)
    const type: UnifiedNodeType = args[0]
    let position: { x: number; y: number }
    let dataOverride: any = undefined
    let snapEnabled = true
    if (typeof args[1] === 'number' && typeof args[2] === 'number') {
      position = { x: args[1], y: args[2] }
      dataOverride = args[3]
      snapEnabled = args[4] ?? true
    } else {
      position = args[1] ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 }
      dataOverride = args[2]
      snapEnabled = args[3] ?? true
    }
    const id = uid(type)
    const count = (nodeTypeCounters[type] ?? 0) + 1
    nodeTypeCounters[type] = count
    const posX = snapEnabled ? snapToGrid(position.x) : position.x
    const posY = snapEnabled ? snapToGrid(position.y) : position.y
    const node: UCanvasNode = {
      id, type,
      position: { x: posX, y: posY },
      data: { ...(dataOverride ?? defaultNodeData(type)), __label: `${UNODE_LABELS[type]}节点 ${count}` },
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  }) as any,

  removeNode: (id) => {
    stopPoll(id)
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      connections: s.connections.filter((c) => c.source.nodeId !== id && c.target.nodeId !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
  },

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    })),

  moveNode: (id, x, y) =>
    set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)) })),

  selectNode: (id) => set({ selectedNodeId: id }),

  addConnection: (c) =>
    set((s) => {
      const srcNode = s.nodes.find((n) => n.id === c.source.nodeId)
      const tgtNode = s.nodes.find((n) => n.id === c.target.nodeId)
      if (!srcNode || !tgtNode) return s
      const src = normalizePortRef(srcNode.type, c.source.portId, true)
      const tgt = normalizePortRef(tgtNode.type, c.target.portId, false)
      if (!src || !tgt) return s
      // 使用 canConnect 校验类型匹配（支持 audio → image/video 等跨类型连接）
      if (!canConnect({ type: src.type, isOutput: true }, { type: tgt.type, isOutput: false })) return s
      const source = { nodeId: c.source.nodeId, portId: src.portId }
      const target = { nodeId: c.target.nodeId, portId: tgt.portId }
      if (source.nodeId === target.nodeId) return s
      // 仅阻止完全相同的重复连接，允许多个源连接到同一目标端口
      if (s.connections.some((e) => e.source.nodeId === source.nodeId && e.source.portId === source.portId && e.target.nodeId === target.nodeId && e.target.portId === target.portId)) return s
      return { connections: [...s.connections, { id: uid('uconn'), source, target }] }
    }),

  removeConnection: (id) =>
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),

  startDrag: (from) => set({ drag: { active: true, fromPort: from, cursor: null } }),
  moveDrag: (cursor) => set((s) => ({ drag: { ...s.drag, cursor } })),

  endDrag: (to) => {
    const { drag, nodes } = get()
    if (drag.fromPort && to) {
      // 1. 确定双方方向：谁是源（输出）谁是目标（输入）
      const srcRaw = drag.fromPort.isOutput ? drag.fromPort : to
      const tgtRaw = drag.fromPort.isOutput ? to : drag.fromPort
      if (srcRaw.isOutput === tgtRaw.isOutput) {
        // 方向相同：直接放弃创建连接
      } else {
        const srcNode = nodes.find((n) => n.id === srcRaw.nodeId)
        const tgtNode = nodes.find((n) => n.id === tgtRaw.nodeId)
        if (srcNode && tgtNode && srcNode.id !== tgtNode.id) {
          // 2. 先做归一化（虚拟口 → 真实口），确保两端方向都有真实口存在
          const src = normalizePortRef(srcNode.type, srcRaw.portId, true)
          const tgt = normalizePortRef(tgtNode.type, tgtRaw.portId, false)
          // 3. 归一化成功后，再做类型匹配（使用 canConnect 支持跨类型连接）
          if (src && tgt && canConnect({ type: src.type, isOutput: true }, { type: tgt.type, isOutput: false })) {
            get().addConnection({
              source: { nodeId: srcRaw.nodeId, portId: src.portId },
              target: { nodeId: tgtRaw.nodeId, portId: tgt.portId },
            })
          }
        }
      }
    }
    set({ drag: { active: false, fromPort: null, cursor: null } })
  },

  runImageGen: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'image' || isBusy(node.data.imageStatus)) return

    // 从 ref 端口读取图生图源节点（可选，遍历所有 ref 连接，取首个有效结果）
    const refConns = state.connections.filter((c) => c.target.nodeId === nodeId && c.target.portId === 'ref')
    let refImageUrl: string | undefined
    if (refConns.length > 0) {
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        if (src.type !== 'image' && src.type !== 'video') continue
        const imgs = (src.data as any)?.imageResults?.filter((r: any) => r.status === 'done')
        if (imgs?.[0]?.url) {
          refImageUrl = imgs[0].url
          break
        }
      }
      if (!refImageUrl) {
        get().updateNodeData(nodeId, { imageStatus: 'error' })
        return
      }
    }

    const localPrompt = (node.data.imagePrompt as string) || ''
    if (!localPrompt.trim()) { get().updateNodeData(nodeId, { imageStatus: 'error' }); return }

    const ratio = (node.data.imageRatio as string) || '16:9'
    const batch = node.data.imageCount ?? 1
    const baseSeed = node.data.imageSeed ?? randomSeed()
    const model = node.data.imageModel ?? 'flux'
    const resolution = node.data.imageResolution ?? '2k'

    // 立即设置 running 状态（UI 反馈），保留已有结果（多批次累积）
    const existingResults = node.data.imageResults ?? []
    get().updateNodeData(nodeId, { imageStatus: 'running' })

    try {
      // 通过后端 API 生成 → 触发 withGeneration 中间件扣减积分
      const res = await generateViaBackend({
        prompt: localPrompt,
        ratio,
        batch,
        seed: baseSeed,
        model,
        resolution,
      })

      const newResults: GenImage[] = res.images.map((img) => ({
        id: uid('img'),
        url: img.url,
        prompt: localPrompt,
        seed: img.seed,
        ratio: ratio as AspectRatio,
        status: 'loading' as ImageStatus,
        createdAt: Date.now(),
      }))

      // 追加到已有结果前面（最新的在最前面）
      const allResults = [...newResults, ...existingResults]
      get().updateNodeData(nodeId, { imageResults: allResults })
      // 刷新右上角积分显示（后端已扣减）
      void useQuotaStore.getState().refreshQuota({ force: true })
    } catch (e) {
      get().updateNodeData(nodeId, { imageStatus: 'error' })
    }
  },

  retryImage: (nodeId, imgId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'image') return
    const results = (node.data.imageResults ?? []).map((r) =>
      r.id === imgId ? { ...r, url: buildRetryUrl(r.url), status: 'loading' as const } : r,
    )
    get().updateNodeData(nodeId, { imageResults: results })
  },

  clearImageResults: (nodeId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'image') return
    if (isBusy(node.data.imageStatus)) return // 生成中不允许清空
    get().updateNodeData(nodeId, { imageResults: [], imageStatus: 'idle' })
  },

  runVideoGen: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'video' || isBusy(node.data.videoStatus)) return

    // 从 ref 端口读取图生视频源节点（可选，遍历所有 ref 连接，取首个有效图片）
    const refConns = state.connections.filter((c) => c.target.nodeId === nodeId && c.target.portId === 'ref')
    let imageUrl: string | undefined
    if (refConns.length > 0) {
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        // 类型校验：只有 image 节点能提供图片作为图生视频依据
        if (src.type !== 'image') continue
        const imgs = (src.data as any)?.imageResults?.filter((r: any) => r.status === 'done')
        if (imgs?.[0]?.url) {
          imageUrl = imgs[0].url
          break
        }
      }
      // 用户连了 ref 但没有任何 image 源产出可用图片 → 阻止静默文生视频
      if (!imageUrl) {
        get().updateNodeData(nodeId, { videoStatus: 'error' })
        return
      }
    }

    const prompt = (node.data.videoPrompt as string) || 'AI 生成视频'
    const isImg2Video = !!imageUrl

    get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: undefined, videoResult: undefined })
    stopPoll(nodeId)

    try {
      const endpoint = isImg2Video ? '/api/video/img2video' : '/api/video/text2video'
      const duration = node.data.videoDuration ?? 5
      const body = isImg2Video ? { imageUrl, prompt } : { prompt, duration }
      const res = await api.post<{ taskId: string; status: string; placeholder?: boolean }>(endpoint, body)

      const result: VideoResult = {
        taskId: res.taskId, status: 'queued', prompt,
        type: isImg2Video ? 'img2video' : 'text2video',
        placeholder: res.placeholder, createdAt: Date.now(),
      }
      get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: res.taskId, videoResult: result })

      const intervalId = setInterval(() => { void get().pollVideoTask(nodeId) }, 3000)
      pollRegistry.set(nodeId, intervalId)
      void get().pollVideoTask(nodeId)
    } catch {
      get().updateNodeData(nodeId, { videoStatus: 'error' })
    }
  },

  pollVideoTask: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'video' || !node.data.videoTaskId) return
    try {
      const res = await api.get<{ status: string; url?: string; prompt: string; placeholder?: boolean }>(
        '/api/video/task/' + node.data.videoTaskId,
      )
      const newStatus = (res.status || 'queued') as GenStatus
      const updated: VideoResult = {
        ...(node.data.videoResult ?? { taskId: node.data.videoTaskId, status: newStatus, prompt: res.prompt, type: 'text2video', createdAt: Date.now() }),
        status: newStatus, url: res.url, placeholder: res.placeholder,
      }
      get().updateNodeData(nodeId, { videoStatus: newStatus, videoResult: updated })
      if (newStatus === 'done' || newStatus === 'error') stopPoll(nodeId)
    } catch { /* silent */ }
  },

  runAudioGen: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'audio' || isBusy(node.data.audioStatus)) return

    // 从 ref 端口读取引用源节点的文本（可选，遍历所有 ref 连接，取首个有效文本）
    const refConns = state.connections.filter((c) => c.target.nodeId === nodeId && c.target.portId === 'ref')
    let refText: string | undefined
    if (refConns.length > 0) {
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        // 类型校验：只有 audio 节点能提供音频文本
        if (src.type !== 'audio') continue
        const t = (src.data as any)?.audioText
        if (t?.trim()) {
          refText = t
          break
        }
      }
    }

    const text = refText || node.data.audioText || ''
    if (!text.trim()) { get().updateNodeData(nodeId, { audioStatus: 'error' }); return }

    get().updateNodeData(nodeId, { audioStatus: 'queued' })
    try {
      const res = await api.post<{ url?: string; placeholder?: boolean; voice?: string }>('/api/audio/tts', {
        text, voice: node.data.audioVoice ?? 'nova',
      })
      const result: AudioResult = {
        url: res.url ?? '', status: 'done', text, voice: res.voice,
        placeholder: res.placeholder,
      }
      get().updateNodeData(nodeId, { audioStatus: 'done', audioResult: result })
    } catch {
      get().updateNodeData(nodeId, { audioStatus: 'error' })
    }
  },

  runScriptGen: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || (node.type as string) !== 'script' || isBusy(node.data.scriptStatus)) return

    const getInput = <T,>(portId: string): T | undefined => {
      const conn = state.connections.find((c) => c.target.nodeId === nodeId && c.target.portId === portId)
      if (!conn) return undefined
      const src = state.nodes.find((n) => n.id === conn.source.nodeId)
      return src?.data as T | undefined
    }

    const text = getInput<{ text?: string }>('text')?.text ?? ''
    if (!text.trim()) { get().updateNodeData(nodeId, { scriptStatus: 'error' }); return }

    get().updateNodeData(nodeId, { scriptStatus: 'queued' })
    try {
      const res = await api.post<{ script?: string; shots?: ScriptShot[]; placeholder?: boolean }>('/api/canvas/script', {
        prompt: text,
      })
      get().updateNodeData(nodeId, {
        scriptStatus: 'done',
        script: res.script ?? '脚本生成完成',
        shots: res.shots ?? [],
      })
    } catch {
      // Fallback: 本地生成简易分镜
      const shots: ScriptShot[] = [
        { id: uid('shot'), index: 1, duration: 3, scene: '开场', shot: '全景', camera: '缓推', dialogue: '', prompt: text.slice(0, 50) },
        { id: uid('shot'), index: 2, duration: 5, scene: '主体', shot: '中景', camera: '固定', dialogue: '', prompt: text.slice(0, 50) },
        { id: uid('shot'), index: 3, duration: 3, scene: '结尾', shot: '特写', camera: '缓拉', dialogue: '', prompt: text.slice(0, 50) },
      ]
      get().updateNodeData(nodeId, {
        scriptStatus: 'done',
        script: '本地分镜（LLM 未配置）',
        shots,
      })
    }
  },

  loadDefaultWorkflow: () => {
    stopAllPolls()
    nodeTypeCounters = { image: 1, video: 1, audio: 1 }
    const imageId = uid('image')
    const videoId = uid('video')
    const audioId = uid('audio')

    const nodes: UCanvasNode[] = [
      { id: imageId, type: 'image', position: { x: 80, y: 150 }, data: { imageResults: [], imageStatus: 'idle', __label: '图片节点 1' } },
      { id: videoId, type: 'video', position: { x: 580, y: 150 }, data: { videoStatus: 'idle', videoPrompt: '', videoModel: 'seedance', videoResolution: '1080p', videoDuration: '5s', videoRatio: '16:9', __label: '视频节点 1' } },
      { id: audioId, type: 'audio', position: { x: 580, y: 500 }, data: { audioText: '', audioVoice: 'nova', audioStatus: 'idle', __label: '音频节点 1' } },
    ]

    const connections: UConnection[] = [
      { id: uid('uconn'), source: { nodeId: imageId, portId: 'out' }, target: { nodeId: videoId, portId: 'ref' } },
    ]

    set({ nodes, connections, viewport: { x: 0, y: 0, zoom: 1 }, selectedNodeId: null })
  },

  clearCanvas: () => {
    stopAllPolls()
    nodeTypeCounters = {}
    set({ nodes: [], connections: [], selectedNodeId: null })
  },

  saveToStorage: () => {
    const { nodes, connections, viewport } = get()
    try {
      const payload = {
        nodes: nodes.map((n) => ({
          ...n,
          // 清理临时状态字段
          data: Object.fromEntries(
            Object.entries(n.data).filter(([k]) =>
              !['imageStatus', 'videoStatus', 'audioStatus', 'videoTaskId', '__label'].includes(k),
            ),
          ),
        })),
        connections,
        viewport,
        counters: nodeTypeCounters,
        savedAt: Date.now(),
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch { /* 静默保存失败 */ }
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const payload = JSON.parse(raw)
      if (!payload.nodes || !Array.isArray(payload.nodes)) return false

      // 恢复节点状态为 idle
      const nodes = payload.nodes.map((n: any) => {
        const statusKey = `${n.type}Status`
        return {
          ...n,
          data: { ...n.data, [statusKey]: 'idle' },
        }
      })

      nodeTypeCounters = payload.counters ?? {}
      set({
        nodes,
        connections: payload.connections ?? [],
        viewport: payload.viewport ?? { x: 0, y: 0, zoom: 1 },
        selectedNodeId: null,
      })
      return true
    } catch {
      return false
    }
  },
}))

// 自动持久化：debounce 保存
const STORAGE_KEY = 'ai_canvas_state_v2'
let saveTimer: ReturnType<typeof setTimeout> | null = null

useUnifiedCanvasStore.subscribe((state, prevState) => {
  if (state.nodes !== prevState.nodes || state.connections !== prevState.connections || state.viewport !== prevState.viewport) {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      useUnifiedCanvasStore.getState().saveToStorage()
    }, 500)
  }
})

// 开发模式：暴露到 window 便于浏览器自动化测试；生产构建不会泄露（仅 window 对象存在时执行）
if (typeof window !== 'undefined') {
  ;(window as any).__ucs = useUnifiedCanvasStore
}
