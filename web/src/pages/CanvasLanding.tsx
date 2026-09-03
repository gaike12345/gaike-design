import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import { useSiteConfig, makeAccent } from '../hooks/useSiteConfig'
import CoverCarousel3D from '../components/preview/CoverCarousel3D'
import {
  Wand2, Film, Image as ImageIcon, Music, Type, Layers,
} from 'lucide-react'
import type { ReactNode } from 'react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type DraggableNode = {
  id: string
  /** 百分比坐标 0-100 */
  x: number
  y: number
  size: number
  label: string
  title: string
}

/** 创作画布 Hero 背景装饰：可拖拽节点图 + 贝塞尔连线 + 调色盘 + 网格栅格 */
function CanvasHeroDecor({ accent }: { accent: string }): ReactNode {
  /** 中性灰：用于网格、连线、时间轴、光晕等装饰元素（节点卡/调色盘保持彩色） */
  const GRAY = '#94a3b8'
  const [nodes, setNodes] = useState<DraggableNode[]>([
    { id: 't', x: 10, y: 18, size: 44, label: 'T', title: '文本' },
    { id: 's', x: 26, y: 10, size: 50, label: 'S', title: '分镜' },
    { id: 'i', x: 44, y: 22, size: 56, label: 'I', title: '图像' },
    { id: 'v', x: 60, y: 50, size: 60, label: 'V', title: '视频' },
    { id: 'a', x: 80, y: 40, size: 50, label: 'A', title: '音频' },
    { id: 'o', x: 90, y: 78, size: 46, label: 'O', title: '输出' },
    { id: 'g', x: 50, y: 88, size: 48, label: 'G', title: '群组' },
    { id: 'm', x: 18, y: 68, size: 42, label: 'M', title: '模型' },
    { id: 'p', x: 34, y: 52, size: 38, label: '⚙', title: '参数' },
    { id: 'l', x: 70, y: 14, size: 44, label: 'L', title: '图层' },
  ])

  // 边：按节点 id 引用
  const edgeDefs: Array<[string, string]> = useMemo(() => [
    ['t', 's'], ['s', 'i'], ['i', 'v'], ['v', 'a'], ['a', 'o'],
    ['p', 'i'], ['m', 'p'], ['m', 'g'], ['g', 'o'], ['v', 'g'], ['l', 'v'],
  ], [])

  // 拖拽状态（单一事实来源：ref）
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    id: string | null
    startX: number
    startY: number
    origX: number
    origY: number
  }>({ id: null, startX: 0, startY: 0, origX: 0, origY: 0 })
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, id: string) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const node = nodes.find(n => n.id === id)
    if (!node) return
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    }
    setDraggingId(id)
    try { (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId) } catch {}
  }, [nodes])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d.id) return
    const wrap = wrapRef.current
    if (!wrap) return
    const rect = wrap.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dxPct = ((e.clientX - d.startX) / rect.width) * 100
    const dyPct = ((e.clientY - d.startY) / rect.height) * 100
    const clamp = (v: number) => Math.max(3, Math.min(97, v))
    setNodes(prev => prev.map(n => n.id === d.id
      ? { ...n, x: clamp(d.origX + dxPct), y: clamp(d.origY + dyPct) }
      : n
    ))
  }, [])

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.id) return
    try { (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId) } catch {}
    dragRef.current.id = null
    setDraggingId(null)
  }, [])

  // 根据 id 查坐标
  const posMap = useMemo(() => {
    const m: Record<string, { x: number; y: number }> = {}
    for (const n of nodes) m[n.id] = { x: n.x, y: n.y }
    return m
  }, [nodes])

  // 双击任意空白重置
  const onDblClick = useCallback((e: React.MouseEvent) => {
    const t = e.target as HTMLElement
    if (t.closest('[data-node="1"]')) return
    setNodes([
      { id: 't', x: 10, y: 18, size: 44, label: 'T', title: '文本' },
      { id: 's', x: 26, y: 10, size: 50, label: 'S', title: '分镜' },
      { id: 'i', x: 44, y: 22, size: 56, label: 'I', title: '图像' },
      { id: 'v', x: 60, y: 50, size: 60, label: 'V', title: '视频' },
      { id: 'a', x: 80, y: 40, size: 50, label: 'A', title: '音频' },
      { id: 'o', x: 90, y: 78, size: 46, label: 'O', title: '输出' },
      { id: 'g', x: 50, y: 88, size: 48, label: 'G', title: '群组' },
      { id: 'm', x: 18, y: 68, size: 42, label: 'M', title: '模型' },
      { id: 'p', x: 34, y: 52, size: 38, label: '⚙', title: '参数' },
      { id: 'l', x: 70, y: 14, size: 44, label: 'L', title: '图层' },
    ])
  }, [])

  return (
    <div
      ref={wrapRef}
      className="absolute inset-0"
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDblClick}
      style={{ touchAction: 'none' }}
    >
      {/* 画布网格（细密 32px 栅格） */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="cvgrid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke={GRAY} strokeWidth="1" />
          </pattern>
          <pattern id="cvbig" width="128" height="128" patternUnits="userSpaceOnUse">
            <rect width="128" height="128" fill="url(#cvgrid)" />
            <path d="M 128 0 L 0 0 0 128" fill="none" stroke={GRAY} strokeWidth="1.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cvbig)" />
      </svg>

      {/* 贝塞尔连线 SVG (跨节点，实时跟随节点位置) */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.40]" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 100 100">
        <defs>
          <linearGradient id="cvline" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={GRAY} stopOpacity="0.85" />
            <stop offset="100%" stopColor={GRAY} stopOpacity="0.35" />
          </linearGradient>
        </defs>
        {edgeDefs.map(([a, b], i) => {
          const pa = posMap[a]; const pb = posMap[b]
          if (!pa || !pb) return null
          const x1 = pa.x; const y1 = pa.y; const x2 = pb.x; const y2 = pb.y
          const cx = (x1 + x2) / 2
          const cy1 = y1 + (y2 - y1) * 0.25
          const cy2 = y2 - (y2 - y1) * 0.25
          return (
            <path
              key={i}
              d={`M ${x1} ${y1} C ${cx} ${cy1}, ${cx} ${cy2}, ${x2} ${y2}`}
              fill="none"
              stroke="url(#cvline)"
              strokeWidth="0.45"
              vectorEffect="non-scaling-stroke"
              strokeDasharray={i % 2 === 0 ? '' : '2 2'}
            />
          )
        })}
      </svg>

      {/* 节点卡（可拖拽） */}
      {nodes.map((n, i) => {
        const isDragging = draggingId === n.id
        return (
          <div
            key={n.id}
            data-node="1"
            onPointerDown={(e) => onPointerDown(e, n.id)}
            className="absolute flex select-none items-center justify-center rounded-lg shadow-md will-change-transform"
            style={{
              left: `${n.x}%`,
              top: `${n.y}%`,
              width: n.size,
              height: n.size,
              transform: isDragging
                ? 'translate(-50%, -50%) scale(1.08)'
                : `translate(-50%, -50%)`,
              transition: isDragging ? 'transform 0.1s ease' : 'transform 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease',
              backgroundColor: isDragging ? 'rgba(255,255,255,0.88)' : 'rgba(255,255,255,0.45)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              border: isDragging ? `2px solid ${accent}` : `1.5px solid ${accent}`,
              color: accent,
              fontFamily: '"JetBrains Mono", ui-monospace, monospace',
              fontWeight: 700,
              fontSize: n.size > 48 ? 20 : 16,
              cursor: isDragging ? 'grabbing' : 'grab',
              touchAction: 'none',
              boxShadow: isDragging
                ? `0 18px 40px -8px ${accent}88, 0 6px 16px -4px ${accent}44, inset 0 1px 0 rgba(255,255,255,0.8)`
                : `0 6px 14px -6px ${accent}33, inset 0 1px 0 rgba(255,255,255,0.5)`,
              zIndex: isDragging ? 50 : 10,
              animation: isDragging ? 'none' : `canvasFloat ${9 + i}s ease-in-out infinite`,
              animationDelay: `${i * 0.5}s`,
              opacity: isDragging ? 0.85 : 0.55,
              padding: 0,
              userSelect: 'none',
            }}
            title={`${n.title} (拖拽移动，双击画布重置)`}
          >
            {n.label}
          </div>
        )
      })}

      {/* 右上 12 色调色盘（远离节点 O） */}
      <div className="pointer-events-none absolute right-[4%] top-[6%] flex flex-col gap-1.5 opacity-[0.35]">
        {[
          ['#f87171', '#fb923c', '#facc15', '#84cc16'],
          ['#22d3ee', '#38bdf8', '#60a5fa', '#818cf8'],
          ['#a78bfa', '#e879f9', '#f472b6', '#fb7185'],
        ].map((row, r) => (
          <div key={r} className="flex gap-1.5">
            {row.map((col, c) => (
              <div key={`${r}-${c}`} className="h-4 w-4 rounded-[4px] ring-1 ring-white/40 shadow-[0_1px_2px_rgba(0,0,0,0.08)]"
                style={{ backgroundColor: col }} />
            ))}
          </div>
        ))}
      </div>

      {/* 左下时间轴刻度 */}
      <div className="pointer-events-none absolute left-[5%] bottom-[10%] flex flex-col gap-1 opacity-[0.22]" style={{ color: GRAY }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="h-px w-8" style={{ backgroundColor: GRAY }} />
            <div className="text-[10px] font-mono tracking-widest" style={{ color: GRAY }}>
              F{String(i + 1).padStart(2, '0')}
            </div>
            <div className="h-px w-[80px]" style={{ backgroundColor: GRAY, opacity: 0.3 }} />
          </div>
        ))}
      </div>

      {/* 中心大光晕 */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[500px] w-[500px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.07] blur-3xl"
           style={{ backgroundColor: GRAY }} />
    </div>
  )
}

const CANVAS_WORKS: LandingWork[] = [
  // 真实视频节点（悬浮播放视频，cover 为静止海报首帧，鼠标进入自动静音播放，离开复位）
  {
    cover: '/covers/canvas-1-fengming-jiutian.png',
    video: '/videos/canvas-video-10-node.mp4',
    typeLabel: '古风权谋',
    title: '凤鸣九天 · 视频节点 10',
    author: '大唐影业 / 节点工作流',
    likes: 10284,
    filter: 'video',
  },
  {
    cover: '/covers/canvas-2-yuxue-zhanchang.png',
    video: '/videos/canvas-video-15-node.mp4',
    typeLabel: '战争史诗',
    title: '浴血战场 · 视频节点 15',
    author: '铁血工房 / 节点工作流',
    likes: 8317,
    filter: 'video',
  },
  {
    cover: '/covers/canvas-3-jinxiu-weiyang.png',
    video: '/videos/canvas-video-16-node.mp4',
    typeLabel: '古装宫斗',
    title: '锦绣未央 · 视频节点 16',
    author: '锦绣文化传媒 / 节点工作流',
    likes: 9455,
    filter: 'video',
  },
  {
    cover: '/covers/canvas-4-nishikong-zhilian.png',
    video: '/videos/canvas-video-22-node.mp4',
    typeLabel: '奇幻穿越',
    title: '逆时空之恋 · 视频节点 22',
    author: '时光映像 / 节点工作流',
    likes: 7296,
    filter: 'video',
  },
  {
    cover: '/covers/canvas-5-aizai-limingqian.png',
    typeLabel: '都市情感',
    title: '爱在黎明前',
    author: '光合映画',
    likes: 9105,
    filter: 'image',
  },
  // 保留 1 张代表「图像生成」能力，题材覆盖 + 2×3 精选展示区填满
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Ghibli%20style%20forest%20illustration%2C%20morning%20mist%2C%20deer%20and%20fireflies%2C%20soft%20watercolor&image_size=landscape_4_3',
    typeLabel: '图像生成',
    title: '森林清晨',
    author: '森绘',
    likes: 6721,
    filter: 'image',
  },
]

/** 功能预览页：/canvas — 统一创作画布（图像 + 视频 + 音频） */
export default function CanvasLanding() {
  const { get } = useSiteConfig()
  const fallback = ACCENTS.image
  const accentHex = get('lc.accent', fallback.main) as string
  const title = get('lc.title', '可视化创作画布') as string
  const desc = get('lc.desc', '节点连接一切：文字 → 图 → 视频 → 音效，想怎么串就怎么串。') as string
  const accent = makeAccent(accentHex, fallback)
  return (
    <FeatureLanding
      tag="创作画布"
      heroTitle={{ highlight: title }}
      heroDesc={desc}
      primaryCta={{ label: '进入创作画布', to: '/workspace/canvas' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '社区画布作品预览 · 3D 轮转展示', maxWidthPx: 360, custom: <CoverCarousel3D works={CANVAS_WORKS} accent={accent.main} faceWidth={200} ringRadiusScale={1.3} /> }}
      works={CANVAS_WORKS}
      heroDecor={<CanvasHeroDecor accent={accent.main} />}
      abilities={[
        {
          icon: <Type className="h-6 w-6" />,
          title: '文本创意',
          desc: '从一句话开始，文本节点作为所有创作的源头，驱动后续分镜、出图与生成。',
        },
        {
          icon: <Wand2 className="h-6 w-6" />,
          title: '脚本分镜',
          desc: 'LLM 自动将文本拆解为分镜脚本，每个镜头独立生成画面，串联成完整叙事。',
        },
        {
          icon: <ImageIcon className="h-6 w-6" />,
          title: '图像生成',
          desc: 'Pollinations 真实出图，支持比例/步数/CFG/批量，负向提示词精修细节。',
        },
        {
          icon: <Film className="h-6 w-6" />,
          title: '视频生成',
          desc: '文生视频或图生视频，图片节点直连视频节点，让静态画面动起来。',
        },
        {
          icon: <Music className="h-6 w-6" />,
          title: '音频生成',
          desc: 'TTS 语音合成，为画面配上旁白与对白，多音色可选。',
        },
        {
          icon: <Layers className="h-6 w-6" />,
          title: '节点编排',
          desc: '无限画布自由布局，拖拽端口创建数据流，一条链路从创意到成品。',
        },
      ]}
      steps={[
        { title: '输入创意文本', desc: '在文本节点写下你的想法，作为整个工作流的起点。' },
        { title: '编排节点与连线', desc: '拖拽端口连接文本→分镜→图片→视频→输出，按需挂载模型与参数节点。' },
        { title: '执行生成与导出', desc: '逐节点点击生成，结果实时同步到输出节点，可送入漫画板块复用。' },
      ]}
      finalCta={{
        title: '准备好用画布串联你的创作了吗？',
        desc: '图像 + 视频 + 音频，一个画布搞定全部，节点式工作流让创作像流水线一样高效。',
        button: { label: '立即进入创作画布', to: '/workspace/canvas' },
      }}
      accent={accent}
    />
  )
}
