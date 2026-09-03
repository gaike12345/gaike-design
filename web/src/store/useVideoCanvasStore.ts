// 视频画布节点式工作流 - 状态管理
//
// 复用画布交互逻辑（视口、平移、缩放、连线），视频专用节点和异步任务流
// 节点类型：
//   script    - 脚本/提示词（输出: script）
//   negative  - 负向提示词（输出: negative）
//   model     - 视频模型（输出: model）
//   params    - 参数：时长/分辨率/帧率（输出: params）
//   startFrame- 起始帧图片（输出: image）
//   generate  - 视频生成（输入: script/negative/model/params/image；输出: video）
//   output    - 视频输出（输入: video）
//
// 异步任务流：generate 节点提交任务 -> 轮询状态 -> 完成后推送到 output

import { create } from 'zustand'
import { api } from '../services/api'

export type VideoNodeType =
  | 'script'
  | 'negative'
  | 'model'
  | 'params'
  | 'startFrame'
  | 'generate'
  | 'output'

export type VideoPortType =
  | 'script'
  | 'negative'
  | 'model'
  | 'params'
  | 'image'
  | 'video'

export interface VPort {
  id: string
  label: string
  type: VideoPortType
}

export type VideoTaskStatus = 'idle' | 'queued' | 'processing' | 'done' | 'error'

export interface VideoResult {
  taskId: string
  url?: string
  status: VideoTaskStatus
  prompt: string
  type: 'text2video' | 'img2video'
  placeholder?: boolean
  createdAt: number
}

export interface VideoNodeData {
  // script
  script?: string
  // negative
  negative?: string
  // model
  modelId?: string
  // params
  duration?: number
  resolution?: '720p' | '1080p'
  fps?: number
  motionStrength?: number
  // startFrame
  imageUrl?: string
  // generate
  status?: VideoTaskStatus
  taskId?: string
  result?: VideoResult
  // output
  video?: VideoResult
}

export interface VCanvasNode {
  id: string
  type: VideoNodeType
  position: { x: number; y: number }
  data: VideoNodeData
}

export interface VConnection {
  id: string
  source: { nodeId: string; portId: string }
  target: { nodeId: string; portId: string }
}

export interface VViewport {
  x: number
  y: number
  zoom: number
}

interface VDragState {
  active: boolean
  fromPort: { nodeId: string; portId: string; type: VideoPortType; isOutput: boolean } | null
  cursor: { x: number; y: number } | null
}

// 轮询注册表：nodeId -> intervalId
const pollRegistry = new Map<string, ReturnType<typeof setInterval>>()

interface VideoCanvasState {
  nodes: VCanvasNode[]
  connections: VConnection[]
  viewport: VViewport
  drag: VDragState
  selectedNodeId: string | null

  setViewport: (v: Partial<VViewport>) => void
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number, cx: number, cy: number) => void
  resetViewport: () => void

  addNode: (type: VideoNodeType, position?: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeData: (id: string, patch: Partial<VideoNodeData>) => void
  moveNode: (id: string, x: number, y: number) => void
  selectNode: (id: string | null) => void

  addConnection: (c: Omit<VConnection, 'id'>) => void
  removeConnection: (id: string) => void

  startDrag: (from: NonNullable<VDragState['fromPort']>) => void
  moveDrag: (cursor: { x: number; y: number }) => void
  endDrag: (to: { nodeId: string; portId: string; type: VideoPortType; isOutput: boolean } | null) => void

  runGenerate: (nodeId: string) => Promise<void>
  pollTask: (nodeId: string) => Promise<void>

  loadDefaultWorkflow: () => void
  clearCanvas: () => void
}

export const VNODE_PORTS: Record<VideoNodeType, { inputs: VPort[]; outputs: VPort[] }> = {
  script: {
    inputs: [],
    outputs: [{ id: 'out', label: '脚本', type: 'script' }],
  },
  negative: {
    inputs: [],
    outputs: [{ id: 'out', label: '负向提示词', type: 'negative' }],
  },
  model: {
    inputs: [],
    outputs: [{ id: 'out', label: '模型', type: 'model' }],
  },
  params: {
    inputs: [],
    outputs: [{ id: 'out', label: '参数', type: 'params' }],
  },
  startFrame: {
    inputs: [],
    outputs: [{ id: 'out', label: '起始帧', type: 'image' }],
  },
  generate: {
    inputs: [
      { id: 'script', label: '脚本', type: 'script' },
      { id: 'negative', label: '负向提示词', type: 'negative' },
      { id: 'model', label: '模型', type: 'model' },
      { id: 'params', label: '参数', type: 'params' },
      { id: 'image', label: '起始帧', type: 'image' },
    ],
    outputs: [{ id: 'video', label: '视频', type: 'video' }],
  },
  output: {
    inputs: [{ id: 'video', label: '视频', type: 'video' }],
    outputs: [],
  },
}

export const VNODE_SIZE: Record<VideoNodeType, { width: number; height: number }> = {
  script: { width: 300, height: 220 },
  negative: { width: 280, height: 160 },
  model: { width: 280, height: 240 },
  params: { width: 280, height: 300 },
  startFrame: { width: 280, height: 220 },
  generate: { width: 320, height: 200 },
  output: { width: 400, height: 340 },
}

export const VIDEO_MODELS = [
  { id: 'seedance', name: 'Seedance Pro', tag: '字节', desc: '文生视频/图生视频，国内合规' },
]

function defaultNodeData(type: VideoNodeType): VideoNodeData {
  switch (type) {
    case 'script':
      return { script: '' }
    case 'negative':
      return { negative: 'low quality, blurry, distorted, watermark' }
    case 'model':
      return { modelId: 'seedance' }
    case 'params':
      return { duration: 5, resolution: '1080p', fps: 30, motionStrength: 50 }
    case 'startFrame':
      return { imageUrl: '' }
    case 'generate':
      return { status: 'idle' }
    case 'output':
      return {}
  }
}

function uid(prefix: string) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

function canConnect(
  from: { type: VideoPortType; isOutput: boolean },
  to: { type: VideoPortType; isOutput: boolean },
): boolean {
  if (from.isOutput === to.isOutput) return false
  const outType = from.isOutput ? from.type : to.type
  const inType = from.isOutput ? to.type : from.type
  return outType === inType
}

// 停止某节点的轮询
function stopPoll(nodeId: string) {
  const id = pollRegistry.get(nodeId)
  if (id) {
    clearInterval(id)
    pollRegistry.delete(nodeId)
  }
}

// 停止所有轮询
function stopAllPolls() {
  pollRegistry.forEach((id) => clearInterval(id))
  pollRegistry.clear()
}

export const useVideoCanvasStore = create<VideoCanvasState>((set, get) => ({
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
      const newX = cx - ((cx - x) * z) / oldZoom
      const newY = cy - ((cy - y) * z) / oldZoom
      return { viewport: { x: newX, y: newY, zoom: z } }
    }),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),

  addNode: (type, position) => {
    const id = uid(type)
    const node: VCanvasNode = {
      id,
      type,
      position: position ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaultNodeData(type),
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  },

  removeNode: (id) => {
    stopPoll(id)
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      connections: s.connections.filter(
        (c) => c.source.nodeId !== id && c.target.nodeId !== id,
      ),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
  },

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)),
    })),

  moveNode: (id, x, y) =>
    set((s) => ({
      nodes: s.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
    })),

  selectNode: (id) => set({ selectedNodeId: id }),

  addConnection: (c) =>
    set((s) => {
      const filtered = s.connections.filter(
        (existing) =>
          !(existing.target.nodeId === c.target.nodeId && existing.target.portId === c.target.portId),
      )
      if (
        filtered.some(
          (existing) =>
            existing.source.nodeId === c.source.nodeId &&
            existing.source.portId === c.source.portId &&
            existing.target.nodeId === c.target.nodeId &&
            existing.target.portId === c.target.portId,
        )
      )
        return s
      if (c.source.nodeId === c.target.nodeId) return s
      return { connections: [...filtered, { ...c, id: uid('vconn') }] }
    }),

  removeConnection: (id) =>
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),

  startDrag: (from) => set({ drag: { active: true, fromPort: from, cursor: null } }),
  moveDrag: (cursor) => set((s) => ({ drag: { ...s.drag, cursor } })),
  endDrag: (to) => {
    const { drag } = get()
    if (drag.fromPort && to && canConnect(drag.fromPort, to)) {
      const source = drag.fromPort.isOutput ? drag.fromPort : to
      const target = drag.fromPort.isOutput ? to : drag.fromPort
      get().addConnection({
        source: { nodeId: source.nodeId, portId: source.portId },
        target: { nodeId: target.nodeId, portId: target.portId },
      })
    }
    set({ drag: { active: false, fromPort: null, cursor: null } })
  },

  runGenerate: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'generate') return
    const currentStatus = node.data.status
    if (currentStatus === 'queued' || currentStatus === 'processing') return

    // 从连接收集输入
    const getInput = <T,>(portId: string): T | undefined => {
      const conn = state.connections.find(
        (c) => c.target.nodeId === nodeId && c.target.portId === portId,
      )
      if (!conn) return undefined
      const sourceNode = state.nodes.find((n) => n.id === conn.source.nodeId)
      return sourceNode?.data as T | undefined
    }

    const script = getInput<{ script?: string }>('script')?.script ?? ''
    const negative = getInput<{ negative?: string }>('negative')?.negative ?? ''
    const params = getInput<{
      duration?: number
      resolution?: string
      fps?: number
      motionStrength?: number
    }>('params')
    const startFrame = getInput<{ imageUrl?: string }>('image')?.imageUrl

    if (!script.trim() && !startFrame?.trim()) {
      get().updateNodeData(nodeId, { status: 'error' })
      return
    }

    get().updateNodeData(nodeId, { status: 'queued', taskId: undefined, result: undefined })
    stopPoll(nodeId)

    try {
      const isImg2Video = !!startFrame?.trim()
      const endpoint = isImg2Video ? '/api/video/img2video' : '/api/video/text2video'
      const body = isImg2Video
        ? { imageUrl: startFrame, prompt: script }
        : { prompt: script, duration: params?.duration ?? 5 }

      const res = await api.post<{ taskId: string; status: string; placeholder?: boolean }>(
        endpoint,
        body,
      )

      const result: VideoResult = {
        taskId: res.taskId,
        status: 'queued',
        prompt: script,
        type: isImg2Video ? 'img2video' : 'text2video',
        placeholder: res.placeholder,
        createdAt: Date.now(),
      }

      get().updateNodeData(nodeId, { status: 'queued', taskId: res.taskId, result })

      // 启动轮询
      const intervalId = setInterval(() => {
        void get().pollTask(nodeId)
      }, 3000)
      pollRegistry.set(nodeId, intervalId)

      // 立即轮询一次
      void get().pollTask(nodeId)
    } catch (e) {
      get().updateNodeData(nodeId, { status: 'error' })
    }
  },

  pollTask: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'generate' || !node.data.taskId) return

    try {
      const res = await api.get<{
        status: string
        url?: string
        prompt: string
        placeholder?: boolean
      }>(`/api/video/task/${node.data.taskId}`)

      const newStatus = (res.status || 'queued') as VideoTaskStatus
      const updatedResult: VideoResult = {
        ...(node.data.result ?? {
          taskId: node.data.taskId,
          status: newStatus,
          prompt: res.prompt || '',
          type: 'text2video',
          createdAt: Date.now(),
        }),
        status: newStatus,
        url: res.url,
        placeholder: res.placeholder,
      }

      get().updateNodeData(nodeId, { status: newStatus, result: updatedResult })

      // 同步到 output 节点
      const outputConn = state.connections.find(
        (c) => c.source.nodeId === nodeId && c.source.portId === 'video',
      )
      if (outputConn) {
        get().updateNodeData(outputConn.target.nodeId, { video: updatedResult })
      }

      // 完成或失败时停止轮询
      if (newStatus === 'done' || newStatus === 'error') {
        stopPoll(nodeId)
      }
    } catch {
      // 轮询失败静默忽略
    }
  },

  loadDefaultWorkflow: () => {
    stopAllPolls()
    const scriptId = uid('script')
    const negativeId = uid('negative')
    const modelId = uid('model')
    const paramsId = uid('params')
    const generateId = uid('generate')
    const outputId = uid('output')

    const nodes: VCanvasNode[] = [
      {
        id: scriptId,
        type: 'script',
        position: { x: 80, y: 80 },
        data: { script: '赛博朋克城市夜景，霓虹灯闪烁，镜头缓缓推进，雨夜街道，电影质感' },
      },
      {
        id: negativeId,
        type: 'negative',
        position: { x: 80, y: 340 },
        data: { negative: 'low quality, blurry, distorted, watermark' },
      },
      {
        id: modelId,
        type: 'model',
        position: { x: 80, y: 540 },
        data: { modelId: 'seedance' },
      },
      {
        id: paramsId,
        type: 'params',
        position: { x: 80, y: 820 },
        data: { duration: 5, resolution: '1080p', fps: 30, motionStrength: 50 },
      },
      {
        id: generateId,
        type: 'generate',
        position: { x: 500, y: 300 },
        data: { status: 'idle' },
      },
      {
        id: outputId,
        type: 'output',
        position: { x: 920, y: 300 },
        data: {},
      },
    ]

    const connections: VConnection[] = [
      { id: uid('vconn'), source: { nodeId: scriptId, portId: 'out' }, target: { nodeId: generateId, portId: 'script' } },
      { id: uid('vconn'), source: { nodeId: negativeId, portId: 'out' }, target: { nodeId: generateId, portId: 'negative' } },
      { id: uid('vconn'), source: { nodeId: modelId, portId: 'out' }, target: { nodeId: generateId, portId: 'model' } },
      { id: uid('vconn'), source: { nodeId: paramsId, portId: 'out' }, target: { nodeId: generateId, portId: 'params' } },
      { id: uid('vconn'), source: { nodeId: generateId, portId: 'video' }, target: { nodeId: outputId, portId: 'video' } },
    ]

    set({ nodes, connections, viewport: { x: 0, y: 0, zoom: 1 }, selectedNodeId: null })
  },

  clearCanvas: () => {
    stopAllPolls()
    set({ nodes: [], connections: [], selectedNodeId: null })
  },
}))
