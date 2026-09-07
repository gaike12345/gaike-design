// LLM 文本生成服务层（前端 → Vite proxy → Node 后端 → DeepSeek/模板）
// 已对接后端 API，自动携带 JWT auth header

import { api } from './api'

export interface ScriptCharacter {
  name: string
  desc: string
  role: string
}
export interface ScriptScene {
  id: number
  location: string
  shot: string
  description: string
  dialogue: string
  mood: string
}
export interface ScriptData {
  title: string
  synopsis: string
  characters: ScriptCharacter[]
  scenes: ScriptScene[]
  genre?: string
}
export interface DialogueLine {
  character: string
  line: string
  emotion: string
}

interface LlmResponse<T> {
  ok: boolean
  data?: T
  source?: 'llm' | 'template' | 'moderation'
  fallbackReason?: string
  error?: string
  // 内容审核拦截标记（输入/输出违规时后端返回 403 + source=moderation）
  blocked?: boolean
  stage?: 'input' | 'output'
  riskLevel?: 'low' | 'medium' | 'high'
}

async function postJson<T>(url: string, body: unknown): Promise<LlmResponse<T>> {
  try {
    return await api.post<LlmResponse<T>>(url, body)
  } catch (e: any) {
    // 403 内容审核拦截：返回带 blocked 标记的响应，便于前端显示违规提示
    if (e.status === 403 && e.data) {
      const errData = e.data as any
      if (errData.blocked || errData.source === 'moderation') {
        return {
          ok: false,
          source: 'moderation',
          error: errData.error || '内容审核拦截',
          blocked: true,
          stage: errData.stage,
          riskLevel: errData.riskLevel,
        } as unknown as LlmResponse<T>
      }
    }
    return { ok: false, error: e.message || '请求失败' }
  }
}

// 1. 脚本生成：主题 → 标题/简介/角色/分镜
export function generateScript(opts: {
  topic: string
  style?: string
  shots?: number
}) {
  return postJson<ScriptData>('/api/llm/script', opts)
}

// 2. 分镜拆解：长脚本 → 分镜列表
export function generateStoryboard(opts: { script: string; count?: number }) {
  return postJson<ScriptScene[]>('/api/llm/storyboard', opts)
}

// 3. 对白生成：角色 + 场景 → 对白
export function generateDialogue(opts: {
  characters: ScriptCharacter[] | string[]
  scene: string
  hint?: string
}) {
  return postJson<DialogueLine[]>('/api/llm/dialogue', opts)
}

// 4. Prompt 优化：中文描述 → AI 绘图 Prompt
export function enhancePrompt(opts: { input: string; ratio?: string }) {
  return postJson<{ prompt: string }>('/api/llm/enhance-prompt', opts)
}

// ==================== 写作板块 8 个 WR 工具 ====================

export interface OutlineAct {
  id: number
  name: string
  summary: string
  beats: string[]
}
export interface OutlineData {
  theme: string
  acts: OutlineAct[]
  characters: { name: string; role: string; arc: string }[]
}

export interface WorldviewData {
  name: string
  genre: string
  geography: string
  history: string
  factions: { name: string; desc: string; stance: string }[]
  rules: string[]
  culture: string
  conflicts: string
}

export interface LorebookEntry {
  key: string
  category: string
  content: string
  aliases: string[]
}
export interface LorebookData {
  entries: LorebookEntry[]
  existing: LorebookEntry[]
}

export interface DeepseekPath {
  id: number
  title: string
  development: string
  consequence: string
  drama: number
}
export interface DeepseekData {
  analysis: string
  paths: DeepseekPath[]
  recommendation: string
}

// WR-01 大纲生成
export function generateOutline(opts: { topic: string; style?: string }) {
  return postJson<OutlineData>('/api/llm/outline', opts)
}

// WR-05 世界观生成
export function generateWorldview(opts: { topic: string }) {
  return postJson<WorldviewData>('/api/llm/worldview', opts)
}

// WR-12 Lorebook 设定库（从源文本抽取词条）
export function generateLorebook(opts: { source: string; existing?: LorebookEntry[] }) {
  return postJson<LorebookData>('/api/llm/lorebook', opts)
}

// WR-19 Prompt 助手（自然语言 → 完整 AI 绘图 Prompt）
export function promptHelper(opts: { input: string; style?: string; ratio?: string }) {
  return postJson<{ prompt: string }>('/api/llm/prompt-helper', opts)
}

// WR-15 DeepSeek 推理（多路径推演）
export function deepseekReason(opts: { situation: string; options?: string[] }) {
  return postJson<DeepseekData>('/api/llm/deepseek', opts)
}

// WR-14 文风模仿
export function styleClone(opts: { sample: string; topic: string }) {
  return postJson<{ content: string; styleFeatures: string }>('/api/llm/style-clone', opts)
}

// WR-18 AI 消痕（去机审痕迹）
export function aiErase(opts: { input: string; intensity?: 'light' | 'medium' | 'heavy' }) {
  return postJson<{ content: string; before: string }>('/api/llm/ai-erase', opts)
}

// ==================== 蛙蛙写作对标：小说编辑器服务 ====================

// 题材/受众/视角/篇幅 维度
export type NovelGenre = '言情' | '现实情感' | '悬疑' | '惊悚' | '科幻' | '武侠' | '脑洞' | '通用'
export type NovelAudience = '男频' | '女频' | '全频'
export type NovelPov = '第一人称' | '第三人称'
export type NovelLength = '短篇小说' | '长篇小说'

// 三选一故事梗概方案
export interface SynopsisOption {
  id: string
  title: string
  synopsis: string
  tags: string[]
}
export interface SynopsisOptionsData {
  options: SynopsisOption[]
}

// 总纲
export interface MasterOutlineData {
  premise: string
  theme: string
  volumes: { name: string; summary: string }[]
  mainline: string
  ending: string
}

// 角色关系
export interface CharacterRelation {
  from: string
  to: string
  type: string
  desc: string
}
export interface CharacterRelationsData {
  relations: CharacterRelation[]
}

// 卷纲
export interface VolumeOutlineData {
  summary: string
  chapters: { title: string; summary: string }[]
  arc: string
}

// 章纲
export interface ChapterOutlineData {
  summary: string
  scenes: { location: string; description: string; dialogue: string; mood: string }[]
  cliffhanger: string
}

// 续写情节
export interface ContinuePlotData {
  development: string
  nextScene: string
  tension: number
}

// 脑洞灵感
export interface InspirationData {
  ideas: { title: string; synopsis: string; tags: string[] }[]
}

// 章节树（本地数据结构）
export interface ChapterNode {
  id: string
  title: string
  content: string
  wordCount: number
  chapterOutline?: ChapterOutlineData
}
export interface VolumeNode {
  id: string
  name: string
  summary: string
  chapters: ChapterNode[]
  volumeOutline?: VolumeOutlineData
}

// 三选一故事梗概
export function synopsisOptions(opts: {
  topic: string
  genre?: string
  audience?: string
  pov?: string
  length?: string
}) {
  return postJson<SynopsisOptionsData>('/api/llm/synopsis-options', opts)
}

// 生成总纲
export function masterOutline(opts: { topic: string; synopsis?: string; genre?: string }) {
  return postJson<MasterOutlineData>('/api/llm/master-outline', opts)
}

// 生成角色关系
export function characterRelations(opts: {
  characters: { name: string; desc?: string; role?: string }[]
  topic?: string
}) {
  return postJson<CharacterRelationsData>('/api/llm/character-relations', opts)
}

// 生成卷纲
export function volumeOutline(opts: { volumeName?: string; topic?: string; masterOutline?: string }) {
  return postJson<VolumeOutlineData>('/api/llm/volume-outline', opts)
}

// 生成章纲
export function chapterOutline(opts: { chapterTitle?: string; volumeSummary?: string; topic?: string }) {
  return postJson<ChapterOutlineData>('/api/llm/chapter-outline', opts)
}

// 续写正文
export function continueText(opts: { text: string; chapterContext?: string; words?: number }) {
  return postJson<{ content: string }>('/api/llm/continue-text', opts)
}

// 续写情节
export function continuePlot(opts: { text: string; direction?: string }) {
  return postJson<ContinuePlotData>('/api/llm/continue-plot', opts)
}

// 书名取名
export function bookTitle(opts: { topic?: string; synopsis?: string; genre?: string }) {
  return postJson<{ titles: string[] }>('/api/llm/book-title', opts)
}

// 导语生成
export function openingLine(opts: { topic?: string; synopsis?: string; style?: string }) {
  return postJson<{ content: string }>('/api/llm/opening-line', opts)
}

// 脑洞灵感
export function inspiration(opts: { keyword?: string; genre?: string }) {
  return postJson<InspirationData>('/api/llm/inspiration', opts)
}

// 智能对话（小Man）
export function smartChat(opts: { message: string; context?: string; novelInfo?: string }) {
  return postJson<{ content: string }>('/api/llm/smart-chat', opts)
}
