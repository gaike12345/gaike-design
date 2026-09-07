// 写作面板组合 Hook
//
// 原实现是 Facade 模式的 zustand store，通过 subscribe 同步 4 个子 store 的状态，
// 并重写 setState 实现反向分发。问题：状态重复、双向同步复杂、setState hack 脆弱。
//
// 新实现：纯组合的自定义 Hook，直接从 4 个子 store 选状态 + 绑定 action。
// 无状态重复、无同步开销、无 setState hack。
//
// 子 store 职责保持不变：
//   useScriptGenStore — 脚本生成（分镜、角色、对白）
//   useWRToolsStore   — 8 个 WR 工具（大纲/世界观/Lorebook/Prompt/DeepSeek/文风/消痕等）
//   useNovelStore     — 小说编辑器（章节树、向导、续写、智能对话等）
//   useEditorStore    — 编辑器设置（字体、字号、缩进、间距）

import { useMemo } from 'react'
import { useShallowStore } from './useShallowStore'
import type {
  ScriptData,
  ScriptScene,
  DialogueLine,
  OutlineData,
  WorldviewData,
  LorebookEntry,
  DeepseekData,
  SynopsisOption,
  MasterOutlineData,
  CharacterRelationsData,
  VolumeOutlineData,
  ChapterOutlineData,
  ContinuePlotData,
  InspirationData,
  VolumeNode,
  ChapterNode,
} from '../services/textApi'
import { useScriptGenStore, type ScriptGenState } from './useScriptGenStore'
import { useWRToolsStore, type WRToolsState, type WRToolKey } from './useWRToolsStore'
import { useNovelStore, type NovelState } from './useNovelStore'
import { useEditorStore, type EditorState } from './useEditorStore'
import type { LayoutType } from './useLayoutStore'

export type ScriptStatus = 'idle' | 'running' | 'done' | 'error'

// 风格预设（保留导出，WritingPane 未直接使用，但保持对外 API 兼容）
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

// ========= 组合后的状态类型（WritingPane 中用到的全集） =========
export interface WritingPaneState {
  // —— ScriptGen ——
  topic: string
  style: string
  shots: number
  script: ScriptData | null
  dialogues: Record<number, DialogueLine[]>
  status: ScriptStatus
  source: 'llm' | 'template' | 'moderation' | null
  error: string | null
  history: ScriptData[]
  suggestions: string[]
  characterRelationsData: CharacterRelationsData | null
  characterRelationsStatus: ScriptStatus

  setTopic: (v: string) => void
  setStyle: (v: string) => void
  setShots: (v: number) => void
  randomTopic: () => void
  runGenerate: () => Promise<void>
  runDialogue: (sceneId: number) => Promise<void>
  sceneToPrompt: (scene: ScriptScene) => string
  sendToLayout: (layout?: LayoutType) => void
  reset: () => void
  addCharacter: (char: { name: string; desc: string; role: string }) => void
  updateCharacter: (name: string, partial: { name?: string; desc?: string; role?: string }) => void
  removeCharacter: (name: string) => void
  runCharacterRelations: () => Promise<void>

  // —— WR Tools ——
  outline: OutlineData | null
  outlineStatus: ScriptStatus
  worldview: WorldviewData | null
  worldviewStatus: ScriptStatus
  lorebook: LorebookEntry[]
  lorebookStatus: ScriptStatus
  promptResult: string | null
  promptStatus: ScriptStatus
  promptInput: string
  deepseek: DeepseekData | null
  deepseekStatus: ScriptStatus
  deepseekSituation: string
  deepseekOptions: string
  styleSample: string
  styleTopic: string
  styleResult: string | null
  styleStatus: ScriptStatus
  eraseInput: string
  eraseIntensity: 'light' | 'medium' | 'heavy'
  eraseResult: string | null
  eraseStatus: ScriptStatus

  setPromptInput: (v: string) => void
  setDeepseekSituation: (v: string) => void
  setDeepseekOptions: (v: string) => void
  setStyleSample: (v: string) => void
  setStyleTopic: (v: string) => void
  setEraseInput: (v: string) => void
  setEraseIntensity: (v: 'light' | 'medium' | 'heavy') => void
  clearTool: (tool: WRToolKey) => void
  runOutline: () => Promise<void>
  runWorldview: () => Promise<void>
  runLorebook: (source: string) => Promise<void>
  runPromptHelper: () => Promise<void>
  runDeepseek: () => Promise<void>
  runStyleClone: () => Promise<void>
  runAIErase: () => Promise<void>
  addLore: (entry: LorebookEntry) => void
  updateLore: (key: string, partial: Partial<LorebookEntry>) => void
  removeLore: (key: string) => void

  // —— Novel ——
  novelGenre: string
  novelAudience: string
  novelPov: string
  novelLength: string
  wizardStep: number
  wizardActive: boolean
  synopsisOptions: SynopsisOption[]
  synopsisStatus: ScriptStatus
  selectedSynopsis: SynopsisOption | null
  masterOutlineData: MasterOutlineData | null
  masterOutlineStatus: ScriptStatus
  volumes: VolumeNode[]
  activeVolumeId: string | null
  activeChapterId: string | null
  currentVolumeOutline: VolumeOutlineData | null
  currentChapterOutline: ChapterOutlineData | null
  volumeOutlineStatus: ScriptStatus
  chapterOutlineStatus: ScriptStatus
  continueTextStatus: ScriptStatus
  continuePlotData: ContinuePlotData | null
  continuePlotStatus: ScriptStatus
  bookTitles: string[]
  bookTitleStatus: ScriptStatus
  openingLineResult: string | null
  openingLineStatus: ScriptStatus
  inspirationData: InspirationData | null
  inspirationStatus: ScriptStatus
  chatMessages: { role: 'user' | 'assistant'; content: string }[]
  chatInput: string
  chatStatus: ScriptStatus

  setNovelGenre: (v: string) => void
  setNovelAudience: (v: string) => void
  setNovelPov: (v: string) => void
  setNovelLength: (v: string) => void
  setWizardStep: (step: number) => void
  startWizard: () => void
  exitWizard: () => void
  runSynopsisOptions: () => Promise<void>
  selectSynopsis: (opt: SynopsisOption) => void
  runMasterOutline: () => Promise<void>
  setActiveChapter: (volumeId: string, chapterId: string) => void
  addVolume: (name?: string) => void
  addChapter: (volumeId: string, title?: string) => void
  updateChapter: (volumeId: string, chapterId: string, partial: Partial<ChapterNode>) => void
  removeChapter: (volumeId: string, chapterId: string) => void
  removeVolume: (volumeId: string) => void
  reorderChapters: (volumeId: string, fromIdx: number, toIdx: number) => void
  runVolumeOutline: (volumeId: string) => Promise<void>
  runChapterOutline: (volumeId: string, chapterId: string) => Promise<void>
  runContinueText: (volumeId: string, chapterId: string, words?: number) => Promise<void>
  runContinuePlot: (volumeId: string, chapterId: string, direction?: string) => Promise<void>
  runBookTitle: () => Promise<void>
  runOpeningLine: (style?: string) => Promise<void>
  runInspiration: (keyword: string) => Promise<void>
  setChatInput: (v: string) => void
  runSmartChat: () => Promise<void>
  clearChat: () => void
  currentChapterWordCount: () => number
  totalWordCount: () => number

  // —— Editor ——
  editorFont: string
  editorFontSize: string
  editorIndent: boolean
  editorSpacing: boolean
  setEditorFont: (v: string) => void
  setEditorFontSize: (v: string) => void
  setEditorIndent: (v: boolean) => void
  setEditorSpacing: (v: boolean) => void
}

// ========= 选择器：从子 store 提取 WritingPane 用到的 state =========
function selectGen(s: ScriptGenState) {
  return {
    topic: s.topic, style: s.style, shots: s.shots,
    script: s.script, dialogues: s.dialogues,
    status: s.status, source: s.source, error: s.error,
    history: s.history, suggestions: s.suggestions,
    characterRelationsData: s.characterRelationsData,
    characterRelationsStatus: s.characterRelationsStatus,
  }
}

function selectWR(s: WRToolsState) {
  return {
    outline: s.outline, outlineStatus: s.outlineStatus,
    worldview: s.worldview, worldviewStatus: s.worldviewStatus,
    lorebook: s.lorebook, lorebookStatus: s.lorebookStatus,
    promptResult: s.promptResult, promptStatus: s.promptStatus, promptInput: s.promptInput,
    deepseek: s.deepseek, deepseekStatus: s.deepseekStatus,
    deepseekSituation: s.deepseekSituation, deepseekOptions: s.deepseekOptions,
    styleSample: s.styleSample, styleTopic: s.styleTopic,
    styleResult: s.styleResult, styleStatus: s.styleStatus,
    eraseInput: s.eraseInput, eraseIntensity: s.eraseIntensity,
    eraseResult: s.eraseResult, eraseStatus: s.eraseStatus,
  }
}

function selectNovel(s: NovelState) {
  return {
    novelGenre: s.novelGenre, novelAudience: s.novelAudience,
    novelPov: s.novelPov, novelLength: s.novelLength,
    wizardStep: s.wizardStep, wizardActive: s.wizardActive,
    synopsisOptions: s.synopsisOptions, synopsisStatus: s.synopsisStatus,
    selectedSynopsis: s.selectedSynopsis,
    masterOutlineData: s.masterOutlineData, masterOutlineStatus: s.masterOutlineStatus,
    volumes: s.volumes, activeVolumeId: s.activeVolumeId, activeChapterId: s.activeChapterId,
    currentVolumeOutline: s.currentVolumeOutline, currentChapterOutline: s.currentChapterOutline,
    volumeOutlineStatus: s.volumeOutlineStatus, chapterOutlineStatus: s.chapterOutlineStatus,
    continueTextStatus: s.continueTextStatus,
    continuePlotData: s.continuePlotData, continuePlotStatus: s.continuePlotStatus,
    bookTitles: s.bookTitles, bookTitleStatus: s.bookTitleStatus,
    openingLineResult: s.openingLineResult, openingLineStatus: s.openingLineStatus,
    inspirationData: s.inspirationData, inspirationStatus: s.inspirationStatus,
    chatMessages: s.chatMessages, chatInput: s.chatInput, chatStatus: s.chatStatus,
  }
}

function selectEditor(s: EditorState) {
  return {
    editorFont: s.editorFont, editorFontSize: s.editorFontSize,
    editorIndent: s.editorIndent, editorSpacing: s.editorSpacing,
  }
}

// ========= 组合 Hook =========
export function useScriptStore(): WritingPaneState {
  const genState = useShallowStore(useScriptGenStore, selectGen)
  const wrState = useShallowStore(useWRToolsStore, selectWR)
  const novelState = useShallowStore(useNovelStore, selectNovel)
  const editorState = useShallowStore(useEditorStore, selectEditor)

  // Action 在每次渲染时重新绑定（事件处理器调用 .getState() 取最新值）
  const actions = useMemo(() => buildActions(), [])

  return useMemo(() => ({
    ...genState,
    ...wrState,
    ...novelState,
    ...editorState,
    ...actions,
  }), [genState, wrState, novelState, editorState, actions])
}

// —— 构建 action 对象：所有 action 都转发到对应子 store 的 .getState() ——
// 这样做的好处：action 引用稳定（useMemo 一次），调用时读取子 store 的最新状态
function buildActions(): Omit<WritingPaneState, keyof ReturnType<typeof selectGen>
  | keyof ReturnType<typeof selectWR>
  | keyof ReturnType<typeof selectNovel>
  | keyof ReturnType<typeof selectEditor>> {

  const g = () => useScriptGenStore.getState()
  const w = () => useWRToolsStore.getState()
  const n = () => useNovelStore.getState()
  const e = () => useEditorStore.getState()

  return {
    // —— ScriptGen setters ——
    setTopic: (v) => g().setTopic(v),
    setStyle: (v) => g().setStyle(v),
    setShots: (v) => g().setShots(v),
    randomTopic: () => g().randomTopic(),

    // —— ScriptGen actions ——
    runGenerate: () => g().runGenerate(),
    runDialogue: (id) => g().runDialogue(id),
    sceneToPrompt: (s) => g().sceneToPrompt(s),
    sendToLayout: (layout) => g().sendToLayout(layout),
    reset: () => g().reset(),
    addCharacter: (char) => g().addCharacter(char),
    updateCharacter: (name, partial) => g().updateCharacter(name, partial),
    removeCharacter: (name) => g().removeCharacter(name),
    runCharacterRelations: () => g().runCharacterRelations(),

    // —— WR setters ——
    setPromptInput: (v) => w().setPromptInput(v),
    setDeepseekSituation: (v) => w().setDeepseekSituation(v),
    setDeepseekOptions: (v) => w().setDeepseekOptions(v),
    setStyleSample: (v) => w().setStyleSample(v),
    setStyleTopic: (v) => w().setStyleTopic(v),
    setEraseInput: (v) => w().setEraseInput(v),
    setEraseIntensity: (v) => w().setEraseIntensity(v),
    clearTool: (tool) => w().clearTool(tool),

    // —— WR actions（需要跨 store 数据的，在调用时通过 .getState() 读取）——
    runOutline: async () => {
      const { topic, style } = g()
      return w().runOutline(topic, style)
    },
    runWorldview: async () => {
      return w().runWorldview(g().topic)
    },
    runLorebook: (source) => w().runLorebook(source),
    runPromptHelper: async () => {
      return w().runPromptHelper(g().style)
    },
    runDeepseek: () => w().runDeepseek(),
    runStyleClone: () => w().runStyleClone(),
    runAIErase: () => w().runAIErase(),

    // —— WR Lorebook CRUD ——
    addLore: (entry) => w().addLore(entry),
    updateLore: (key, partial) => w().updateLore(key, partial),
    removeLore: (key) => w().removeLore(key),

    // —— Novel: 元数据 + 向导 ——
    setNovelGenre: (v) => n().setNovelGenre(v),
    setNovelAudience: (v) => n().setNovelAudience(v),
    setNovelPov: (v) => n().setNovelPov(v),
    setNovelLength: (v) => n().setNovelLength(v),
    setWizardStep: (step) => n().setWizardStep(step),
    startWizard: () => n().startWizard(),
    exitWizard: () => n().exitWizard(),

    // —— Novel: 梗概 + 总纲（需要 topic）——
    runSynopsisOptions: async () => n().runSynopsisOptions(g().topic),
    selectSynopsis: (opt) => n().selectSynopsis(opt),
    runMasterOutline: async () => n().runMasterOutline(g().topic),

    // —— Novel: 章节树 ——
    setActiveChapter: (vId, cId) => n().setActiveChapter(vId, cId),
    addVolume: (name) => n().addVolume(name),
    addChapter: (vId, title) => n().addChapter(vId, title),
    updateChapter: (vId, cId, partial) => n().updateChapter(vId, cId, partial),
    removeChapter: (vId, cId) => n().removeChapter(vId, cId),
    removeVolume: (vId) => n().removeVolume(vId),
    reorderChapters: (vId, fromIdx, toIdx) => n().reorderChapters(vId, fromIdx, toIdx),

    // —— Novel: 卷纲/章纲（需要 topic）——
    runVolumeOutline: async (vId) => n().runVolumeOutline(vId, g().topic),
    runChapterOutline: async (vId, cId) => n().runChapterOutline(vId, cId, g().topic),

    // —— Novel: 续写 ——
    runContinueText: (vId, cId, words) => n().runContinueText(vId, cId, words),
    runContinuePlot: (vId, cId, direction) => n().runContinuePlot(vId, cId, direction),

    // —— Novel: 书名/导语/灵感（需要 topic / genre）——
    runBookTitle: async () => n().runBookTitle(g().topic),
    runOpeningLine: async (style) => n().runOpeningLine(g().topic, style),
    runInspiration: async (keyword) => n().runInspiration(keyword, n().novelGenre),

    // —— Novel: 智能对话 ——
    setChatInput: (v) => n().setChatInput(v),
    runSmartChat: async () => n().runSmartChat(g().topic),
    clearChat: () => n().clearChat(),

    // —— Novel: 字数统计 ——
    currentChapterWordCount: () => n().currentChapterWordCount(),
    totalWordCount: () => n().totalWordCount(),

    // —— Editor 设置 ——
    setEditorFont: (v) => e().setEditorFont(v),
    setEditorFontSize: (v) => e().setEditorFontSize(v),
    setEditorIndent: (v) => e().setEditorIndent(v),
    setEditorSpacing: (v) => e().setEditorSpacing(v),
  }
}
