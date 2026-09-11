import { useState, useRef, useEffect, useCallback, type ChangeEvent } from 'react'
import {
  Volume2, Music, Play, Pause, Mic, Trash2, Loader2, Sparkles,
  Clock, Plus, Wand2, RefreshCw, AlertCircle, Download, FileMusic,
  Image as ImageIcon, Video, Upload, Zap, FileText, Copy, User,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import DemoBadge from '../components/ui/DemoBadge'
import { useQuotaStore } from '../store/useQuotaStore'
import { useCostEstimate, formatTokensCompact } from '../hooks/useCostEstimate'
import { CostBadge } from '../components/ui/CostBadge'

type AudioMode = 'easy' | 'song' | 'instrumental' | 'soundtrack' | 'tts'
type TaskStatus = 'preparing' | 'queued' | 'running' | 'streaming' | 'succeeded' | 'failed' | 'timeouted' | 'cancelled'

interface SongChoice {
  index: number
  url: string
  flac_url?: string
  wav_url?: string
  duration: number
  title?: string
  style?: string
}

interface TaskQueryResult {
  taskId: string
  status: TaskStatus
  model: string
  failedReason?: string
  choices?: SongChoice[]
}

interface AudioItem {
  id: string
  type: 'song' | 'instrumental' | 'tts' | 'soundtrack'
  url: string
  flacUrl?: string
  wavUrl?: string
  duration: number
  label: string
  title?: string
  status?: TaskStatus
  taskId?: string
  placeholder?: boolean
  prompt?: string
  mode: AudioMode
}

const MODEL_OPTIONS = [
  { value: 'auto', label: '自动（最新模型）' },
  { value: 'mureka-9.5', label: 'Mureka V9.5（最新）' },
  { value: 'mureka-9', label: 'Mureka V9' },
  { value: 'mureka-8', label: 'Mureka V8' },
] as const

const GENDER_OPTIONS = [
  { value: '', label: '不限' },
  { value: 'female', label: '女声' },
  { value: 'male', label: '男声' },
] as const

const STYLE_TEMPLATES = [
  { name: '流行', prompt: 'pop, upbeat, bright, female vocal, 120 bpm', emoji: '🎵' },
  { name: 'R&B', prompt: 'r&b, slow, passionate, male vocal, smooth', emoji: '💙' },
  { name: '摇滚', prompt: 'rock, energetic, electric guitar, drums, powerful', emoji: '🎸' },
  { name: '电子', prompt: 'electronic, synthwave, retro, 80s, driving beat', emoji: '⚡' },
  { name: '国风', prompt: 'chinese traditional, erhu, guzheng, pentatonic, elegant', emoji: '🏮' },
  { name: 'Lo-Fi', prompt: 'lo-fi, chillhop, relaxed, study music, vinyl crackle', emoji: '🌙' },
  { name: '史诗', prompt: 'cinematic, epic, orchestral, trailer, horns and strings', emoji: '⚔️' },
  { name: '环境', prompt: 'ambient, calm, soft pads, meditation, ethereal', emoji: '🌿' },
  { name: '嘻哈', prompt: 'hip-hop, trap, 808 bass, rhythmic, confident', emoji: '🎤' },
  { name: '爵士', prompt: 'jazz, smooth, saxophone, piano, swing rhythm', emoji: '🎷' },
  { name: '民谣', prompt: 'folk, acoustic guitar, warm, storytelling, fingerpicking', emoji: '🪕' },
  { name: '古典', prompt: 'classical, piano, strings, elegant, emotional', emoji: '🎻' },
  { name: '舞曲', prompt: 'dance, edm, four on the floor, energetic, festival', emoji: '💃' },
  { name: '蓝调', prompt: 'blues, slow, guitar, soulful, 12 bar progression', emoji: '🎸' },
  { name: '雷鬼', prompt: 'reggae, offbeat, relaxed, bass heavy, summer vibes', emoji: '🌴' },
  { name: '乡村', prompt: 'country, acoustic, twangy guitar, storytelling, warm', emoji: '🤠' },
  { name: '朋克', prompt: 'punk rock, fast, raw, distorted guitars, rebellious', emoji: '🔥' },
  { name: '氛围电子', prompt: 'downtempo, atmospheric, dreamy, reverb heavy, chill', emoji: '☁️' },
  { name: '动漫', prompt: 'anime opening, j-rock, fast paced, energetic, bright', emoji: '🌸' },
  { name: '游戏', prompt: 'game soundtrack, orchestral, adventurous, fantasy, epic', emoji: '🎮' },
] as const

const EASY_SUGGESTIONS = [
  { label: '甜蜜情歌', prompt: '甜蜜的情歌，人声加吉他就好，温柔浪漫' },
  { label: '生日歌', prompt: '写一首欢快的生日歌，温馨庆祝' },
  { label: '夏日海边', prompt: '夏日海边旅行，阳光沙滩，轻快活泼' },
  { label: '深夜伤感', prompt: '深夜伤感旋律说唱，孤独下坠的空间' },
  { label: '咖啡厅', prompt: '咖啡厅背景音乐，慵懒放松的下午茶时光' },
  { label: '高燃战斗', prompt: '高燃游戏战斗音乐，激烈紧张，鼓点密集' },
] as const

const TTS_VOICES = [
  { value: 'nova', label: 'Nova（女声）' },
  { value: 'alloy', label: 'Alloy' },
  { value: 'echo', label: 'Echo（男声）' },
  { value: 'fable', label: 'Fable' },
  { value: 'onyx', label: 'Onyx（男声）' },
  { value: 'shimmer', label: 'Shimmer' },
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

const STATUS_LABELS: Record<TaskStatus, string> = {
  preparing: '准备中',
  queued: '排队中',
  running: '生成中',
  streaming: '流式传输',
  succeeded: '完成',
  failed: '失败',
  timeouted: '超时',
  cancelled: '已取消',
}

const TERMINAL_STATUSES: TaskStatus[] = ['succeeded', 'failed', 'timeouted', 'cancelled']

export default function AudioPage() {
  const [mode, setMode] = useState<AudioMode>('easy')
  const refreshQuota = useQuotaStore((s) => s.refreshQuota)
  const remainingTokens = useQuotaStore((s) => s.quota.remainingTokens)
  const quotaLoading = useQuotaStore((s) => s.loading)
  useEffect(() => { void refreshQuota({ force: false }) }, [refreshQuota])

  // === Easy mode state ===
  const [easyPrompt, setEasyPrompt] = useState('')
  const [easyModel, setEasyModel] = useState<string>('auto')
  const [easyLoading, setEasyLoading] = useState(false)
  const [easyError, setEasyError] = useState<string | null>(null)

  // === Song (custom) state ===
  const [songLyrics, setSongLyrics] = useState('')
  const [songPrompt, setSongPrompt] = useState('')
  const [songTitle, setSongTitle] = useState('')
  const [songModel, setSongModel] = useState<string>('auto')
  const [songGender, setSongGender] = useState<string>('')
  const [songLoading, setSongLoading] = useState(false)
  const [songError, setSongError] = useState<string | null>(null)

  // Lyrics generation
  const [lyricsPrompt, setLyricsPrompt] = useState('')
  const [lyricsLoading, setLyricsLoading] = useState(false)
  const [generatedTitle, setGeneratedTitle] = useState('')
  const [lyricsError, setLyricsError] = useState<string | null>(null)

  // === Reference song & Vocal clone state ===
  const [refFile, setRefFile] = useState<File | null>(null)
  const [refId, setRefId] = useState<string>('')
  const [refName, setRefName] = useState<string>('')
  const [refUploading, setRefUploading] = useState(false)
  const [refError, setRefError] = useState<string | null>(null)

  const [vocalFile, setVocalFile] = useState<File | null>(null)
  const [vocalId, setVocalId] = useState<string>('')
  const [vocalDesc, setVocalDesc] = useState<string>('')
  const [vocalUploading, setVocalUploading] = useState(false)
  const [vocalError, setVocalError] = useState<string | null>(null)

  // === Instrumental state ===
  const [instPrompt, setInstPrompt] = useState('')
  const [instModel, setInstModel] = useState<string>('auto')
  const [instLoading, setInstLoading] = useState(false)
  const [instError, setInstError] = useState<string | null>(null)

  // === Soundtrack state ===
  const [stFile, setStFile] = useState<File | null>(null)
  const [stPreview, setStPreview] = useState<string>('')
  const [stPrompt, setStPrompt] = useState('')
  const [stTitle, setStTitle] = useState('')
  const [stModel, setStModel] = useState<string>('auto')
  const [stLoading, setStLoading] = useState(false)
  const [stError, setStError] = useState<string | null>(null)

  // === TTS state ===
  const [ttsText, setTtsText] = useState('')
  const [ttsVoice, setTtsVoice] = useState<string>('nova')
  const [ttsLoading, setTtsLoading] = useState(false)
  const [ttsError, setTtsError] = useState<string | null>(null)

  // === Results ===
  const [audioItems, setAudioItems] = useState<AudioItem[]>([])
  const [playingId, setPlayingId] = useState<string | null>(null)
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [currentTime, setCurrentTime] = useState<Record<string, number>>({})
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({})
  const pollTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({})

  const songEst = useCostEstimate('audio.music', { model: 'mureka-auto', duration: 120 })
  const instEst = useCostEstimate('audio.music', { model: 'mureka-auto', duration: 60 })
  const ttsEst = useCostEstimate('audio.tts', { voice: ttsVoice, text: ttsText, textLen: ttsText.length })

  const stopPolling = useCallback((itemId: string) => {
    const timer = pollTimers.current[itemId]
    if (timer) {
      clearInterval(timer)
      delete pollTimers.current[itemId]
    }
  }, [])

  const pollTask = useCallback(async (itemId: string, taskId: string, type: 'song' | 'instrumental' | 'soundtrack') => {
    const timer = setInterval(async () => {
      try {
        const res = await api.get<TaskQueryResult>(`/api/audio/query/${taskId}?type=${type === 'instrumental' ? 'instrumental' : 'song'}`)
        setAudioItems((prev) => prev.map((item) =>
          item.id === itemId
            ? { ...item, status: res.status, label: `${type === 'song' ? '歌曲' : type === 'soundtrack' ? '配乐' : '纯音乐'} · ${STATUS_LABELS[res.status] || res.status}` }
            : item,
        ))

        if (TERMINAL_STATUSES.includes(res.status)) {
          stopPolling(itemId)

          if (res.status === 'succeeded' && res.choices && res.choices.length > 0) {
            const choice = res.choices[0]
            setAudioItems((prev) => prev.map((item) =>
              item.id === itemId
                ? {
                    ...item,
                    status: 'succeeded',
                    url: choice.url,
                    flacUrl: choice.flac_url,
                    wavUrl: choice.wav_url,
                    duration: choice.duration / 1000,
                    title: choice.title,
                    label: `${type === 'song' ? '歌曲' : type === 'soundtrack' ? '配乐' : '纯音乐'} · ${choice.title || choice.style || '完成'}`,
                  }
                : item,
            ))
          } else if (res.status !== 'succeeded') {
            setAudioItems((prev) => prev.map((item) =>
              item.id === itemId
                ? { ...item, status: res.status, label: `${type === 'song' ? '歌曲' : type === 'soundtrack' ? '配乐' : '纯音乐'} · ${STATUS_LABELS[res.status]}：${res.failedReason || ''}` }
                : item,
            ))
          }
        }
      } catch {
        // 静默重试
      }
    }, 5000)
    pollTimers.current[itemId] = timer
  }, [stopPolling])

  useEffect(() => {
    return () => {
      Object.values(pollTimers.current).forEach((timer) => clearInterval(timer))
    }
  }, [])

  // === Easy mode: 提示词 → 一键生成歌曲 ===
  const handleEasyGenerate = async () => {
    if (!easyPrompt.trim()) {
      setEasyError('请描述你想要的歌曲')
      return
    }
    if (songEst.lowBalance) {
      setEasyError(`积分不足：本次预计消耗 ${formatTokensCompact(songEst.tokens ?? 0)}，剩余 ${formatTokensCompact(songEst.remaining)}。`)
      return
    }
    setEasyLoading(true)
    setEasyError(null)
    try {
      const res = await api.post<{ taskId: string; status: string }>('/api/audio/easy-generate', {
        prompt: easyPrompt.trim(),
        model: easyModel,
        n: 2,
      })
      songEst.consume()
      const itemId = genId()
      const item: AudioItem = {
        id: itemId,
        type: 'song',
        mode: 'easy',
        url: '',
        duration: 0,
        label: `歌曲 · ${STATUS_LABELS[res.status as TaskStatus] || res.status}`,
        status: res.status as TaskStatus,
        taskId: res.taskId,
        prompt: easyPrompt.trim(),
      }
      setAudioItems((prev) => [item, ...prev])
      void pollTask(itemId, res.taskId, 'song')
    } catch (e) {
      setEasyError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setEasyLoading(false)
    }
  }

  // === 歌词生成 ===
  const handleGenerateLyrics = async () => {
    if (!lyricsPrompt.trim()) {
      setLyricsError('请输入歌词主题描述')
      return
    }
    setLyricsLoading(true)
    setLyricsError(null)
    try {
      const res = await api.post<{ title: string; lyrics: string }>('/api/audio/lyrics', {
        prompt: lyricsPrompt.trim(),
      })
      setGeneratedTitle(res.title || '')
      setSongLyrics(res.lyrics || '')
      setSongTitle(res.title || '')
    } catch (e) {
      setLyricsError(e instanceof Error ? e.message : '歌词生成失败')
    } finally {
      setLyricsLoading(false)
    }
  }

  // === 歌词续写 ===
  const handleExtendLyrics = async () => {
    if (!songLyrics.trim()) {
      setLyricsError('请先输入已有歌词')
      return
    }
    setLyricsLoading(true)
    setLyricsError(null)
    try {
      const res = await api.post<{ lyrics: string }>('/api/audio/lyrics/extend', {
        lyrics: songLyrics.trim(),
      })
      setSongLyrics(res.lyrics || songLyrics)
    } catch (e) {
      setLyricsError(e instanceof Error ? e.message : '歌词续写失败')
    } finally {
      setLyricsLoading(false)
    }
  }

  // === 参考歌曲上传 ===
  const handleRefUpload = async () => {
    if (!refFile) { setRefError('请选择参考音频文件'); return }
    setRefUploading(true)
    setRefError(null)
    try {
      const formData = new FormData()
      formData.append('file', refFile)
      formData.append('purpose', 'reference')
      const token = localStorage.getItem('token')
      const res = await fetch('/api/audio/files/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '上传失败')
      setRefId(data.fileId)
      setRefName(data.filename || refFile.name)
    } catch (e) {
      setRefError(e instanceof Error ? e.message : '参考歌曲上传失败')
    } finally {
      setRefUploading(false)
    }
  }

  // === 音色克隆 ===
  const handleVocalClone = async () => {
    if (!vocalFile) { setVocalError('请选择人声样本文件'); return }
    setVocalUploading(true)
    setVocalError(null)
    try {
      const formData = new FormData()
      formData.append('file', vocalFile)
      if (vocalDesc) formData.append('description', vocalDesc)
      const token = localStorage.getItem('token')
      const res = await fetch('/api/audio/vocal-clone', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '音色克隆失败')
      setVocalId(data.vocalId)
    } catch (e) {
      setVocalError(e instanceof Error ? e.message : '音色克隆失败')
    } finally {
      setVocalUploading(false)
    }
  }

  // === 歌曲生成（自定义模式） ===
  const handleGenerateSong = async () => {
    if (!songLyrics.trim()) {
      setSongError('请输入歌词（可点击「AI 生成歌词」自动创作）')
      return
    }
    if (songEst.lowBalance) {
      setSongError(`积分不足：本次预计消耗 ${formatTokensCompact(songEst.tokens ?? 0)}，剩余 ${formatTokensCompact(songEst.remaining)}。`)
      return
    }
    setSongLoading(true)
    setSongError(null)
    try {
      const res = await api.post<{ taskId: string; status: string }>('/api/audio/song', {
        lyrics: songLyrics.trim(),
        prompt: songPrompt.trim() || undefined,
        model: songModel,
        gender: songGender || undefined,
        reference_id: refId || undefined,
        vocal_id: vocalId || undefined,
        n: 2,
      })
      songEst.consume()
      const itemId = genId()
      const item: AudioItem = {
        id: itemId,
        type: 'song',
        mode: 'song',
        url: '',
        duration: 0,
        label: `歌曲 · ${STATUS_LABELS[res.status as TaskStatus] || res.status}`,
        status: res.status as TaskStatus,
        taskId: res.taskId,
        title: songTitle,
        prompt: songPrompt,
      }
      setAudioItems((prev) => [item, ...prev])
      void pollTask(itemId, res.taskId, 'song')
    } catch (e) {
      setSongError(e instanceof Error ? e.message : '歌曲生成失败')
    } finally {
      setSongLoading(false)
    }
  }

  // === 纯音乐生成 ===
  const handleGenerateInstrumental = async () => {
    if (!instPrompt.trim()) {
      setInstError('请输入风格描述')
      return
    }
    if (instEst.lowBalance) {
      setInstError(`积分不足：本次预计消耗 ${formatTokensCompact(instEst.tokens ?? 0)}，剩余 ${formatTokensCompact(instEst.remaining)}。`)
      return
    }
    setInstLoading(true)
    setInstError(null)
    try {
      const res = await api.post<{ taskId: string; status: string }>('/api/audio/instrumental', {
        prompt: instPrompt.trim(),
        model: instModel,
        n: 1,
      })
      instEst.consume()
      const itemId = genId()
      const item: AudioItem = {
        id: itemId,
        type: 'instrumental',
        mode: 'instrumental',
        url: '',
        duration: 0,
        label: `纯音乐 · ${STATUS_LABELS[res.status as TaskStatus] || res.status}`,
        status: res.status as TaskStatus,
        taskId: res.taskId,
        prompt: instPrompt,
      }
      setAudioItems((prev) => [item, ...prev])
      void pollTask(itemId, res.taskId, 'instrumental')
    } catch (e) {
      setInstError(e instanceof Error ? e.message : '纯音乐生成失败')
    } finally {
      setInstLoading(false)
    }
  }

  // === 配乐生成 ===
  const handleSoundtrackFile = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setStFile(file)
    if (file.type.startsWith('image/')) {
      setStPreview(URL.createObjectURL(file))
    } else {
      setStPreview('')
    }
  }

  const handleGenerateSoundtrack = async () => {
    if (!stFile) {
      setStError('请上传图片或视频')
      return
    }
    if (songEst.lowBalance) {
      setStError(`积分不足：本次预计消耗 ${formatTokensCompact(songEst.tokens ?? 0)}，剩余 ${formatTokensCompact(songEst.remaining)}。`)
      return
    }
    setStLoading(true)
    setStError(null)
    try {
      const formData = new FormData()
      formData.append('media', stFile)
      if (stPrompt) formData.append('prompt', stPrompt)
      if (stTitle) formData.append('title', stTitle)
      formData.append('model', stModel)

      const token = localStorage.getItem('token')
      const res = await fetch('/api/audio/soundtrack', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '上传失败')

      songEst.consume()
      const itemId = genId()
      const item: AudioItem = {
        id: itemId,
        type: 'soundtrack',
        mode: 'soundtrack',
        url: '',
        duration: 0,
        label: `配乐 · ${STATUS_LABELS[data.status as TaskStatus] || data.status}`,
        status: data.status as TaskStatus,
        taskId: data.taskId,
        title: stTitle,
        prompt: stPrompt,
      }
      setAudioItems((prev) => [item, ...prev])
      void pollTask(itemId, data.taskId, 'soundtrack')
    } catch (e) {
      setStError(e instanceof Error ? e.message : '配乐生成失败')
    } finally {
      setStLoading(false)
    }
  }

  // === TTS ===
  const handleTTS = async () => {
    if (!ttsText.trim()) {
      setTtsError('请输入要合成的文本')
      return
    }
    if (ttsEst.lowBalance) {
      setTtsError(`积分不足：本次预计消耗 ${formatTokensCompact(ttsEst.tokens ?? 0)}，剩余 ${formatTokensCompact(ttsEst.remaining)}。`)
      return
    }
    setTtsLoading(true)
    setTtsError(null)
    try {
      const res = await api.post<{ url: string; voice: string; duration: number; placeholder?: boolean }>('/api/audio/tts', {
        text: ttsText.trim(),
        voice: ttsVoice,
      })
      ttsEst.consume()
      const voiceLabel = TTS_VOICES.find((v) => v.value === res.voice)?.label || res.voice
      const item: AudioItem = {
        id: genId(),
        type: 'tts',
        mode: 'tts',
        url: res.url,
        duration: res.duration ?? 0,
        label: `TTS · ${voiceLabel} · ${ttsText.trim().slice(0, 18)}${ttsText.trim().length > 18 ? '…' : ''}`,
        placeholder: res.placeholder,
      }
      setAudioItems((prev) => [item, ...prev])
    } catch (e) {
      setTtsError(e instanceof Error ? e.message : '生成失败')
    } finally {
      setTtsLoading(false)
    }
  }

  // === 播放控制 ===
  const togglePlay = (id: string) => {
    Object.entries(audioRefs.current).forEach(([k, el]) => {
      if (k !== id && el) el.pause()
    })
    const el = audioRefs.current[id]
    if (!el || !el.src) return
    if (playingId === id) {
      el.pause()
      setPlayingId(null)
    } else {
      el.play().catch(() => setPlayingId(null))
      setPlayingId(id)
    }
  }

  const handleTimeUpdate = (id: string) => {
    const el = audioRefs.current[id]
    if (!el) return
    const pct = el.duration ? (el.currentTime / el.duration) * 100 : 0
    setProgress((prev) => ({ ...prev, [id]: pct }))
    setCurrentTime((prev) => ({ ...prev, [id]: el.currentTime }))
  }

  const handleSeek = (id: string, pct: number) => {
    const el = audioRefs.current[id]
    if (!el || !el.duration) return
    el.currentTime = (pct / 100) * el.duration
    setProgress((prev) => ({ ...prev, [id]: pct }))
  }

  const handleAudioEnded = (id: string) => {
    if (playingId === id) setPlayingId(null)
    setProgress((prev) => ({ ...prev, [id]: 0 }))
    setCurrentTime((prev) => ({ ...prev, [id]: 0 }))
  }

  const handleDelete = (id: string) => {
    stopPolling(id)
    const el = audioRefs.current[id]
    if (el) el.pause()
    if (playingId === id) setPlayingId(null)
    setAudioItems((prev) => prev.filter((i) => i.id !== id))
    delete audioRefs.current[id]
  }

  const handleRetry = (item: AudioItem) => {
    if (!item.taskId) return
    void pollTask(item.id, item.taskId, item.type === 'instrumental' ? 'instrumental' : 'song')
    setAudioItems((prev) => prev.map((i) =>
      i.id === item.id ? { ...i, status: 'running', label: `${item.type === 'song' ? '歌曲' : item.type === 'soundtrack' ? '配乐' : '纯音乐'} · 重新查询中` } : i,
    ))
  }

  // === 做同款 ===
  const handleMakeSimilar = (item: AudioItem) => {
    if (item.prompt) {
      if (item.mode === 'easy') {
        setEasyPrompt(item.prompt)
        setMode('easy')
      } else if (item.mode === 'song') {
        setSongPrompt(item.prompt)
        setMode('song')
      } else if (item.mode === 'instrumental') {
        setInstPrompt(item.prompt)
        setMode('instrumental')
      }
    }
  }

  const modeTabs: { value: AudioMode; label: string; icon: typeof Music }[] = [
    { value: 'easy', label: '简易模式', icon: Sparkles },
    { value: 'song', label: '自定义', icon: Music },
    { value: 'instrumental', label: '纯音乐', icon: Volume2 },
    { value: 'soundtrack', label: '配乐', icon: Video },
    { value: 'tts', label: 'TTS', icon: Mic },
  ]

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
              <p className="text-sm text-neutral-500">AI 歌曲 · 纯音乐 · 视频配乐 · TTS · Mureka 引擎</p>
            </div>
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
        {/* 模式切换 */}
        <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-neutral-200 bg-white p-1 shadow-sm">
          {modeTabs.map(({ value, label, icon: Icon }) => {
            const active = mode === value
            return (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`flex flex-1 min-w-fit items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${active ? 'bg-audio-600 text-white shadow-sm' : 'text-neutral-500 hover:bg-audio-50 hover:text-audio-600'}`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            )
          })}
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            {/* === 简易模式 === */}
            {mode === 'easy' && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">简易模式</h2>
                  <span className="ml-auto text-xs text-neutral-400">一句话生成歌曲</span>
                </div>

                <p className="mb-3 text-xs text-neutral-500">描述你想要的歌曲，AI 自动生成歌词和旋律</p>

                {/* 灵感建议 */}
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {EASY_SUGGESTIONS.map((s) => (
                    <button
                      key={s.label}
                      onClick={() => setEasyPrompt(s.prompt)}
                      className="rounded-full border border-audio-200 bg-audio-50 px-2.5 py-1 text-[11px] font-medium text-audio-700 hover:bg-audio-100 transition-colors"
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={easyPrompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setEasyPrompt(e.target.value)}
                  rows={4}
                  placeholder="如：甜蜜的情歌，人声加吉他就好，温柔浪漫"
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">模型</label>
                  <select
                    value={easyModel}
                    onChange={(e) => setEasyModel(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {easyError && <p className="mt-2 text-xs text-red-500">{easyError}</p>}

                <button
                  onClick={handleEasyGenerate}
                  disabled={easyLoading || songEst.lowBalance}
                  className={
                    'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                    (songEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                  }
                  title={songEst.tokens ? songEst.lowBalance
                    ? `积分不足：需要 ${formatTokensCompact(songEst.tokens)}，剩余 ${formatTokensCompact(songEst.remaining)}`
                    : `本次预计消耗 ${formatTokensCompact(songEst.tokens)} 积分` : '生成歌曲'}
                >
                  {easyLoading
                    ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中…</>)
                    : (<><Sparkles className="h-4 w-4" />一键生成歌曲
                       <CostBadge tokens={songEst.tokens} loading={songEst.loading} lowBalance={songEst.lowBalance} /></>)}
                </button>
              </section>
            )}

            {/* === 自定义模式 === */}
            {mode === 'song' && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                    <Music className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">自定义歌曲</h2>
                  <span className="ml-auto text-xs text-neutral-400">歌词 + 风格</span>
                </div>

                {/* 歌词区 */}
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-medium text-neutral-600">歌词</label>
                  <div className="flex gap-1">
                    <button
                      onClick={handleExtendLyrics}
                      disabled={lyricsLoading || !songLyrics.trim()}
                      className="inline-flex items-center gap-1 rounded-md bg-neutral-100 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200 disabled:opacity-50"
                    >
                      {lyricsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
                      续写歌词
                    </button>
                    <button
                      onClick={handleGenerateLyrics}
                      disabled={lyricsLoading}
                      className="inline-flex items-center gap-1 rounded-md bg-audio-100 px-2 py-1 text-[11px] font-medium text-audio-700 hover:bg-audio-200 disabled:opacity-50"
                    >
                      {lyricsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Wand2 className="h-3 w-3" />}
                      AI 生成歌词
                    </button>
                  </div>
                </div>

                {(lyricsLoading || lyricsPrompt) && (
                  <div className="mb-2">
                    <input
                      value={lyricsPrompt}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setLyricsPrompt(e.target.value)}
                      placeholder="输入歌词主题，如：夏日海滩、离别之夜..."
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                    />
                  </div>
                )}

                {generatedTitle && (
                  <p className="mb-1 text-xs text-audio-600">标题：{generatedTitle}</p>
                )}
                {lyricsError && <p className="mb-1 text-xs text-red-500">{lyricsError}</p>}

                <textarea
                  value={songLyrics}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setSongLyrics(e.target.value)}
                  rows={6}
                  placeholder={'[Verse]\n输入歌词，可使用 [Verse] [Chorus] [Bridge] 等段落标签\n或点击上方「AI 生成歌词」自动创作'}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                {/* 风格提示词 */}
                <label className="mb-1.5 mt-3 block text-xs font-medium text-neutral-600">风格提示词</label>
                <input
                  value={songPrompt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setSongPrompt(e.target.value)}
                  placeholder="如：pop, upbeat, bright, female vocal, 120 bpm"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                {/* 风格模板标签 */}
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {STYLE_TEMPLATES.slice(0, 8).map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setSongPrompt(t.prompt)}
                      className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] text-neutral-500 hover:bg-audio-50 hover:text-audio-600"
                    >
                      {t.emoji} {t.name}
                    </button>
                  ))}
                </div>

                {/* 歌名 + 模型 + 性别 */}
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">歌名</label>
                    <input
                      value={songTitle}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setSongTitle(e.target.value.slice(0, 50))}
                      placeholder="输入歌名"
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">模型</label>
                    <select
                      value={songModel}
                      onChange={(e) => setSongModel(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">人声</label>
                    <select
                      value={songGender}
                      onChange={(e) => setSongGender(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none"
                    >
                      {GENDER_OPTIONS.map((g) => (
                        <option key={g.value} value={g.value}>{g.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* 参考歌曲 & 音色克隆 */}
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {/* 参考歌曲上传 */}
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <FileMusic className="h-3 w-3 text-audio-500" />
                      <span className="text-[11px] font-medium text-neutral-600">参考歌曲</span>
                      {refId && (
                        <button
                          onClick={() => { setRefId(''); setRefName(''); setRefFile(null) }}
                          className="ml-auto text-[10px] text-red-400 hover:text-red-600"
                        >清除</button>
                      )}
                    </div>
                    {refId ? (
                      <div className="flex items-center gap-1.5 rounded-md bg-audio-50 px-2 py-1 text-[11px] text-audio-700">
                        <FileMusic className="h-3 w-3" />
                        <span className="truncate">{refName || '已上传'}</span>
                        <span className="ml-auto rounded-full bg-audio-200 px-1 text-[9px]">ID: {refId.slice(0, 8)}…</span>
                      </div>
                    ) : (
                      <>
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 py-2 hover:border-audio-400 hover:bg-audio-50">
                          {refUploading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-audio-500" />
                          ) : (
                            <Upload className="h-3 w-3 text-neutral-400" />
                          )}
                          <span className="mt-0.5 text-[10px] text-neutral-400">{refUploading ? '上传中…' : '上传参考歌曲'}</span>
                          <span className="text-[9px] text-neutral-300">mp3/m4a, 30s</span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/m4a,audio/x-m4a"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRefFile(f); void handleRefUpload(); } }}
                          />
                        </label>
                        {refError && <p className="mt-1 text-[10px] text-red-500">{refError}</p>}
                      </>
                    )}
                  </div>

                  {/* 音色克隆 */}
                  <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <User className="h-3 w-3 text-violet-500" />
                      <span className="text-[11px] font-medium text-neutral-600">自定义歌手</span>
                      {vocalId && (
                        <button
                          onClick={() => { setVocalId(''); setVocalFile(null) }}
                          className="ml-auto text-[10px] text-red-400 hover:text-red-600"
                        >清除</button>
                      )}
                    </div>
                    {vocalId ? (
                      <div className="flex items-center gap-1.5 rounded-md bg-violet-50 px-2 py-1 text-[11px] text-violet-700">
                        <User className="h-3 w-3" />
                        <span className="truncate">{vocalDesc || '已克隆音色'}</span>
                        <span className="ml-auto rounded-full bg-violet-200 px-1 text-[9px]">ID: {vocalId.slice(0, 8)}…</span>
                      </div>
                    ) : (
                      <>
                        <input
                          value={vocalDesc}
                          onChange={(e) => setVocalDesc(e.target.value.slice(0, 100))}
                          placeholder="音色描述（可选）"
                          className="mb-1 w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-[10px] text-neutral-700 placeholder:text-neutral-400 focus:border-violet-400 focus:outline-none"
                        />
                        <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-neutral-300 py-2 hover:border-violet-400 hover:bg-violet-50">
                          {vocalUploading ? (
                            <Loader2 className="h-3 w-3 animate-spin text-violet-500" />
                          ) : (
                            <Upload className="h-3 w-3 text-neutral-400" />
                          )}
                          <span className="mt-0.5 text-[10px] text-neutral-400">{vocalUploading ? '克隆中…' : '上传人声样本'}</span>
                          <span className="text-[9px] text-neutral-300">mp3/m4a, 15-30s, &lt;10MB</span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp3,audio/m4a,audio/x-m4a"
                            className="hidden"
                            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setVocalFile(f); void handleVocalClone(); } }}
                          />
                        </label>
                        {vocalError && <p className="mt-1 text-[10px] text-red-500">{vocalError}</p>}
                      </>
                    )}
                  </div>
                </div>

                {songError && <p className="mt-2 text-xs text-red-500">{songError}</p>}

                <button
                  onClick={handleGenerateSong}
                  disabled={songLoading || songEst.lowBalance}
                  className={
                    'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                    (songEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                  }
                  title={songEst.tokens ? songEst.lowBalance
                    ? `积分不足：需要 ${formatTokensCompact(songEst.tokens)}，剩余 ${formatTokensCompact(songEst.remaining)}`
                    : `本次预计消耗 ${formatTokensCompact(songEst.tokens)} 积分` : '生成歌曲'}
                >
                  {songLoading
                    ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中…</>)
                    : (<><Sparkles className="h-4 w-4" />生成歌曲
                       <CostBadge tokens={songEst.tokens} loading={songEst.loading} lowBalance={songEst.lowBalance} /></>)}
                </button>
              </section>
            )}

            {/* === 纯音乐 === */}
            {mode === 'instrumental' && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">纯音乐生成</h2>
                  <span className="ml-auto text-xs text-neutral-400">无人声</span>
                </div>

                <label className="mb-1.5 block text-xs font-medium text-neutral-600">风格描述</label>
                <textarea
                  value={instPrompt}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInstPrompt(e.target.value)}
                  rows={4}
                  placeholder="如：ambient, calm, soft pads, 80 bpm, meditation"
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                {/* 风格模板网格 */}
                <div className="mt-2 grid grid-cols-5 gap-1.5">
                  {STYLE_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setInstPrompt(t.prompt)}
                      className="flex flex-col items-center rounded-lg border border-neutral-200 bg-neutral-50 py-1.5 hover:border-audio-300 hover:bg-audio-50 transition-colors"
                    >
                      <span className="text-base">{t.emoji}</span>
                      <span className="text-[9px] text-neutral-500">{t.name}</span>
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">模型</label>
                  <select
                    value={instModel}
                    onChange={(e) => setInstModel(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                {instError && <p className="mt-2 text-xs text-red-500">{instError}</p>}

                <button
                  onClick={handleGenerateInstrumental}
                  disabled={instLoading || instEst.lowBalance}
                  className={
                    'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                    (instEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                  }
                  title={instEst.tokens ? instEst.lowBalance
                    ? `积分不足：需要 ${formatTokensCompact(instEst.tokens)}，剩余 ${formatTokensCompact(instEst.remaining)}`
                    : `本次预计消耗 ${formatTokensCompact(instEst.tokens)} 积分` : '生成纯音乐'}
                >
                  {instLoading
                    ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中…</>)
                    : (<><Sparkles className="h-4 w-4" />生成纯音乐
                       <CostBadge tokens={instEst.tokens} loading={instEst.loading} lowBalance={instEst.lowBalance} /></>)}
                </button>
              </section>
            )}

            {/* === 配乐 === */}
            {mode === 'soundtrack' && (
              <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-audio-100 text-audio-600">
                    <Video className="h-4 w-4" />
                  </div>
                  <h2 className="text-base font-semibold text-neutral-900">视频/图片配乐</h2>
                  <span className="ml-auto text-xs text-neutral-400">上传→AI配乐</span>
                </div>

                {/* 上传区 */}
                <label className="mb-1.5 block text-xs font-medium text-neutral-600">上传视频或图片</label>
                <div className="mb-3">
                  {stPreview ? (
                    <div className="relative rounded-lg border border-neutral-200 overflow-hidden">
                      <img src={stPreview} alt="预览" className="w-full max-h-48 object-cover" />
                      <button
                        onClick={() => { setStFile(null); setStPreview('') }}
                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 py-8 hover:border-audio-400 hover:bg-audio-50">
                      <Upload className="h-6 w-6 text-neutral-400" />
                      <span className="mt-2 text-xs text-neutral-500">点击上传视频或图片</span>
                      <span className="text-[10px] text-neutral-400">视频最大 300MB / 3分钟 · 图片最大 100MB</span>
                      <input type="file" accept="image/*,video/*" onChange={handleSoundtrackFile} className="hidden" />
                    </label>
                  )}
                  {stFile && !stPreview && (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-600">
                      <FileMusic className="h-3 w-3" />
                      {stFile.name}
                    </div>
                  )}
                </div>

                <label className="mb-1.5 block text-xs font-medium text-neutral-600">配乐描述</label>
                <input
                  value={stPrompt}
                  onChange={(e: ChangeEvent<HTMLInputElement>) => setStPrompt(e.target.value)}
                  placeholder="描述适合你的视频或图片的音乐风格或情绪"
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">歌名</label>
                    <input
                      value={stTitle}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setStTitle(e.target.value.slice(0, 50))}
                      placeholder="输入歌名"
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-neutral-600">模型</label>
                    <select
                      value={stModel}
                      onChange={(e) => setStModel(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-2 py-1.5 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none"
                    >
                      {MODEL_OPTIONS.map((m) => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {stError && <p className="mt-2 text-xs text-red-500">{stError}</p>}

                <button
                  onClick={handleGenerateSoundtrack}
                  disabled={stLoading || !stFile || songEst.lowBalance}
                  className={
                    'mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 ' +
                    (songEst.lowBalance ? 'bg-red-600 hover:bg-red-700' : 'bg-audio-600 hover:bg-audio-700')
                  }
                >
                  {stLoading
                    ? (<><Loader2 className="h-4 w-4 animate-spin" />提交中…</>)
                    : (<><Sparkles className="h-4 w-4" />生成配乐
                       <CostBadge tokens={songEst.tokens} loading={songEst.loading} lowBalance={songEst.lowBalance} /></>)}
                </button>
              </section>
            )}

            {/* === TTS === */}
            {mode === 'tts' && (
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
                  rows={6}
                  placeholder="请输入要配音的文本..."
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 placeholder:text-neutral-400 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                />

                <div className="mt-3">
                  <label className="mb-1 block text-xs font-medium text-neutral-600">音色</label>
                  <select
                    value={ttsVoice}
                    onChange={(e) => setTtsVoice(e.target.value)}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-800 focus:border-audio-400 focus:outline-none focus:ring-2 focus:ring-audio-100"
                  >
                    {TTS_VOICES.map((v) => (
                      <option key={v.value} value={v.value}>{v.label}</option>
                    ))}
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
                  title={ttsEst.tokens ? ttsEst.lowBalance
                    ? `积分不足：需要 ${formatTokensCompact(ttsEst.tokens)}，剩余 ${formatTokensCompact(ttsEst.remaining)}`
                    : `本次预计消耗 ${formatTokensCompact(ttsEst.tokens)} 积分` : '生成配音'}
                >
                  {ttsLoading
                    ? (<><Loader2 className="h-4 w-4 animate-spin" />生成中…</>)
                    : (<><Sparkles className="h-4 w-4" />生成配音
                       <CostBadge tokens={ttsEst.tokens} loading={ttsEst.loading} lowBalance={ttsEst.lowBalance} /></>)}
                </button>
              </section>
            )}
          </div>

          {/* === 生成结果 === */}
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
                <p className="mt-1 text-xs text-neutral-400">在左侧生成音乐或配音后，结果会出现在这里</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {audioItems.map((item) => {
                  const isPlaying = playingId === item.id
                  const TypeIcon = item.type === 'tts' ? Mic : item.type === 'song' ? Music : item.type === 'soundtrack' ? Video : Volume2
                  const typeBadge = item.type === 'tts' ? 'bg-audio-50 text-audio-700' : item.type === 'song' ? 'bg-audio-100 text-audio-800' : item.type === 'soundtrack' ? 'bg-violet-50 text-violet-700' : 'bg-audio-50 text-audio-700'
                  const isLoading = item.status && !TERMINAL_STATUSES.includes(item.status)
                  const canPlay = !!item.url && !isLoading
                  const canRetry = item.status && ['failed', 'timeouted', 'cancelled'].includes(item.status) && item.taskId
                  const typeLabel = item.type === 'tts' ? 'TTS' : item.type === 'song' ? '歌曲' : item.type === 'soundtrack' ? '配乐' : '纯音乐'
                  const pct = progress[item.id] || 0
                  const cur = currentTime[item.id] || 0

                  return (
                    <li
                      key={item.id}
                      className={`rounded-xl border p-3 transition-all ${isPlaying ? 'border-audio-400 bg-audio-50/60 ring-1 ring-audio-200' : 'border-neutral-200 bg-white hover:border-audio-200'}`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${typeBadge}`}>
                          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <TypeIcon className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-800">{item.label}</p>
                          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-400">
                            {item.duration > 0 ? (<><Clock className="h-3 w-3" />{formatDuration(cur)} / {formatDuration(item.duration)}</>) : null}
                            {item.status && !TERMINAL_STATUSES.includes(item.status) && (
                              <span className="text-audio-600"> · {STATUS_LABELS[item.status]}…</span>
                            )}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadge}`}>
                          {typeLabel}
                        </span>
                        {item.placeholder && <DemoBadge />}
                      </div>

                      {item.title && (
                        <p className="mt-1.5 text-[11px] text-neutral-500">{item.title}</p>
                      )}

                      <div className="mt-3 flex items-center gap-2">
                        {canPlay ? (
                          <button
                            onClick={() => togglePlay(item.id)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-audio-600 text-white shadow-sm transition-all hover:bg-audio-700"
                            title={isPlaying ? '暂停' : '播放'}
                          >
                            {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 translate-x-[1px]" />}
                          </button>
                        ) : isLoading ? (
                          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-audio-100 text-audio-400">
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </div>
                        ) : canRetry ? (
                          <button
                            onClick={() => handleRetry(item)}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200"
                            title="重试"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </button>
                        ) : (
                          <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-300">
                            <AlertCircle className="h-4 w-4" />
                          </div>
                        )}

                        {/* 真实进度条 */}
                        <div
                          className="relative h-9 flex-1 cursor-pointer overflow-hidden rounded-full bg-neutral-100"
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect()
                            const clickPct = ((e.clientX - rect.left) / rect.width) * 100
                            handleSeek(item.id, clickPct)
                          }}
                        >
                          <div
                            className="absolute inset-y-0 left-0 bg-audio-200 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center text-[11px] tabular-nums text-neutral-500">
                            {canPlay ? (isPlaying ? `${formatDuration(cur)} / ${formatDuration(item.duration)}` : '点击播放') : isLoading ? '生成中…请稍候' : '无法播放'}
                          </div>
                        </div>

                        {/* 下载按钮组 */}
                        {canPlay && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            {item.flacUrl && (
                              <a href={item.flacUrl} download className="inline-flex h-7 items-center rounded-md bg-neutral-100 px-1.5 text-[9px] font-medium text-neutral-500 hover:bg-audio-50 hover:text-audio-600" title="下载 FLAC">FLAC</a>
                            )}
                            {item.wavUrl && (
                              <a href={item.wavUrl} download className="inline-flex h-7 items-center rounded-md bg-neutral-100 px-1.5 text-[9px] font-medium text-neutral-500 hover:bg-audio-50 hover:text-audio-600" title="下载 WAV">WAV</a>
                            )}
                            <a href={item.url} download className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-audio-50 hover:text-audio-500" title="下载 MP3">
                              <Download className="h-4 w-4" />
                            </a>
                          </div>
                        )}

                        {/* 做同款 */}
                        {item.prompt && canPlay && (
                          <button
                            onClick={() => handleMakeSimilar(item)}
                            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-audio-50 px-2 text-[10px] font-medium text-audio-600 hover:bg-audio-100"
                            title="用相同参数重新生成"
                          >
                            <Copy className="h-3 w-3" />
                            做同款
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-400 transition-all hover:bg-red-50 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      <audio
                        ref={(el) => { audioRefs.current[item.id] = el }}
                        src={item.url || undefined}
                        onEnded={() => handleAudioEnded(item.id)}
                        onError={() => { if (playingId === item.id) setPlayingId(null) }}
                        onTimeUpdate={() => handleTimeUpdate(item.id)}
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
