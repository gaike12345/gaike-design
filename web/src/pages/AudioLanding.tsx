import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import { useSiteConfig, makeAccent } from '../hooks/useSiteConfig'
import {
  Music4,
  Mic2,
  Sliders,
  Languages,
} from 'lucide-react'
import type { ReactNode } from 'react'
import React, { useMemo, useRef, useState, useCallback, useEffect } from 'react'

/* -------------------------------------------------------------------------- */
/*  交互式乐谱：点击五线谱任意位置 → 合法音高吸附 + 弹跳音符 + Web Audio 短音     */
/* -------------------------------------------------------------------------- */

type NoteDur = 'q' /* quarter */ | 'e' /* eighth */ | 'h' /* half */ | 'w' /* whole */
type Accidental = '#' | 'b' | 'n'

interface NoteBubble {
  id: number
  x: number               // svg x
  posIdx: number          // 0..N_POS-1（C4..C6）吸附后的位置
  dur: NoteDur
  acc: Accidental
  color: string
  bornAt: number
}

const SCORE_W = 400
const SCORE_H = 250
const STAFF_TOP = 70
const LINE_SPACING = 15           // 五线谱两线间距（半间距 = 1 位阶）
const CLEF_W = 44
const N_POS = 15                  // C4 (60) ~ C6 (84)
const POS_Y_BASE = STAFF_TOP + LINE_SPACING * 5   // position 0 = C4 的 SVG y
const MAX_NOTES = 16

/** 音位 → 标准音名 & midi（仅用于偶然音判断、frequency 计算） */
const DIATONIC = [
  { name: 'C', midi: 60 },
  { name: 'D', midi: 62 },
  { name: 'E', midi: 64 },
  { name: 'F', midi: 65 },
  { name: 'G', midi: 67 },
  { name: 'A', midi: 69 },
  { name: 'B', midi: 71 },
  { name: 'C', midi: 72 },
  { name: 'D', midi: 74 },
  { name: 'E', midi: 76 },
  { name: 'F', midi: 77 },
  { name: 'G', midi: 79 },
  { name: 'A', midi: 81 },
  { name: 'B', midi: 83 },
  { name: 'C', midi: 84 },
]

function posIdxToY(i: number): number {
  return POS_Y_BASE - i * (LINE_SPACING / 2)
}
function yToPosIdx(y: number): number {
  const raw = Math.round((POS_Y_BASE - y) / (LINE_SPACING / 2))
  return Math.max(0, Math.min(N_POS - 1, raw))
}
function midiOf(idx: number, acc: Accidental): number {
  const d = DIATONIC[idx]
  if (acc === '#') return d.midi + 1
  if (acc === 'b') return d.midi - 1
  return d.midi
}
function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12)
}

function InteractiveMusicScore({ accent }: { accent: string }): ReactNode {
  const svgRef = useRef<SVGSVGElement | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const masterGainRef = useRef<GainNode | null>(null)
  const [notes, setNotes] = useState<NoteBubble[]>([])
  const nextIdRef = useRef(1)

  /** 按需初始化 WebAudio（首次用户手势触发，满足 autoplay policy） */
  const ensureAudio = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current
    try {
      const AC: typeof AudioContext =
        (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AC()
      const gain = ctx.createGain()
      gain.gain.value = 0.0001
      gain.connect(ctx.destination)
      audioCtxRef.current = ctx
      masterGainRef.current = gain
      // 默认用户第一声后 master 音量拉起（否则 iOS 初始可能仍为 0）
      void ctx.resume?.()
      gain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.02)
      return ctx
    } catch {
      return null
    }
  }, [])

  /** 播放单音：正弦 + 快速包络（0.4s 总时长，钢琴般短促） */
  const playTone = useCallback((freqHz: number, durMs = 360) => {
    const ctx = ensureAudio()
    if (!ctx || !masterGainRef.current) return
    const t0 = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle' // 比 sine 丰满、比方波柔和（更像 MIDI 电钢）
    osc.frequency.value = freqHz
    g.gain.setValueAtTime(0.0001, t0)
    g.gain.exponentialRampToValueAtTime(0.9, t0 + 0.01)            // attack
    g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.07)           // decay -> sustain
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000) // release
    osc.connect(g)
    g.connect(masterGainRef.current)
    osc.start(t0)
    osc.stop(t0 + durMs / 1000 + 0.05)
  }, [ensureAudio])

  /** 将 click 的 clientX/Y 转成 SVG 坐标，并生成吸附后音符写入 state */
  const onStaffClick = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current
      if (!svg) return
      const pt = svg.createSVGPoint()
      pt.x = e.clientX
      pt.y = e.clientY
      const local = pt.matrixTransform(svg.getScreenCTM()?.inverse())
      if (!local) return
      // x 限在谱面可视区（避开高音谱号 + 右侧边距）
      const xMin = CLEF_W + 10
      const xMax = SCORE_W - 16
      const x = Math.max(xMin, Math.min(xMax, local.x))
      const posIdx = yToPosIdx(local.y)
      // 随机时值 & 偶然音（增加点击变化感）
      const durs: NoteDur[] = ['q', 'q', 'q', 'e', 'h', 'w']
      const accs: Accidental[] = ['n', 'n', 'n', 'n', '#', 'b']
      const dur = durs[Math.floor(Math.random() * durs.length)]
      const acc = accs[Math.floor(Math.random() * accs.length)]
      const midi = midiOf(posIdx, acc)

      // 加入 state（先进先出，最多 MAX_NOTES）
      setNotes((prev) => {
        const next: NoteBubble[] = [
          ...prev,
          {
            id: nextIdRef.current++,
            x,
            posIdx,
            dur,
            acc,
            color: accent,
            bornAt: performance.now(),
          },
        ]
        return next.length > MAX_NOTES ? next.slice(next.length - MAX_NOTES) : next
      })

      // 真实音高发声
      playTone(midiToFreq(midi))
    },
    [accent, playTone],
  )

  /** 自动清理已消逝音符（> 4.5s），避免 state 线性膨胀 */
  useEffect(() => {
    const t = setInterval(() => {
      const now = performance.now()
      setNotes((prev) => (prev.length === 0 ? prev : prev.filter((n) => now - n.bornAt < 4500)))
    }, 800)
    return () => clearInterval(t)
  }, [])

  const GRAY = '#475569'
  const LIGHT = '#94a3b8'

  return (
    <div className="relative w-full select-none">
      {/* 谱面容器：圆角纸感 + 细边框 + 内阴影（仿乐谱纸） */}
      <div
        className="relative overflow-hidden rounded-2xl"
        style={{
          aspectRatio: `${SCORE_W} / ${SCORE_H}`,
          background:
            'linear-gradient(180deg, #ffffff 0%, #f8fafc 55%, #ffffff 100%)',
          border: `1px solid ${accent}33`,
          boxShadow:
            `0 20px 40px -18px ${accent}55, 0 6px 14px -6px rgba(15,23,42,0.08), inset 0 1px 0 rgba(255,255,255,0.9)`,
        }}
      >
        {/* 角落的水印提示（点击乐谱生成音符） */}
        <div className="pointer-events-none absolute left-3 top-2 text-[10px] font-mono tracking-widest"
             style={{ color: LIGHT }}>
          ▶ click staff &nbsp;·&nbsp; 点击作曲
        </div>
        <div className="pointer-events-none absolute right-3 top-2 text-[10px] font-mono tracking-widest"
             style={{ color: accent, opacity: 0.8 }}>
          ♪ interactive score
        </div>

        <svg
          ref={svgRef}
          id="interactive-score-svg"
          data-testid="interactive-score"
          viewBox={`0 0 ${SCORE_W} ${SCORE_H}`}
          className="h-full w-full cursor-crosshair"
          onClick={onStaffClick}
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 5 条谱线（不规则曲线：每条用贝塞尔 path 替代直线，高低起伏明显） */}
          {[0, 1, 2, 3, 4].map((i) => {
            const baseY = STAFF_TOP + i * LINE_SPACING
            return (
              <path
                key={i}
                d={`M 16 ${baseY} C ${SCORE_W * 0.15} ${baseY + Math.sin(i * 1.7 + 0.3) * 14 - 6}, ${SCORE_W * 0.3} ${baseY + Math.cos(i * 1.1) * 18 + 4}, ${SCORE_W * 0.45} ${baseY + Math.sin(i * 2.3 + 1) * 16 - 3} S ${SCORE_W * 0.72} ${baseY + Math.cos(i * 1.9 + 0.5) * 20 + 5}, ${SCORE_W * 0.88} ${baseY + Math.sin(i * 2.8 + 0.2) * 14 - 4}, ${SCORE_W - 16} ${baseY + Math.cos(i * 3.1) * 10 + 2}`}
                fill="none"
                stroke={GRAY}
                strokeWidth="1.1"
                strokeLinecap="round"
              />
            )
          })}


          {/* 高音谱号 𝄞（serif 字形渲染较自然） */}
          <text
            x="20"
            y={STAFF_TOP + 4 * LINE_SPACING + 2}
            fontSize="64"
            fontFamily="'EB Garamond', 'Times New Roman', serif"
            fill={accent}
            style={{ filter: `drop-shadow(0 2px 6px ${accent}55)` }}
          >𝄞</text>

          {/* 拍号（4 / 4） */}
          <text x="64" y={STAFF_TOP + 2 * LINE_SPACING + 5} fontSize="20" fontWeight="700" fill={GRAY} fontFamily="'Georgia', serif">4</text>
          <text x="64" y={STAFF_TOP + 4 * LINE_SPACING - 1} fontSize="20" fontWeight="700" fill={GRAY} fontFamily="'Georgia', serif">4</text>

          {/* 已生成音符：弹跳入场 + 缓慢淡出 */}
          {notes.map((n) => {
            const yC = posIdxToY(n.posIdx)               // 音符头中心 y
            const stemUp = n.posIdx < N_POS / 2           // 低位 stem 朝上，高位朝下
            const headR = 6.2
            const headW = headR * 1.35                    // 椭圆宽（标准音符头横向拉长）
            const headH = headR
            const stemLen = 3 * LINE_SPACING - 1
            const stemX = stemUp ? n.x + headW : n.x - headW
            const stemY1 = stemUp ? yC - stemLen : yC
            const stemY2 = stemUp ? yC : yC + stemLen

            // 加线（ledger lines）：超出 5 线时画短横线
            const ledgers: number[] = []
            for (let p = -2; p <= 16; p++) {
              // 加线位阶：偶数（与五条线一致，偶数 = 线，奇数 = 间）
              if (p % 2 !== 0) continue
              // 在 5 线外（0..8 对应 C4 底 ~ 5 线上方），五线内位阶 2..10 对应五条线（line 0..4）
              if (p >= 2 && p <= 10) continue
              if (n.posIdx === p) ledgers.push(p)
            }

            return (
              <g
                key={n.id}
                style={{
                  transformOrigin: `${n.x}px ${yC}px`,
                  animation: 'scoreBounceIn 0.55s cubic-bezier(.22,1.2,.36,1) both, scoreFade 4.5s ease-in forwards',
                }}
              >
                {/* 加线（ledger lines） */}
                {ledgers.map((p) => (
                  <line
                    key={p}
                    x1={n.x - headW - 4}
                    y1={posIdxToY(p)}
                    x2={n.x + headW + 4}
                    y2={posIdxToY(p)}
                    stroke={GRAY}
                    strokeWidth="1"
                    strokeLinecap="round"
                  />
                ))}

                {/* 偶然音 # / b / n (在音符左侧) */}
                {n.acc !== 'n' ? (
                  <text
                    x={n.x - headW - 16}
                    y={yC + 4}
                    fontSize="16"
                    fontFamily="'Times New Roman', serif"
                    fontWeight="700"
                    textAnchor="middle"
                    fill={n.color}
                    style={{ filter: `drop-shadow(0 1px 2px ${n.color}88)` }}
                  >
                    {n.acc === '#' ? '♯' : '♭'}
                  </text>
                ) : null}

                {/* 音符头（空心 / 实心，whole 无 stem，whole/half 空心） */}
                {n.dur === 'w' ? (
                  <ellipse cx={n.x} cy={yC} rx={headW} ry={headH}
                    fill="#ffffff" stroke={n.color} strokeWidth="1.8"
                    transform={`rotate(-20 ${n.x} ${yC})`}
                    style={{ filter: `drop-shadow(0 1px 2px ${n.color}aa)` }}
                  />
                ) : n.dur === 'h' ? (
                  <>
                    <ellipse cx={n.x} cy={yC} rx={headW} ry={headH}
                      fill="#ffffff" stroke={n.color} strokeWidth="1.8"
                      transform={`rotate(-20 ${n.x} ${yC})`}
                      style={{ filter: `drop-shadow(0 1px 2px ${n.color}aa)` }}
                    />
                    <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={n.color} strokeWidth="1.8" strokeLinecap="round" />
                  </>
                ) : (
                  <>
                    <ellipse cx={n.x} cy={yC} rx={headW} ry={headH}
                      fill={n.color}
                      transform={`rotate(-20 ${n.x} ${yC})`}
                      style={{ filter: `drop-shadow(0 1px 2px ${n.color}88)` }}
                    />
                    <line x1={stemX} y1={stemY1} x2={stemX} y2={stemY2} stroke={n.color} strokeWidth="1.8" strokeLinecap="round" />
                    {/* 八分音符：1 条符尾（flag，朝 stem 顶端） */}
                    {n.dur === 'e' ? (
                      <path
                        d={stemUp
                          ? `M ${stemX} ${stemY1} c 4 -2, 10 -4, 10 10`
                          : `M ${stemX} ${stemY2} c -4 2, -10 4, -10 -10`}
                        fill="none" stroke={n.color} strokeWidth="2.2" strokeLinecap="round"
                      />
                    ) : null}
                  </>
                )}
              </g>
            )
          })}
        </svg>
      </div>

      {/* 关键帧（组件级 style，不污染全局） */}
      <style>{`
        @keyframes scoreBounceIn {
          0%   { transform: scale(0.0) rotate(-45deg); opacity: 0; }
          62%  { transform: scale(1.22) rotate(6deg);  opacity: 1; }
          80%  { transform: scale(0.94) rotate(-2deg); opacity: 1; }
          100% { transform: scale(1.0) rotate(0deg);   opacity: 1; }
        }
        @keyframes scoreFade {
          0%, 70% { opacity: 1; }
          100%    { opacity: 0.05; }
        }
      `}</style>
    </div>
  )
}

/** 音频创作 Hero 背景装饰：频谱条 + 同心圆声波 + 五线谱 + 黑胶唱片 + 音量旋钮 + EQ 均衡器 */
function AudioHeroDecor({ accent }: { accent: string }): ReactNode {
  /** 中性灰：结构元素使用（与 Canvas 板块保持强度一致，节点/面板/旋钮用 accent 彩色） */
  const GRAY = '#94a3b8'

  /** 左下均衡器（31 条不同高度的频谱柱，按高斯曲线高-低-高分布，呼吸动画） */
  const eqBars = useMemo(() => {
    const len = 31
    return Array.from({ length: len }, (_, i) => {
      // 高斯状中心高、两端低 + 随机微扰，基准 10-64px
      const x = (i - (len - 1) / 2) / ((len - 1) / 2.4)
      const base = 64 * Math.exp(-(x * x)) + 10
      const jitter = [7, 29, 11, 43, 17, 53, 9, 37, 13, 47, 23, 59, 3, 31, 21][i % 15]
      const h = Math.max(8, Math.min(72, base + jitter - 18))
      return {
        h,
        animDur: 0.9 + ((i * 37) % 19) / 20,
        animDelay: (i * 0.05) % 2,
      }
    })
  }, [])

  /** 五线谱音符（♪ / ♫ 散落在五线四间） */
  const staffNotes = useMemo<Array<{ left: number; top: number; ch: string; size: number; rotate: number }>>(() => ([
    { left: 14, top: 0, ch: '♪', size: 22, rotate: -8 },
    { left: 28, top: 2, ch: '♫', size: 26, rotate: 4 },
    { left: 42, top: 1, ch: '♩', size: 20, rotate: -3 },
    { left: 54, top: 3, ch: '♬', size: 24, rotate: 6 },
    { left: 66, top: 0, ch: '♪', size: 22, rotate: -5 },
    { left: 78, top: 2, ch: '♫', size: 26, rotate: 3 },
  ]), [])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* ============ 1) 中心同心圆声波（扩散声浪，从中心向外衰减 opacity） ============ */}
      <svg className="absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 opacity-[0.18]" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
        <g fill="none" stroke={GRAY} strokeWidth="1">
          {[50, 90, 130, 170, 210, 250, 290].map((r, i) => (
            <circle
              key={r}
              cx="400"
              cy="300"
              r={r}
              style={{
                strokeOpacity: 0.8 - i * 0.11,
                transformOrigin: '400px 300px',
                animation: `audioRipple ${3 + i * 0.7}s ease-out infinite`,
                animationDelay: `${i * 0.25}s`,
              }}
            />
          ))}
        </g>
      </svg>

      {/* ============ 2) 底层细密点阵（代替 Canvas 网格，音频感：横向时间刻度） ============ */}
      <svg className="absolute inset-0 h-full w-full opacity-[0.10]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="audot" width="28" height="28" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill={GRAY} />
          </pattern>
          <pattern id="audotBig" width="112" height="112" patternUnits="userSpaceOnUse">
            <rect width="112" height="112" fill="url(#audot)" />
            <path d="M 112 0 L 0 0 0 112" fill="none" stroke={GRAY} strokeWidth="1" strokeOpacity="0.6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#audotBig)" />
      </svg>

      {/* ============ 3) 左上：音量旋钮（rotary） ============ */}
      <div
        className="absolute left-[5%] top-[8%] opacity-[0.40]"
        title="音量旋钮"
        style={{ animation: 'audioFloat 7s ease-in-out infinite' }}
      >
        <div
          className="relative flex items-center justify-center rounded-full"
          style={{
            width: 80,
            height: 80,
            background: `radial-gradient(circle at 30% 30%, #ffffff 0%, #e5e7eb 55%, ${GRAY} 100%)`,
            border: `1.5px solid ${GRAY}`,
            boxShadow: `inset 0 2px 6px rgba(255,255,255,0.9), inset 0 -4px 10px rgba(15,23,42,0.25), 0 6px 18px -4px ${accent}55`,
          }}
        >
          <div
            className="absolute rounded-full"
            style={{
              width: 54,
              height: 54,
              background: `conic-gradient(from 215deg at 50% 50%, ${accent}00 0%, ${accent}cc 25%, ${accent}ee 60%, ${accent}00 82%)`,
              mask: 'radial-gradient(circle, transparent 58%, black 60%)',
              WebkitMask: 'radial-gradient(circle, transparent 58%, black 60%)',
              opacity: 0.9,
            }}
          />
          {/* 指针 */}
          <div
            className="absolute"
            style={{
              width: 4,
              height: 24,
              borderRadius: 2,
              background: accent,
              top: 8,
              left: '50%',
              transform: 'translateX(-50%) rotate(-45deg)',
              transformOrigin: '50% calc(100% - 4px)',
              boxShadow: `0 0 6px ${accent}aa`,
            }}
          />
          {/* 中心轴心 */}
          <div className="relative rounded-full" style={{ width: 12, height: 12, background: '#0f172a', boxShadow: 'inset 0 1px 2px rgba(255,255,255,0.4)' }} />
        </div>
        {/* 刻度线 */}
        <svg className="absolute -inset-2" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          {Array.from({ length: 11 }).map((_, i) => {
            const a = -135 + (i * 270) / 10
            const rad = (a * Math.PI) / 180
            const r1 = i % 5 === 0 ? 40 : 43
            const r2 = 48
            const x1 = 50 + r1 * Math.cos(rad)
            const y1 = 50 + r1 * Math.sin(rad)
            const x2 = 50 + r2 * Math.cos(rad)
            const y2 = 50 + r2 * Math.sin(rad)
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GRAY} strokeWidth={i % 5 === 0 ? 1.4 : 0.8} opacity={0.7} />
          })}
        </svg>
      </div>

      {/* ============ 4) 左下：EQ 频谱均衡器条（31 条，高斯分布） ============ */}
      <div className="absolute left-[4%] bottom-[7%] flex items-end gap-1 opacity-[0.32]">
        {eqBars.map((b, i) => (
          <div
            key={i}
            className="rounded-t"
            style={{
              width: 6,
              height: b.h,
              background: `linear-gradient(180deg, ${accent}ff 0%, ${accent}aa 45%, ${GRAY}bb 100%)`,
              animation: `audioEq ${b.animDur}s ease-in-out infinite`,
              animationDelay: `${b.animDelay}s`,
              boxShadow: `0 0 8px -2px ${accent}66`,
              transformOrigin: 'bottom',
            }}
          />
        ))}
        <div className="ml-3 self-end text-[10px] font-mono tracking-widest pb-1" style={{ color: GRAY, opacity: 0.7 }}>EQ · 31-band</div>
      </div>

      {/* ============ 5) 右下：黑胶唱片（LP，缓慢自转） ============ */}
      <div
        className="absolute right-[4%] bottom-[6%] opacity-[0.42]"
        title="黑胶唱片"
      >
        <div className="relative" style={{ width: 150, height: 150 }}>
          {/* 外环凹槽（纹理） */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            {Array.from({ length: 9 }).map((_, i) => (
              <circle key={i} cx="50" cy="50" r={10 + i * 4.2} fill="none" stroke="#0f172a" strokeWidth="0.35" opacity={0.6 + i * 0.04} />
            ))}
          </svg>
          {/* 唱片主体 */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'radial-gradient(circle at 50% 50%, #0b1220 0%, #1e293b 40%, #020617 72%, #000 100%)',
              boxShadow: `0 18px 40px -10px rgba(0,0,0,0.55), inset 0 0 30px rgba(0,0,0,0.8)`,
              animation: 'audioSpin 18s linear infinite',
            }}
          >
            {/* 标签中心 */}
            <div
              className="absolute left-1/2 top-1/2 rounded-full"
              style={{
                width: 52,
                height: 52,
                transform: 'translate(-50%, -50%)',
                background: `radial-gradient(circle at 30% 30%, #ffffff 0%, ${accent}cc 45%, #be185d 100%)`,
                boxShadow: `inset 0 2px 6px rgba(255,255,255,0.4), inset 0 -2px 6px rgba(0,0,0,0.3)`,
              }}
            >
              <div className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-900 shadow-inner" />
              <div className="absolute left-1/2 top-1/2 h-0.5 w-6 -translate-x-1/2 translate-y-[30px] rounded-full bg-white/60" />
            </div>
          </div>
        </div>
        <div className="mt-2 text-right text-[10px] font-mono tracking-widest" style={{ color: GRAY, opacity: 0.7 }}>LP · 12"</div>
      </div>

      {/* ============ 6) 右上：波形（时间轴 × 多声道信号） ============ */}
      <div className="absolute right-[5%] top-[9%] w-[260px] opacity-[0.30]">
        <svg viewBox="0 0 260 84" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
          {/* 通道 1：粉(accent) 波形 */}
          <path
            fill="none"
            stroke={accent}
            strokeWidth="1.6"
            opacity={0.9}
            d={buildWaveformPath(260, 84, { amp: 22, freq: 0.09, phase: 0, center: 24, noise: 4, seed: 7 })}
          />
          {/* 通道 2：灰波形 */}
          <path
            fill="none"
            stroke={GRAY}
            strokeWidth="1.4"
            opacity={0.85}
            d={buildWaveformPath(260, 84, { amp: 18, freq: 0.13, phase: 2.1, center: 60, noise: 5, seed: 13 })}
          />
          {/* 播放头 */}
          <line x1="92" y1="4" x2="92" y2="80" stroke={accent} strokeWidth="1.2" strokeDasharray="3 3" opacity={0.9} />
          <circle cx="92" cy="42" r="3" fill={accent} opacity={0.9} />
        </svg>
        <div className="mt-1 flex justify-between text-[10px] font-mono tracking-widest" style={{ color: GRAY, opacity: 0.7 }}>
          <span>00:00</span><span>CH1 / CH2</span><span>02:45</span>
        </div>
      </div>

      {/* ============ 7) 中下：五线谱 + 音符（♪♫♩♬ 浮动） ============ */}
      <div className="absolute left-1/2 bottom-[6%] w-[55%] -translate-x-1/2 opacity-[0.26]">
        <svg viewBox="0 0 600 90" preserveAspectRatio="none" className="h-[80px] w-full" xmlns="http://www.w3.org/2000/svg">
          {/* 五条线 */}
          {[0, 1, 2, 3, 4].map(i => (
            <line key={i} x1="0" y1={20 + i * 12} x2="600" y2={20 + i * 12} stroke={GRAY} strokeWidth="1" />
          ))}
          {/* 小节线 */}
          {[150, 300, 450].map(x => (
            <line key={x} x1={x} y1="20" x2={x} y2="68" stroke={GRAY} strokeWidth="1" opacity="0.8" />
          ))}
          {/* 高音谱号 */}
          <text x="8" y="58" fontSize="44" fontFamily="serif" fill={accent} opacity="0.85">𝄞</text>
        </svg>
        {/* 音符（绝对定位，能加浮动动画） */}
        {staffNotes.map((n, i) => (
          <div
            key={i}
            className="absolute font-serif font-bold"
            style={{
              left: `${n.left}%`,
              top: `${8 + n.top * 10}px`,
              fontSize: n.size,
              transform: `translateY(-50%) rotate(${n.rotate}deg)`,
              color: accent,
              opacity: 0.85,
              animation: `audioFloat ${6 + (i * 13) % 7}s ease-in-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          >
            {n.ch}
          </div>
        ))}
      </div>

      {/* ============ 8) 中心大光晕（粉 accent） ============ */}
      <div
        className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl opacity-[0.08]"
        style={{ background: `radial-gradient(circle, ${accent} 0%, ${GRAY}00 70%)` }}
      />

      {/* ============ 关键帧（注入一次即可，全局 tailwind + style tag 共享） ============ */}
      <style>{`
        @keyframes audioRipple {
          0% { transform: scale(0.92); opacity: 0.0; }
          20% { opacity: 0.9; }
          100% { transform: scale(1.25); opacity: 0.0; }
        }
        @keyframes audioEq {
          0%, 100% { transform: scaleY(0.65); }
          45% { transform: scaleY(1.05); }
          70% { transform: scaleY(0.82); }
        }
        @keyframes audioSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes audioFloat {
          0%, 100% { transform: translateY(-50%) rotate(0deg); }
          50% { transform: translateY(calc(-50% - 6px)) rotate(2deg); }
        }
      `}</style>
    </div>
  )
}

/** 辅助：生成一个波形 SVG path（正弦 + 谐波 + 伪随机抖动，形成可辨识的音频信号） */
function buildWaveformPath(
  w: number,
  h: number,
  opt: { amp: number; freq: number; phase: number; center: number; noise: number; seed: number },
): string {
  const { amp, freq, phase, center, noise, seed } = opt
  const steps = 180
  let d = ''
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * w
    const k = i + seed
    // 基波 sin + 2 次谐波 cos + 伪随机（与 seed 绑定的确定性噪声）
    const wave =
      Math.sin(t * freq + phase) * amp +
      Math.cos(t * freq * 2.3 + phase * 1.3) * (amp * 0.35) +
      Math.sin(t * freq * 0.61 + phase * 0.7) * (amp * 0.25)
    const nse = (((k * 9301 + 49297) % 233280) / 233280 - 0.5) * noise * 2
    const y = center + wave + nse
    if (i === 0) d += `M ${t.toFixed(2)} ${y.toFixed(2)}`
    else d += ` L ${t.toFixed(2)} ${y.toFixed(2)}`
  }
  return d
}

const AUDIO_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Bedtime%20story%20audiobook%20cover%2C%20dreamy%20starry%20night%20sky%20soft%20crescent%20moon%2C%20tiny%20open%20book%20flying%20among%20glowing%20stars%2C%20cozy%20pastel%20purple&image_size=landscape_4_3',
    typeLabel: '有声书',
    title: '枕边故事·星空旅人',
    author: '暖声',
    likes: 3210,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Piano%20spring%20album%20cover%2C%20grand%20piano%20with%20cherry%20blossoms%2C%20warm%20morning%20sunlight%20through%20window%2C%20soft%20bokeh%2C%20cozy%20music%20room&image_size=landscape_4_3',
    typeLabel: 'BGM 专辑',
    title: '晨间钢琴·春日',
    author: '音律',
    likes: 2876,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Urban%20legend%20horror%20podcast%20cover%2C%20dark%20city%20alley%20mysterious%20shadows%2C%20single%20flickering%20old%20lamp%2C%20moody%20teal%20noir%20vintage%20microphone&image_size=landscape_4_3',
    typeLabel: '悬疑播客',
    title: '都市怪谈·第3季',
    author: '夜行',
    likes: 4563,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=English%20learning%20podcast%20cover%2C%20open%20vintage%20classic%20book%20with%20cup%20of%20tea%2C%20antique%20library%20bookshelves%2C%20warm%20reading%20lamp%2C%20cozy%20study&image_size=landscape_4_3',
    typeLabel: '语言学习',
    title: '英语美文跟读',
    author: 'Luna',
    likes: 1982,
    filter: 'audio',
  },
  // 凑足 6 件（让 3D 环 n=6 与其他两页完全同步，半径与视觉比例一致），题材互补
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Lofi%20chillhop%20album%20cover%2C%20lofi%20girl%20wearing%20headphones%20by%20rainy%20window%20with%20cat%2C%20warm%20yellow%20desk%20lamp%2C%20soft%20pastel%20illustration&image_size=landscape_4_3',
    typeLabel: 'Lo-Fi 电台',
    title: '雨夜 Lo-Fi 电台',
    author: 'Chill Lab',
    likes: 5128,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Documentary%20narration%20audiobook%20cover%2C%20retro%20microphone%20against%20mountains%20and%20sunrise%20golden%20hour%20landscape%2C%20cinematic%20warm%20sepia%20tone&image_size=landscape_4_3',
    typeLabel: '人文纪实',
    title: '山河纪事 · 旁白集',
    author: '山河志',
    likes: 2655,
    filter: 'audio',
  },
]

/** 功能预览页：/audio — 音频创作 */
export default function AudioLanding() {
  const { get } = useSiteConfig()
  const fallback = ACCENTS.audio
  const accentHex = get('la.accent', fallback.main) as string
  const title = get('la.title', 'AI 音频创作工作室') as string
  const desc = get('la.desc', 'TTS 配音 + 音乐生成 + 音效库合成，一键出你专属的播客或 BGM。') as string
  const accent = makeAccent(accentHex, fallback)
  return (
    <FeatureLanding
      tag="音频创作"
      heroTitle={{ highlight: title }}
      heroDesc={desc}
      primaryCta={{ label: '进入音频工作区', to: '/workspace/audio' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '可交互乐谱 · 点击谱面作曲', maxWidthPx: 400, bare: true, custom: <InteractiveMusicScore accent={accent.main} /> }}
      works={AUDIO_WORKS}
      heroDecor={<AudioHeroDecor accent={accent.main} />}

      abilities={[
        {
          icon: <Mic2 className="h-6 w-6" />,
          title: '多角色 TTS',
          desc: '为每个角色绑定独有的音色，支持情绪（平静/激动/悲伤）变化，避免千篇一律。',
        },
        {
          icon: <Music4 className="h-6 w-6" />,
          title: 'BGM 情绪驱动',
          desc: '输入当前剧情情绪标签，AI 自动生成合适长度的背景音乐并自然循环。',
        },
        {
          icon: <Sliders className="h-6 w-6" />,
          title: '音轨混音台',
          desc: '配音 / BGM / 环境音 / 特效音 4 轨独立调节，支持淡入淡出与音量包络。',
        },
        {
          icon: <Languages className="h-6 w-6" />,
          title: '多语言多方言',
          desc: '中文（含方言）、英、日、韩一键切换语言版本，触达更广泛的听众。',
        },
      ]}
      steps={[
        { title: '拆分对白', desc: '自动从小说 / 漫画脚本中提取对白，自动分配到对应角色。' },
        { title: '音频合成', desc: '为每个角色挑选音色与情绪，生成对白、BGM 与环境音。' },
        { title: '混音导出', desc: '在混音台微调音轨，导出 MP3 / WAV，并可与视频板块联动合成。' },
      ]}
      finalCta={{
        title: '让你的作品有声音？',
        desc: '从独白到大型有声剧，AI 音频板块全程陪伴。',
        button: { label: '立即进入音频工作区', to: '/workspace/audio' },
      }}
      accent={accent}
    />
  )
}
