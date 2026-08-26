import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Video,
  Film,
  Play,
  Pause,
  Image as ImageIcon,
  Wand2,
  Loader2,
  CheckCircle2,
  Clock,
  Trash2,
  X,
  AlertCircle,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useModelStore } from '../store/useModelStore'

/** 独立页面：/video — 视频创作（文生视频 + 图生视频 + 异步任务轮询） */

type VideoStatus = 'queued' | 'processing' | 'done'
type TaskType = 'text2video' | 'img2video'

interface VideoTask {
  taskId: string
  status: VideoStatus
  prompt: string
  type: TaskType
  url?: string
}

const DURATION_OPTIONS = [
  { value: '3', label: '3 秒' },
  { value: '5', label: '5 秒' },
  { value: '10', label: '10 秒' },
] as const

function StatusBadge({ status }: { status: VideoStatus }) {
  if (status === 'done') {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600">
        <CheckCircle2 className="h-4 w-4" />
      </span>
    )
  }
  if (status === 'processing') {
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
        <Loader2 className="h-4 w-4 animate-spin" />
      </span>
    )
  }
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-video-100 text-video-600">
      <Clock className="h-4 w-4" />
    </span>
  )
}

export default function VideoPage() {
  const { getModelsByType, fetchModels } = useModelStore()
  const [activeModel, setActiveModel] = useState<string>('')

  useEffect(() => { fetchModels('video') }, [fetchModels])

  // 文生视频
  const [t2vPrompt, setT2vPrompt] = useState('')
  const [t2vDuration, setT2vDuration] = useState<string>(DURATION_OPTIONS[1].value)
  // 图生视频
  const [i2vImageUrl, setI2vImageUrl] = useState('')
  const [i2vPrompt, setI2vPrompt] = useState('')
  // 任务列表 + 提交/播放状态
  const [tasks, setTasks] = useState<VideoTask[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [playingId, setPlayingId] = useState<string | null>(null)
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  // 用 ref 镜像 tasks，供 setInterval 读取最新值，避免把 tasks 放进轮询 effect 的依赖数组造成无限循环
  const tasksRef = useRef<VideoTask[]>([])
  useEffect(() => {
    tasksRef.current = tasks
  }, [tasks])

  const updateTask = useCallback((taskId: string, patch: Partial<VideoTask>) => {
    setTasks((prev) => prev.map((t) => (t.taskId === taskId ? { ...t, ...patch } : t)))
  }, [])

  const pollTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await api.get<{ status: string; url?: string; prompt: string }>(
          `/api/video/task/${taskId}`,
        )
        updateTask(taskId, {
          status: (res.status || 'queued') as VideoStatus,
          url: res.url,
          prompt: res.prompt || '',
        })
      } catch {
        // 轮询失败静默忽略，3 秒后再试
      }
    },
    [updateTask],
  )

  // 每 3 秒轮询所有未完成任务（status !== 'done'）
  useEffect(() => {
    const id = window.setInterval(() => {
      const pending = tasksRef.current.filter((t) => t.status !== 'done')
      pending.forEach((t) => {
        void pollTask(t.taskId)
      })
    }, 3000)
    return () => window.clearInterval(id)
  }, [pollTask])

  // ---- 文生视频 ----
  const handleText2Video = async () => {
    if (!t2vPrompt.trim()) {
      setError('请输入视频描述')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.post<{ taskId: string; status: string }>(
        '/api/video/text2video',
        { prompt: t2vPrompt.trim(), duration: Number(t2vDuration) },
      )
      const newTask: VideoTask = {
        taskId: res.taskId,
        status: (res.status || 'queued') as VideoStatus,
        prompt: t2vPrompt.trim(),
        type: 'text2video',
      }
      setTasks((prev) => [newTask, ...prev])
      // 立即触发一次轮询，避免等满 3 秒
      void pollTask(res.taskId)
      setT2vPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 图生视频 ----
  const handleImg2Video = async () => {
    if (!i2vImageUrl.trim()) {
      setError('请输入图片 URL')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await api.post<{ taskId: string; status: string }>(
        '/api/video/img2video',
        { imageUrl: i2vImageUrl.trim(), prompt: i2vPrompt.trim() },
      )
      const newTask: VideoTask = {
        taskId: res.taskId,
        status: (res.status || 'queued') as VideoStatus,
        prompt: i2vPrompt.trim() || '图生视频',
        type: 'img2video',
      }
      setTasks((prev) => [newTask, ...prev])
      void pollTask(res.taskId)
      setI2vPrompt('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  // ---- 播放/暂停 ----
  const togglePlay = (taskId: string) => {
    // 先暂停其他视频
    Object.entries(videoRefs.current).forEach(([k, el]) => {
      if (k !== taskId && el) el.pause()
    })
    const el = videoRefs.current[taskId]
    if (!el) return
    if (playingId === taskId) {
      el.pause()
      setPlayingId(null)
    } else {
      el.play().catch(() => setPlayingId(null))
      setPlayingId(taskId)
    }
  }

  const handleVideoEnded = (taskId: string) => {
    if (playingId === taskId) setPlayingId(null)
  }

  // ---- 删除任务 ----
  const handleDelete = (taskId: string) => {
    const el = videoRefs.current[taskId]
    if (el) el.pause()
    if (playingId === taskId) setPlayingId(null)
    setTasks((prev) => prev.filter((t) => t.taskId !== taskId))
    delete videoRefs.current[taskId]
  }

  return (
    <div className="min-h-screen bg-white">
      <Navbar />

      {/* 标题区 — 视频强调色 amber */}
      <section className="bg-video-50 py-8">
        <div className="mx-auto max-w-6xl px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-video-600 ring-1 ring-video-100">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">视频创作</h1>
              <p className="text-sm text-slate-500">文生视频 · 图生视频 · 异步任务自动轮询</p>
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6">

        {/* 左右两栏 */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 左栏：视频生成工具 */}
          <div className="space-y-6">
            {/* A. 文生视频面板 */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-video-100 text-video-600">
                  <Wand2 className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">文生视频</h2>
                <span className="ml-auto text-xs text-slate-400">文本 → 视频</span>
              </div>

              {/* AI 模型选择 — 动态从后端获取 */}
              {getModelsByType('video').length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-amber-700">AI 模型</label>
                  <select
                    value={activeModel}
                    onChange={(e) => setActiveModel(e.target.value)}
                    className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm text-amber-800 focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                  >
                    {getModelsByType('video').map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                视频描述
              </label>
              <textarea
                value={t2vPrompt}
                onChange={(e) => setT2vPrompt(e.target.value)}
                rows={3}
                placeholder="例如：赛博朋克城市夜景，霓虹灯闪烁，镜头缓缓推进…"
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-video-400 focus:outline-none focus:ring-2 focus:ring-video-100"
              />

              <div className="mt-3 flex items-center gap-3">
                <label className="text-xs font-medium text-slate-600">时长</label>
                <select
                  value={t2vDuration}
                  onChange={(e) => setT2vDuration(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-video-400 focus:outline-none focus:ring-2 focus:ring-video-100"
                >
                  {DURATION_OPTIONS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </div>

              {error && (
                <p className="mt-2 flex items-center gap-1 text-xs text-red-500">
                  <AlertCircle className="h-3 w-3" />
                  {error}
                </p>
              )}

              <button
                onClick={handleText2Video}
                disabled={submitting}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-video-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-video-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交中…
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    生成视频
                  </>
                )}
              </button>
            </section>

            {/* B. 图生视频面板 */}
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-video-100 text-video-600">
                  <ImageIcon className="h-4 w-4" />
                </div>
                <h2 className="text-base font-semibold text-slate-900">图生视频</h2>
                <span className="ml-auto text-xs text-slate-400">静图 → 视频</span>
              </div>

              <label className="mb-1.5 block text-xs font-medium text-slate-600">
                图片 URL
              </label>
              <div className="relative">
                <input
                  type="url"
                  value={i2vImageUrl}
                  onChange={(e) => setI2vImageUrl(e.target.value)}
                  placeholder="https://example.com/image.png"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-800 placeholder:text-slate-400 focus:border-video-400 focus:outline-none focus:ring-2 focus:ring-video-100"
                />
                {i2vImageUrl && (
                  <button
                    onClick={() => setI2vImageUrl('')}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    title="清除"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <label className="mb-1.5 mt-3 block text-xs font-medium text-slate-600">
                动态效果描述
              </label>
              <textarea
                value={i2vPrompt}
                onChange={(e) => setI2vPrompt(e.target.value)}
                rows={3}
                placeholder="例如：镜头向右平移，头发随风飘动…"
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-video-400 focus:outline-none focus:ring-2 focus:ring-video-100"
              />

              <button
                onClick={handleImg2Video}
                disabled={submitting}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-video-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-video-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    提交中…
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4" />
                    生成视频
                  </>
                )}
              </button>
            </section>
          </div>

          {/* 右栏：任务列表 */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-video-100 text-video-600">
                <Film className="h-4 w-4" />
              </div>
              <h2 className="text-base font-semibold text-slate-900">任务列表</h2>
              <span className="ml-auto rounded-full bg-video-50 px-2 py-0.5 text-xs font-medium text-video-700">
                {tasks.length} 条
              </span>
            </div>

            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-video-50 text-video-400 ring-1 ring-video-100">
                  <Film className="h-7 w-7" />
                </div>
                <p className="mt-3 text-sm font-medium text-slate-600">还没有视频任务</p>
                <p className="mt-1 text-xs text-slate-400">
                  在左侧提交文生视频或图生视频后，任务会出现在这里
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task) => {
                  const isDone = task.status === 'done'
                  const isProcessing = task.status === 'processing'
                  const isPlaying = playingId === task.taskId
                  return (
                    <li
                      key={task.taskId}
                      className={`rounded-xl border p-3 transition-all ${
                        isPlaying
                          ? 'border-video-400 bg-video-50/60 ring-1 ring-video-200'
                          : 'border-slate-200 bg-white hover:border-video-200'
                      }`}
                    >
                      {/* 顶部：状态 + prompt + 删除 */}
                      <div className="flex items-center gap-2">
                        <StatusBadge status={task.status} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {task.prompt}
                          </p>
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            {task.type === 'text2video' ? '文生视频' : '图生视频'} ·{' '}
                            {task.taskId.slice(0, 8)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleDelete(task.taskId)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition-all hover:bg-red-50 hover:text-red-500"
                          title="删除"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {/* 视频 / 占位 */}
                      <div className="mt-3 overflow-hidden rounded-lg bg-slate-900">
                        {isDone && task.url ? (
                          <div className="relative aspect-video">
                            <video
                              ref={(el) => {
                                videoRefs.current[task.taskId] = el
                              }}
                              src={task.url}
                              onEnded={() => handleVideoEnded(task.taskId)}
                              onError={() => {
                                if (playingId === task.taskId) setPlayingId(null)
                              }}
                              playsInline
                              preload="none"
                              className="h-full w-full object-contain"
                            />
                            <button
                              onClick={() => togglePlay(task.taskId)}
                              className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/30"
                              title={isPlaying ? '暂停' : '播放'}
                            >
                              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-video-600 shadow-md backdrop-blur">
                                {isPlaying ? (
                                  <Pause className="h-5 w-5" />
                                ) : (
                                  <Play className="h-5 w-5 translate-x-[1px]" />
                                )}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex aspect-video flex-col items-center justify-center gap-2 text-slate-300">
                            <Loader2 className="h-6 w-6 animate-spin text-video-400" />
                            <span className="text-xs">
                              {isProcessing ? '生成中…' : '排队中…'}
                            </span>
                          </div>
                        )}
                      </div>
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
