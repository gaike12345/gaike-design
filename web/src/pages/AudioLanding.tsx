import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import { useSiteConfig, makeAccent } from '../hooks/useSiteConfig'
import {
  Music4,
  Mic2,
  Sliders,
  Languages,
} from 'lucide-react'
import type { ReactNode } from 'react'
import React, { useMemo } from 'react'

/* -------------------------------------------------------------------------- */
/*  复古留声机：哑光黄铜 + 深红木纹 + 褪色纸张底，19世纪爱迪生时代质感          */
/* -------------------------------------------------------------------------- */

const PHONO_W = 400
const PHONO_H = 300

function VintagePhonograph({ accent }: { accent: string }): ReactNode {
  /** 黑胶凹槽线（手摇式 78 转老唱片，沟槽深且疏） */
  const grooves = useMemo(() => {
    return Array.from({ length: 9 }, (_, i) => 55 - i * 5.2)
  }, [])

  /** 纸张噪点纹理（做旧泛黄效果） */
  const paperSpecks = useMemo(() => {
    const arr: { x: number; y: number; r: number; o: number }[] = []
    for (let i = 0; i < 60; i++) {
      arr.push({
        x: Math.random() * PHONO_W,
        y: Math.random() * PHONO_H,
        r: Math.random() * 1.2 + 0.3,
        o: Math.random() * 0.15 + 0.05,
      })
    }
    return arr
  }, [])

  return (
    <div
      className="relative w-full select-none"
      style={{ filter: 'sepia(0.18) saturate(0.85) contrast(0.95)' }}
    >
      <div
        className="relative mx-auto overflow-hidden"
        style={{
          width: '100%',
          maxWidth: PHONO_W,
          aspectRatio: `${PHONO_W} / ${PHONO_H}`,
          background:
            'radial-gradient(ellipse at 50% 35%, #f4ead0 0%, #e8d9b5 40%, #d4be8e 80%, #b89d6a 100%)',
          border: '4px solid #3a2410',
          borderRadius: '4px',
          boxShadow:
            `inset 0 0 60px rgba(90,60,20,0.35), inset 0 2px 0 rgba(255,240,200,0.4), 0 18px 36px -10px rgba(40,20,5,0.55), 0 4px 12px -2px rgba(40,20,5,0.3)`,
        }}
      >
        {/* 纸张做旧斑点层 */}
        <svg
          viewBox={`0 0 ${PHONO_W} ${PHONO_H}`}
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
          style={{ opacity: 0.6, mixBlendMode: 'multiply' }}
        >
          {paperSpecks.map((s, i) => (
            <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#6b4a20" opacity={s.o} />
          ))}
          {/* 四角泛黄焦痕 */}
          <radialGradient id="cornerBurn" cx="0%" cy="0%" r="80%">
            <stop offset="0%" stopColor="#8a5a20" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#8a5a20" stopOpacity="0" />
          </radialGradient>
          <rect x="0" y="0" width="80" height="80" fill="url(#cornerBurn)" />
          <rect x="320" y="0" width="80" height="80" fill="url(#cornerBurn)" transform="scale(-1,1) translate(-720,0)" />
        </svg>

        {/* 主留声机 SVG */}
        <svg
          viewBox={`0 0 ${PHONO_W} ${PHONO_H}`}
          className="absolute inset-0 h-full w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* —— 深红木纹底座 —— */}
            <linearGradient id="woodBase" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#6b3a1a" />
              <stop offset="30%" stopColor="#4a2510" />
              <stop offset="100%" stopColor="#2a1505" />
            </linearGradient>
            <linearGradient id="woodTop" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#7a4520" />
              <stop offset="60%" stopColor="#5a2c12" />
              <stop offset="100%" stopColor="#3a1a08" />
            </linearGradient>
            {/* 木纹纵向条纹 */}
            <pattern id="woodGrain" x="0" y="0" width="8" height="30" patternUnits="userSpaceOnUse">
              <rect width="8" height="30" fill="transparent" />
              <line x1="2" y1="0" x2="3" y2="30" stroke="#2a1505" strokeWidth="0.5" opacity="0.4" />
              <line x1="5" y1="0" x2="4" y2="30" stroke="#3a1a08" strokeWidth="0.3" opacity="0.3" />
            </pattern>

            {/* —— 哑光老黄铜（无强反光，偏暗沉） —— */}
            <radialGradient id="brassBell" cx="32%" cy="32%" r="85%">
              <stop offset="0%" stopColor="#d4b070" />
              <stop offset="30%" stopColor="#b8924c" />
              <stop offset="65%" stopColor="#8a6820" />
              <stop offset="90%" stopColor="#5a3e10" />
              <stop offset="100%" stopColor="#3a2808" />
            </radialGradient>
            <linearGradient id="brassArm" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#8a6820" />
              <stop offset="50%" stopColor="#b8924c" />
              <stop offset="100%" stopColor="#6a4818" />
            </linearGradient>

            {/* —— 黑胶（棕黑带磨损，非纯黑） —— */}
            <radialGradient id="vinyl" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#2a1f15" />
              <stop offset="50%" stopColor="#181208" />
              <stop offset="100%" stopColor="#080604" />
            </radialGradient>
            {/* 褪色标签纸（米黄而非鲜艳 accent） */}
            <radialGradient id="labelGrad" cx="40%" cy="40%" r="65%">
              <stop offset="0%" stopColor="#e8c878" />
              <stop offset="70%" stopColor="#c4a050" />
              <stop offset="100%" stopColor="#8a6820" />
            </radialGradient>

            {/* —— 喇叭内壁深阴影 —— */}
            <radialGradient id="bellInner" cx="38%" cy="38%" r="62%">
              <stop offset="0%" stopColor="#000" stopOpacity="0" />
              <stop offset="60%" stopColor="#000" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#000" stopOpacity="0.7" />
            </radialGradient>

            {/* 老旧投影（柔和大范围、暖棕调） */}
            <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
              <feOffset dx="4" dy="7" result="off" />
              <feFlood floodColor="#1a0a02" floodOpacity="0.45" />
              <feComposite in2="off" operator="in" />
              <feMerge>
                <feMergeNode />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* ============ 1) 木质底座（方正厚重，复古箱体） ============ */}
          <g filter="url(#softShadow)">
            {/* 前面板 */}
            <rect x="68" y="248" width="264" height="32" fill="url(#woodBase)" />
            <rect x="68" y="248" width="264" height="32" fill="url(#woodGrain)" />
            {/* 顶面（薄椭圆） */}
            <ellipse cx="200" cy="248" rx="132" ry="14" fill="url(#woodTop)" />
            {/* 顶面木纹 */}
            <ellipse cx="200" cy="248" rx="132" ry="14" fill="url(#woodGrain)" opacity="0.6" />
            {/* 顶面边缘描深 */}
            <ellipse cx="200" cy="248" rx="132" ry="14" fill="none" stroke="#1a0a02" strokeWidth="0.6" opacity="0.7" />
            {/* 底座装饰线（雕花凹槽） */}
            <rect x="76" y="256" width="248" height="16" fill="none" stroke="#1a0a02" strokeWidth="0.5" opacity="0.6" />
            <rect x="80" y="260" width="240" height="8" fill="none" stroke="#3a1a08" strokeWidth="0.4" opacity="0.5" />
            {/* 四角铜钉 */}
            {[[76, 252], [324, 252], [76, 276], [324, 276]].map(([x, y], i) => (
              <g key={i}>
                <circle cx={x} cy={y} r="2.5" fill="#6a4818" />
                <circle cx={x} cy={y} r="2.5" fill="none" stroke="#2a1808" strokeWidth="0.4" />
                <circle cx={x - 0.8} cy={y - 0.8} r="0.8" fill="#b8924c" opacity="0.5" />
              </g>
            ))}
          </g>

          {/* ============ 2) 黑胶唱片（78转，慢速转动） ============ */}
          <g
            style={{
              transformOrigin: '200px 212px',
              animation: 'phonographSpin 12s linear infinite',
            }}
          >
            {/* 唱片主体 */}
            <circle cx="200" cy="212" r="58" fill="url(#vinyl)" />
            {/* 凹槽线（手摇式老唱片，疏而深） */}
            {grooves.map((r, i) => (
              <circle
                key={i}
                cx="200" cy="212" r={r}
                fill="none"
                stroke="#3a2a18" strokeWidth="0.4"
                opacity={0.5 + (i % 3) * 0.08}
              />
            ))}
            {/* 磨损划痕（随机细线，做旧感） */}
            <path d="M 158 198 Q 200 188 242 200" fill="none" stroke="#4a3a20" strokeWidth="0.3" opacity="0.4" />
            <path d="M 165 225 Q 200 230 235 222" fill="none" stroke="#4a3a20" strokeWidth="0.3" opacity="0.3" />
            {/* 中心标签（米黄纸） */}
            <circle cx="200" cy="212" r="18" fill="url(#labelGrad)" />
            <circle cx="200" cy="212" r="18" fill="none" stroke="#5a3810" strokeWidth="0.5" opacity="0.6" />
            {/* 标签文字（深棕，老印刷感） */}
            <text x="200" y="209" fontSize="5" fontFamily="'Georgia', 'Times New Roman', serif" fill="#3a1a08" textAnchor="middle" opacity="0.85" fontWeight="700" letterSpacing="0.5">MAN TV</text>
            <text x="200" y="217" fontSize="3" fontFamily="'Georgia', serif" fill="#5a2c12" textAnchor="middle" opacity="0.7" letterSpacing="0.8">78 RPM · 1908</text>
            {/* 中心孔 */}
            <circle cx="200" cy="212" r="1.8" fill="#0a0604" />
          </g>

          {/* ============ 3) 唱针臂（哑光黄铜，老旧厚重） ============ */}
          <g filter="url(#softShadow)">
            {/* 支点（圆形底座，黄铜） */}
            <circle cx="300" cy="180" r="9" fill="url(#brassArm)" />
            <circle cx="300" cy="180" r="9" fill="none" stroke="#2a1808" strokeWidth="0.6" />
            <circle cx="300" cy="180" r="4" fill="#2a1808" />
            <circle cx="298" cy="178" r="1.5" fill="#d4b070" opacity="0.4" />
            {/* 臂杆（粗实，无亮高光） */}
            <line x1="300" y1="180" x2="232" y2="220" stroke="url(#brassArm)" strokeWidth="5" strokeLinecap="round" />
            <line x1="300" y1="180" x2="232" y2="220" stroke="#3a2808" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
            {/* 针头 */}
            <circle cx="232" cy="220" r="5.5" fill="url(#brassArm)" />
            <circle cx="232" cy="220" r="5.5" fill="none" stroke="#2a1808" strokeWidth="0.5" />
            <circle cx="232" cy="220" r="2.5" fill="#1a0a02" />
          </g>

          {/* ============ 4) 喇叭花（哑光黄铜大喇叭，柔和无反光） ============ */}
          <g filter="url(#softShadow)">
            {/* 喇叭管颈 */}
            <path
              d="M 295 178 Q 280 158 262 142 L 248 158 Q 258 172 275 188 Z"
              fill="url(#brassArm)"
              stroke="#2a1808" strokeWidth="0.6"
            />
            {/* 喇叭主体（大椭圆口） */}
            <ellipse
              cx="128" cy="108" rx="68" ry="58"
              fill="url(#brassBell)"
              stroke="#2a1808" strokeWidth="1"
            />
            {/* 喇叭表面铜锈做旧（不规则色斑） */}
            <ellipse cx="115" cy="95" rx="20" ry="14" fill="#5a4a20" opacity="0.25" />
            <ellipse cx="150" cy="125" rx="16" ry="12" fill="#3a2a10" opacity="0.2" />
            <ellipse cx="95" cy="130" rx="14" ry="10" fill="#4a3a18" opacity="0.18" />
            {/* 内壁阴影（深度） */}
            <ellipse
              cx="128" cy="108" rx="58" ry="48"
              fill="url(#bellInner)"
            />
            {/* 喇叭口内圈深孔 */}
            <ellipse
              cx="128" cy="108" rx="48" ry="40"
              fill="#1a0a02"
              opacity="0.85"
            />
            {/* 喇叭口柔和过渡边缘 */}
            <ellipse
              cx="128" cy="108" rx="50" ry="42"
              fill="none" stroke="#3a2010" strokeWidth="0.6" opacity="0.5"
            />
            {/* 喇叭口微弱漫射光（非锐利反光，做旧后黯淡） */}
            <path
              d="M 80 92 Q 100 78 128 75"
              fill="none"
              stroke="#c4a060" strokeWidth="2" strokeLinecap="round" opacity="0.4"
            />
            <path
              d="M 78 102 Q 92 88 120 84"
              fill="none"
              stroke="#a88840" strokeWidth="1" strokeLinecap="round" opacity="0.25"
            />
          </g>

          {/* ============ 5) 声波（从喇叭口飘出，细线、柔和） ============ */}
          <g style={{ transformOrigin: '128px 108px' }} opacity="0.7">
            {[0, 1, 2].map(i => (
              <path
                key={i}
                d="M 95 95 Q 80 82 68 70 M 105 78 Q 95 62 86 50 M 115 70 Q 108 52 106 38"
                fill="none"
                stroke="#6a4a20"
                strokeWidth="1.2"
                strokeLinecap="round"
                style={{
                  transformOrigin: '128px 108px',
                  transform: `scale(${0.7 + i * 0.15})`,
                  animation: 'phonographWave 3s ease-out infinite',
                  animationDelay: `${i * 0.6}s`,
                }}
              />
            ))}
          </g>

          {/* ============ 6) 底座铜铭牌（深棕背景 + 暗黄铜字） ============ */}
          <g>
            <rect x="145" y="262" width="110" height="14" rx="1" fill="#1a0a02" />
            <rect x="145" y="262" width="110" height="14" rx="1" fill="none" stroke="#5a3e10" strokeWidth="0.6" />
            <text x="200" y="272" fontSize="6" fontFamily="'Georgia', 'Times New Roman', serif" fill="#b8924c" textAnchor="middle" fontWeight="700" letterSpacing="1.5" opacity="0.85">MAN TV GRAMOPHONE</text>
          </g>

          {/* ============ 7) 手摇把（右侧，哑光黄铜） ============ */}
          <g filter="url(#softShadow)">
            {/* 把手轴 */}
            <line x1="332" y1="246" x2="346" y2="240" stroke="url(#brassArm)" strokeWidth="3" strokeLinecap="round" />
            <line x1="332" y1="246" x2="346" y2="240" stroke="#2a1808" strokeWidth="0.5" strokeLinecap="round" opacity="0.5" />
            {/* 把手圆环 */}
            <circle cx="350" cy="238" r="7" fill="none" stroke="url(#brassArm)" strokeWidth="3" />
            <circle cx="350" cy="238" r="7" fill="none" stroke="#2a1808" strokeWidth="0.5" opacity="0.5" />
          </g>
        </svg>
      </div>

      {/* 关键帧 */}
      <style>{`
        @keyframes phonographSpin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes phonographWave {
          0%   { opacity: 0; transform: scale(0.6) translate(0, 0); }
          30%  { opacity: 0.6; }
          100% { opacity: 0; transform: scale(1.15) translate(-12px, -10px); }
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
      preview={{ title: '复古留声机 · 19世纪黄铜质感', maxWidthPx: 400, bare: true, custom: <VintagePhonograph accent={accent.main} /> }}
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
