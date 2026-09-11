/**
 * LLM 路由类型定义 — 从 routes/llm.ts 提取
 */

export interface SynopsisOption { id: string; title: string; synopsis: string; tags: string[] }
export interface SynopsisOptionsData { options: SynopsisOption[] }

export interface MasterOutlineData {
  premise: string
  theme: string
  volumes: { name: string; summary: string }[]
  mainline: string
  ending: string
}

export interface CharacterRelationsData {
  relations: { from: string; to: string; type: string; desc: string }[]
}

export interface VolumeOutlineData {
  summary: string
  chapters: { title: string; summary: string }[]
  arc: string
}

export interface ChapterOutlineData {
  summary: string
  scenes: { location: string; description: string; dialogue: string; mood: string }[]
  cliffhanger: string
}

export interface ContinuePlotData {
  development: string
  nextScene: string
  tension: number
}

export interface InspirationData {
  ideas: { title: string; synopsis: string; tags: string[] }[]
}

export interface OutlineAct { id: number; name: string; summary: string; beats: string[] }
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

export interface LorebookEntry { key: string; category: string; content: string; aliases: string[] }
export interface LorebookData { entries: LorebookEntry[]; existing: LorebookEntry[] }

export interface DeepseekPath { id: number; title: string; development: string; consequence: string; drama: number }
export interface DeepseekData { analysis: string; paths: DeepseekPath[]; recommendation: string }

export interface ScriptCharacter { name: string; desc: string; role: string }
export interface ScriptScene { id: number; location: string; shot: string; description: string; dialogue: string; mood: string }
export interface ScriptData {
  title: string
  synopsis: string
  characters: ScriptCharacter[]
  scenes: ScriptScene[]
  genre?: string
}

export interface DialogueLine { character: string; line: string; emotion: string }
