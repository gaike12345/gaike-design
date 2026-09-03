import { create } from 'zustand'
import {
  type ScriptData,
  type ScriptScene,
  type DialogueLine,
  type OutlineData,
  type WorldviewData,
  type LorebookEntry,
  type DeepseekData,
  type SynopsisOption,
  type MasterOutlineData,
  type CharacterRelationsData,
  type VolumeOutlineData,
  type ChapterOutlineData,
  type ContinuePlotData,
  type InspirationData,
  type VolumeNode,
  type ChapterNode,
} from '../services/textApi'
import { useEditorStore } from './useEditorStore'
import { useWRToolsStore, type WRToolKey } from './useWRToolsStore'
import { useScriptGenStore } from './useScriptGenStore'
import { useNovelStore } from './useNovelStore'
import type { LayoutType } from './useLayoutStore'

export type ScriptStatus = 'idle' | 'running' | 'done' | 'error'

// 风格预设（与 Studio 中模型/画风对齐，便于用户快速切换）
export const STYLE_PRESETS = [
  { id: 'general', label: '通用', desc: '不限类型' },
  { id: 'scifi', label: '科幻赛博', desc: '机甲/霓虹/未来' },
  { id: 'ancient', label: '古风仙侠', desc: '水墨/宫廷/江湖' },
  { id: 'campus', label: '校园青春', desc: '学生/恋爱/日常' },
  { id: 'mystery', label: '悬疑推理', desc: '侦探/迷案' },
  { id: 'cute', label: '萌系治愈', desc: '童话/小动物' },
  { id: 'horror', label: '惊悚恐怖', desc: '灵异/诡异' },
  { id: 'food', label: '美食', desc: '料理/味道' },
] as const

export type StyleId = (typeof STYLE_PRESETS)[number]['id']

interface ScriptState {
  // 输入参数
  topic: string
  style: string
  shots: number

  // 输出数据
  script: ScriptData | null
  dialogues: Record<number, DialogueLine[]> // key = scene.id

  // 状态
  status: ScriptStatus
  source: 'llm' | 'template' | 'moderation' | null
  error: string | null

  // 历史（最近一次为当前展示）
  history: ScriptData[]
  suggestions: string[]

  // setters
  setTopic: (v: string) => void
  setStyle: (v: string) => void
  setShots: (v: number) => void
  randomTopic: () => void

  // 主流程：生成完整脚本（含角色 + 分镜）
  runGenerate: () => Promise<void>

  // 单场景补生成对白
  runDialogue: (sceneId: number) => Promise<void>

  // 选定分镜 → 绘图 prompt（交给 useStudioStore 使用）
  sceneToPrompt: (scene: ScriptScene) => string

  // 桥接：一键把脚本+对白送入排版编辑器
  sendToLayout: (layout?: LayoutType) => void

  reset: () => void

  // ==================== 8 个 WR 工具状态 ====================

  // WR-01 大纲
  outline: OutlineData | null
  outlineStatus: ScriptStatus

  // WR-05 世界观
  worldview: WorldviewData | null
  worldviewStatus: ScriptStatus

  // WR-12 Lorebook（设定库，可在 Prompt 注入）
  lorebook: LorebookEntry[]
  lorebookStatus: ScriptStatus

  // WR-19 Prompt 助手
  promptResult: string | null
  promptStatus: ScriptStatus
  promptInput: string
  setPromptInput: (v: string) => void

  // WR-15 DeepSeek 推理
  deepseek: DeepseekData | null
  deepseekStatus: ScriptStatus
  deepseekSituation: string
  deepseekOptions: string
  setDeepseekSituation: (v: string) => void
  setDeepseekOptions: (v: string) => void

  // WR-14 文风模仿
  styleSample: string
  styleTopic: string
  styleResult: string | null
  styleStatus: ScriptStatus
  setStyleSample: (v: string) => void
  setStyleTopic: (v: string) => void

  // WR-18 AI 消痕
  eraseInput: string
  eraseIntensity: 'light' | 'medium' | 'heavy'
  eraseResult: string | null
  eraseStatus: ScriptStatus
  setEraseInput: (v: string) => void
  setEraseIntensity: (v: 'light' | 'medium' | 'heavy') => void

  // 通用：清空某个工具的结果
  clearTool: (tool: 'outline' | 'worldview' | 'lorebook' | 'prompt' | 'deepseek' | 'style' | 'erase') => void

  // WR 工具 actions
  runOutline: () => Promise<void>
  runWorldview: () => Promise<void>
  runLorebook: (source: string) => Promise<void>
  runPromptHelper: () => Promise<void>
  runDeepseek: () => Promise<void>
  runStyleClone: () => Promise<void>
  runAIErase: () => Promise<void>

  // Lorebook CRUD（手动增删改）
  addLore: (entry: LorebookEntry) => void
  updateLore: (key: string, partial: Partial<LorebookEntry>) => void
  removeLore: (key: string) => void

  // 角色卡 CRUD
  addCharacter: (char: { name: string; desc: string; role: string }) => void
  updateCharacter: (name: string, partial: { name?: string; desc?: string; role?: string }) => void
  removeCharacter: (name: string) => void

  // ==================== 蛙蛙写作对标：小说编辑器状态 ====================

  // 小说元数据
  novelGenre: string
  novelAudience: string
  novelPov: string
  novelLength: string
  setNovelGenre: (v: string) => void
  setNovelAudience: (v: string) => void
  setNovelPov: (v: string) => void
  setNovelLength: (v: string) => void

  // 引导式创作向导（0=一句话灵感 1=故事梗概3选1 2=大纲角色 3=正文）
  wizardStep: number
  wizardActive: boolean
  setWizardStep: (step: number) => void
  startWizard: () => void
  exitWizard: () => void

  // 三选一梗概
  synopsisOptions: SynopsisOption[]
  synopsisStatus: ScriptStatus
  selectedSynopsis: SynopsisOption | null
  runSynopsisOptions: () => Promise<void>
  selectSynopsis: (opt: SynopsisOption) => void

  // 总纲
  masterOutlineData: MasterOutlineData | null
  masterOutlineStatus: ScriptStatus
  runMasterOutline: () => Promise<void>

  // 角色关系
  characterRelationsData: CharacterRelationsData | null
  characterRelationsStatus: ScriptStatus
  runCharacterRelations: () => Promise<void>

  // 章节树
  volumes: VolumeNode[]
  activeVolumeId: string | null
  activeChapterId: string | null
  setActiveChapter: (volumeId: string, chapterId: string) => void
  addVolume: (name?: string) => void
  addChapter: (volumeId: string, title?: string) => void
  updateChapter: (volumeId: string, chapterId: string, partial: Partial<ChapterNode>) => void
  removeChapter: (volumeId: string, chapterId: string) => void
  removeVolume: (volumeId: string) => void
  reorderChapters: (volumeId: string, fromIdx: number, toIdx: number) => void

  // 卷纲/章纲
  currentVolumeOutline: VolumeOutlineData | null
  currentChapterOutline: ChapterOutlineData | null
  volumeOutlineStatus: ScriptStatus
  chapterOutlineStatus: ScriptStatus
  runVolumeOutline: (volumeId: string) => Promise<void>
  runChapterOutline: (volumeId: string, chapterId: string) => Promise<void>

  // 续写
  continueTextStatus: ScriptStatus
  continuePlotData: ContinuePlotData | null
  continuePlotStatus: ScriptStatus
  runContinueText: (volumeId: string, chapterId: string, words?: number) => Promise<void>
  runContinuePlot: (volumeId: string, chapterId: string, direction?: string) => Promise<void>

  // 书名/导语/灵感
  bookTitles: string[]
  bookTitleStatus: ScriptStatus
  openingLineResult: string | null
  openingLineStatus: ScriptStatus
  inspirationData: InspirationData | null
  inspirationStatus: ScriptStatus
  runBookTitle: () => Promise<void>
  runOpeningLine: (style?: string) => Promise<void>
  runInspiration: (keyword: string) => Promise<void>

  // 智能对话（小Man）
  chatMessages: { role: 'user' | 'assistant'; content: string }[]
  chatInput: string
  chatStatus: ScriptStatus
  setChatInput: (v: string) => void
  runSmartChat: () => Promise<void>
  clearChat: () => void

  // 编辑器设置
  editorFont: string
  editorFontSize: string
  editorIndent: boolean
  editorSpacing: boolean
  setEditorFont: (v: string) => void
  setEditorFontSize: (v: string) => void
  setEditorIndent: (v: boolean) => void
  setEditorSpacing: (v: boolean) => void

  // 当前章节字数统计
  currentChapterWordCount: () => number
  totalWordCount: () => number
}

// ============ Facade 聚合函数 ============
function aggregateState(): Partial<ScriptState> {
  const e = useEditorStore.getState()
  const w = useWRToolsStore.getState()
  const g = useScriptGenStore.getState()
  const n = useNovelStore.getState()
  return {
    topic: g.topic, style: g.style, shots: g.shots,
    script: g.script, dialogues: g.dialogues,
    status: g.status, source: g.source, error: g.error,
    history: g.history, suggestions: g.suggestions,
    characterRelationsData: g.characterRelationsData, characterRelationsStatus: g.characterRelationsStatus,

    outline: w.outline, outlineStatus: w.outlineStatus,
    worldview: w.worldview, worldviewStatus: w.worldviewStatus,
    lorebook: w.lorebook, lorebookStatus: w.lorebookStatus,
    promptResult: w.promptResult, promptStatus: w.promptStatus, promptInput: w.promptInput,
    deepseek: w.deepseek, deepseekStatus: w.deepseekStatus,
    deepseekSituation: w.deepseekSituation, deepseekOptions: w.deepseekOptions,
    styleSample: w.styleSample, styleTopic: w.styleTopic,
    styleResult: w.styleResult, styleStatus: w.styleStatus,
    eraseInput: w.eraseInput, eraseIntensity: w.eraseIntensity,
    eraseResult: w.eraseResult, eraseStatus: w.eraseStatus,

    novelGenre: n.novelGenre, novelAudience: n.novelAudience,
    novelPov: n.novelPov, novelLength: n.novelLength,
    wizardStep: n.wizardStep, wizardActive: n.wizardActive,
    synopsisOptions: n.synopsisOptions, synopsisStatus: n.synopsisStatus,
    selectedSynopsis: n.selectedSynopsis,
    masterOutlineData: n.masterOutlineData, masterOutlineStatus: n.masterOutlineStatus,
    volumes: n.volumes, activeVolumeId: n.activeVolumeId, activeChapterId: n.activeChapterId,
    currentVolumeOutline: n.currentVolumeOutline, currentChapterOutline: n.currentChapterOutline,
    volumeOutlineStatus: n.volumeOutlineStatus, chapterOutlineStatus: n.chapterOutlineStatus,
    continueTextStatus: n.continueTextStatus,
    continuePlotData: n.continuePlotData, continuePlotStatus: n.continuePlotStatus,
    bookTitles: n.bookTitles, bookTitleStatus: n.bookTitleStatus,
    openingLineResult: n.openingLineResult, openingLineStatus: n.openingLineStatus,
    inspirationData: n.inspirationData, inspirationStatus: n.inspirationStatus,
    chatMessages: n.chatMessages, chatInput: n.chatInput, chatStatus: n.chatStatus,

    editorFont: e.editorFont, editorFontSize: e.editorFontSize,
    editorIndent: e.editorIndent, editorSpacing: e.editorSpacing,
  }
}

export const useScriptStore = create<ScriptState>((set, _get) => {
  let syncing = false
  const sync = () => {
    if (syncing) return
    syncing = true
    try { set(aggregateState() as Partial<ScriptState>) } finally { syncing = false }
  }
  // 订阅 4 个子 store，任何变化都同步到 Facade
  useEditorStore.subscribe(sync)
  useWRToolsStore.subscribe(sync)
  useScriptGenStore.subscribe(sync)
  useNovelStore.subscribe(sync)

  return {
    ...(aggregateState() as ScriptState),

    // ========= ScriptGen Setters =========
    setTopic: (v) => useScriptGenStore.getState().setTopic(v),
    setStyle: (v) => useScriptGenStore.getState().setStyle(v),
    setShots: (v) => useScriptGenStore.getState().setShots(v),
    randomTopic: () => useScriptGenStore.getState().randomTopic(),

    // ========= WR Setters =========
    setPromptInput: (v) => useWRToolsStore.getState().setPromptInput(v),
    setDeepseekSituation: (v) => useWRToolsStore.getState().setDeepseekSituation(v),
    setDeepseekOptions: (v) => useWRToolsStore.getState().setDeepseekOptions(v),
    setStyleSample: (v) => useWRToolsStore.getState().setStyleSample(v),
    setStyleTopic: (v) => useWRToolsStore.getState().setStyleTopic(v),
    setEraseInput: (v) => useWRToolsStore.getState().setEraseInput(v),
    setEraseIntensity: (v) => useWRToolsStore.getState().setEraseIntensity(v),

    clearTool: (tool: WRToolKey) => useWRToolsStore.getState().clearTool(tool),

    // ========= ScriptGen Actions =========
    runGenerate: () => useScriptGenStore.getState().runGenerate(),
    runDialogue: (id) => useScriptGenStore.getState().runDialogue(id),
    sceneToPrompt: (s) => useScriptGenStore.getState().sceneToPrompt(s),
    sendToLayout: (layout) => useScriptGenStore.getState().sendToLayout(layout),
    reset: () => useScriptGenStore.getState().reset(),

  // ==================== 8 个 WR 工具 actions ====================

    // WR-01 大纲生成（转发）
    runOutline: async () => {
      const { topic, style } = useScriptGenStore.getState()
      return useWRToolsStore.getState().runOutline(topic, style)
    },

    // WR-05 世界观生成（转发）
    runWorldview: async () => {
      return useWRToolsStore.getState().runWorldview(useScriptGenStore.getState().topic)
    },

    // WR-12 Lorebook（转发）
    runLorebook: (source) => useWRToolsStore.getState().runLorebook(source),

    // WR-19 Prompt 助手（转发）
    runPromptHelper: () => useWRToolsStore.getState().runPromptHelper(useScriptGenStore.getState().style),

    // WR-15 DeepSeek（转发）
    runDeepseek: () => useWRToolsStore.getState().runDeepseek(),

    // WR-14 文风模仿（转发）
    runStyleClone: () => useWRToolsStore.getState().runStyleClone(),

    // WR-18 AI 消痕（转发）
    runAIErase: () => useWRToolsStore.getState().runAIErase(),

    // Lorebook CRUD（转发）
    addLore: (entry) => useWRToolsStore.getState().addLore(entry),
    updateLore: (key, partial) => useWRToolsStore.getState().updateLore(key, partial),
    removeLore: (key) => useWRToolsStore.getState().removeLore(key),

    // 角色 CRUD（转发）
    addCharacter: (char) => useScriptGenStore.getState().addCharacter(char),
    updateCharacter: (name, partial) => useScriptGenStore.getState().updateCharacter(name, partial),
    removeCharacter: (name) => useScriptGenStore.getState().removeCharacter(name),
    runCharacterRelations: () => useScriptGenStore.getState().runCharacterRelations(),

    // ========= Novel: 元数据 + 向导 =========
    setNovelGenre: (v) => useNovelStore.getState().setNovelGenre(v),
    setNovelAudience: (v) => useNovelStore.getState().setNovelAudience(v),
    setNovelPov: (v) => useNovelStore.getState().setNovelPov(v),
    setNovelLength: (v) => useNovelStore.getState().setNovelLength(v),
    setWizardStep: (step) => useNovelStore.getState().setWizardStep(step),
    startWizard: () => useNovelStore.getState().startWizard(),
    exitWizard: () => useNovelStore.getState().exitWizard(),

    // ========= Novel: 梗概 + 总纲 =========
    runSynopsisOptions: () => useNovelStore.getState().runSynopsisOptions(useScriptGenStore.getState().topic),
    selectSynopsis: (opt) => useNovelStore.getState().selectSynopsis(opt),
    runMasterOutline: () => useNovelStore.getState().runMasterOutline(useScriptGenStore.getState().topic),

    // ========= Novel: 章节树 =========
    setActiveChapter: (vId, cId) => useNovelStore.getState().setActiveChapter(vId, cId),
    addVolume: (name) => useNovelStore.getState().addVolume(name),
    addChapter: (vId, title) => useNovelStore.getState().addChapter(vId, title),
    updateChapter: (vId, cId, partial) => useNovelStore.getState().updateChapter(vId, cId, partial),
    removeChapter: (vId, cId) => useNovelStore.getState().removeChapter(vId, cId),
    removeVolume: (vId) => useNovelStore.getState().removeVolume(vId),
    reorderChapters: (vId, fromIdx, toIdx) => useNovelStore.getState().reorderChapters(vId, fromIdx, toIdx),

    // ========= Novel: 卷纲/章纲 =========
    runVolumeOutline: (vId) => useNovelStore.getState().runVolumeOutline(vId, useScriptGenStore.getState().topic),
    runChapterOutline: (vId, cId) => useNovelStore.getState().runChapterOutline(vId, cId, useScriptGenStore.getState().topic),

    // ========= Novel: 续写 =========
    runContinueText: (vId, cId, words) => useNovelStore.getState().runContinueText(vId, cId, words),
    runContinuePlot: (vId, cId, direction) => useNovelStore.getState().runContinuePlot(vId, cId, direction),

    // ========= Novel: 书名/导语/灵感 =========
    runBookTitle: () => useNovelStore.getState().runBookTitle(useScriptGenStore.getState().topic),
    runOpeningLine: (style) => useNovelStore.getState().runOpeningLine(useScriptGenStore.getState().topic, style),
    runInspiration: (keyword) => useNovelStore.getState().runInspiration(keyword, useNovelStore.getState().novelGenre),

    // ========= Novel: 智能对话 =========
    setChatInput: (v) => useNovelStore.getState().setChatInput(v),
    runSmartChat: () => useNovelStore.getState().runSmartChat(useScriptGenStore.getState().topic),
    clearChat: () => useNovelStore.getState().clearChat(),

    // ========= Editor: 设置 =========
    setEditorFont: (v) => useEditorStore.getState().setEditorFont(v),
    setEditorFontSize: (v) => useEditorStore.getState().setEditorFontSize(v),
    setEditorIndent: (v) => useEditorStore.getState().setEditorIndent(v),
    setEditorSpacing: (v) => useEditorStore.getState().setEditorSpacing(v),

    // ========= Derived: 字数统计（从 Novel volumes 计算） =========
    currentChapterWordCount: () => useNovelStore.getState().currentChapterWordCount(),
    totalWordCount: () => useNovelStore.getState().totalWordCount(),
  }
})

// ================================================================
//  setState 分发：WritingPane 中直接调用 useScriptStore.setState 更新 volumes 等字段
//  需要把 patch 按归属分发到对应的子 store
// ================================================================
const originalSetState = useScriptStore.setState
const EDITOR_KEYS = new Set(['editorFont', 'editorFontSize', 'editorIndent', 'editorSpacing'])
const WR_KEYS = new Set([
  'outline', 'outlineStatus',
  'worldview', 'worldviewStatus',
  'lorebook', 'lorebookStatus',
  'promptResult', 'promptStatus', 'promptInput',
  'deepseek', 'deepseekStatus', 'deepseekSituation', 'deepseekOptions',
  'styleSample', 'styleTopic', 'styleResult', 'styleStatus',
  'eraseInput', 'eraseIntensity', 'eraseResult', 'eraseStatus',
])
const GEN_KEYS = new Set([
  'topic', 'style', 'shots',
  'script', 'dialogues',
  'status', 'source', 'error',
  'history', 'suggestions',
  'characterRelationsData', 'characterRelationsStatus',
])

useScriptStore.setState = (partial: any, replace?: boolean) => {
  const patch = typeof partial === 'function'
    ? (partial as any)(useScriptStore.getState())
    : partial

  if (!patch) {
    ;(originalSetState as any)(partial, replace)
    return
  }

  const editorPatch: any = {}
  const wrPatch: any = {}
  const genPatch: any = {}
  const novelPatch: any = {}

  for (const [k, v] of Object.entries(patch)) {
    if (EDITOR_KEYS.has(k)) editorPatch[k] = v
    else if (WR_KEYS.has(k)) wrPatch[k] = v
    else if (GEN_KEYS.has(k)) genPatch[k] = v
    else novelPatch[k] = v
  }

  if (Object.keys(editorPatch).length) (useEditorStore.setState as any)(editorPatch, replace)
  if (Object.keys(wrPatch).length) (useWRToolsStore.setState as any)(wrPatch, replace)
  if (Object.keys(genPatch).length) (useScriptGenStore.setState as any)(genPatch, replace)
  if (Object.keys(novelPatch).length) (useNovelStore.setState as any)(novelPatch, replace)

  ;(originalSetState as any)(patch, replace)
}
