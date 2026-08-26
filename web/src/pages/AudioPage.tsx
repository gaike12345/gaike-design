import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import {
  Volume2,
  Music,
  Play,
  Pause,
  Mic,
  Trash2,
  Loader2,
  Sparkles,
  Clock,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useModelStore } from '../store/useModelStore'

/** 独立页面：/audio — 音频创作（TTS 配音 + BGM 生成） */

type AudioType = 'tts' | 'bgm'

interface AudioItem {
  id: string
  type: AudioType
  url: string
  duration: number
  label: string
}

interface TTSResult {
  url: string
  duration: number
  voice: string
}

interface BGMResult {
  url: string
  duration: number
  mood: string
}

const VOICE_OPTIONS = [
  { value: 'female-default', label: '默认女声' },
  { value: 'male', label: '男声' },
  { value: 'boy', label: '少年' },
  { value: 'girl', label: '少女' },
  { value: 'narration', label: '旁白' },
] as const

const MOOD_OPTIONS = [
  { value: 'happy', label: '欢快', emoji: '😊' },
  { value: 'sad', label: '悲伤', emoji: '😢' },
  { value: 'tense', label: '紧张', emoji: '⚡' },
  { value: 'calm', label: '宁静', emoji: '🌿' },
  { value: 'epic', label: '史诗', emoji: '⚔️' },
] as const

// 格式化秒为 mm:ss
function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

// 简易 id 生成
function genId(): string {
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AudioPage() {
  const { getModelsByType, fetchModels } = useModelStore()
  const [activeModel, setActiveModel] = useState<string>('')

  useEffect(() => { fetchModels('audio') }, [fetchModels])

  // TTS 状态
  const [ttsText, setTtsText] = useState('')
  const [ttsVoice, setTtsVoice] = useState<string>(VOICE_OPTIONS[0].value)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)

  // BGM 状态
  const [bgmMood, setBgmMood] = useState<string>(MOOD_OPTIONS[0].value)
  const [bgmDuration, setBgmDuration] = useState<number>(30)
  const [bgmLoading, setBgmLoading] = useState(false)
  const [bgmError, setBgmError] = useState<string | null>(null)

  // 结果列表 + 播放状态
  const [audioItems, setAudioItems] = useState<AudioItem[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  // ---- TTS 生成 ----
  const handleTTS = async () => {
    if (!ttsText.trim()) {
      setTtsError('请输入要合成的文本')
      return
    }
    setTtsLoading(true)
    setTtsError(null)
    try {
      const res = await api.post<TTSResult>('/api/audio/tts', {
        text: ttsText.trim(),
        voice: ttsVoice,
      })
      const voiceLabel =
        VOICE_OPTIONS.find((v) => v.value === res.voice)?.label || res.voice || ttsVoice
      const item: AudioItem = {
        id: genId(),
        type: 'tts',
        url: res.url,
        duration: res.duration ?? 0,
        label: `TTS · ${voiceLabel} · ${ttsText.trim().slice(0, 18)}${ttsText.trim().length > 18 ? '…' : ''}`,
      }
      setAudioItems((prev) => [item, ...prev])
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setTtsLoading(false)
    }
  }

  // ---- BGM 生成 ----
  const handleBGM = async () => {
    setBgmLoading(true)
    setBgmError(null)
    try {
      const res = await api.post<BGMResult>('/api/audio/music', {
        mood: bgmMood,
        duration: bgmDuration,
        style: 'auto',
      })
      const moodLabel =
        MOOD_OPTIONS.find((m) => m.value === res.mood)?.label || res.mood || bgmMood
      const item: AudioItem = {
        id: genId(),
        type: 'bgm',
        url: res.url,
        duration: res.duration ?? bgmDuration,
        label: `BGM · ${moodLabel} · ${bgmDuration}s`,
      }
      setAudioItems((prev) => [item, ...prev])
    } catch (e) {
      setBgmError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setBgmLoading(false)
    }
  }

  // ---- 播放/暂停 ----
  const togglePlay = (id: string) => {
    // 先暂停其他
    Object.entries(audioRefs.current).forEach(([k, el]) => {
      if (k !== id && el) {
        el.pause()
      }
    })

    const el = audioRefs.current[id]
    if (!el) return

    if (playingId === id) {
      // 当前正在播放 → 暂停
      el.pause()
      setPlayingId(null)
    } else {
      el.play().catch(() => {
        // 加载失败（如占位路径）也不崩溃
        setPlayingId(null)
      })
      setPlayingId(id)
    }
  }

  const handleAudioEnded = (id: string) => {
    if (playingId === id) setPlayingId(null)
  }

  // ---- 删除 ----
  const handleDelete = (id: string) => {
    const el = audioRefs.current[id]
    if (el) {
      el.pause()
    }
    if (playingId === id) setPlayingId(null)
    setAudioItems((prev) => prev.filter((i) => i.id !== id))
    delete audioRefs.current[id]
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* 标题区 — 音频强调色 pink */}
      <section className="bg-audio-50 py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-audio-600 ring-1 ring-audio-100">
              <Volume2 className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">音频创作</h1>
              <p className="text-sm text-slate-500">AI 配音 · BGM 情绪生成 · 一站式音频工具</p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">

        {/* 左右两栏 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左栏：音频生成工具 */}
          <div className="space-y-6">
            {/* A. TTS 配音面板 */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                  <Mic className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">TTS 配音</h2>
                <span className="ml-auto text-xs text-slate-400">文本转语音</span>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-slate-600">文本内容</label>
              <textarea
                value={ttsText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTtsText(e.target.value)}
                rows={4}
                placeholder="请输入要配音的文本，例如：角色 A：欢迎来到 AI 漫剧圈…"
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
              />

              {/* AI 模型选择 — 动态从后端获取 */}
              {getModelsByType('audio').length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-pink-700">AI 模型</label>
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value)}
                    className="w-full rounded-lg border border-pink-200 bg-white px-3 py-2 text-sm text-pink-800 focus:border-pink-400 focus:ring-1 focus:ring-pink-400"
                  >
                    {getModelsByType('audio').map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">音色</label>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                >
                  {VOICE_OPTIONS.map((v) => (
                    <option key={v.value} value={v.value}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>

              {ttsError && (
                <p className="mt-2 text-xs text-red-500">{ttsError}</p>
              )}

              <button
                onClick={handleTTS}
                disabled={ttsLoading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-audio-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-audio-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {ttsLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    生成配音
                  </>
                )}
              </button>
            </section>

            {/* B. BGM 生成面板 */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                  <Music className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">BGM 生成</h2>
                <span className="ml-auto text-xs text-slate-400">情绪驱动</span>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-slate-600">情绪</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((m) => {
                  const active = bgmMood === m.value
                  return (
                    <button
                      key={m.value}
                      onClick={() => setBgmMood(m.value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
                        active
                          ? 'border-audio-500 bg-audio-50 text-audio-700 ring-1 ring-audio-200'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-audio-200 hover:text-audio-600'
                      }`}
                    >
                      <span className="mr-1">{m.emoji}</span>
                      {m.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">时长</label>
                <input
                  type="range"
                  min={10}
                  max={60}
                  step={1}
                  value={bgmDuration}
                  onChange={(e) => setBgmDuration(Number(e.target.value))}
                  className="flex-1 accent-audio-600"
                />
                <span className="w-16 rounded-md bg-audio-50 px-2 py-1 text-right text-xs font-semibold text-audio-700">
                  {bgmDuration}s
                </span>
              </div>

              {bgmError && (
                <p className="mt-2 text-xs text-red-500">{bgmError}</p>
              )}

              <button
                onClick={handleBGM}
                disabled={bgmLoading}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-audio-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-audio-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {bgmLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    生成 BGM
                  </>
                )}
              </button>
            </section>
          </div>

          {/* 右栏：生成结果列表 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                <Volume2 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">生成结果</h2>
              <span className="ml-auto rounded-full bg-audio-50 px-2 py-0.5 text-xs font-medium text-audio-700">
                {audioItems.length} 条
              </span>
            </div>

            {audioItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-audio-50 text-audio-400 ring-1 ring-audio-100">
                  <Music className="h-7 w-7" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">还没有音频</p>
                <p className="mt-1 text-xs text-slate-400">
                  在左侧生成 TTS 配音或 BGM 后，结果会出现在这里
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {audioItems.map((item) => {
                  const isPlaying = playingId === item.id
                  const TypeIcon = item.type === 'tts' ? Mic : Music
                  const typeBadge =
                    item.type === 'tts'
                      ? 'bg-audio-50 text-audio-700'
                      : 'bg-audio-100 text-audio-800'
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 transition-all ${
                        isPlaying
                          ? 'border-audio-400 bg-audio-50/60 ring-1 ring-audio-200'
                          : 'border-slate-200 bg-white hover:border-audio-200'
                      }`}
                    >
                      {/* 顶部：类型 + 描述 + 时长 */}
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeBadge}`}
                        >
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {item.label}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {formatDuration(item.duration)}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadge}`}
                        >
                          {item.type === 'tts' ? 'TTS' : 'BGM'}
                        </span>
                      </div>

                      {/* 控件行 */}
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => togglePlay(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-audio-600 text-white shadow-sm transition-all hover:bg-audio-700"
                          title={isPlaying ? '暂停' : '播放'}
                        >
                          {isPlaying ? (
                            <Pause className="h-4 w-4" />
                          ) : (
                            <Play className="h-4 w-4 translate-x-[1px]" />
                          )}
                        </button>

                        {/* 进度条样式（占位） */}
                        <div className="relative h-9 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={`absolute inset-y-0 left-0 ${
                              isPlaying ? 'bg-audio-200' : 'bg-audio-100'
                            } transition-all`}
                            style={{ width: isPlaying ? '40%' : '0%' }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">
                            {isPlaying ? '播放中…' : '点击播放'}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* 隐藏 audio 标签，失败不崩溃 */}
                      <audio
                        ref={(el) => {
                          audioRefs.current[item.id] = el
                        }}
                        src={item.url}
                        onEnded={() => handleAudioEnded(item.id)}
                        onError={() => {
                          if (playingId === item.id) setPlayingId(null)
                        }}
                        preload="none"
                      />
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
