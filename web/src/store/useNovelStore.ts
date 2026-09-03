import { create } from 'zustand'
import {
  synopsisOptions,
  masterOutline,
  volumeOutline as volumeOutlineApi,
  chapterOutline as chapterOutlineApi,
  continueText,
  continuePlot,
  bookTitle,
  openingLine,
  inspiration,
  smartChat,
  type SynopsisOption,
  type MasterOutlineData,
  type VolumeOutlineData,
  type ChapterOutlineData,
  type ContinuePlotData,
  type InspirationData,
  type VolumeNode,
  type ChapterNode,
} from '../services/textApi'

export type ScriptStatus = 'idle' | 'running' | 'done' | 'error'

export interface NovelState {
  novelGenre: string
  novelAudience: string
  novelPov: string
  novelLength: string
  setNovelGenre: (v: string) => void
  setNovelAudience: (v: string) => void
  setNovelPov: (v: string) => void
  setNovelLength: (v: string) => void

  // 当前选择的小说 AI 模型（null = 使用后端默认）
  novelModel: string | null
  setNovelModel: (modelId: string | null) => void

  wizardStep: number
  wizardActive: boolean
  setWizardStep: (step: number) => void
  startWizard: () => void
  exitWizard: () => void

  synopsisOptions: SynopsisOption[]
  synopsisStatus: ScriptStatus
  selectedSynopsis: SynopsisOption | null
  runSynopsisOptions: (topic: string) => Promise<void>
  selectSynopsis: (opt: SynopsisOption) => void

  masterOutlineData: MasterOutlineData | null
  masterOutlineStatus: ScriptStatus
  runMasterOutline: (topic: string) => Promise<void>

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

  currentVolumeOutline: VolumeOutlineData | null
  currentChapterOutline: ChapterOutlineData | null
  volumeOutlineStatus: ScriptStatus
  chapterOutlineStatus: ScriptStatus
  runVolumeOutline: (volumeId: string, topic: string) => Promise<void>
  runChapterOutline: (volumeId: string, chapterId: string, topic: string) => Promise<void>

  continueTextStatus: ScriptStatus
  continuePlotData: ContinuePlotData | null
  continuePlotStatus: ScriptStatus
  runContinueText: (volumeId: string, chapterId: string, words?: number) => Promise<void>
  runContinuePlot: (volumeId: string, chapterId: string, direction?: string) => Promise<void>

  bookTitles: string[]
  bookTitleStatus: ScriptStatus
  openingLineResult: string | null
  openingLineStatus: ScriptStatus
  inspirationData: InspirationData | null
  inspirationStatus: ScriptStatus
  runBookTitle: (topic: string) => Promise<void>
  runOpeningLine: (topic: string, style?: string) => Promise<void>
  runInspiration: (keyword: string, genre: string) => Promise<void>

  chatMessages: { role: 'user' | 'assistant'; content: string }[]
  chatInput: string
  chatStatus: ScriptStatus
  setChatInput: (v: string) => void
  runSmartChat: (topic: string) => Promise<void>
  clearChat: () => void

  currentChapterWordCount: () => number
  totalWordCount: () => number
}

export const useNovelStore = create<NovelState>((set, get) => ({
  novelGenre: '通用',
  novelAudience: '全频',
  novelPov: '第三人称',
  novelLength: '长篇小说',
  setNovelGenre: (v) => set({ novelGenre: v }),
  setNovelAudience: (v) => set({ novelAudience: v }),
  setNovelPov: (v) => set({ novelPov: v }),
  setNovelLength: (v) => set({ novelLength: v }),

  novelModel: null,
  setNovelModel: (modelId) => set({ novelModel: modelId }),

  wizardStep: 0,
  wizardActive: false,
  setWizardStep: (step) => set({ wizardStep: Math.max(0, Math.min(3, step)) }),
  startWizard: () => set({ wizardActive: true, wizardStep: 0 }),
  exitWizard: () => set({ wizardActive: false }),

  synopsisOptions: [],
  synopsisStatus: 'idle',
  selectedSynopsis: null,
  runSynopsisOptions: async (topic) => {
    const { novelGenre, novelAudience, novelPov, novelLength, novelModel, synopsisStatus } = get()
    if (!topic.trim() || synopsisStatus === 'running') return
    set({ synopsisStatus: 'running', synopsisOptions: [], selectedSynopsis: null })
    const resp = await synopsisOptions({ topic, genre: novelGenre, audience: novelAudience, pov: novelPov, length: novelLength, model: novelModel || undefined })
    if (!resp.ok || !resp.data) { set({ synopsisStatus: 'error' }); return }
    set({ synopsisStatus: 'done', synopsisOptions: resp.data.options })
  },
  selectSynopsis: (opt) => set({ selectedSynopsis: opt, wizardStep: 2 }),

  masterOutlineData: null,
  masterOutlineStatus: 'idle',
  runMasterOutline: async (topic) => {
    const { selectedSynopsis, novelGenre, masterOutlineStatus } = get()
    if (!topic.trim() || masterOutlineStatus === 'running') return
    set({ masterOutlineStatus: 'running', masterOutlineData: null })
    const resp = await masterOutline({ topic, synopsis: selectedSynopsis?.synopsis || '', genre: novelGenre })
    if (!resp.ok || !resp.data) { set({ masterOutlineStatus: 'error' }); return }
    set({ masterOutlineStatus: 'done', masterOutlineData: resp.data })
    const vols: VolumeNode[] = resp.data.volumes.map((v, vi) => ({
      id: `vol_${Date.now()}_${vi}`, name: v.name, summary: v.summary, chapters: [],
    }))
    set({ volumes: vols, activeVolumeId: vols[0]?.id || null })
  },

  volumes: [],
  activeVolumeId: null,
  activeChapterId: null,
  setActiveChapter: (volumeId, chapterId) => set({ activeVolumeId: volumeId, activeChapterId: chapterId }),
  addVolume: (name) => {
    const id = `vol_${Date.now()}`
    const vol: VolumeNode = { id, name: name || `第${get().volumes.length + 1}卷`, summary: '', chapters: [] }
    set((s) => ({ volumes: [...s.volumes, vol], activeVolumeId: id }))
  },
  addChapter: (volumeId, title) => {
    const id = `ch_${Date.now()}`
    set((s) => ({
      volumes: s.volumes.map((v) => {
        if (v.id !== volumeId) return v
        const ch: ChapterNode = { id, title: title || `第${v.chapters.length + 1}章`, content: '', wordCount: 0 }
        return { ...v, chapters: [...v.chapters, ch] }
      }),
      activeVolumeId: volumeId,
      activeChapterId: id,
    }))
  },
  updateChapter: (volumeId, chapterId, partial) => {
    set((s) => ({
      volumes: s.volumes.map((v) =>
        v.id !== volumeId ? v : {
          ...v,
          chapters: v.chapters.map((c) => {
            if (c.id !== chapterId) return c
            const updated = { ...c, ...partial }
            if (partial.content !== undefined) updated.wordCount = partial.content.replace(/\s/g, '').length
            return updated
          }),
        }
      ),
    }))
  },
  removeChapter: (volumeId, chapterId) => {
    set((s) => ({
      volumes: s.volumes.map((v) => v.id !== volumeId ? v : { ...v, chapters: v.chapters.filter((c) => c.id !== chapterId) }),
      activeChapterId: s.activeChapterId === chapterId ? null : s.activeChapterId,
    }))
  },
  removeVolume: (volumeId) => {
    set((s) => ({
      volumes: s.volumes.filter((v) => v.id !== volumeId),
      activeVolumeId: s.activeVolumeId === volumeId ? null : s.activeVolumeId,
    }))
  },
  reorderChapters: (volumeId, fromIdx, toIdx) => {
    set((s) => ({
      volumes: s.volumes.map((v) => {
        if (v.id !== volumeId) return v
        const chapters = [...v.chapters]
        const [moved] = chapters.splice(fromIdx, 1)
        chapters.splice(toIdx, 0, moved)
        return { ...v, chapters }
      }),
    }))
  },

  currentVolumeOutline: null,
  currentChapterOutline: null,
  volumeOutlineStatus: 'idle',
  chapterOutlineStatus: 'idle',
  runVolumeOutline: async (volumeId, topic) => {
    const { volumes, volumeOutlineStatus } = get()
    const vol = volumes.find((v) => v.id === volumeId)
    if (!vol || volumeOutlineStatus === 'running') return
    set({ volumeOutlineStatus: 'running' })
    const resp = await volumeOutlineApi({ volumeName: vol.name, topic })
    if (!resp.ok || !resp.data) { set({ volumeOutlineStatus: 'error' }); return }
    set({ volumeOutlineStatus: 'done', currentVolumeOutline: resp.data })
    const newChapters: ChapterNode[] = resp.data.chapters.map((c, i) => ({
      id: `ch_${Date.now()}_${i}`, title: c.title, content: '', wordCount: 0,
    }))
    set((s) => ({
      volumes: s.volumes.map((v) => v.id !== volumeId ? v : { ...v, chapters: newChapters, volumeOutline: resp.data }),
    }))
  },
  runChapterOutline: async (volumeId, chapterId, topic) => {
    const { volumes, chapterOutlineStatus } = get()
    const vol = volumes.find((v) => v.id === volumeId)
    const ch = vol?.chapters.find((c) => c.id === chapterId)
    if (!ch || chapterOutlineStatus === 'running') return
    set({ chapterOutlineStatus: 'running' })
    const resp = await chapterOutlineApi({ chapterTitle: ch.title, volumeSummary: vol?.summary || '', topic })
    if (!resp.ok || !resp.data) { set({ chapterOutlineStatus: 'error' }); return }
    set({ chapterOutlineStatus: 'done', currentChapterOutline: resp.data })
    set((s) => ({
      volumes: s.volumes.map((v) => v.id !== volumeId ? v : {
        ...v,
        chapters: v.chapters.map((c) => c.id !== chapterId ? c : { ...c, chapterOutline: resp.data }),
      }),
    }))
  },

  continueTextStatus: 'idle',
  continuePlotData: null,
  continuePlotStatus: 'idle',
  runContinueText: async (volumeId, chapterId, words = 500) => {
    const { volumes, masterOutlineData, novelModel, continueTextStatus } = get()
    const ch = volumes.find((v) => v.id === volumeId)?.chapters.find((c) => c.id === chapterId)
    if (!ch || !ch.content || continueTextStatus === 'running') return
    set({ continueTextStatus: 'running' })
    const resp = await continueText({ text: ch.content, chapterContext: masterOutlineData?.mainline || '', words, model: novelModel || undefined })
    if (!resp.ok || !resp.data) { set({ continueTextStatus: 'error' }); return }
    set({ continueTextStatus: 'done' })
    get().updateChapter(volumeId, chapterId, { content: ch.content + '\n' + resp.data.content })
  },
  runContinuePlot: async (volumeId, chapterId, direction) => {
    const { volumes, novelModel, continuePlotStatus } = get()
    const ch = volumes.find((v) => v.id === volumeId)?.chapters.find((c) => c.id === chapterId)
    if (!ch || !ch.content || continuePlotStatus === 'running') return
    set({ continuePlotStatus: 'running', continuePlotData: null })
    const resp = await continuePlot({ text: ch.content, direction, model: novelModel || undefined })
    if (!resp.ok || !resp.data) { set({ continuePlotStatus: 'error' }); return }
    set({ continuePlotStatus: 'done', continuePlotData: resp.data })
  },

  bookTitles: [],
  bookTitleStatus: 'idle',
  openingLineResult: null,
  openingLineStatus: 'idle',
  inspirationData: null,
  inspirationStatus: 'idle',
  runBookTitle: async (topic) => {
    const { selectedSynopsis, novelGenre, bookTitleStatus } = get()
    if (bookTitleStatus === 'running') return
    set({ bookTitleStatus: 'running', bookTitles: [] })
    const resp = await bookTitle({ topic, synopsis: selectedSynopsis?.synopsis || '', genre: novelGenre })
    if (!resp.ok || !resp.data) { set({ bookTitleStatus: 'error' }); return }
    set({ bookTitleStatus: 'done', bookTitles: resp.data.titles })
  },
  runOpeningLine: async (topic, style = '黄金开篇') => {
    const { selectedSynopsis, openingLineStatus } = get()
    if (openingLineStatus === 'running') return
    set({ openingLineStatus: 'running', openingLineResult: null })
    const resp = await openingLine({ topic, synopsis: selectedSynopsis?.synopsis || '', style })
    if (!resp.ok || !resp.data) { set({ openingLineStatus: 'error' }); return }
    set({ openingLineStatus: 'done', openingLineResult: resp.data.content })
  },
  runInspiration: async (keyword, genre) => {
    if (get().inspirationStatus === 'running') return
    set({ inspirationStatus: 'running', inspirationData: null })
    const resp = await inspiration({ keyword, genre })
    if (!resp.ok || !resp.data) { set({ inspirationStatus: 'error' }); return }
    set({ inspirationStatus: 'done', inspirationData: resp.data })
  },

  chatMessages: [],
  chatInput: '',
  chatStatus: 'idle',
  setChatInput: (v) => set({ chatInput: v }),
  runSmartChat: async (topic) => {
    const { chatInput, chatMessages, selectedSynopsis, masterOutlineData, chatStatus } = get()
    if (!chatInput.trim() || chatStatus === 'running') return
    const userMsg = chatInput.trim()
    const newMessages = [...chatMessages, { role: 'user' as const, content: userMsg }]
    set({ chatStatus: 'running', chatMessages: newMessages, chatInput: '' })
    const novelInfo = `主题:${topic};梗概:${selectedSynopsis?.synopsis || '无'};总纲:${masterOutlineData?.mainline || '无'}`
    const resp = await smartChat({ message: userMsg, novelInfo, context: chatMessages.slice(-3).map(m => `${m.role}:${m.content}`).join(';') })
    if (!resp.ok || !resp.data) { set({ chatStatus: 'error' }); return }
    set({ chatStatus: 'done', chatMessages: [...newMessages, { role: 'assistant', content: resp.data.content }] })
  },
  clearChat: () => set({ chatMessages: [], chatInput: '', chatStatus: 'idle' }),

  currentChapterWordCount: () => {
    const { volumes, activeVolumeId, activeChapterId } = get()
    const ch = volumes.find((v) => v.id === activeVolumeId)?.chapters.find((c) => c.id === activeChapterId)
    return ch ? ch.wordCount : 0
  },
  totalWordCount: () => get().volumes.reduce((sum, v) => sum + v.chapters.reduce((s, c) => s + c.wordCount, 0), 0),
}))
