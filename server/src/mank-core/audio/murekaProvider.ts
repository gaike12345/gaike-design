/**
 * Mureka API 客户端 — AI 音乐生成
 * 文档: https://platform.mureka.ai/docs/
 *
 * 核心接口:
 *   POST /v1/song/generate       词 → 完整歌曲（异步）
 *   POST /v1/song/easy-generate  提示词 → 完整歌曲（异步）
 *   POST /v1/instrumental/generate 提示词 → 纯音乐（异步）
 *   POST /v1/lyrics/generate     提示词 → 歌词（同步）
 *   POST /v1/lyrics/extend       歌词续写（同步）
 *   GET  /v1/song/query/{id}     轮询歌曲任务
 *   GET  /v1/instrumental/query/{id} 轮询纯音乐任务
 *   POST /v1/files/upload        上传参考歌曲/旋律/人声文件
 *   POST /v1/song/vocal-clone    音色克隆（上传人声样本→生成 vocal_id）
 */

import path from 'path'
import fs from 'fs'
import { BusinessError, SystemError } from '../../mank-common/errors'

const MUREKA_BASE = process.env.MUREKA_BASE_URL || 'https://api.mureka.cn'
const MUREKA_KEY = process.env.MUREKA_API_KEY || ''

export type MurekaModel = 'auto' | 'mureka-9.5' | 'mureka-9' | 'mureka-8' | 'mureka-o2'
export type MurekaTaskStatus = 'preparing' | 'queued' | 'running' | 'streaming' | 'succeeded' | 'failed' | 'timeouted' | 'cancelled'
export type MurekaGender = 'female' | 'male'

export interface MurekaSongChoice {
  index: number
  url: string
  flac_url?: string
  wav_url?: string
  duration: number
  title?: string
  style?: string
  prompt?: string
  stream_url?: string
}

export interface MurekaTaskResult {
  id: string
  created_at: number
  finished_at?: number
  model: string
  status: MurekaTaskStatus
  failed_reason?: string
  trace_id?: string
  choices?: MurekaSongChoice[]
}

export interface MurekaLyricsResult {
  title: string
  lyrics: string
}

export interface SongGenerateParams {
  lyrics: string
  model?: MurekaModel
  prompt?: string
  gender?: MurekaGender
  reference_id?: string
  vocal_id?: string
  melody_id?: string
  n?: number
  stream?: boolean
}

export interface EasyGenerateParams {
  prompt: string
  model?: MurekaModel
  n?: number
}

export interface InstrumentalParams {
  prompt?: string
  model?: MurekaModel
  instrumental_id?: string
  n?: number
}

export interface SongExtendParams {
  audio_id: string
  lyrics: string
  model?: MurekaModel
  prompt?: string
}

export interface SoundtrackParams {
  media_url: string
  media_type: 'image' | 'video'
  prompt?: string
  title?: string
  model?: MurekaModel
}

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' }
  if (MUREKA_KEY) h.Authorization = `Bearer ${MUREKA_KEY}`
  return h
}

async function postJSON<T>(p: string, body: unknown, timeout = 30000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${MUREKA_BASE}${p}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
      throw new SystemError(`Mureka API error: ${msg}`)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

async function getJSON<T>(p: string, timeout = 30000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(`${MUREKA_BASE}${p}`, {
      method: 'GET',
      headers: headers(),
      signal: ctrl.signal,
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
      throw new SystemError(`Mureka API error: ${msg}`)
    }
    return data as T
  } finally {
    clearTimeout(timer)
  }
}

export function isConfigured(): boolean {
  return !!MUREKA_KEY
}

/** 提交歌曲生成任务（歌词 + 风格提示词 → 完整歌曲） */
export async function generateSong(params: SongGenerateParams): Promise<MurekaTaskResult> {
  const payload: Record<string, unknown> = {
    lyrics: params.lyrics,
    model: params.model || 'auto',
  }
  if (params.prompt) payload.prompt = params.prompt
  if (params.gender) payload.gender = params.gender
  if (params.reference_id) payload.reference_id = params.reference_id
  if (params.vocal_id) payload.vocal_id = params.vocal_id
  if (params.melody_id) payload.melody_id = params.melody_id
  if (params.n) payload.n = params.n
  if (params.stream) payload.stream = params.stream

  return postJSON<MurekaTaskResult>('/v1/song/generate', payload)
}

/** 提交简单模式歌曲生成（仅提示词 → 完整歌曲，AI 自动生成歌词） */
export async function easyGenerateSong(params: EasyGenerateParams): Promise<MurekaTaskResult> {
  const payload: Record<string, unknown> = {
    prompt: params.prompt,
    model: params.model || 'auto',
  }
  if (params.n) payload.n = params.n

  return postJSON<MurekaTaskResult>('/v1/song/easy-generate', payload)
}

/** 提交纯音乐生成任务 */
export async function generateInstrumental(params: InstrumentalParams): Promise<MurekaTaskResult> {
  const payload: Record<string, unknown> = {
    model: params.model || 'auto',
  }
  if (params.prompt) payload.prompt = params.prompt
  if (params.instrumental_id) payload.instrumental_id = params.instrumental_id
  if (params.n) payload.n = params.n

  return postJSON<MurekaTaskResult>('/v1/instrumental/generate', payload)
}

/** 生成歌词（同步返回） */
export async function generateLyrics(prompt: string): Promise<MurekaLyricsResult> {
  return postJSON<MurekaLyricsResult>('/v1/lyrics/generate', { prompt })
}

/** 续写歌词（同步返回） */
export async function extendLyrics(lyrics: string): Promise<{ lyrics: string }> {
  return postJSON<{ lyrics: string }>('/v1/lyrics/extend', { lyrics })
}

/** 歌曲续写（基于已有歌曲继续创作） */
export async function extendSong(params: SongExtendParams): Promise<MurekaTaskResult> {
  const payload: Record<string, unknown> = {
    audio_id: params.audio_id,
    lyrics: params.lyrics,
    model: params.model || 'auto',
  }
  if (params.prompt) payload.prompt = params.prompt
  return postJSON<MurekaTaskResult>('/v1/song/extend', payload)
}

/** 图片/视频配乐生成 */
export async function generateSoundtrack(params: SoundtrackParams): Promise<MurekaTaskResult> {
  const payload: Record<string, unknown> = {
    media_url: params.media_url,
    media_type: params.media_type,
    model: params.model || 'auto',
  }
  if (params.prompt) payload.prompt = params.prompt
  if (params.title) payload.title = params.title
  return postJSON<MurekaTaskResult>('/v1/soundtrack/generate', payload)
}

/** 查询歌曲任务状态 */
export async function querySongTask(taskId: string): Promise<MurekaTaskResult> {
  return getJSON<MurekaTaskResult>(`/v1/song/query/${taskId}`)
}

/** 查询纯音乐任务状态 */
export async function queryInstrumentalTask(taskId: string): Promise<MurekaTaskResult> {
  return getJSON<MurekaTaskResult>(`/v1/instrumental/query/${taskId}`)
}

export type FilePurpose = 'reference' | 'vocal' | 'melody' | 'instrumental' | 'voice' | 'audio' | 'remix' | 'soundtrack' | 'lyrics-video'

export interface MurekaFileResult {
  id: string
  bytes: number
  created_at: number
  filename: string
  purpose: string
}

export interface MurekaVocalCloneResult {
  vocal_id: string
  description: string
  created_at: number
}

/**
 * 上传文件到 Mureka（参考歌曲/旋律/人声样本等）
 * purpose=reference: 参考歌曲（30s，mp3/m4a）
 * purpose=vocal: 人声样本（15-30s，用于 reference_id+vocal_id 组合）
 * purpose=melody: 旋律样本（5-60s，mp3/m4a/mid）
 */
export async function uploadFile(filePath: string, purpose: FilePurpose): Promise<MurekaFileResult> {
  const fileBuffer = fs.readFileSync(filePath)
  const filename = path.basename(filePath)

  const formData = new FormData()
  const blob = new Blob([fileBuffer])
  formData.append('file', blob, filename)
  formData.append('purpose', purpose)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120000)
  try {
    const res = await fetch(`${MUREKA_BASE}/v1/files/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MUREKA_KEY}` },
      body: formData,
      signal: ctrl.signal,
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
      throw new SystemError(`Mureka upload error: ${msg}`)
    }
    return data as MurekaFileResult
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 音色克隆：上传人声样本 → 生成可复用的 vocal_id
 * 支持格式: mp3, m4a; 文件 < 10MB; 时长 15-30s（超出自动裁剪）
 */
export async function vocalClone(filePath: string, description?: string): Promise<MurekaVocalCloneResult> {
  const fileBuffer = fs.readFileSync(filePath)
  const filename = path.basename(filePath)

  const formData = new FormData()
  const blob = new Blob([fileBuffer])
  formData.append('file', blob, filename)
  if (description) formData.append('description', description)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120000)
  try {
    const res = await fetch(`${MUREKA_BASE}/v1/song/vocal-clone`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${MUREKA_KEY}` },
      body: formData,
      signal: ctrl.signal,
    })
    const data = await res.json()
    if (!res.ok) {
      const msg = (data as { error?: { message?: string } })?.error?.message || `HTTP ${res.status}`
      throw new SystemError(`Mureka vocal clone error: ${msg}`)
    }
    return data as MurekaVocalCloneResult
  } finally {
    clearTimeout(timer)
  }
}

/** 下载音频文件到本地 */
export async function downloadAudio(url: string, destDir: string, filename: string): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 120000)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new SystemError(`下载失败: HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    const dest = path.join(destDir, filename)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    return dest
  } finally {
    clearTimeout(timer)
  }
}

/** 终态判断 */
export function isTerminal(status: MurekaTaskStatus): boolean {
  return ['succeeded', 'failed', 'timeouted', 'cancelled'].includes(status)
}

/** 模型列表（供前端展示） */
export const MUREKA_MODELS = [
  { value: 'auto' as const, label: '自动（最新模型）' },
  { value: 'mureka-9.5' as const, label: 'Mureka V9.5（最新）' },
  { value: 'mureka-9' as const, label: 'Mureka V9' },
  { value: 'mureka-8' as const, label: 'Mureka V8' },
] as const
