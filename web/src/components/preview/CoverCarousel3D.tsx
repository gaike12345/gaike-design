import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Heart } from 'lucide-react'
import type { LandingWork } from '../layout/FeatureLanding'

interface CoverCarousel3DProps {
  works: LandingWork[]
  accent?: string
  autoPlayInterval?: number
  /** 卡面比例，默认 3/4（竖版小说封面），影视海报传 16/9 */
  aspectRatio?: number
  /** 面卡基准宽度（px），默认 255。缩小则面卡 + 3D 环半径 + 容器包装都同步变小 */
  faceWidth?: number
  /** 3D 环半径缩放系数，默认 1.8。越小面卡间距越紧凑（面卡间重叠更多），越大间距越疏 */
  ringRadiusScale?: number
  /** 是否在 3D 封面背后加磨砂玻璃底板（backdrop-blur + 半透明白），默认 false */
  frostedBg?: boolean
}

export default function CoverCarousel3D({
  works,
  accent = '#6366F1',
  autoPlayInterval = 3500,
  aspectRatio = 3 / 4,
  faceWidth = 255,
  ringRadiusScale = 1.8,
  frostedBg = false,
}: CoverCarousel3DProps) {
  const [active, setActive] = useState(0)
  const [paused, setPaused] = useState(false)
  const n = works.length
  const stepDeg = 360 / n
  // fraction: 拖拽过程中连续的 3D 旋转，让整个环跟着手指实时滑动
  const [dragFrac, setDragFrac] = useState(0)

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inertiaRef = useRef<number | null>(null)
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({})
  const dragRef = useRef<{
    on: boolean
    startX: number
    startY: number
    lastX: number
    lastT: number
    vx: number
    locked: 'h' | 'v' | null
    startIdx: number
    pointerId: number
  }>({
    on: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastT: 0,
    vx: 0,
    locked: null,
    startIdx: 0,
    pointerId: -1,
  })

  useEffect(() => {
    if (paused || n <= 1) return
    timerRef.current = setInterval(() => {
      setActive((i) => (i + 1) % n)
    }, autoPlayInterval)
    return () => {
      timerRef.current && clearInterval(timerRef.current)
    }
  }, [paused, n, autoPlayInterval])

  const go = (delta: number) => setActive((i) => (i + delta + n) % n)

  const stopInertia = () => {
    if (inertiaRef.current != null) {
      cancelAnimationFrame(inertiaRef.current)
      inertiaRef.current = null
    }
  }

  // 根据 dragFrac（连续的浮点偏移）吸附到最近整数张，松手时调用
  const settleDrag = (initialVx: number) => {
    stopInertia()
    // 初始阶段：惯性滑行（vx 单位 = frac/帧，1 frac = 一张面卡位移），带阻尼
    if (Math.abs(initialVx) > 0.01) {
      let vx = initialVx
      let frac = dragFrac
      const damp = 0.9
      const step = () => {
        vx *= damp
        frac += vx
        setDragFrac(frac)
        if (Math.abs(vx) < 0.006) {
          // 惯性结束，吸附到最近整数索引
          snapToIndex(frac)
        } else {
          inertiaRef.current = requestAnimationFrame(step)
        }
      }
      inertiaRef.current = requestAnimationFrame(step)
    } else {
      snapToIndex(dragFrac)
    }
  }

  const snapToIndex = (frac: number) => {
    const base = dragRef.current.startIdx
    const targetOffset = Math.round(frac)
    const next = ((base + targetOffset) % n + n) % n
    setDragFrac(0)
    dragRef.current.on = false
    setActive(next)
    // 松手 500ms 后恢复自动轮播（保持原先"hover 就停"的逻辑）
    setPaused(false)
  }

  // 高度按比例缩放，3D 环半径也随面宽同步缩放
  const faceHeight = Math.round(faceWidth / aspectRatio)
  const radius = Math.round(faceWidth / (2 * Math.tan(Math.PI / n)) * ringRadiusScale)

  const playVideo = (i: number) => {
    const v = videoRefs.current[i]
    if (!v) return
    v.currentTime = 0
    const p = v.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }
  const stopVideo = (i: number) => {
    const v = videoRefs.current[i]
    if (!v) return
    try {
      v.pause()
      v.currentTime = 0
    } catch {
      // ignore
    }
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // 只处理主按钮（左键/触摸/笔），避免点小圆点切换时误触发拖拽
    if (e.button !== 0 && e.pointerType === 'mouse') return
    stopInertia()
    const d = dragRef.current
    d.on = true
    d.startX = e.clientX
    d.startY = e.clientY
    d.lastX = e.clientX
    d.lastT = performance.now()
    d.vx = 0
    d.locked = null
    d.startIdx = active
    d.pointerId = e.pointerId
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    setPaused(true)
    setDragFrac(0)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.on) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    // 4px 锁轴阈值：横向锁为拖拽，纵向锁则把事件放给浏览器滚动
    if (!d.locked) {
      if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return
      d.locked = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (d.locked !== 'h') return
    e.preventDefault()
    // 手机 carousel 直觉：手指右滑 → 前一张（active-1）；手指左滑 → 下一张（active+1）
    const frac = -(dx / faceWidth)
    setDragFrac(frac)
    const now = performance.now()
    const dt = Math.max(1, now - d.lastT)
    // vx：frac/ms → 换算为 frac/帧（16.66ms/帧），惯性阶段直接用
    d.vx = -(((e.clientX - d.lastX) / faceWidth) * (16.66 / dt))
    d.lastX = e.clientX
    d.lastT = now
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.on) return
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture?.(d.pointerId)
    } catch {
      // ignore
    }
    const wasHoriz = d.locked === 'h'
    d.on = false
    d.locked = null
    if (!wasHoriz) {
      // 纵向滚动/轻点，不改变位置，恢复自动轮播
      setDragFrac(0)
      setPaused(false)
      return
    }
    // 点击判定：横向拖动 < 4px 视为点，按点逻辑不切（点由左右箭头/小圆点处理）
    if (Math.abs(e.clientX - d.startX) < 4 && Math.abs(e.clientY - d.startY) < 4) {
      setDragFrac(0)
      setPaused(false)
      return
    }
    settleDrag(d.vx)
  }

  const onPointerCancel = () => {
    const d = dragRef.current
    if (!d.on) return
    stopInertia()
    d.on = false
    d.locked = null
    setDragFrac(0)
    setPaused(false)
  }

  // 拖拽中用真实连续的角度渲染；松手后回到 active 的整数吸附
  const visualIndex =
    dragRef.current.on || inertiaRef.current != null ? dragRef.current.startIdx + dragFrac : active
  const visualDeg = -visualIndex * stepDeg
  const isDragging = dragRef.current.on || inertiaRef.current != null

  return (
    <div
      className="cover-3d-wrap relative h-full w-full overflow-visible select-none touch-none"
      onMouseEnter={() => !dragRef.current.on && setPaused(true)}
      onMouseLeave={() => !dragRef.current.on && setPaused(false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {/* 磨砂玻璃底板（仅 frostedBg=true 时渲染）：backdrop-blur 让下方的 Hero 装饰 / 节点 / 网格透出柔和模糊 */}
      {frostedBg && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-0 rounded-3xl border"
          style={{
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.62) 0%, rgba(255,255,255,0.38) 50%, rgba(255,255,255,0.55) 100%)',
            borderColor: 'rgba(255,255,255,0.7)',
            backdropFilter: 'blur(18px) saturate(1.2)',
            WebkitBackdropFilter: 'blur(18px) saturate(1.2)',
            boxShadow:
              '0 20px 60px rgba(15,23,42,0.08), 0 8px 24px rgba(15,23,42,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
          }}
        />
      )}
      <div
        className="absolute inset-0 flex items-start justify-center"
        style={{ perspective: '1000px', perspectiveOrigin: '50% 0%', paddingTop: '8px' }}
      >
        <div
          className="cover-3d-ring relative"
          style={{
            width: faceWidth,
            height: faceHeight,
            transformStyle: 'preserve-3d',
            transition: isDragging ? 'none' : 'transform 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
            transform: `rotateY(${visualDeg}deg)`,
          }}
        >
          {works.map((w, i) => {
            const angle = stepDeg * i
            const isActive = Math.abs(((i - visualIndex) % n + n) % n) < 1e-6
            return (
              <div
                key={w.title}
                className="cover-face absolute inset-0 overflow-hidden rounded-xl bg-neutral-900"
                style={{
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                  backfaceVisibility: 'hidden',
                  boxShadow:
                    '0 40px 80px rgba(0,0,0,0.18), 0 25px 50px rgba(0,0,0,0.12), 0 12px 24px rgba(0,0,0,0.08), 0 0 60px rgba(0,0,0,0.06)',
                }}
                onMouseEnter={() => {
                  // 仅正面（居中面）支持悬浮播放，避免背面/侧面面卡被无意中触发
                  if (!isActive || !w.video) return
                  playVideo(i)
                }}
                onMouseLeave={() => {
                  if (!w.video) return
                  stopVideo(i)
                }}
              >
                {w.video ? (
                  // 视频面：只用 <video poster=cover>，不再叠加 <img>（同封面不二元素）
                  <video
                    ref={(el) => {
                      videoRefs.current[i] = el
                    }}
                    src={w.video}
                    poster={w.cover}
                    muted
                    playsInline
                    loop
                    preload="none"
                    className="h-full w-full object-cover"
                    style={{
                      filter: isActive
                        ? 'saturate(1.1) brightness(1.03)'
                        : 'saturate(0.7) brightness(0.7)',
                      transform: (isActive ? 'scale(1.02)' : 'scale(0.95)') + ' translateZ(0)',
                      transition:
                        'filter 0.5s ease, transform 0.5s ease, opacity 0.45s ease',
                      backfaceVisibility: 'hidden',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                  />
                ) : (
                  // 纯图面：只用 <img>，不同封面内出现 <video>
                  <img
                    src={w.cover}
                    alt={w.title}
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full object-cover"
                    style={{
                      transition:
                        'filter 0.5s ease, transform 0.5s ease, opacity 0.45s ease',
                      filter: isActive
                        ? 'saturate(1.1) brightness(1.05)'
                        : 'saturate(0.7) brightness(0.7)',
                      transform: (isActive ? 'scale(1.02)' : 'scale(0.95)') + ' translateZ(0)',
                      backfaceVisibility: 'hidden',
                      userSelect: 'none',
                      pointerEvents: 'none',
                    }}
                    onError={(e) => {
                      e.currentTarget.style.visibility = 'hidden'
                    }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 左右悬浮控制区（强制最上层，避免 3D 环 translateZ 溢出后遮挡点击） */}
      <div
        className="group absolute left-0 top-0 z-40 flex h-full w-1/2 cursor-pointer items-center justify-start pointer-events-auto"
        onMouseEnter={() => setPaused(true)}
        onClick={(e) => {
          // 拖拽过程中箭头的"整块 click"不应触发切换（拖拽松手本身会决定位置）
          if (dragRef.current.on) return
          e.stopPropagation()
          go(-1)
        }}
        aria-label="上一个"
      >
        <div className="ml-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-md backdrop-blur-sm transition-all duration-200 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0">
          <ChevronLeft className="h-6 w-6 text-neutral-700" />
        </div>
      </div>
      <div
        className="group absolute right-0 top-0 z-40 flex h-full w-1/2 cursor-pointer items-center justify-end pointer-events-auto"
        onMouseEnter={() => setPaused(true)}
        onClick={(e) => {
          if (dragRef.current.on) return
          e.stopPropagation()
          go(1)
        }}
        aria-label="下一个"
      >
        <div className="mr-3 flex h-10 w-10 items-center justify-center rounded-full bg-white/80 shadow-md backdrop-blur-sm transition-all duration-200 opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0">
          <ChevronRight className="h-6 w-6 text-neutral-700" />
        </div>
      </div>

      <div className="absolute bottom-[calc(0.75rem+120px)] left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-neutral-500/30 px-3 py-1.5 backdrop-blur-md shadow-sm ring-1 ring-white/40 pointer-events-auto">
        {works.map((_, i) => (
          <button
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              setActive(i)
            }}
            className="h-1.5 rounded-full transition-all"
            style={{
              width: i === active ? 18 : 6,
              backgroundColor: i === active ? accent : 'rgba(255,255,255,0.55)',
            }}
            aria-label={`跳到第 ${i + 1} 张`}
          />
        ))}
      </div>
    </div>
  )
}
