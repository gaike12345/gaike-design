// 无限画布节点式工作流 - 状态管理
//
// 参考 Liblib / ComfyUI 的节点式图像创作工作流
// 核心数据：节点（Node）+ 连接（Connection）+ 视口（Viewport）
//
// 节点类型：
//   prompt     - 正向提示词（输出: prompt）
//   negative   - 负向提示词（输出: negative）
//   model      - 模型选择（输出: model）
//   params     - 参数（输出: params）
//   refImage   - 参考图（输出: refImage）
//   generate   - 生成执行（输入: prompt/negative/model/params/refImage；输出: images）
//   output     - 输出展示（输入: images）
//
// 数据流：prompt/negative/model/params/refImage -> generate -> output

import { create } from 'zustand'
import type { AspectRatio, GenStatus, GenImage } from './useStudioStore'
import { buildRetryUrl, generateViaBackend } from '../services/imageApi'

export type NodeType =
  | 'prompt'
  | 'negative'
  | 'model'
  | 'params'
  | 'refImage'
  | 'generate'
  | 'output'

export type PortType =
  | 'prompt'
  | 'negative'
  | 'model'
  | 'params'
  | 'refImage'
  | 'images'

export interface Port {
  id: string
  label: string
  type: PortType
}

export interface NodeData {
  prompt?: string
  negative?: string
  modelId?: string
  ratio?: AspectRatio
  steps?: number
  cfg?: number
  seed?: number | null
  batch?: number
  refImages?: string[]
  status?: GenStatus
  taskId?: string
  results?: GenImage[]
  images?: GenImage[]
  errorMessage?: string
}

export interface CanvasNode {
  id: string
  type: NodeType
  position: { x: number; y: number }
  data: NodeData
  selected?: boolean
}

export interface Connection {
  id: string
  source: { nodeId: string; portId: string }
  target: { nodeId: string; portId: string }
}

export interface Viewport {
  x: number
  y: number
  zoom: number
}

interface DragState {
  active: boolean
  nodeId: string | null
  fromPort: { nodeId: string; portId: string; type: PortType; isOutput: boolean } | null
  cursor: { x: number; y: number } | null
}

interface CanvasState {
  nodes: CanvasNode[]
  connections: Connection[]
  viewport: Viewport
  drag: DragState
  selectedNodeId: string | null

  setViewport: (v: Partial<Viewport>) => void
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number, cx: number, cy: number) => void
  resetViewport: () => void

  addNode: (type: NodeType, position?: { x: number; y: number }) => string
  removeNode: (id: string) => void
  updateNodeData: (id: string, patch: Partial<NodeData>) => void
  moveNode: (id: string, x: number, y: number) => void
  selectNode: (id: string | null) => void

  addConnection: (c: Omit<Connection, 'id'>) => void
  removeConnection: (id: string) => void
  removeConnectionByPort: (nodeId: string, portId: string) => void

  startDrag: (from: NonNullable<DragState['fromPort']>) => void
  moveDrag: (cursor: { x: number; y: number }) => void
  endDrag: (to: { nodeId: string; portId: string; type: PortType; isOutput: boolean } | null) => void

  runGenerate: (nodeId: string) => void
  retryImage: (nodeId: string, imgId: string) => void

  loadDefaultWorkflow: () => void
  clearCanvas: () => void
}

export const NODE_PORTS: Record<NodeType, { inputs: Port[]; outputs: Port[] }> = {
  prompt: {
    inputs: [],
    outputs: [{ id: 'out', label: '正向提示词', type: 'prompt' }],
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
  refImage: {
    inputs: [],
    outputs: [{ id: 'out', label: '参考图', type: 'refImage' }],
  },
  generate: {
    inputs: [
      { id: 'prompt', label: '正向提示词', type: 'prompt' },
      { id: 'negative', label: '负向提示词', type: 'negative' },
      { id: 'model', label: '模型', type: 'model' },
      { id: 'params', label: '参数', type: 'params' },
      { id: 'refImage', label: '参考图', type: 'refImage' },
    ],
    outputs: [{ id: 'images', label: '生成图', type: 'images' }],
  },
  output: {
    inputs: [{ id: 'images', label: '生成图', type: 'images' }],
    outputs: [],
  },
}

export const NODE_SIZE: Record<NodeType, { width: number; height: number }> = {
  prompt: { width: 280, height: 220 },
  negative: { width: 280, height: 160 },
  model: { width: 280, height: 220 },
  params: { width: 280, height: 320 },
  refImage: { width: 280, height: 200 },
  generate: { width: 320, height: 200 },
  output: { width: 360, height: 320 },
}

function defaultNodeData(type: NodeType): NodeData {
  switch (type) {
    case 'prompt':
      return { prompt: '' }
    case 'negative':
      return { negative: 'lowres, bad anatomy, blurry, watermark' }
    case 'model':
      return { modelId: 'flux' }
    case 'params':
      return { ratio: '1:1', steps: 28, cfg: 7, seed: null, batch: 1 }
    case 'refImage':
      return { refImages: [] }
    case 'generate':
      return { status: 'idle', taskId: undefined, results: [] }
    case 'output':
      return { images: [] }
  }
}

function uid(prefix: string) {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7)
}

function isBusy(s?: GenStatus) {
  return s === 'queued' || s === 'running'
}

function randomSeed() {
  return Math.floor(Math.random() * 1e9)
}

function canConnect(
  from: { type: PortType; isOutput: boolean },
  to: { type: PortType; isOutput: boolean },
): boolean {
  if (from.isOutput === to.isOutput) return false
  const outType = from.isOutput ? from.type : to.type
  const inType = from.isOutput ? to.type : from.type
  return outType === inType
}

export const useCanvasStore = create<CanvasState>((set, get) => ({
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  drag: { active: false, nodeId: null, fromPort: null, cursor: null },
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
    const node: CanvasNode = {
      id,
      type,
      position: position ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: defaultNodeData(type),
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  },

  removeNode: (id) =>
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      connections: s.connections.filter(
        (c) => c.source.nodeId !== id && c.target.nodeId !== id,
      ),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    })),

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
      return { connections: [...filtered, { ...c, id: uid('conn') }] }
    }),

  removeConnection: (id) =>
    set((s) => ({ connections: s.connections.filter((c) => c.id !== id) })),

  removeConnectionByPort: (nodeId, portId) =>
    set((s) => ({
      connections: s.connections.filter(
        (c) =>
          !(
            (c.source.nodeId === nodeId && c.source.portId === portId) ||
            (c.target.nodeId === nodeId && c.target.portId === portId)
          ),
      ),
    })),

  startDrag: (from) => set({ drag: { active: true, nodeId: null, fromPort: from, cursor: null } }),
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
    set({ drag: { active: false, nodeId: null, fromPort: null, cursor: null } })
  },

  runGenerate: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'generate') return
    if (isBusy(node.data.status)) return

    const getInput = <T,>(portId: string): T | undefined => {
      const conn = state.connections.find(
        (c) => c.target.nodeId === nodeId && c.target.portId === portId,
      )
      if (!conn) return undefined
      const sourceNode = state.nodes.find((n) => n.id === conn.source.nodeId)
      return sourceNode?.data as T | undefined
    }

    const prompt = getInput<{ prompt?: string }>('prompt')?.prompt ?? ''
    const negative = getInput<{ negative?: string }>('negative')?.negative ?? ''
    const params = getInput<{
      ratio?: AspectRatio
      steps?: number
      cfg?: number
      seed?: number | null
      batch?: number
    }>('params')
    const refImages = getInput<{ refImages?: string[] }>('refImage')?.refImages ?? []

    if (!prompt.trim()) {
      get().updateNodeData(nodeId, { status: 'error' })
      return
    }

    const ratio = params?.ratio ?? '1:1'
    const batch = params?.batch ?? 2
    const baseSeed = params?.seed ?? randomSeed()

    const taskId = 't_' + Date.now()
    get().updateNodeData(nodeId, { status: 'running', taskId, results: [] })

    try {
      // 通过后端代理生成 — 经过审核+积分扣减
      const res = await generateViaBackend({
        prompt,
        ratio,
        batch,
        seed: baseSeed,
        model: 'general-pro',
        resolution: '2k',
      })

      const results: GenImage[] = res.images.map((img, i) => ({
        id: taskId + '_' + i,
        url: img.url,
        prompt,
        seed: img.seed,
        ratio,
        status: 'loading',
        createdAt: Date.now(),
      }))

      get().updateNodeData(nodeId, { status: 'running', taskId, results })

      const outputConn = state.connections.find(
        (c) => c.source.nodeId === nodeId && c.source.portId === 'images',
      )
      if (outputConn) {
        get().updateNodeData(outputConn.target.nodeId, { images: results })
      }
    } catch (e: any) {
      get().updateNodeData(nodeId, { status: 'error', errorMessage: e?.message || '生成失败' })
    }
  },

  retryImage: (nodeId, imgId) => {
    const node = get().nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'generate') return
    const results = node.data.results ?? []
    const updated = results.map((r) =>
      r.id === imgId
        ? { ...r, url: buildRetryUrl(r.url), status: 'loading' as const }
        : r,
    )
    get().updateNodeData(nodeId, { results: updated })

    const state = get()
    const outputConn = state.connections.find(
      (c) => c.source.nodeId === nodeId && c.source.portId === 'images',
    )
    if (outputConn) {
      get().updateNodeData(outputConn.target.nodeId, { images: updated })
    }
  },

  loadDefaultWorkflow: () => {
    const promptId = uid('prompt')
    const negativeId = uid('negative')
    const modelId = uid('model')
    const paramsId = uid('params')
    const generateId = uid('generate')
    const outputId = uid('output')

    const nodes: CanvasNode[] = [
      {
        id: promptId,
        type: 'prompt',
        position: { x: 80, y: 80 },
        data: { prompt: '赛博朋克少女机甲特写，霓虹灯，雨夜，电影质感，8k' },
      },
      {
        id: negativeId,
        type: 'negative',
        position: { x: 80, y: 340 },
        data: { negative: 'lowres, bad anatomy, blurry, watermark' },
      },
      {
        id: modelId,
        type: 'model',
        position: { x: 80, y: 540 },
        data: { modelId: 'flux' },
      },
      {
        id: paramsId,
        type: 'params',
        position: { x: 80, y: 800 },
        data: { ratio: '1:1', steps: 28, cfg: 7, seed: null, batch: 1 },
      },
      {
        id: generateId,
        type: 'generate',
        position: { x: 480, y: 300 },
        data: { status: 'idle', results: [] },
      },
      {
        id: outputId,
        type: 'output',
        position: { x: 900, y: 300 },
        data: { images: [] },
      },
    ]

    const connections: Connection[] = [
      {
        id: uid('conn'),
        source: { nodeId: promptId, portId: 'out' },
        target: { nodeId: generateId, portId: 'prompt' },
      },
      {
        id: uid('conn'),
        source: { nodeId: negativeId, portId: 'out' },
        target: { nodeId: generateId, portId: 'negative' },
      },
      {
        id: uid('conn'),
        source: { nodeId: modelId, portId: 'out' },
        target: { nodeId: generateId, portId: 'model' },
      },
      {
        id: uid('conn'),
        source: { nodeId: paramsId, portId: 'out' },
        target: { nodeId: generateId, portId: 'params' },
      },
      {
        id: uid('conn'),
        source: { nodeId: generateId, portId: 'images' },
        target: { nodeId: outputId, portId: 'images' },
      },
    ]

    set({ nodes, connections, viewport: { x: 0, y: 0, zoom: 1 }, selectedNodeId: null })
  },

  clearCanvas: () => set({ nodes: [], connections: [], selectedNodeId: null }),
}))

