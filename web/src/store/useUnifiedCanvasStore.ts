// 统一创作画布 - 状态管理（合并图像+视频+音频）
//
// 对标 LibTV：3 大基础节点 + 输出节点
// 节点类型：image / video / audio
//
// 公共类型、常量、工具函数已提取到 canvasBase.ts，
// 本文件只包含 Zustand store 状态和业务逻辑。

import { create } from 'zustand'
import { api, uploadFile } from '../services/api'
import logger from '../utils/logger'
import { downloadAndCache } from '../services/mediaCache'
import { buildRetryUrl, generateViaBackend, img2imgViaBackend } from '../services/imageApi'
import { getImageModel, validateRatio, validateResolution } from '../config/imageModels'
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
import { errMsg } from '../lib/utils'

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
  AUDIO_VOICES,
  snapToGrid,
  canConnect,
}

const pollRegistry = new PollRegistry()

// ==================== 方案 C：拖入文件本地预览 ====================
/**
 * 客户端图片压缩：大图缩到 maxSize 内 + 转 JPEG quality 0.85
 * 与 UnifiedCanvas.tsx 中的 compressImage 保持一致逻辑
 * 用于拖入图片时立即上传前压缩（34MB PNG → ~500KB JPEG）
 */
async function compressImageForUpload(file: File, maxSize = 1920, quality = 0.85): Promise<File> {
  if (file.size < 1 * 1024 * 1024) return file
  const isPng = file.type === 'image/png'
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width > maxSize || height > maxSize) {
        const ratio = Math.min(maxSize / width, maxSize / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const compressed = new File(
            [blob],
            file.name.replace(/\.[^.]+$/, isPng ? '.png' : '.jpg'),
            { type: isPng ? 'image/png' : 'image/jpeg' },
          )
          resolve(compressed)
        },
        isPng ? 'image/png' : 'image/jpeg',
        quality,
      )
    }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file) }
    img.src = url
  })
}

// ==================== 图片生成并发队列 ====================
// Pollinations sk_ 密钥无速率限制，支持高并发
// 队列系统限制最多同时生成 10 个节点的图片，其余排队等待
// 任务完成条件：该节点的所有图片都加载完成（成功或失败）
const MAX_CONCURRENT_IMAGE_GEN = 10

interface ImageGenQueueItem {
  nodeId: string
  resolve: () => void
}

class ImageGenQueue {
  private queue: ImageGenQueueItem[] = []
  private active = new Set<string>() // 正在生成中的 nodeId

  /**
   * 请求生成权限。返回 Promise，在获得执行权时 resolve
   * 调用方负责在图片全部加载完成后调用 complete()
   */
  acquire(nodeId: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.active.size < MAX_CONCURRENT_IMAGE_GEN) {
        this.active.add(nodeId)
        resolve()
      } else {
        this.queue.push({ nodeId, resolve })
      }
    })
  }

  /** 标记某个节点的生成任务完成（所有图片已加载），启动下一个排队的任务 */
  complete(nodeId: string): void {
    this.active.delete(nodeId)
    this.processNext()
  }

  private processNext(): void {
    while (this.active.size < MAX_CONCURRENT_IMAGE_GEN && this.queue.length > 0) {
      const next = this.queue.shift()!
      this.active.add(next.nodeId)
      next.resolve()
    }
  }

  /** 取消某个节点的排队 */
  cancel(nodeId: string): void {
    this.queue = this.queue.filter((item) => item.nodeId !== nodeId)
    this.active.delete(nodeId)
    this.processNext()
  }

  isQueued(nodeId: string): boolean {
    return this.queue.some((item) => item.nodeId === nodeId)
  }

  clear(): void {
    this.queue = []
    this.active.clear()
  }
}

const imageGenQueue = new ImageGenQueue()

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
  updateNodeData: (id: string, patch: Partial<UnifiedNodeData> | ((prev: Partial<UnifiedNodeData>) => Partial<UnifiedNodeData>)) => void
  moveNode: (id: string, x: number, y: number) => void
  selectNode: (id: string | null) => void

  addConnection: (c: Omit<UConnection, 'id'>) => void
  removeConnection: (id: string) => void

  startDrag: (from: NonNullable<UDragState['fromPort']>) => void
  moveDrag: (cursor: { x: number; y: number }) => void
  endDrag: (to: { nodeId: string; portId: string; type: UnifiedPortType; isOutput: boolean } | null) => void

  runImageGen: (nodeId: string) => Promise<void>
  completeImageGen: (nodeId: string) => void
  retryImage: (nodeId: string, imgId: string) => void
  clearImageResults: (nodeId: string) => void
  /** 创建连接的图片节点（高清/9宫格/四视图）：自动创建新节点+连接线+img2img 生成 */
  createConnectedImageNode: (sourceNodeId: string, mode: 'hd' | '9grid' | '4view') => void
  /** 从外部图片 URL 创建图片节点（拖拽外部图片到画布） */
  addExternalImage: (url: string, position: { x: number; y: number }) => string
  /** 从本地 File 创建图片节点（立即上传到服务器拿公网 URL，和其他图片节点完全一致） */
  addExternalImageFile: (file: File, position: { x: number; y: number }) => string
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
    // 动态计算序号：取当前画布上同类型节点 __label 中的最大数字 + 1
    // 如果没有任何同类型节点 → 1（即使 counters 里残留了旧值）
    const existing = get().nodes.filter((n) => n.type === type)
    let nextCount = 1
    if (existing.length > 0) {
      let max = 0
      for (const n of existing) {
        const m = (n.data.__label || '').match(/(\d+)$/)
        if (m) {
          const num = parseInt(m[1], 10)
          if (num > max) max = num
        }
      }
      nextCount = max + 1
    }
    nodeTypeCounters[type] = nextCount
    const posX = snapEnabled ? snapToGrid(position.x) : position.x
    const posY = snapEnabled ? snapToGrid(position.y) : position.y
    const node: UCanvasNode = {
      id, type,
      position: { x: posX, y: posY },
      data: { ...(dataOverride ?? defaultNodeData(type)), __label: `${UNODE_LABELS[type]}${nextCount}` },
    }
    set((s) => ({ nodes: [...s.nodes, node], selectedNodeId: id }))
    return id
  }) as UnifiedCanvasState['addNode'],

  removeNode: (id) => {
    pollRegistry.stop(id)
    imageGenQueue.cancel(id) // 取消该节点的排队/生成
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      connections: s.connections.filter((c) => c.source.nodeId !== id && c.target.nodeId !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
  },

  updateNodeData: (id, patch) =>
    set((s) => ({
      nodes: s.nodes.map((n) => {
        if (n.id !== id) return n
        const resolvedPatch = typeof patch === 'function' ? patch(n.data) : patch
        return { ...n, data: { ...n.data, ...resolvedPatch } }
      }),
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
    if (node.data.imageStatus === 'queued') return // 已在队列中

    // 从 ref 端口读取图生图源节点（可选，遍历所有 ref 连接，取首个有效结果）
    const refConns = state.connections.filter((c) => c.target.nodeId === nodeId && c.target.portId === 'ref')
    let refImageUrl: string | undefined
    if (refConns.length > 0) {
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        if (src.type !== 'image' && src.type !== 'video') continue
        const imgs = src.data.imageResults?.filter((r) => r.status === 'done')
        // 必须用 originalUrl（Pollinations 原始公网地址），图生图时 Pollinations 服务器需要能公网访问
        // 所有图片节点（无论画布生成还是外部拖入）在 status='done' 时 originalUrl 都是公网 URL
        if (imgs?.[0]?.originalUrl) {
          refImageUrl = imgs[0].originalUrl
          break
        }
      }
      if (!refImageUrl) {
        get().updateNodeData(nodeId, {
          imageStatus: 'error',
          imageErrorMsg: '参考图未就绪或缺少原始地址，请确认源节点图片已生成完成',
        })
        return
      }
    }

    // strip [ref: 节点名称] 形式的内联引用标记，避免下游图片模型把它当成字面量 prompt
    const localPrompt = (node.data.imagePrompt || '').replace(/\[ref:\s*[^\]]+\]/g, '').trim()
    if (!localPrompt.trim()) { get().updateNodeData(nodeId, { imageStatus: 'error' }); return }

    const model = node.data.imageModel || 'sdxl'
    const ratio = validateRatio(model, (node.data.imageRatio as string) || '1:1')
    const resolution = validateResolution(model, node.data.imageResolution || '1k')
    const modelCfg = getImageModel(model)
    const batch = Math.max(1, Math.min(node.data.imageCount ?? 1, modelCfg.maxBatch))
    const baseSeed = node.data.imageSeed ?? randomSeed()
    const existingResults = node.data.imageResults ?? []

    // R2 修正：前端 img2img 前置校验，仅以 imageToImage 为判据
    // maxReferenceImages=0 表示 Pollinations 未明确返回上限，不等于"不支持图生图"
    // 后端 image.route.ts 已做硬校验，这里提前拦截避免无谓的网络请求和积分扣减
    if (refImageUrl && !modelCfg.features.imageToImage) {
      get().updateNodeData(nodeId, {
        imageStatus: 'error',
        imageErrorMsg: `模型 ${modelCfg.label || model} 不支持图生图，请切换支持参考图的模型`,
      })
      return
    }

    // 标记为排队中
    get().updateNodeData(nodeId, { imageStatus: 'queued', imageErrorMsg: undefined })

    // 等待队列分配执行权（并发控制：最多 2 个节点同时生成）
    await imageGenQueue.acquire(nodeId)

    // 再次检查节点是否存在（可能在排队期间被删除）
    const currentNode = get().nodes.find((n) => n.id === nodeId)
    if (!currentNode || currentNode.type !== 'image') {
      imageGenQueue.complete(nodeId)
      return
    }

    get().updateNodeData(nodeId, { imageStatus: 'running' })

    try {
      // 通过后端 API 生成 → 触发 withGeneration 中间件扣减积分
      const isImg2Img = !!refImageUrl
      const res = isImg2Img
        ? await img2imgViaBackend({
            prompt: localPrompt,
            image: refImageUrl,
            ratio,
            model,
            resolution,
          })
        : await generateViaBackend({
            prompt: localPrompt,
            ratio,
            batch,
            seed: baseSeed,
            model,
            resolution,
            quality: node.data.imageQuality as string | undefined,
            transparent: node.data.imageTransparent as boolean | undefined,
          })

      const newResults: GenImage[] = res.images.map((img) => ({
        id: uid('img'),
        url: img.url,
        originalUrl: img.originalUrl,
        prompt: localPrompt,
        seed: img.seed,
        ratio: ratio as AspectRatio,
        status: 'loading' as ImageStatus,
        createdAt: Date.now(),
      }))

      // 追加到已有结果前面（最新的在最前面）
      const allResults = [...newResults, ...existingResults]
      get().updateNodeData(nodeId, { imageResults: allResults })
      // 异步缓存到 IndexedDB（签名 URL 2小时过期前立即下载 Blob 存入本地）
      for (const r of newResults) {
        if (r.originalUrl) void downloadAndCache(r.url, r.originalUrl)
      }
      // 刷新右上角积分显示（后端已扣减）
      void useQuotaStore.getState().refreshQuota({ force: true })
      // API 成功后立即释放队列槽位，图片加载是异步的不应阻塞队列
      imageGenQueue.complete(nodeId)
    } catch (e) {
      const msg = errMsg(e, '生成失败')
      get().updateNodeData(nodeId, { imageStatus: 'error', imageErrorMsg: msg })
      // 失败时后端已自动返还积分，刷新前端积分显示
      void useQuotaStore.getState().refreshQuota({ force: true })
      // API 调用失败，立即释放队列槽位
      imageGenQueue.complete(nodeId)
    }
  },

  /** 图片全部加载完成后调用（保留兼容，队列已在 API 返回时释放） */
  completeImageGen: (nodeId) => {
    imageGenQueue.complete(nodeId)
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
    if (node.data.imageStatus === 'running') return // 生成中不允许清空
    if (node.data.imageStatus === 'queued') {
      imageGenQueue.cancel(nodeId) // 取消排队
    }
    get().updateNodeData(nodeId, { imageResults: [], imageStatus: 'idle' })
  },

  createConnectedImageNode: (sourceNodeId, mode) => {
    const state = get()
    const srcNode = state.nodes.find((n) => n.id === sourceNodeId)
    if (!srcNode || srcNode.type !== 'image') return

    // 获取源节点的生成结果（用于判断是否有图可引用）
    const srcResults = srcNode.data.imageResults?.filter((r) => r.status === 'done') ?? []
    if (srcResults.length === 0) return

    // 原始 prompt
    const srcPrompt = (srcNode.data.imagePrompt as string) || ''

    // 按模式构建 prompt 和参数
    let prompt: string
    let ratio: string
    let resolution: string

    if (mode === 'hd') {
      // 高清：同画面放大增强
      prompt = srcPrompt
        ? `${srcPrompt}, ultra detailed, high resolution, enhanced details, 4K quality, sharp focus, masterpiece`
        : 'ultra detailed, high resolution, enhanced details, 4K quality, sharp focus, masterpiece'
      ratio = (srcNode.data.imageRatio as string) || '1:1'
      resolution = '2k'
    } else if (mode === '9grid') {
      // 9宫格：主图 + 9 个细节面板合成图
      prompt = srcPrompt
        ? `${srcPrompt}, concept art design sheet, main panoramic view in center with 9 numbered detail callout panels showing specific areas of interest, labeled detail views arranged around the main image, grid layout, comprehensive design overview`
        : 'concept art design sheet, main panoramic view in center with 9 numbered detail callout panels showing specific areas of interest, labeled detail views arranged around the main image, grid layout, comprehensive design overview'
      ratio = '16:9'
      resolution = '2k'
    } else {
      // 四视图：4 视角参考表（特写 + 正面 + 侧面 + 背面）
      prompt = srcPrompt
        ? `${srcPrompt}, character reference sheet, 4 views arrangement: close-up portrait, front view, side view, back view, character turnaround, full character design, multiple angles reference`
        : 'character reference sheet, 4 views arrangement: close-up portrait, front view, side view, back view, character turnaround, full character design, multiple angles reference'
      ratio = '16:9'
      resolution = '2k'
    }

    // 新节点位置：原节点右侧偏移 400px（节点宽 320 + 80 间距）
    const offsetX = 400
    const newX = srcNode.position.x + offsetX
    const newY = srcNode.position.y

    // 创建新图片节点
    const newNodeId = get().addNode('image', { x: newX, y: newY }, {
      imagePrompt: prompt,
      imageRatio: ratio,
      imageResolution: resolution,
      imageModel: srcNode.data.imageModel,
      imageCount: 1,
    }, false)

    // 添加连接线：源节点 out → 新节点 ref
    get().addConnection({
      source: { nodeId: sourceNodeId, portId: 'out' },
      target: { nodeId: newNodeId, portId: 'ref' },
    })

    // 自动启动生成（img2img 模式，runImageGen 会自动从 ref 连接读取参考图）
    setTimeout(() => { get().runImageGen(newNodeId) }, 100)
  },

  addExternalImage: (url, position) => {
    // 外部 URL 拖入画布：直接用外部 URL 作为 originalUrl
    // Pollinations 可直接访问公网 URL，无需上传到服务器，img2img 和画布生成完全一致
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`
    const imgId = uid('img')
    const base = defaultNodeData('image')
    const newNodeId = get().addNode('image', position, {
      ...base,
      imageResults: [{
        id: imgId,
        url: fullUrl,
        originalUrl: fullUrl,
        prompt: '',
        seed: 0,
        ratio: '1:1' as const,
        status: 'done' as ImageStatus,
        createdAt: Date.now(),
      }],
      imageStatus: 'done' as GenStatus,
    }, false)
    void downloadAndCache(fullUrl, fullUrl)
    return newNodeId
  },

  addExternalImageFile: (file, position) => {
    // 本地 File 拖入画布：立即用 ObjectURL 预览（毫秒级），同时异步上传到服务器
    // 上传完成前 status='loading'，完成后 status='done'，与其他图片节点完全一致
    const objectUrl = URL.createObjectURL(file)
    const imgId = uid('img')
    const base = defaultNodeData('image')
    const newNodeId = get().addNode('image', position, {
      ...base,
      imageResults: [{
        id: imgId,
        url: objectUrl,           // 预览用 ObjectURL（立即可见）
        originalUrl: objectUrl,   // 临时，上传后更新为服务器公网 URL
        prompt: '',
        seed: 0,
        ratio: '1:1' as const,
        status: 'loading' as ImageStatus,
        createdAt: Date.now(),
      }],
      imageStatus: 'running' as GenStatus,
    }, false)
    // 立即异步上传到服务器
    void (async () => {
      try {
        const compressed = await compressImageForUpload(file)
        const data = await uploadFile('/api/upload/image', compressed)
        const fullUrl = data.url.startsWith('http') ? data.url : `${window.location.origin}${data.url}`
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== newNodeId) return n
            const updated = (n.data.imageResults ?? []).map((r) =>
              r.id === imgId
                ? { ...r, url: data.url, originalUrl: fullUrl, status: 'done' as ImageStatus }
                : r,
            )
            return { ...n, data: { ...n.data, imageResults: updated, imageStatus: 'done' as GenStatus } }
          }),
        }))
        void downloadAndCache(data.url, fullUrl)
        // 释放 ObjectURL
        URL.revokeObjectURL(objectUrl)
      } catch (e) {
        logger.error('addExternalImageFile upload failed:', e)
        set((s) => ({
          nodes: s.nodes.map((n) => {
            if (n.id !== newNodeId) return n
            const updated = (n.data.imageResults ?? []).map((r) =>
              r.id === imgId ? { ...r, status: 'error' as ImageStatus } : r,
            )
            return { ...n, data: { ...n.data, imageResults: updated, imageStatus: 'error' as GenStatus } }
          }),
        }))
      }
    })()
    return newNodeId
  },

  runVideoGen: async (nodeId) => {
    const state = get()
    const node = state.nodes.find((n) => n.id === nodeId)
    if (!node || node.type !== 'video' || isBusy(node.data.videoStatus)) return

    // ===== 全能参考：遍历所有 ref 连接，收集所有可用的图片作为参考 =====
    const refConns = state.connections.filter((c) => c.target.nodeId === nodeId && c.target.portId === 'ref')

    // 构建 连接节点 → originalUrl 映射表（用于 @图N 解析）
    // 所有图片节点（无论画布生成还是外部拖入）在 status='done' 时 originalUrl 都是公网 URL
    const refNodeMap = new Map<string, { label: string; url: string; nodeId: string }>()
    for (const conn of refConns) {
      const src = state.nodes.find((n) => n.id === conn.source.nodeId)
      if (!src) continue
      if (src.type !== 'image') continue
      const label = (src.data.__label as string) || ''
      const imgs = src.data.imageResults?.filter((r) => r.status === 'done')
      if (imgs?.[0]?.originalUrl) {
        refNodeMap.set(src.id, {
          label,
          url: imgs[0].originalUrl,
          nodeId: src.id,
        })
      }
    }

    // strip [ref: 节点名称] 形式的内联引用标记（已由 mention 逻辑独立解析连接关系，
    // 此处只清理 prompt 文本，避免下游视频模型把它当成字面量 prompt 影响生成）
    const rawPrompt = (node.data.videoPrompt || 'AI 生成视频').replace(/\[ref:\s*[^\]]+\]/g, '').trim()

    // 解析 @图N 标签，按出现顺序收集参考图
    // 例："场景：@图1是家庭场景，人物：@图2是男主" → [@图1, @图2]
    const mentionPattern = /@图\d+/g
    const mentions = rawPrompt.match(mentionPattern) || []

    let imageUrl: string | undefined
    let collectedRefImages: string[] | undefined
    let prompt: string

    if (mentions.length > 0) {
      // 有 @引用：按 @出现顺序收集对应图片 URL
      const orderedUrls: string[] = []
      for (const mention of mentions) {
        const label = mention.substring(1) // 去掉 @，得到 "图1"
        // 在 refNodeMap 中找到 label 匹配的节点
        for (const [, info] of refNodeMap) {
          if (info.label === label) {
            orderedUrls.push(info.url)
            break
          }
        }
      }

      if (orderedUrls.length > 0) {
        imageUrl = orderedUrls[0]
        collectedRefImages = orderedUrls.length > 1 ? orderedUrls.slice(1) : undefined
      }

      // 保留 @图N 标签在 prompt 中（视频模型可理解 @图1/@图2 对应参考图顺序）
      prompt = rawPrompt.trim() || 'AI 生成视频'
    } else {
      // 无 @引用：回退到旧行为（收集所有连接节点的图片）
      const allRefImages: string[] = []
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        if (src.type !== 'image') continue
        const imgs = src.data.imageResults?.filter((r) => r.status === 'done') ?? []
        for (const img of imgs) {
          if (img.originalUrl) allRefImages.push(img.originalUrl)
        }
      }
      imageUrl = allRefImages[0]
      collectedRefImages = allRefImages.length > 1 ? allRefImages.slice(1) : undefined
      prompt = rawPrompt.trim() || 'AI 生成视频'
    }

    // 用户连了 ref 但没有任何 image 源产出可用图片 → 阻止静默文生视频
    if (refConns.length > 0 && !imageUrl) {
      get().updateNodeData(nodeId, { videoStatus: 'error', videoErrorMsg: '参考图缺少原始地址，请重新生成源节点的图片后再试' })
      return
    }

    const model = node.data.videoModel || 'seedance-pro'
    const resolution = node.data.videoResolution
    const ratio = node.data.videoRatio
    const audio = node.data.videoAudio ?? false
    const endImage = node.data.videoEndImage
    const referenceImages = node.data.videoReferenceImages
    const referenceVideo = node.data.videoReferenceVideo
    const refMode = (node.data.videoRefMode ?? 'omni') as string

    // 首尾帧模式：按连接的图片节点顺序，第一个节点为首帧，第二个节点为尾帧
    if (refMode === 'endframe') {
      // 收集所有连接的图片节点（按连接顺序）
      const endframeRefImages: string[] = []
      for (const conn of refConns) {
        const src = state.nodes.find((n) => n.id === conn.source.nodeId)
        if (!src) continue
        if (src.type !== 'image') continue
        const imgs = src.data.imageResults?.filter((r) => r.status === 'done') ?? []
        for (const img of imgs) {
          if (img.originalUrl) endframeRefImages.push(img.originalUrl)
        }
      }

      // 也合并用户手动上传的参考图
      const allEndframeImages = [
        ...(referenceImages ?? []),
        ...endframeRefImages,
      ]

      if (allEndframeImages.length >= 2) {
        // 有两张以上图片：第一张为首帧，第二张为尾帧
        imageUrl = allEndframeImages[0]
        const endframeEndImage = allEndframeImages[1]
        const endframeModel = node.data.videoModel || 'seedance-pro'
        const endframeResolution = node.data.videoResolution
        const endframeRatio = node.data.videoRatio
        const endframeAudio = node.data.videoAudio ?? false
        const endframeDurId = node.data.videoDuration || '5s'
        const endframeDuration = Number(String(endframeDurId).replace(/[^0-9]/g, '')) || 5

        get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: undefined, videoResult: undefined, videoErrorMsg: undefined })
        pollRegistry.stop(nodeId)

        try {
          const toAbs = (u: string) => u.startsWith('/') ? `${window.location.origin}${u}` : u
          const body = {
            imageUrl: toAbs(imageUrl),
            endImage: toAbs(endframeEndImage),
            prompt: rawPrompt.trim() || 'AI 生成视频',
            model: endframeModel,
            duration: endframeDuration,
            resolution: endframeResolution,
            ratio: endframeRatio,
            audio: endframeAudio,
          }
          const res = await api.post<{ taskId: string; status: string; placeholder?: boolean }>('/api/video/img2video', body)
          const result: VideoResult = {
            taskId: res.taskId, status: 'queued', prompt: rawPrompt.trim() || 'AI 生成视频',
            type: 'img2video',
            placeholder: res.placeholder, createdAt: Date.now(),
          }
          get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: res.taskId, videoResult: result })
          pollRegistry.start(nodeId, () => { void get().pollVideoTask(nodeId) }, 3000)
          void get().pollVideoTask(nodeId)
          return
        } catch (e: unknown) {
          const msg = (e as Error).message
          get().updateNodeData(nodeId, { videoStatus: 'error', videoErrorMsg: msg })
          return
        }
      } else if (allEndframeImages.length === 1) {
        get().updateNodeData(nodeId, { videoStatus: 'error', videoErrorMsg: '首尾帧模式需要连接两张图片节点（第一张为首帧，第二张为尾帧）' })
        return
      } else {
        get().updateNodeData(nodeId, { videoStatus: 'error', videoErrorMsg: '首尾帧模式需要连接两张图片节点（第一张为首帧，第二张为尾帧）' })
        return
      }
    }

    // duration id (5s / 10s) → 秒数
    const durId = node.data.videoDuration || '5s'
    const duration = Number(String(durId).replace(/[^0-9]/g, '')) || 5

    get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: undefined, videoResult: undefined, videoErrorMsg: undefined })
    pollRegistry.stop(nodeId)

    try {
      // 将相对 URL（/uploads/xxx）转为绝对 URL，后端 z.string().url() 要求完整 URL
      const toAbs = (u: string) => u.startsWith('/') ? `${window.location.origin}${u}` : u
      // 首帧图作为 imageUrl 走 img2video
      const effectiveImageUrl = imageUrl ? toAbs(imageUrl) : undefined
      const effectiveIsImg2Video = !!effectiveImageUrl
      const endpoint = effectiveIsImg2Video ? '/api/video/img2video' : '/api/video/text2video'
      const extraParams: Record<string, unknown> = {}
      if (endImage) extraParams.endImage = toAbs(endImage)

      {
        // 全能参考/图生视频：合并用户手动参考图 + 连接节点自动收集的参考图
        const mergedRefImages = [
          ...(node.data.videoReferenceImages ?? []),
          ...(collectedRefImages ?? []),
        ].map(toAbs)
        if (mergedRefImages.length > 0) extraParams.referenceImages = mergedRefImages
      }
      if (referenceVideo) extraParams.referenceVideo = toAbs(referenceVideo)

      const body = effectiveIsImg2Video
        ? { imageUrl: effectiveImageUrl, prompt, model, duration, resolution, ratio, audio, ...extraParams }
        : { prompt, model, duration, resolution, ratio, audio, ...extraParams }
      const res = await api.post<{ taskId: string; status: string; placeholder?: boolean }>(endpoint, body)

      const result: VideoResult = {
        taskId: res.taskId, status: 'queued', prompt,
        type: effectiveIsImg2Video ? 'img2video' : 'text2video',
        placeholder: res.placeholder, createdAt: Date.now(),
      }
      get().updateNodeData(nodeId, { videoStatus: 'queued', videoTaskId: res.taskId, videoResult: result })

      pollRegistry.start(nodeId, () => { void get().pollVideoTask(nodeId) }, 3000)
      void get().pollVideoTask(nodeId)
    } catch (e) {
      const msg = errMsg(e, '视频生成启动失败')
      get().updateNodeData(nodeId, { videoStatus: 'error', videoErrorMsg: msg })
      // 失败时后端已自动返还积分，刷新前端积分显示
      void useQuotaStore.getState().refreshQuota({ force: true })
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
      const patch: Partial<UnifiedNodeData> = { videoStatus: newStatus, videoResult: updated }
      if (newStatus === 'error') {
        patch.videoErrorMsg = (res as { error?: string }).error || '视频生成失败'
        // 失败时后端已自动返还积分，刷新前端积分显示
        void useQuotaStore.getState().refreshQuota({ force: true })
      }
      get().updateNodeData(nodeId, patch)
      // 视频生成完成后异步缓存到 IndexedDB（CDN 链接可能过期，需立即下载 Blob）
      if (newStatus === 'done' && res.url) {
        void downloadAndCache(res.url, res.url)
      }
      if (newStatus === 'done' || newStatus === 'error') pollRegistry.stop(nodeId)
    } catch (e) {
      // 轮询失败不立即标记为 error，可能是临时网络问题
      // 连续失败由 stopPoll 的超时机制处理
      logger.warn('Canvas', '视频任务轮询失败:', node.data.videoTaskId, e)
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

    get().updateNodeData(nodeId, { audioStatus: 'queued', audioErrorMsg: undefined })
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
      const msg = errMsg(e, '音频生成失败')
      get().updateNodeData(nodeId, { audioStatus: 'error', audioErrorMsg: msg })
      // 失败时后端已自动返还积分，刷新前端积分显示
      void useQuotaStore.getState().refreshQuota({ force: true })
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
      { id: imageId, type: 'image', position: { x: 80, y: 150 }, data: { imageResults: [], imageStatus: 'idle', __label: '图1' } },
      { id: videoId, type: 'video', position: { x: 580, y: 150 }, data: { videoStatus: 'idle', videoPrompt: '', videoModel: 'seedance', videoResolution: '1080p', videoDuration: '5s', videoRatio: '16:9', __label: '视1' } },
      { id: audioId, type: 'audio', position: { x: 580, y: 500 }, data: { audioText: '', audioVoice: 'nova', audioStatus: 'idle', __label: '音1' } },
    ]

    const connections: UConnection[] = [
      { id: uid('uconn'), source: { nodeId: imageId, portId: 'out' }, target: { nodeId: videoId, portId: 'ref' } },
    ]

    set({ nodes, connections, viewport: { x: 0, y: 0, zoom: 1 }, selectedNodeId: null })
  },

  clearCanvas: () => {
    pollRegistry.stopAll()
    imageGenQueue.clear() // 清空图片生成队列
    nodeTypeCounters = {}
    // 取消待写入的防抖保存并解除归属绑定：
    // 持久化数据按 userId 分 key 隔离，登出仅清内存态，本人再次登录可恢复
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    canvasOwnerId = null
    set({ nodes: [], connections: [], selectedNodeId: null })
  },

  saveToStorage: () => {
    // 未登录/已登出时不持久化：防止登出竞态把空画布写进其他账户的存储分片
    if (!canvasOwnerId) return
    const { nodes, connections, viewport } = get()
    try {
      const payload = {
        nodes: nodes.map((n) => ({
          ...n,
          // 清理临时运行态字段（生成状态/任务ID），__label 序号持久保留
          data: Object.fromEntries(
            Object.entries(n.data).filter(([k]) =>
              !['imageStatus', 'videoStatus', 'audioStatus', 'videoTaskId'].includes(k),
            ),
          ),
        })),
        connections,
        viewport,
        counters: nodeTypeCounters,
        savedAt: Date.now(),
      }
      localStorage.setItem(currentStorageKey(), JSON.stringify(payload))
    } catch (e) {
      // localStorage 保存失败（可能是配额超限或隐私模式），不影响核心功能
      logger.warn('Canvas', '本地保存失败:', e)
    }
  },

  loadFromStorage: () => {
    try {
      // 一次性迁移清理旧版全局 key：其数据无法确认归属账户，按隔离原则直接丢弃
      if (localStorage.getItem(LEGACY_STORAGE_KEY)) {
        localStorage.removeItem(LEGACY_STORAGE_KEY)
      }
      const raw = localStorage.getItem(currentStorageKey())
      if (!raw) return false
      const payload = JSON.parse(raw) as StoredCanvasState
      if (!payload.nodes || !Array.isArray(payload.nodes)) return false

      // 恢复节点状态为 idle；对历史缺失 __label 的节点做一次性迁移补齐序号
      // 先扫描已有 __label 算每种类型的 max，再给缺失的分配 max+1、max+2…
      const counters: Record<string, number> = {}
      // ① 第一遍：统计已有 __label 的节点中每种类型的最大序号
      for (const n of payload.nodes) {
        const lbl = (n.data as Record<string, unknown>)?.__label as string | undefined
        if (typeof lbl === 'string') {
          const m = lbl.match(/(\d+)$/)
          if (m) {
            const num = parseInt(m[1], 10)
            const cur = counters[n.type] ?? 0
            if (num > cur) counters[n.type] = num
          }
        }
      }
      // ② 第二遍：缺失 __label 的按 max+1 补齐（递增避免冲突）
      const nodes = payload.nodes
        .filter(isStoredNode)
        .map((n) => {
          const statusKey = `${n.type}Status`
          const hasLabel = typeof (n.data as Record<string, unknown>)?.__label === 'string'
          let labeledData = { ...n.data, [statusKey]: 'idle' }
          if (!hasLabel) {
            const next = (counters[n.type] ?? 0) + 1
            counters[n.type] = next
            labeledData.__label = `${UNODE_LABELS[n.type]}${next}`
          }
          // 向后兼容清理：旧版方案中 pendingUpload=true 的图片在页面刷新后 File 引用已丢失，
          // 新方案下拖入图片在创建时已立即上传，originalUrl 是服务器公网 URL，刷新后仍有效。
          // 此处仅清理旧版遗留的 pendingUpload=true 数据，避免 img2img 读到失效的 blob: URL。
          const data = labeledData as Record<string, unknown>
          if (Array.isArray(data.imageResults)) {
            let hasStale = false
            let hasUrlFix = false
            const cleaned = (data.imageResults as Array<Record<string, unknown>>).map((r) => {
              if (r.pendingUpload === true) {
                hasStale = true
                return { ...r, url: '', originalUrl: '', pendingUpload: false }
              }
              // 清理旧 Base64 签名 URL（?u= 格式）
              // Pollinations 已废弃 GET image= 参数（base64 data URL），旧 img2img 结果全部失效
              // 直接清空 url，避免浏览器反复请求 400
              if (typeof r.url === 'string' && r.url.includes('?u=')) {
                hasStale = true
                return { ...r, url: '', originalUrl: '', pendingUpload: false }
              }
              return r
            })
            if (hasStale) {
              data.imageResults = cleaned
              data.imageStatus = 'error'
              data.imageErrorMsg = '页面已刷新，旧版外部图片引用已失效，请重新拖入图片'
            } else if (hasUrlFix) {
              data.imageResults = cleaned
              // URL 修复不需要标记为 error，图片仍然可用（originalUrl 是公网 URL）
            }
          }
          return { ...n, data: labeledData } as UCanvasNode
        })

      nodeTypeCounters = counters

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
// 画布数据按账户隔离：key 携带归属用户 id，换账户登录互不可见
const STORAGE_KEY_PREFIX = 'ai_canvas_state_v2'
// 旧版全局 key（无归属隔离），加载时一次性清除
const LEGACY_STORAGE_KEY = 'ai_canvas_state_v2'
let saveTimer: ReturnType<typeof setTimeout> | null = null
// 画布归属人（用户 id）：由画布挂载点/认证流程设置，登出时解除
let canvasOwnerId: string | null = null

export function setCanvasOwnerId(id: string | null) {
  canvasOwnerId = id
}

function currentStorageKey() {
  return canvasOwnerId ? `${STORAGE_KEY_PREFIX}:${canvasOwnerId}` : `${STORAGE_KEY_PREFIX}:anon`
}

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
