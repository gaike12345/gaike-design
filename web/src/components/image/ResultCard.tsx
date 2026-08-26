// 图像板块共享：结果卡片
//
// 提取自 ImagePane / Studio，统一图像结果展示与重试逻辑
// 改进：重试 setTimeout 在组件卸载时正确清理（修复 P2-1）

import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, Loader2, RefreshCw, Download, Heart, MoreHorizontal,
} from 'lucide-react'
import { useStudioStore, type GenImage } from '../../store/useStudioStore'
import { RATIO_CLASS } from './constants'
import { cn } from '../../lib/utils'

export interface ResultCardProps {
  img: GenImage
  taskId: string
}

const MAX_RETRY = 5
const RETRY_DELAY = 2000
const STAGGER_MS = 4000

export default function ResultCard({ img, taskId }: ResultCardProps) {
  const updateImageStatus = useStudioStore((s) => s.updateImageStatus)
  const retryImage = useStudioStore((s) => s.retryImage)
  const [loaded, setLoaded] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [active, setActive] = useState(false)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const indexInBatch = parseInt(img.id.split('_').pop() || '0', 10)

  useEffect(() => {
    setLoaded(false)
    setRetryCount(0)
    const t = setTimeout(() => setActive(true), indexInBatch * STAGGER_MS)
    return () => {
      clearTimeout(t)
      setActive(false)
      // 清理重试定时器，避免卸载后调用 setState
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
        retryTimerRef.current = null
      }
    }
  }, [img.url, indexInBatch])

  const src = retryCount > 0
    ? `${img.url}${img.url.includes('?') ? '&' : '?'}_retry=${retryCount}_${Date.now()}`
    : img.url

  const handleLoad = () => {
    setLoaded(true)
    updateImageStatus(taskId, img.id, 'done')
  }

  const handleError = () => {
    if (retryCount < MAX_RETRY) {
      // 存储定时器 id 以便卸载时清理
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((c) => c + 1)
        retryTimerRef.current = null
      }, RETRY_DELAY)
    } else {
      updateImageStatus(taskId, img.id, 'error')
    }
  }

  const isError = img.status === 'error' && retryCount >= MAX_RETRY
  const isRetrying = retryCount > 0 && !loaded && !isError
  const isPending = !active && !isError

  return (
    <div className={cn(
      'group relative overflow-hidden rounded-lg border bg-ink-100',
      RATIO_CLASS[img.ratio],
      isError ? 'border-red-200' : 'border-ink-200'
    )}>
      {isError ? (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-red-50 p-3 text-center">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <p className="text-[11px] text-red-600">生成失败</p>
          <button
            onClick={() => retryImage(taskId, img.id)}
            className="btn-outline !px-2 !py-1 text-[11px]"
          >
            <RefreshCw className="h-3 w-3" /> 重试
          </button>
        </div>
      ) : (
        <>
          <img
            key={src}
            src={active ? src : undefined}
            alt={img.prompt}
            onLoad={handleLoad}
            onError={handleError}
            className={cn('h-full w-full object-cover transition-opacity',
              loaded ? 'opacity-100' : 'opacity-0')}
          />
          {!loaded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-ink-100 to-ink-200">
              <Loader2 className="h-5 w-5 animate-spin text-ink-400" />
              {isPending && <span className="text-[10px] text-ink-400">排队中</span>}
              {isRetrying && <span className="text-[10px] text-ink-400">重试中 {retryCount}/{MAX_RETRY}</span>}
            </div>
          )}
          <div className="absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
            <div className="flex w-full items-center justify-between">
              <span className="font-mono text-[10px] text-white/80">#{img.seed}</span>
              <div className="flex gap-1">
                <button className="rounded-md bg-white/20 p-1 text-white backdrop-blur hover:bg-white/30">
                  <Heart className="h-3 w-3" />
                </button>
                <a href={img.url} download={`ai-image-${img.seed}.png`} target="_blank" rel="noreferrer"
                  className="rounded-md bg-white/20 p-1 text-white backdrop-blur hover:bg-white/30">
                  <Download className="h-3 w-3" />
                </a>
                <button className="rounded-md bg-white/20 p-1 text-white backdrop-blur hover:bg-white/30">
                  <MoreHorizontal className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
