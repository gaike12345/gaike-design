import { create } from 'zustand'
import {
  generateOutline,
  generateWorldview,
  generateLorebook,
  promptHelper,
  deepseekReason,
  styleClone,
  aiErase,
  type OutlineData,
  type WorldviewData,
  type LorebookEntry,
  type DeepseekData,
} from '../services/textApi'

export type WRToolKey = 'outline' | 'worldview' | 'lorebook' | 'prompt' | 'deepseek' | 'style' | 'erase'
export type ScriptStatus = 'idle' | 'running' | 'done' | 'error'

export interface WRToolsState {
  // WR-01 大纲
  outline: OutlineData | null
  outlineStatus: ScriptStatus
  runOutline: (topic: string, style: string) => Promise<void>

  // WR-05 世界观
  worldview: WorldviewData | null
  worldviewStatus: ScriptStatus
  runWorldview: (topic: string) => Promise<void>

  // WR-12 Lorebook
  lorebook: LorebookEntry[]
  lorebookStatus: ScriptStatus
  runLorebook: (source: string) => Promise<void>
  addLore: (entry: LorebookEntry) => void
  updateLore: (key: string, partial: Partial<LorebookEntry>) => void
  removeLore: (key: string) => void

  // WR-19 Prompt 助手
  promptResult: string | null
  promptStatus: ScriptStatus
  promptInput: string
  setPromptInput: (v: string) => void
  runPromptHelper: (style: string) => Promise<void>

  // WR-15 DeepSeek 推理
  deepseek: DeepseekData | null
  deepseekStatus: ScriptStatus
  deepseekSituation: string
  deepseekOptions: string
  setDeepseekSituation: (v: string) => void
  setDeepseekOptions: (v: string) => void
  runDeepseek: () => Promise<void>

  // WR-14 文风模仿
  styleSample: string
  styleTopic: string
  styleResult: string | null
  styleStatus: ScriptStatus
  setStyleSample: (v: string) => void
  setStyleTopic: (v: string) => void
  runStyleClone: () => Promise<void>

  // WR-18 AI 消痕
  eraseInput: string
  eraseIntensity: 'light' | 'medium' | 'heavy'
  eraseResult: string | null
  eraseStatus: ScriptStatus
  setEraseInput: (v: string) => void
  setEraseIntensity: (v: 'light' | 'medium' | 'heavy') => void
  runAIErase: () => Promise<void>

  clearTool: (tool: WRToolKey) => void
}

export const useWRToolsStore = create<WRToolsState>((set, get) => ({
  // WR-01
  outline: null,
  outlineStatus: 'idle',
  runOutline: async (topic, style) => {
    if (!topic.trim() || get().outlineStatus === 'running') return
    set({ outlineStatus: 'running', outline: null })
    const resp = await generateOutline({ topic, style })
    if (!resp.ok || !resp.data) { set({ outlineStatus: 'error' }); return }
    set({ outlineStatus: 'done', outline: resp.data })
  },

  // WR-05
  worldview: null,
  worldviewStatus: 'idle',
  runWorldview: async (topic) => {
    if (!topic.trim() || get().worldviewStatus === 'running') return
    set({ worldviewStatus: 'running', worldview: null })
    const resp = await generateWorldview({ topic })
    if (!resp.ok || !resp.data) { set({ worldviewStatus: 'error' }); return }
    set({ worldviewStatus: 'done', worldview: resp.data })
  },

  // WR-12
  lorebook: [],
  lorebookStatus: 'idle',
  runLorebook: async (source) => {
    if (!source.trim() || get().lorebookStatus === 'running') return
    set({ lorebookStatus: 'running' })
    const existing = get().lorebook
    const resp = await generateLorebook({ source, existing })
    if (!resp.ok || !resp.data) { set({ lorebookStatus: 'error' }); return }
    const merged = [...existing]
    const known = new Set(merged.map((e) => e.key))
    resp.data.entries.forEach((e) => {
      if (!known.has(e.key)) { merged.push(e); known.add(e.key) }
    })
    set({ lorebookStatus: 'done', lorebook: merged })
  },
  addLore: (entry) => set((state) => {
    if (state.lorebook.some((e) => e.key === entry.key)) return state
    return { lorebook: [...state.lorebook, entry] }
  }),
  updateLore: (key, partial) => set((state) => ({
    lorebook: state.lorebook.map((e) => (e.key === key ? { ...e, ...partial } : e)),
  })),
  removeLore: (key) => set((state) => ({
    lorebook: state.lorebook.filter((e) => e.key !== key),
  })),

  // WR-19
  promptResult: null,
  promptStatus: 'idle',
  promptInput: '',
  setPromptInput: (v) => set({ promptInput: v }),
  runPromptHelper: async (style) => {
    const { promptInput, promptStatus } = get()
    if (!promptInput.trim() || promptStatus === 'running') return
    set({ promptStatus: 'running', promptResult: null })
    const resp = await promptHelper({ input: promptInput, style })
    if (!resp.ok || !resp.data) { set({ promptStatus: 'error' }); return }
    set({ promptStatus: 'done', promptResult: resp.data.prompt })
  },

  // WR-15
  deepseek: null,
  deepseekStatus: 'idle',
  deepseekSituation: '',
  deepseekOptions: '',
  setDeepseekSituation: (v) => set({ deepseekSituation: v }),
  setDeepseekOptions: (v) => set({ deepseekOptions: v }),
  runDeepseek: async () => {
    const { deepseekSituation, deepseekOptions, deepseekStatus } = get()
    if (!deepseekSituation.trim() || deepseekStatus === 'running') return
    set({ deepseekStatus: 'running', deepseek: null })
    const options = deepseekOptions
      .split(/[/,，;；\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
    const resp = await deepseekReason({ situation: deepseekSituation, options })
    if (!resp.ok || !resp.data) { set({ deepseekStatus: 'error' }); return }
    set({ deepseekStatus: 'done', deepseek: resp.data })
  },

  // WR-14
  styleSample: '',
  styleTopic: '',
  styleResult: null,
  styleStatus: 'idle',
  setStyleSample: (v) => set({ styleSample: v }),
  setStyleTopic: (v) => set({ styleTopic: v }),
  runStyleClone: async () => {
    const { styleSample, styleTopic, styleStatus } = get()
    if (!styleSample.trim() || !styleTopic.trim() || styleStatus === 'running') return
    set({ styleStatus: 'running', styleResult: null })
    const resp = await styleClone({ sample: styleSample, topic: styleTopic })
    if (!resp.ok || !resp.data) { set({ styleStatus: 'error' }); return }
    set({ styleStatus: 'done', styleResult: resp.data.content })
  },

  // WR-18
  eraseInput: '',
  eraseIntensity: 'medium',
  eraseResult: null,
  eraseStatus: 'idle',
  setEraseInput: (v) => set({ eraseInput: v }),
  setEraseIntensity: (v) => set({ eraseIntensity: v }),
  runAIErase: async () => {
    const { eraseInput, eraseIntensity, eraseStatus } = get()
    if (!eraseInput.trim() || eraseStatus === 'running') return
    set({ eraseStatus: 'running', eraseResult: null })
    const resp = await aiErase({ input: eraseInput, intensity: eraseIntensity })
    if (!resp.ok || !resp.data) { set({ eraseStatus: 'error' }); return }
    set({ eraseStatus: 'done', eraseResult: resp.data.content })
  },

  clearTool: (tool) => {
    if (tool === 'outline') set({ outline: null, outlineStatus: 'idle' })
    else if (tool === 'worldview') set({ worldview: null, worldviewStatus: 'idle' })
    else if (tool === 'lorebook') set({ lorebook: [], lorebookStatus: 'idle' })
    else if (tool === 'prompt') set({ promptResult: null, promptStatus: 'idle' })
    else if (tool === 'deepseek') set({ deepseek: null, deepseekStatus: 'idle' })
    else if (tool === 'style') set({ styleResult: null, styleStatus: 'idle' })
    else if (tool === 'erase') set({ eraseResult: null, eraseStatus: 'idle' })
  },
}))
