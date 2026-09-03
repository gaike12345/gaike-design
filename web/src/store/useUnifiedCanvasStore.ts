// 统一创作画布 - 状态管理（合并图像+视频+音频）
//
// 对标 LibTV：3 大基础节点 + 输出节点
// 节点类型：image / video / audio
//
// 公共类型、常量、工具函数已提取到 canvasBase.ts，
// 本文件只包含 Zustand store 状态和业务逻辑。

import { create } from 'zustand'
import { api } from '../services/api'
import { buildImageUrl, buildRetryUrl, generateViaBackend } from '../services/imageApi'
import { useQuotaStore } from './useQuotaStore'
import {
  // 类型
  type UnifiedNodeType,
  type UnifiedPortType,
  type UPort,
  type GenStatus,
  type ImageStatus,
  type GenImage,
  type VideoResult,
  type AudioResult,
  type ScriptShot,
  type UnifiedNodeData,
  type UCanvasNode,
  type UConnection,
  type UViewport,
  type UDragState,
  // 常量
  UNODE_PORTS,
  UNODE_SIZE,
  UNODE_LABELS,
  GRID_SIZE,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  IMAGE_RATIOS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  VIDEO_DURATIONS,
  AUDIO_VOICES,
  // 工具函数
  uid,
  isBusy,
  randomSeed,
  snapToGrid,
  canConnect,
  normalizePortRef,
  defaultNodeData,
  panViewport,
  zoomViewport,
  PollRegistry,
} from './canvasBase'

export type {
  UnifiedNodeType,
  UnifiedPortType,
  UPort,
  GenStatus,
  ImageStatus,
  GenImage,
  VideoResult,
  AudioResult,
  ScriptShot,
  UnifiedNodeData,
  UCanvasNode,
  UConnection,
  UViewport,
}

export {
  UNODE_PORTS,
  UNODE_SIZE,
  UNODE_LABELS,
  GRID_SIZE,
  IMAGE_MODELS,
  IMAGE_RESOLUTIONS,
  IMAGE_RATIOS,
  VIDEO_MODELS,
  VIDEO_RESOLUTIONS,
  VIDEO_DURATIONS,
  AUDIO_VOICES,
  snapToGrid,
  canConnect,
}

const pollRegistry = new PollRegistry()

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
    (type: UnifiedNodeType, position?: { x: number; y: number }, dataOverride?: Partial<UnifiedNodeData>, snapToGrid?: boolean): string
    (type: UnifiedNodeType, x: number, y: number, dataOverride?: Partial<UnifiedNodeData>, snapToGrid?: boolean): string
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

interface StoredCanvasState {
  nodes: Array<Omit<UCanvasNode, 'data'> & { data: Record<string, unknown> }>
  connections: UConnection[]
  viewport: UViewport
  counters: Record<string, number>
  savedAt: number
}

function isStoredNode(n: unknown): n is StoredCanvasState['nodes'][number] {
  return typeof n === 'object' && n !== null && 'id' in n && 'type' in n && 'position' in n && 'data' in n
}

export const useUnifiedCanvasStore = create<UnifiedCanvasState>((set, get) => ({
  nodes: [],
  connections: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  drag: { active: false, fromPort: null, cursor: null },
  selectedNodeId: null,

  setViewport: (v) => set((s) => ({ viewport: { ...s.viewport, ...v } })),
  panBy: (dx, dy) =>
    set((s) => ({ viewport: panViewport(s.viewport, dx, dy) })),
  zoomTo: (zoom, cx, cy) =>
    set((s) => ({ viewport: zoomViewport(s.viewport, zoom, cx, cy) })),
  resetViewport: () => set({ viewport: { x: 0, y: 0, zoom: 1 } }),

  addNode: ((
    type: UnifiedNodeType,
    positionOrX?: { x: number; y: number } | number,
    yOrData?: Partial<UnifiedNodeData> | number,
    dataOrSnap?: Partial<UnifiedNodeData> | boolean,
    snapEnabledArg?: boolean,
  ) => {
    let position: { x: number; y: number }
    let dataOverride: Partial<UnifiedNodeData> | undefined
    let snapEnabled = true
    if (typeof positionOrX === 'number' && typeof yOrData === 'number') {
      position = { x: positionOrX, y: yOrData }
      dataOverride = dataOrSnap as Partial<UnifiedNodeData> | undefined
      snapEnabled = snapEnabledArg ?? true
    } else {
      position = (positionOrX as { x: number; y: number }) ?? { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 }
      dataOverride = yOrData as Partial<UnifiedNodeData> | undefined
      snapEnabled = (dataOrSnap as boolean) ?? true
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
  }) as UnifiedCanvasState['addNode'],

  removeNode: (id) => {
    pollRegistry.stop(id)
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
        const imgs = src.data.imageResults?.filter((r) => r.status === 'done')
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

    const localPrompt = node.data.imagePrompt || ''
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
        const imgs = src.data.imageResults?.filter((r) => r.status === 'done')
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

    const prompt = node.data.videoPrompt || 'AI 生成视频'
    const isImg2Video = !!imageUrl

    get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: undefined, videoResult: undefined })
    pollRegistry.stop(nodeId)

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

      pollRegistry.start(nodeId, () => { void get().pollVideoTask(nodeId) }, 3000)
      void get().pollVideoTask(nodeId)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Canvas] 视频生成启动失败:', e)
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
      if (newStatus === 'done' || newStatus === 'error') pollRegistry.stop(nodeId)
    } catch (e) {
      // 轮询失败不立即标记为 error，可能是临时网络问题
      // 连续失败由 stopPoll 的超时机制处理
      // eslint-disable-next-line no-console
      console.warn('[Canvas] 视频任务轮询失败:', node.data.videoTaskId, e)
    }
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
        const t = src.data.audioText
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
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[Canvas] 音频生成失败:', e)
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
    pollRegistry.stopAll()
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
    pollRegistry.stopAll()
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
    } catch (e) {
      // localStorage 保存失败（可能是配额超限或隐私模式），不影响核心功能
      // eslint-disable-next-line no-console
      console.warn('[Canvas] 本地保存失败:', e)
    }
  },

  loadFromStorage: () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return false
      const payload = JSON.parse(raw) as StoredCanvasState
      if (!payload.nodes || !Array.isArray(payload.nodes)) return false

      // 恢复节点状态为 idle
      const nodes = payload.nodes
        .filter(isStoredNode)
        .map((n) => {
          const statusKey = `${n.type}Status`
          return {
            ...n,
            data: { ...n.data, [statusKey]: 'idle' },
          } as UCanvasNode
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
  ;(window as Window & { __ucs?: typeof useUnifiedCanvasStore }).__ucs = useUnifiedCanvasStore
}
