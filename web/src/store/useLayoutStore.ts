// 图文排版 Store
//
// 职责：管理 Page / Layer / Selection 状态，提供排版编辑器的全部操作。
// 与 useScriptStore（脚本/分镜）和 useStudioStore（图像生成）解耦，
// 通过 sendToLayout / fillImage 桥接方法实现跨 store 数据流。
//
// 设计尺寸约定（条漫为主）：
// - 条漫 3 栏：1080 × 1620（每分镜 540 高）
// - 4 格漫画：1080 × 1080（每格 540 × 540）
// - 单图海报：1080 × 1350
// - 绘本跨页：1600 × 1200

import { create } from 'zustand'

// ============ 类型定义 ============

export type LayoutType = 'grid4' | 'strip3' | 'poster' | 'spread'

export const LAYOUT_PRESETS: Record<
  LayoutType,
  { label: string; width: number; height: number; desc: string }
> = {
  strip3: { label: '3 栏条漫', width: 1080, height: 1620, desc: '适合短篇 / 社媒' },
  grid4: { label: '4 格漫画', width: 1080, height: 1080, desc: '4 格搞笑 / 节奏感' },
  poster: { label: '单图海报', width: 1080, height: 1350, desc: '宣传 / 配图' },
  spread: { label: '绘本跨页', width: 1600, height: 1200, desc: '绘本 / 跨页插画' },
}

type LayerType = 'image' | 'bubble' | 'text' | 'shape'

interface BaseLayer {
  id: string
  type: LayerType
  x: number
  y: number
  w: number
  h: number
  rotation: number
  opacity: number
  visible: boolean
  locked: boolean
}

export interface ImageLayer extends BaseLayer {
  type: 'image'
  props: {
    src: string
    sceneId?: number // 反查到 useScriptStore 的分镜 id
    filter?: 'none' | 'grayscale' | 'sepia'
  }
}

export type BubbleShape = 'ellipse' | 'rect' | 'cloud' | 'shout'

export interface BubbleLayer extends BaseLayer {
  type: 'bubble'
  props: {
    shape: BubbleShape
    text: string
    fontFamily: string
    fontSize: number
    color: string
    align: 'left' | 'center' | 'right'
    bgColor: string
    borderColor: string
  }
}

export interface TextLayer extends BaseLayer {
  type: 'text'
  props: {
    text: string
    fontFamily: string
    fontSize: number
    color: string
    align: 'left' | 'center' | 'right'
    vertical: boolean // 竖排（古风用）
  }
}

export type Layer = ImageLayer | BubbleLayer | TextLayer

export interface Page {
  id: string
  projectId: string
  seq: number // 页码（从 1 起）
  layout: LayoutType
  width: number
  height: number
  background: string
  layers: Layer[]
  createdAt: number
  updatedAt: number
}

// ============ Store ============

interface LayoutState {
  pages: Page[]
  activePageId: string | null
  selectedLayerId: string | null

  // 派生：当前激活的 Page
  activePage: () => Page | null
  // 派生：当前选中的 Layer
  selectedLayer: () => Layer | null

  // 页面操作
  setActivePage: (id: string) => void
  addPage: (layout?: LayoutType) => void
  removePage: (id: string) => void
  duplicatePage: (id: string) => void
  movePage: (id: string, direction: 'up' | 'down') => void
  movePageTo: (fromId: string, toId: string) => void
  updatePage: (id: string, partial: Partial<Page>) => void

  // 图层操作
  selectLayer: (id: string | null) => void
  addLayer: (layer: Layer) => void
  updateLayer: (id: string, partial: Partial<Layer> | ((l: Layer) => Layer)) => void
  removeLayer: (id: string) => void
  moveLayer: (id: string, direction: 'up' | 'down') => void

  // 桥接：从脚本送入（分镜 → 图层，对白 → 气泡）
  initFromScript: (
    layers: Layer[],
    layout?: LayoutType,
    projectId?: string,
    size?: { width?: number; height?: number }
  ) => void

  // 桥接：给图像层补 src（来自 useStudioStore 的生成结果）
  fillImage: (layerId: string, src: string) => void

  reset: () => void
}

// 工具：生成 id
function uid(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

// 工具：clone layer（用于 update 回调形式）
function cloneLayer(l: Layer): Layer {
  switch (l.type) {
    case 'image':
      return { ...l, props: { ...l.props } }
    case 'bubble':
      return { ...l, props: { ...l.props } }
    case 'text':
      return { ...l, props: { ...l.props } }
  }
}

export const useLayoutStore = create<LayoutState>((set, get) => ({
  pages: [],
  activePageId: null,
  selectedLayerId: null,

  activePage: () => {
    const { pages, activePageId } = get()
    return pages.find((p) => p.id === activePageId) ?? null
  },

  selectedLayer: () => {
    const page = get().activePage()
    if (!page) return null
    return page.layers.find((l) => l.id === get().selectedLayerId) ?? null
  },

  setActivePage: (id) => set({ activePageId: id, selectedLayerId: null }),

  addPage: (layout = 'strip3') => {
    const preset = LAYOUT_PRESETS[layout]
    const seq = get().pages.length + 1
    const page: Page = {
      id: uid('page'),
      projectId: 'default',
      seq,
      layout,
      width: preset.width,
      height: preset.height,
      background: '#ffffff',
      layers: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((state) => ({
      pages: [...state.pages, page],
      activePageId: page.id,
      selectedLayerId: null,
    }))
  },

  removePage: (id) =>
    set((state) => {
      const idx = state.pages.findIndex((p) => p.id === id)
      if (idx === -1) return state
      const pages = state.pages.filter((p) => p.id !== id)
      // 重排页码
      pages.forEach((p, i) => (p.seq = i + 1))
      const activePageId =
        state.activePageId === id
          ? pages[Math.min(idx, pages.length - 1)]?.id ?? null
          : state.activePageId
      return { pages, activePageId, selectedLayerId: null }
    }),

  duplicatePage: (id) =>
    set((state) => {
      const idx = state.pages.findIndex((p) => p.id === id)
      if (idx === -1) return state
      const src = state.pages[idx]
      // 深拷贝 layers，并重新生成 id（避免与原页图层冲突）
      const clonedLayers: Layer[] = src.layers.map((l) => {
        const copy = cloneLayer(l)
        copy.id = uid(l.type === 'image' ? 'img' : l.type === 'bubble' ? 'bbl' : 'txt')
        return copy
      })
      const newPage: Page = {
        ...src,
        id: uid('page'),
        seq: 0, // 占位，下面统一重排
        layers: clonedLayers,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      const pages = [...state.pages]
      pages.splice(idx + 1, 0, newPage)
      pages.forEach((p, i) => (p.seq = i + 1))
      return { pages, activePageId: newPage.id, selectedLayerId: null }
    }),

  movePage: (id, direction) =>
    set((state) => {
      const idx = state.pages.findIndex((p) => p.id === id)
      if (idx === -1) return state
      const target = direction === 'up' ? idx + 1 : idx - 1
      if (target < 0 || target >= state.pages.length) return state
      const pages = [...state.pages]
      ;[pages[idx], pages[target]] = [pages[target], pages[idx]]
      pages.forEach((p, i) => (p.seq = i + 1))
      return { pages }
    }),

  movePageTo: (fromId, toId) =>
    set((state) => {
      if (fromId === toId) return state
      const fromIdx = state.pages.findIndex((p) => p.id === fromId)
      const toIdx = state.pages.findIndex((p) => p.id === toId)
      if (fromIdx === -1 || toIdx === -1) return state
      const pages = [...state.pages]
      const [moved] = pages.splice(fromIdx, 1)
      pages.splice(toIdx, 0, moved)
      pages.forEach((p, i) => (p.seq = i + 1))
      return { pages }
    }),

  updatePage: (id, partial) =>
    set((state) => ({
      pages: state.pages.map((p) =>
        p.id === id ? { ...p, ...partial, updatedAt: Date.now() } : p
      ),
    })),

  selectLayer: (id) => set({ selectedLayerId: id }),

  addLayer: (layer) =>
    set((state) => {
      if (!state.activePageId) return state
      const pages = state.pages.map((p) =>
        p.id === state.activePageId
          ? { ...p, layers: [...p.layers, layer], updatedAt: Date.now() }
          : p
      )
      return { pages, selectedLayerId: layer.id }
    }),

  updateLayer: (id, partial) =>
    set((state) => {
      if (!state.activePageId) return state
      const pages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p
        const layers = p.layers.map((l) => {
          if (l.id !== id) return l
          const next = typeof partial === 'function' ? partial(cloneLayer(l)) : partial
          return { ...l, ...next, props: { ...l.props, ...(next as Layer).props } } as Layer
        })
        return { ...p, layers, updatedAt: Date.now() }
      })
      return { pages }
    }),

  removeLayer: (id) =>
    set((state) => {
      if (!state.activePageId) return state
      const pages = state.pages.map((p) =>
        p.id === state.activePageId
          ? { ...p, layers: p.layers.filter((l) => l.id !== id), updatedAt: Date.now() }
          : p
      )
      return {
        pages,
        selectedLayerId: state.selectedLayerId === id ? null : state.selectedLayerId,
      }
    }),

  moveLayer: (id, direction) =>
    set((state) => {
      if (!state.activePageId) return state
      const pages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p
        const idx = p.layers.findIndex((l) => l.id === id)
        if (idx === -1) return p
        const target = direction === 'up' ? idx + 1 : idx - 1
        if (target < 0 || target >= p.layers.length) return p
        const layers = [...p.layers]
        ;[layers[idx], layers[target]] = [layers[target], layers[idx]]
        return { ...p, layers, updatedAt: Date.now() }
      })
      return { pages }
    }),

  initFromScript: (layers, layout = 'strip3', projectId = 'default', size) => {
    const preset = LAYOUT_PRESETS[layout]
    const page: Page = {
      id: uid('page'),
      projectId,
      seq: 1,
      layout,
      width: size?.width ?? preset.width,
      height: size?.height ?? preset.height,
      background: '#ffffff',
      layers,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set({
      pages: [page],
      activePageId: page.id,
      selectedLayerId: null,
    })
  },

  fillImage: (layerId, src) =>
    set((state) => {
      if (!state.activePageId) return state
      const pages = state.pages.map((p) => {
        if (p.id !== state.activePageId) return p
        const layers = p.layers.map((l) => {
          if (l.id !== layerId || l.type !== 'image') return l
          return { ...l, props: { ...l.props, src } } as ImageLayer
        })
        return { ...p, layers, updatedAt: Date.now() }
      })
      return { pages }
    }),

  reset: () =>
    set({ pages: [], activePageId: null, selectedLayerId: null }),
}))

// ============ 工厂函数：构造常用 Layer ============

export function makeImageLayer(opts: {
  sceneId?: number
  src?: string
  x: number
  y: number
  w: number
  h: number
}): ImageLayer {
  return {
    id: uid('img'),
    type: 'image',
    x: opts.x,
    y: opts.y,
    w: opts.w,
    h: opts.h,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    props: {
      src: opts.src ?? '',
      sceneId: opts.sceneId,
      filter: 'none',
    },
  }
}

export function makeBubbleLayer(opts: {
  text: string
  x: number
  y: number
  w?: number
  h?: number
  shape?: BubbleShape
}): BubbleLayer {
  return {
    id: uid('bbl'),
    type: 'bubble',
    x: opts.x,
    y: opts.y,
    w: opts.w ?? 320,
    h: opts.h ?? 80,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    props: {
      shape: opts.shape ?? 'ellipse',
      text: opts.text,
      fontFamily: '思源黑体',
      fontSize: 16,
      color: '#1a1a2e',
      align: 'center',
      bgColor: '#ffffff',
      borderColor: '#1a1a2e',
    },
  }
}
