import { create } from 'zustand'
import {
  generateScript,
  generateDialogue,
  characterRelations,
  type ScriptData,
  type ScriptScene,
  type DialogueLine,
  type CharacterRelationsData,
} from '../services/textApi'
import { useLayoutStore, makeImageLayer, makeBubbleLayer, type LayoutType, type Layer } from './useLayoutStore'

export type ScriptStatus = 'idle' | 'running' | 'done' | 'error'

const TOPIC_SUGGESTIONS = [
  '霓虹都市中寻找失踪妹妹的机甲少女',
  '云游剑客误入仙山，遇见千年白狐',
  '高三同桌在毕业季的最后一次告白',
  '美食街深夜食堂老板与神秘食客',
  '森林精灵与迷路小猫的奇遇',
]

export interface ScriptGenState {
  // 输入参数
  topic: string
  style: string
  shots: number

  // 输出数据
  script: ScriptData | null
  dialogues: Record<number, DialogueLine[]>

  // 状态
  status: ScriptStatus
  source: 'llm' | 'template' | null
  error: string | null

  // 历史 + 建议
  history: ScriptData[]
  suggestions: string[]

  // 角色关系
  characterRelationsData: CharacterRelationsData | null
  characterRelationsStatus: ScriptStatus

  // Setters
  setTopic: (v: string) => void
  setStyle: (v: string) => void
  setShots: (v: number) => void
  randomTopic: () => void

  // 主流程
  runGenerate: () => Promise<void>
  runDialogue: (sceneId: number) => Promise<void>
  sceneToPrompt: (scene: ScriptScene) => string
  sendToLayout: (layout?: LayoutType) => void
  reset: () => void

  // 角色卡 CRUD（修改 script.characters）
  addCharacter: (char: { name: string; desc: string; role: string }) => void
  updateCharacter: (name: string, partial: { name?: string; desc?: string; role?: string }) => void
  removeCharacter: (name: string) => void

  // 角色关系
  runCharacterRelations: () => Promise<void>
}

export const useScriptGenStore = create<ScriptGenState>((set, get) => ({
  topic: '',
  style: '通用',
  shots: 5,
  script: null,
  dialogues: {},
  status: 'idle',
  source: null,
  error: null,
  history: [],
  suggestions: TOPIC_SUGGESTIONS,
  characterRelationsData: null,
  characterRelationsStatus: 'idle',

  setTopic: (v) => set({ topic: v }),
  setStyle: (v) => set({ style: v }),
  setShots: (v) => set({ shots: Math.max(1, Math.min(12, v)) }),
  randomTopic: () => {
    const pool = get().suggestions
    const next = pool[Math.floor(Math.random() * pool.length)]
    set({ topic: next })
  },

  runGenerate: async () => {
    const { topic, style, shots } = get()
    if (!topic.trim() || get().status === 'running') return

    set({ status: 'running', error: null })
    const resp = await generateScript({ topic, style, shots })
    if (!resp.ok || !resp.data) {
      set({ status: 'error', error: resp.error || '生成失败' })
      return
    }
    const script = resp.data
    set((state) => ({
      status: 'done',
      script,
      source: resp.source ?? null,
      dialogues: {},
      history: [script, ...state.history].slice(0, 20),
    }))
  },

  runDialogue: async (sceneId) => {
    const { script, dialogues, style } = get()
    if (!script) return
    const scene = script.scenes.find((s) => s.id === sceneId)
    if (!scene) return
    const resp = await generateDialogue({
      characters: script.characters,
      scene: `${scene.location}：${scene.description}`,
      hint: scene.mood,
    })
    if (!resp.ok || !resp.data) return
    set({
      dialogues: { ...dialogues, [sceneId]: resp.data },
      style,
    })
  },

  sceneToPrompt: (scene) => {
    const { script, style } = get()
    const chars = script?.characters
      .filter((c) => scene.description.includes(c.name))
      .map((c) => c.desc)
      .join('，')
    const styleHint = style && style !== '通用' ? `，${style}风格` : ''
    const base = scene.description
    return [chars, base].filter(Boolean).join('，') + styleHint + '，电影质感，8k'
  },

  sendToLayout: (layout = 'strip3') => {
    const { script, dialogues } = get()
    if (!script || script.scenes.length === 0) return
    const FRAME_HEIGHT = 540
    const PAGE_WIDTH = 1080
    const layers: Layer[] = []
    script.scenes.forEach((scene, i) => {
      layers.push(makeImageLayer({
        sceneId: scene.id,
        x: 0,
        y: i * FRAME_HEIGHT,
        w: PAGE_WIDTH,
        h: FRAME_HEIGHT,
      }))
      const dl = dialogues[scene.id]
      const bubbleTexts: string[] = []
      if (dl && dl.length > 0) {
        dl.forEach((line) => bubbleTexts.push(`${line.character}：${line.line}`))
      } else if (scene.dialogue) {
        bubbleTexts.push(scene.dialogue)
      }
      bubbleTexts.forEach((text, j) => {
        layers.push(makeBubbleLayer({
          text,
          x: 60,
          y: i * FRAME_HEIGHT + 30 + j * 95,
          w: 380,
          h: 80,
        }))
      })
    })
    const totalHeight = FRAME_HEIGHT * script.scenes.length
    useLayoutStore.getState().initFromScript(layers, layout, 'default', {
      width: PAGE_WIDTH,
      height: totalHeight,
    })
  },

  reset: () => set({
    topic: '', style: '通用', shots: 5, script: null, dialogues: {},
    status: 'idle', source: null, error: null,
  }),

  addCharacter: (char) => set((state) => {
    if (!state.script) return state
    if (state.script.characters.some((c) => c.name === char.name)) return state
    return {
      script: {
        ...state.script,
        characters: [...state.script.characters, char],
      },
    }
  }),
  updateCharacter: (name, partial) => set((state) => {
    if (!state.script) return state
    return {
      script: {
        ...state.script,
        characters: state.script.characters.map((c) =>
          c.name === name ? { ...c, ...partial } : c
        ),
      },
    }
  }),
  removeCharacter: (name) => set((state) => {
    if (!state.script) return state
    return {
      script: {
        ...state.script,
        characters: state.script.characters.filter((c) => c.name !== name),
      },
    }
  }),

  runCharacterRelations: async () => {
    const { script, topic } = get()
    const chars = script?.characters || []
    if (!chars.length || get().characterRelationsStatus === 'running') return
    set({ characterRelationsStatus: 'running', characterRelationsData: null })
    const resp = await characterRelations({ characters: chars, topic })
    if (!resp.ok || !resp.data) { set({ characterRelationsStatus: 'error' }); return }
    set({ characterRelationsStatus: 'done', characterRelationsData: resp.data })
  },
}))
