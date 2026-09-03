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
  Plus,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useModelStore } from '../store/useModelStore'
import DemoBadge from '../components/ui/DemoBadge'
import { useQuotaStore } from '../store/useQuotaStore'
import { useCostEstimate, formatTokensCompact } from '../hooks/useCostEstimate'
import { CostBadge } from '../components/ui/CostBadge'

/** 独立页面：/audio — 音频创作（TTS 配音 + BGM 生成） */

type AudioType = 'tts' | 'bgm'

interface AudioItem {
  id: string
  type: AudioType
  url: string
  duration: number
  label: string
  placeholder?: boolean
}

interface TTSResult {
  placeholder?: boolean
  url: string
  duration: number
  voice: string
}

interface BGMResult {
  placeholder?: boolean
  url: string
  duration: number
  mood: string
}

const VOICE_OPTIONS = [
  { value: 'female-default', label: '默认女声' },
] as const

const MOOD_OPTIONS = [
  { value: 'happy', label: '欢快', emoji: '😊' },
  { value: 'sad', label: '悲伤', emoji: '😢' },
  { value: 'tense', label: '紧张', emoji: '⚡' },
  { value: 'calm', label: '宁静', emoji: '🌿' },
  { value: 'epic', label: '史诗', emoji: '⚔️' },
] as const

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function genId(): string {
  return `audio-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function AudioPage() {
  const { getModelsByType, fetchModels } = useModelStore()
  const [activeModel, setActiveModel] = useState<string>('')
  useEffect(() => { fetchModels('audio') }, [fetchModels])

  const refreshQuota = useQuotaStore((s) => s.refreshQuota)
  const remainingTokens = useQuotaStore((s) => s.quota.remainingTokens)
  const quotaLoading = useQuotaStore((s) => s.loading)
  useEffect(() => { void refreshQuota({ force: false }) }, [refreshQuota])

  const [ttsText, setTtsText] = useState('')
  const [ttsVoice, setTtsVoice] = useState<string>(VOICE_OPTIONS[0].value)
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)

  const [bgmMood, setBgmMood] = useState<string>(MOOD_OPTIONS[0].value)
  const [bgmDuration, setBgmDuration] = useState<number>(30)
  const [bgmLoading, setBgmLoading] = useState(false)
  const [bgmError, setBgmError] = useState<string | null>(null)

  const ttsEst = useCostEstimate('audio.tts', { voice: ttsVoice, text: ttsText, textLen: ttsText.length })
  const musicEst = useCostEstimate('audio.music', { model: activeModel || undefined, duration: bgmDuration })

  const [audioItems, setAudioItems] = useState<AudioItem[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})

  const handleTTS = async () => {
    if (!ttsText.trim()) {
      setTtsError('请输入要合成的文本')
      return
    }
    if (ttsEst.lowBalance) {
      setTtsError(`积分不足：本次预计消耗 ${formatTokensCompact(ttsEst.tokens ?? 0)}，您还剩 ${formatTokensCompact(ttsEst.remaining)}。请前往「设置 → 积分」充值。`)
      return
    }
    setTtsLoading(true)
    setTtsError(null)
    try {
      const res = await api.post<TTSResult>('/api/audio/tts', {
        text: ttsText.trim(),
        voice: ttsVoice,
      })
      ttsEst.consume()
      const voiceLabel =
        VOICE_OPTIONS.find((v) => v.value === res.voice)?.label || res.voice || ttsVoice
      const item: AudioItem = {
        id: genId(),
        type: 'tts',
        url: res.url,
        duration: res.duration ?? 0,
        label: `TTS · ${voiceLabel} · ${ttsText.trim().slice(0, 18)}${ttsText.trim().length > 18 ? '…' : ''}`,
        placeholder: res.placeholder,
      }
      setAudioItems((prev) => [item, ...prev])
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setTtsLoading(false)
    }
  }

  const handleBGM = async () => {
    if (musicEst.lowBalance) {
      setBgmError(`积分不足：本次预计消耗 ${formatTokensCompact(musicEst.tokens ?? 0)}，您还剩 ${formatTokensCompact(musicEst.remaining)}。请前往「设置 → 积分」充值。`)
      return
    }
    setBgmLoading(true)
    setBgmError(null)
    try {
      const res = await api.post<BGMResult>('/api/audio/music', {
        mood: bgmMood,
        duration: bgmDuration,
        style: 'auto',
      })
      musicEst.consume()
      const moodLabel =
        MOOD_OPTIONS.find((m) => m.value === res.mood)?.label || res.mood || bgmMood
      const item: AudioItem = {
        id: genId(),
        type: 'bgm',
        url: res.url,
        duration: res.duration ?? bgmDuration,
        label: `BGM · ${moodLabel} · ${bgmDuration}s`,
        placeholder: res.placeholder,
      }
      setAudioItems((prev) => [item, ...prev])
    } catch (e) {
      setBgmError(e instanceof Error ? e.message : '生成失败，请稍后重试')
    } finally {
      setBgmLoading(false)
    }
  }

  const togglePlay = (id: string) => {
    Object.entries(audioRefs.current).forEach(([k, el]) => {
      if (k !== id && el) { el.pause() }
    })
    const el = audioRefs.current[id]
    if (!el) return
    if (playingId === id) {
      el.pause()
      setPlayingId(null)
    } else {
      el.play().catch(() => { setPlayingId(null) })
      setPlayingId(id)
    }
  }

  const handleAudioEnded = (id: string) => {
    if (playingId === id) setPlayingId(null)
  }

  const handleDelete = (id: string) => {
    const el = audioRefs.current[id]
    if (el) { el.pause() }
    if (playingId === id) setPlayingId(null)
    setAudioItems((prev) => prev.filter((i) => i.id !== id))
    delete audioRefs.current[id]
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <section className="bg-audio-50 py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-audio-600 ring-1 ring-audio-100">
              <Volume2 className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">音频创作</h1>
              <p className="text-sm text-neutral-500">AI 配音 · BGM 情绪生成 · 一站式音频工具</p>
            </div>
            {/* 顶部积分余额徽章 */}
            <div className="flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 shadow-sm">
              <span className="h-4 w-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-[9px] font-black text-white shadow-inner">₵</span>
              <span className="text-[13px] font-semibold tabular-nums text-amber-700"
                title={quotaLoading ? '积分读取中…' : `剩余积分 ${formatTokensCompact(remainingTokens)}`}>
                {quotaLoading ? '…' : formatTokensCompact(remainingTokens)}
              </span>
              <button
                onClick={() => window.location.assign('/settings#quota')}
                className="ml-1 h-5 w-5 rounded-md bg-amber-500/15 text-amber-600 hover:bg-amber-500/25 border border-amber-500/30 flex items-center justify-center transition-colors"
                title="前往积分充值中心"
              >
                <Plus className="h-2.5 w-2.5" />
              </button>
            </div>
            <DemoBadge variant="md" className="flex-shrink-0" />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4">
          <DemoBadge variant="banner">
            当前为 MVP 演示阶段，TTS 配音与 BGM 生成返回占位音频文件，生产环境将对接真实 TTS / 音乐生成服务。
          </DemoBadge>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                  <Mic className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-neutral-900">TTS 配音</h2>
                <span className="ml-auto text-xs text-neutral-400">文本转语音</span>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-neutral-600">文本内容</label>
              <textarea
                value={ttsText}
                onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setTtsText(e.target.value)}
                rows={4}
                placeholder="请输入要配音的文本，例如：角色 A：欢迎来到 AI 漫剧圈…"
                className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
              />

              {getModelsByType('audio').length > 0 && (
                <div className="space-y-1.5 mt-3">
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
                <label className="text-xs font-medium text-neutral-600">音色</label>
                <select
                  value={ttsVoice}
                  onChange={(e) => setTtsVoice(e.target.value)}
                  className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                >
                  {VOICE_OPTIONS.map((v) => (<option key={v.value} value={v.value}>{v.label}</option>))}
                </select>
              </div>

              {ttsError && <p className="mt-2 text-xs text-red-500">{ttsError}</p>}

              <button
                onClick={handleTTS}
                disabled={ttsLoading || ttsEst.lowBalance}
                className={
                  'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (ttsEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                }
                title={
                  ttsEst.tokens && ttsEst.tokens > 0
                    ? ttsEst.lowBalance
                      ? `积分不足：需要 ${formatTokensCompact(ttsEst.tokens)}，剩余 ${formatTokensCompact(ttsEst.remaining)}`
                      : `本次预计消耗 ${formatTokensCompact(ttsEst.tokens)} 积分`
                    : '生成配音'
                }
              >
                {ttsLoading
                  ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中…</>)
                  : (<><Sparkles className="h-4 w-4" />生成配音
                     <CostBadge tokens={ttsEst.tokens} loading={ttsEst.loading} lowBalance={ttsEst.lowBalance} /></>)}
              </button>
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                  <Music className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-neutral-900">BGM 生成</h2>
                <span className="ml-auto text-xs text-neutral-400">情绪驱动</span>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-neutral-600">情绪</label>
              <div className="flex flex-wrap gap-2">
                {MOOD_OPTIONS.map((m) => {
                  const active = bgmMood === m.value
                  return (
                    <button
                      key={m.value}
                      onClick={() => setBgmMood(m.value)}
                      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${active ? 'border-audio-500 bg-audio-50 text-audio-700 ring-1 ring-audio-200' : 'border-neutral-200 bg-white text-neutral-600 hover:border-audio-200 hover:text-audio-600'}`}
                    >
                      <span className="mr-1">{m.emoji}</span>{m.label}
                    </button>
                  )
                })}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <label className="text-xs font-medium text-neutral-600">时长</label>
                <input
                  type="range" min={10} max={60} step={1}
                  value={bgmDuration}
                  onChange={(e) => setBgmDuration(Number(e.target.value))}
                  className="flex-1 accent-audio-600"
                />
                <span className="w-16 rounded-md bg-audio-50 px-2 py-1 text-right text-xs font-semibold text-audio-700">{bgmDuration}s</span>
              </div>

              {bgmError && <p className="mt-2 text-xs text-red-500">{bgmError}</p>}

              <button
                onClick={handleBGM}
                disabled={bgmLoading || musicEst.lowBalance}
                className={
                  'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                  (musicEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                }
                title={
                  musicEst.tokens && musicEst.tokens > 0
                    ? musicEst.lowBalance
                      ? `积分不足：需要 ${formatTokensCompact(musicEst.tokens)}，剩余 ${formatTokensCompact(musicEst.remaining)}`
                      : `本次预计消耗 ${formatTokensCompact(musicEst.tokens)} 积分`
                    : '生成 BGM'
                }
              >
                {bgmLoading
                  ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中…</>)
                  : (<><Sparkles className="h-4 w-4" />生成 BGM
                     <CostBadge tokens={musicEst.tokens} loading={musicEst.loading} lowBalance={musicEst.lowBalance} /></>)}
              </button>
            </section>
          </div>

          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                <Volume2 className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-neutral-900">生成结果</h2>
              <span className="ml-auto rounded-full bg-audio-50 px-2 py-0.5 text-xs font-medium text-audio-700">{audioItems.length} 条</span>
            </div>

            {audioItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-audio-50 text-audio-400 ring-1 ring-audio-100">
                  <Music className="h-7 w-7" />
                </div>
                <p className="mt-3 text-sm font-medium text-neutral-600">还没有音频</p>
                <p className="mt-1 text-xs text-neutral-400">在左侧生成 TTS 配音或 BGM 后，结果会出现在这里</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {audioItems.map((item) => {
                  const isPlaying = playingId === item.id
                  const TypeIcon = item.type === 'tts' ? Mic : Music
                  const typeBadge = item.type === 'tts' ? 'bg-audio-50 text-audio-700' : 'bg-audio-100 text-audio-800'
                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 transition-all ${isPlaying ? 'border-audio-400 bg-audio-50/60 ring-1 ring-audio-200' : 'border-neutral-200 bg-white hover:border-audio-200'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeBadge}`}>
                          <TypeIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">{item.label}</p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-neutral-400">
                            <Clock className="h-3 w-3" />{formatDuration(item.duration)}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadge}`}>
                          {item.type === 'tts' ? 'TTS' : 'BGM'}
                        </span>
                        {item.placeholder && <DemoBadge />}
                      </div>

                      <div className="mt-3 flex items-center gap-2">
                        <button
                          onClick={() => togglePlay(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-audio-600 text-white shadow-sm transition-all hover:bg-audio-700"
                          title={isPlaying ? '暂停' : '播放'}
                        >
                          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
                        </button>
                        <div className="relative h-9 flex-1 overflow-hidden rounded-full bg-neutral-100">
                          <div className={`absolute inset-y-0 left-0 ${isPlaying ? 'bg-audio-200' : 'bg-audio-100'} transition-all`} style={{ width: isPlaying ? '40%' : '0%' }} />
                          <div className="absolute inset-0 flex items-center justify-center text-xs text-neutral-400">{isPlaying ? '播放中…' : '点击播放'}</div>
                        </div>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-red-50 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <audio
                        ref={(el) => { audioRefs.current[item.id] = el }}
                        src={item.url}
                        onEnded={() => handleAudioEnded(item.id)}
                        onError={() => { if (playingId === item.id) setPlayingId(null) }}
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