import { create } from 'zustand'
import { buildRetryUrl, generateViaBackend } from '../services/imageApi'

export type AspectRatio = '1:1' | '3:4' | '4:3' | '16:9' | '9:16'
export type GenStatus = 'idle' | 'queued' | 'running' | 'done' | 'error'
export type ImageStatus = 'loading' | 'done' | 'error'

export interface GenImage {
  id: string
  url: string
  originalUrl?: string
  prompt: string
  seed: number
  ratio: AspectRatio
  status: ImageStatus
  createdAt: number
}

export interface GenTask {
  id: string
  prompt: string
  negativePrompt: string
  ratio: AspectRatio
  steps: number
  cfg: number
  seed: number
  batch: number
  status: GenStatus
  results: GenImage[]
  createdAt: number
  errorMessage?: string
}

interface StudioState {
  prompt: string
  negativePrompt: string
  ratio: AspectRatio
  steps: number
  cfg: number
  seed: number | null
  batch: number
  status: GenStatus
  history: GenTask[]
  setPrompt: (v: string) => void
  setNegativePrompt: (v: string) => void
  setRatio: (v: AspectRatio) => void
  setSteps: (v: number) => void
  setCfg: (v: number) => void
  setSeed: (v: number | null) => void
  setBatch: (v: number) => void
  generate: () => void
  reset: () => void
  // 单图状态回调（由 ResultCard 的 img onload/onerror 触发）
  updateImageStatus: (taskId: string, imgId: string, status: ImageStatus) => void
  // 重试单张图（重新发起请求）
  retryImage: (taskId: string, imgId: string) => void
}

function randomSeed() {
  return Math.floor(Math.random() * 1e9)
}

function isBusy(s: GenStatus) {
  return s === 'queued' || s === 'running'
}

// 根据所有图状态汇总 task 状态
function aggregateTaskStatus(results: GenImage[]): GenStatus {
  if (results.length === 0) return 'idle'
  if (results.every((r) => r.status === 'done')) return 'done'
  if (results.every((r) => r.status === 'done' || r.status === 'error')) return 'done'
  if (results.some((r) => r.status === 'loading')) return 'running'
  return 'done'
}

export const useStudioStore = create<StudioState>((set, get) => ({
  prompt: '',
  negativePrompt: '',
  ratio: '1:1',
  steps: 28,
  cfg: 7,
  seed: null,
  batch: 2,
  status: 'idle',
  history: [],
  setPrompt: (v) => set({ prompt: v }),
  setNegativePrompt: (v) => set({ negativePrompt: v }),
  setRatio: (v) => set({ ratio: v }),
  setSteps: (v) => set({ steps: v }),
  setCfg: (v) => set({ cfg: v }),
  setSeed: (v) => set({ seed: v }),
  setBatch: (v) => set({ batch: v }),

  generate: async () => {
    const s = get()
    if (!s.prompt.trim() || isBusy(s.status)) return

    const taskId = `t_${Date.now()}`
    const baseSeed = s.seed ?? randomSeed()

    // 先置为 running，给用户即时反馈
    set({ status: 'running' })

    try {
      // 通过后端代理生成 — 经过审核+积分扣减
      const res = await generateViaBackend({
        prompt: s.prompt,
        ratio: s.ratio,
        batch: s.batch,
        seed: baseSeed,
        model: 'general-pro',
        resolution: '2k',
      })

      const results: GenImage[] = res.images.map((img, i) => ({
        id: `${taskId}_${i}`,
        url: img.url,
        prompt: s.prompt,
        seed: img.seed,
        ratio: s.ratio as AspectRatio,
        status: 'loading' as const,
        createdAt: Date.now(),
      }))

      const task: GenTask = {
        id: taskId,
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        ratio: s.ratio,
        steps: s.steps,
        cfg: s.cfg,
        seed: baseSeed,
        batch: s.batch,
        status: 'running',
        results,
        createdAt: Date.now(),
      }

      set((state) => ({
        status: 'running',
        history: [task, ...state.history].slice(0, 50),
      }))
    } catch (e: unknown) {
      // 审核不通过或生成失败
      set({ status: 'error' })
      // 用一个失败的 task 占位，展示错误信息
      const task: GenTask = {
        id: taskId,
        prompt: s.prompt,
        negativePrompt: s.negativePrompt,
        ratio: s.ratio,
        steps: s.steps,
        cfg: s.cfg,
        seed: baseSeed,
        batch: s.batch,
        status: 'error',
        results: [],
        createdAt: Date.now(),
        errorMessage: (e as { message?: string })?.message || '生成失败',
      }
      set((state) => ({
        history: [task, ...state.history].slice(0, 50),
      }))
    }
  },

  updateImageStatus: (taskId, imgId, status) => {
    set((state) => {
      const history = state.history.map((t) => {
        if (t.id !== taskId) return t
        const results = t.results.map((img) =>
          img.id === imgId ? { ...img, status } : img
        )
        return { ...t, results, status: aggregateTaskStatus(results) }
      })
      // 顶层 status 跟随最新一个 task
      const latest = history[0]
      return {
        history,
        status: latest ? latest.status : 'idle',
      }
    })
  },

  retryImage: (taskId, imgId) => {
    set((state) => {
      const history = state.history.map((t) => {
        if (t.id !== taskId) return t
        const results = t.results.map((img) =>
          img.id === imgId
            ? { ...img, url: buildRetryUrl(img.url), status: 'loading' as const }
            : img
        )
        return { ...t, results, status: aggregateTaskStatus(results) }
      })
      const latest = history[0]
      return {
        history,
        status: latest ? (latest.status === 'done' ? 'running' : latest.status) : 'idle',
      }
    })
  },

  reset: () =>
    set({
      prompt: '',
      negativePrompt: '',
      ratio: '1:1',
      steps: 28,
      cfg: 7,
      seed: null,
      batch: 2,
      status: 'idle',
    }),
}))
