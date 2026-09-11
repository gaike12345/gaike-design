// 站点配置模块（FeaturesTab）
// 从 AdminPage.tsx 抽取，包含：
//   - 站点配置分组/页面模块定义（SITE_GROUPS, PAGE_MODULES）
//   - 所有迷你预览组件（14 种）
//   - SectionCard / ControlRow / GroupCard 可视化卡片
//   - AuditDrawer 审计回滚抽屉
//   - FeaturesTab 主组件
//
// 仅导出 FeaturesTab 和 registerFeaturesDirtyKeysRef。

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, MutableRefObject } from 'react'
import {
  AlertTriangle,
  Bell,
  BookOpen,
  Box,
  Check,
  ChevronRight,
  Clock,
  Copyright,
  Cpu,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  FileText,
  Gift,
  History,
  Image,
  LayoutGrid,
  Layers,
  Loader2,
  LogIn,
  MessageSquare,
  Music,
  Music4,
  Palette,
  RefreshCw,
  Rocket,
  Save,
  Settings2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Undo2,
  UsersRound,
  Video,
  X,
} from 'lucide-react'

import ModerationPanel from '../ModerationPanel'
import { CommunityManageTab } from './CommunityManageTab'
import { ModelsByType } from './ModelsTab'
import { VideoModelCompare } from './VideoModelCompare'
import { LlmPricingCompare } from './LlmPricingCompare'
import { ImageModelCompare } from './ImageModelCompare'
import { AudioModelCompare } from './AudioModelCompare'

import {
  useSiteConfig,
  putSiteBatch,
  getSiteAudit,
  rollbackSiteAudit,
  clearSiteDraft,
  makeAccent,
  type SiteItemMeta,
  type ControlType,
} from '../../hooks/useSiteConfig'

import type {
  Role,
  IconComponent,
  SiteGroupDef,
  PageSectionDef,
  PageModuleDef,
} from './types'

// =============== 站点配置分组定义 ===============
const SITE_GROUPS: SiteGroupDef[] = [
  { key: 'pricing',         label: '套餐定价',       icon: DollarSign, accent: 'emerald', radius: '/pricing 页面 Pro/企业版 展示与积分', highRisk: true },
  { key: 'rate-limit',      label: '限流阈值',       icon: Shield,   accent: 'violet',  radius: '全平台 AI 接口限流（实时生效）', highRisk: true, sensitive: true },
  { key: 'safety',          label: '安全与公告',     icon: ShieldAlert, accent: 'rose', radius: '内容审核严格度、全站公告横幅', sensitive: true },
]

// 将 seed 中实际的 4 个 landing-group 合并展示
const LANDING_GROUPS = ['landing-novel', 'landing-canvas', 'landing-audio', 'landing-community'] as const
const LANDING_LABELS: Record<string, { title: string; icon: IconComponent; accent: string }> = {
  'landing-novel':     { title: '🎩 小说写作 /novel',       icon: BookOpen,  accent: 'indigo' },
  'landing-canvas':    { title: '🎬 创作画布 /canvas',      icon: Layers,    accent: 'cyan' },
  'landing-audio':     { title: '🎙 音频创作 /audio',       icon: Music4,    accent: 'pink' },
  'landing-community': { title: '🧑‍🤝‍🧑 创作者社区 /community', icon: UsersRound, accent: 'emerald' },
}

// =============== 页面模块定义（PAGE_MODULES） ===============
// 保留完整的 6 大模块 + works/moderation 虚拟项（侧边栏任务栏不变）
// 仅 system 模块保留 5 项配置 section + 各板块模型管理
export const PAGE_MODULES: PageModuleDef[] = [
  {
    key: 'novel', label: '小说写作', icon: BookOpen, accent: 'indigo',
    subtitle: '小说创作页面（/novel）',
    route: '/novel',
    sections: [],
  },
  {
    key: 'canvas', label: '创作画布', icon: Layers, accent: 'indigo',
    subtitle: 'AI 创作画布（/canvas）',
    route: '/canvas',
    sections: [],
    children: [
      { key: 'canvas.image',  shortKey: 'image',  label: '图像生成', icon: Image,  accent: 'cyan',   subtitle: 'AI 图像生成', route: '/canvas', filterType: 'image' },
      { key: 'canvas.video',  shortKey: 'video',  label: '视频生成', icon: Video, accent: 'violet', subtitle: 'AI 视频生成', route: '/canvas', filterType: 'video' },
    ],
  },
  {
    key: 'audio', label: '音频创作', icon: Music4, accent: 'pink',
    subtitle: 'AI 音频创作（/audio）',
    route: '/audio',
    sections: [],
  },
  {
    key: 'system', label: '系统设置', icon: Settings2, accent: 'violet',
    subtitle: '套餐定价、AI 接口限流',
    route: '全站系统层',
    sections: [
      {
        key: 'sys-pricing-plans', title: '套餐权益与价格数值', icon: CreditCard,
        description: 'Pro/企业版 每月价格、附赠积分、折扣、显示价格版本',
        highlight: '/pricing 定价页每张套餐卡片里的数字、权益清单',
        badges: ['highRisk'],
        sources: [{ group: 'pricing', keyMatch: /^pricing\.(pro_|business_|prices_)/ }],
        cols: 2,
        preview: 'pricing-plans',
      },
      {
        key: 'sys-ratelimit', title: 'AI 接口限流阈值', icon: Shield,
        description: '全平台 AI 生成（画/音/字/漫） 单用户每日/每分调用上限',
        highlight: '所有用户实时生效（保存后立即限流）',
        badges: ['highRisk', 'sensitive'],
        sources: [{ group: 'rate-limit' }],
        cols: 2,
        preview: 'ratelimit',
      },
    ],
  },
]

// =============== 子分组（Subgroup）规则 ===============
// 每条 item 的 key 按前缀归入一个 subgroup；左侧子目录与右侧视觉段一一对应
interface SubgroupRule { prefix: RegExp | ((k: string, g: string) => boolean); label: string }
const SUBGROUP_RULES: Record<string, SubgroupRule[]> = {
  pricing: [
    { prefix: /^pricing\.(pro_|business_|prices_)/, label: '权益与价格数值' },
  ],
  safety: [
    { prefix: /^safety\.moderation_/, label: '内容审核严格度' },
    { prefix: /^safety\.announcement_?/, label: '全站公告横幅' },
  ],
}
const SUBGROUP_FALLBACK_LABEL = '其它配置'

// —— SectionWithItems：收集后的 section + items 结构 ——
type SectionWithItems = {
  moduleKey: string
  moduleLabel: string
  moduleIcon: IconComponent
  moduleAccent: string
  section: PageSectionDef
  items: Array<{ item: SiteItemMeta; group: string }>
}

// =============== 全局 dirtyKeys ref 注册（供 FeaturesSideNav 显示 badge） ===============
let __FEATURES_DIRTY_KEYS__: MutableRefObject<Set<string>> | null = null

export function registerFeaturesDirtyKeysRef(ref: MutableRefObject<Set<string>>) {
  __FEATURES_DIRTY_KEYS__ = ref
}

export function useFeaturesNav() {
  const ctx = useSiteConfig()
  if (!ctx) return { data: { version: 0, config: {}, groups: {} } as SiteConfigData, dirtyKeys: new Set<string>() }
  const dirtySet: Set<string> = __FEATURES_DIRTY_KEYS__?.current ?? new Set()
  return { data: ctx.data, dirtyKeys: dirtySet }
}

// =============== 工具函数 ===============

export function collectSectionItems(
  dataGroups: Record<string, SiteItemMeta[]> | undefined,
): Map<string, SectionWithItems> {
  // key = `${moduleKey}::${section.key}`
  const result = new Map<string, SectionWithItems>()
  const allSources: Array<{ item: SiteItemMeta; group: string }> = []
  if (dataGroups) {
    for (const [g, arr] of Object.entries(dataGroups)) {
      for (const it of arr) allSources.push({ item: it, group: g })
    }
  }
  for (const m of PAGE_MODULES) {
    for (const sec of m.sections) {
      const matched: Array<{ item: SiteItemMeta; group: string }> = []
      for (const s of sec.sources) {
        const allowedGroups = !s.group ? null : (Array.isArray(s.group) ? s.group : [s.group])
        const kmatchFn = !s.keyMatch
          ? null
          : (s.keyMatch instanceof RegExp
              ? ((k: string) => (s.keyMatch as RegExp).test(k))
              : (s.keyMatch as (k: string) => boolean))
        for (const it of allSources) {
          if (allowedGroups && !allowedGroups.includes(it.group)) continue
          if (kmatchFn && !kmatchFn(it.item.key)) continue
          matched.push(it)
        }
      }
      // 按 sort 升序，再按 key 稳定去重（section 多 sources 可能重复）
      const seen = new Set<string>()
      const deduped: Array<{ item: SiteItemMeta; group: string }> = []
      for (const x of matched.sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0))) {
        if (seen.has(x.item.key)) continue
        seen.add(x.item.key)
        deduped.push(x)
      }
      result.set(`${m.key}::${sec.key}`, {
        moduleKey: m.key, moduleLabel: m.label, moduleIcon: m.icon, moduleAccent: m.accent,
        section: sec, items: deduped,
      })
    }
  }
  return result
}

// 将 items 按 subgroup 分块
function splitToSubgroups(
  items: Array<{ item: SiteItemMeta; group: string }>,
  groupKey: string,
): Array<{ label: string; items: Array<{ item: SiteItemMeta; group: string }>; anchor: string }> {
  // landing 特殊处理：直接按 group（landing-novel/canvas/audio/community）切
  if (groupKey === 'landing') {
    const buckets: Record<string, Array<{ item: SiteItemMeta; group: string }>> = {}
    for (const it of items) {
      (buckets[it.group] ??= []).push(it)
    }
    return LANDING_GROUPS
      .filter((g) => buckets[g]?.length)
      .map((g) => ({
        label: LANDING_LABELS[g].title,
        items: buckets[g].sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0)),
        anchor: `sg-${g}`,
      }))
  }
  const rules = SUBGROUP_RULES[groupKey] ?? []
  const buckets = new Map<string, Array<{ item: SiteItemMeta; group: string }>>()
  const orderedLabels: string[] = []
  for (const it of items) {
    let label = SUBGROUP_FALLBACK_LABEL
    for (const r of rules) {
      const ok = typeof r.prefix === 'function' ? r.prefix(it.item.key, groupKey) : r.prefix.test(it.item.key)
      if (ok) { label = r.label; break }
    }
    if (!buckets.has(label)) { buckets.set(label, []); orderedLabels.push(label) }
    buckets.get(label)!.push(it)
  }
  if (buckets.has(SUBGROUP_FALLBACK_LABEL) && orderedLabels.at(-1) !== SUBGROUP_FALLBACK_LABEL) {
    // 把 "其它" 放最后
    const idx = orderedLabels.indexOf(SUBGROUP_FALLBACK_LABEL)
    if (idx > -1) orderedLabels.splice(idx, 1), orderedLabels.push(SUBGROUP_FALLBACK_LABEL)
  }
  return orderedLabels.map((label, i) => ({
    label,
    items: buckets.get(label)!.sort((a, b) => (a.item.sort ?? 0) - (b.item.sort ?? 0)),
    anchor: `sg-${groupKey}-${i}`,
  }))
}

function groupIconFor(g: string) {
  const found = SITE_GROUPS.find(x => x.key === g)
  if (found) return found.icon
  if (g === 'landing-novel') return BookOpen
  if (g === 'landing-canvas') return Layers
  if (g === 'landing-audio') return Music4
  if (g === 'landing-community') return UsersRound
  return Settings2
}

// —— 迷你预览小工具：从 row.items + values（乐观编辑值）里按 key 读取当前值 ——
function pickVal(values: Record<string, unknown>, items: Array<{item: SiteItemMeta; group: string}>, key: string, fallback: unknown): unknown {
  // 优先：values（用户正在编辑但未保存的最新值）→ 保证预览即时
  if (values && Object.prototype.hasOwnProperty.call(values, key)) {
    const v = values[key]
    return v === undefined ? fallback : v
  }
  // 次选：从 items（由 data.groups 灌入的 SiteItemMeta 原始 defaultValue/当前 API 值）兜底
  const it = items.find(x => x.item.key === key)
  if (it && Object.prototype.hasOwnProperty.call(values, key) === false && it.item.id) {
    // items 里只有元数据，没有值；值在 values 里，因此直接返回 fallback
  }
  return fallback
}

function formatValueForDisplay(v: unknown): string {
  if (v == null) return '—'
  if (typeof v === 'boolean') return v ? '开启' : '关闭'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function diffValue(a: unknown, b: unknown): boolean {
  if (a === b) return false
  return JSON.stringify(a) !== JSON.stringify(b)
}

// ===== 工具：安全序列化 config =====
function safeStringify(c: unknown): string {
  if (c == null) return '{}'
  if (typeof c === 'string') {
    try {
      return JSON.stringify(JSON.parse(c), null, 2)
    } catch {
      return c
    }
  }
  try {
    return JSON.stringify(c, null, 2)
  } catch {
    return '{}'
  }
}

// =============== SectionCard / ControlRow / GroupCard ===============

// ======= 可视化页面区域卡片（按页面模块内每个 section 一张） =======
function SectionCard({
  row,
  values,
  originalValues,
  dirtyKeys,
  onValueChange,
  onRevertKey,
}: {
  row: SectionWithItems
  values: Record<string, unknown>
  originalValues: Record<string, unknown>
  dirtyKeys: Set<string>
  onValueChange: (group: string, key: string, v: unknown) => void
  onRevertKey: (key: string) => void
}) {
  const { moduleAccent, moduleLabel, section, items } = row
  const Icon = section.icon ?? LayoutGrid
  const accent = section.accent ?? moduleAccent
  const colorBorder: Record<string, string> = {
    blue: 'border-l-blue-500', indigo: 'border-l-indigo-500', cyan: 'border-l-cyan-500',
    fuchsia: 'border-l-fuchsia-500', emerald: 'border-l-emerald-500', violet: 'border-l-violet-500',
    rose: 'border-l-rose-500', pink: 'border-l-pink-500', slate: 'border-l-slate-500',
  }
  const colorBadge: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700', indigo: 'bg-indigo-100 text-indigo-700',
    cyan: 'bg-cyan-100 text-cyan-700', fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
    emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700',
    rose: 'bg-rose-100 text-rose-700', pink: 'bg-pink-100 text-pink-700', slate: 'bg-slate-100 text-slate-700',
  }
  const dirtyInSection = items.filter(it => dirtyKeys.has(it.item.key)).length
  const cols = section.cols ?? 2
  const gridColCls = cols === 2 ? 'md:grid-cols-2' : 'grid-cols-1'
  const hasItems = items.length > 0
  const highRisk = section.badges?.includes('highRisk')
  const sensitive = section.badges?.includes('sensitive')

  return (
    <section
      id={`sec-${row.moduleKey}-${section.key}`}
      className={`scroll-mt-24 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden border-l-4 ${colorBorder[accent] ?? ''}`}
    >
      <header className="flex items-start gap-3 bg-gradient-to-r from-neutral-50/60 to-white px-5 py-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-sm ${colorBadge[accent] ?? ''}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-bold tracking-tight text-neutral-900">{section.title}</h4>
            {highRisk && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-800 !text-[10px]">
                ⚠ 高风险 · 保存需确认
              </span>
            )}
            {sensitive && !highRisk && (
              <span className="chip border border-violet-300 bg-violet-100 text-violet-800 !text-[10px]">
                🔒 敏感配置
              </span>
            )}
            {dirtyInSection > 0 && (
              <span className="chip border border-amber-300 bg-white text-amber-700 !text-[11px] animate-pulse">
                {dirtyInSection} 项待保存
              </span>
            )}
          </div>
          {/* 可视化说明：告诉用户这是页面哪一块 UI / 控件 */}
          <p className="mt-1 text-xs text-neutral-500">{section.description}</p>
          {section.highlight && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-neutral-900/[0.04] px-2 py-1 text-[10px] font-medium text-neutral-600 ring-1 ring-black/5">
              <Box className="h-3 w-3" />
              位置：<span className="text-neutral-800">{section.highlight}</span>
            </div>
          )}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs font-medium text-neutral-500">{items.length} 项</div>
          <div className="mt-0.5 text-[10px] text-neutral-400">所属：{moduleLabel}</div>
        </div>
      </header>

      {/* —— SectionCard 内迷你即时预览 —— */}
      {section.preview && hasItems && (
        <div className="px-4 md:px-5 pt-4 pb-2">
          <SectionMiniPreview row={row} values={values} />
        </div>
      )}

      <div className={`px-4 py-4 md:px-5 ${hasItems ? 'pb-5' : ''}`}>
        {!hasItems ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-neutral-200 bg-neutral-50/60 py-10 text-neutral-400">
            <EyeOff className="h-6 w-6" />
            <p className="mt-2 text-xs">当前没有匹配到可设置的控件（该页面 UI 模块后续可再扩展）</p>
          </div>
        ) : (
          <div className={`grid gap-3 ${gridColCls}`}>
            {items.map(({ item, group }) => (
              <ControlRow
                key={item.key}
                item={item}
                group={group}
                value={values[item.key]}
                originalValue={originalValues[item.key]}
                dirty={dirtyKeys.has(item.key)}
                onChange={(v) => onValueChange(group, item.key, v)}
                onRevert={() => onRevertKey(item.key)}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

// ======= 单条控件 =======
interface ControlRowProps {
  item: SiteItemMeta
  group: string
  value: unknown
  dirty: boolean
  originalValue: unknown
  onChange: (v: unknown) => void
  onRevert: () => void
}

function ControlRow({ item, group, value, dirty, originalValue, onChange, onRevert }: ControlRowProps) {
  const cfg = item.config ?? {}
  const placeholder = cfg.placeholder as string | undefined
  const accentMap: Record<string, string> = {
    blue:    'accent-blue-600   focus:border-blue-400   focus:ring-blue-100   peer-checked:bg-blue-600',
    indigo:  'accent-indigo-600 focus:border-indigo-400 focus:ring-indigo-100 peer-checked:bg-indigo-600',
    cyan:    'accent-cyan-600   focus:border-cyan-400   focus:ring-cyan-100   peer-checked:bg-cyan-600',
    fuchsia: 'accent-fuchsia-600 focus:border-fuchsia-400 focus:ring-fuchsia-100 peer-checked:bg-fuchsia-600',
    emerald: 'accent-emerald-600 focus:border-emerald-400 focus:ring-emerald-100 peer-checked:bg-emerald-600',
    violet:  'accent-violet-600  focus:border-violet-400  focus:ring-violet-100  peer-checked:bg-violet-600',
    rose:    'accent-rose-600   focus:border-rose-400   focus:ring-rose-100   peer-checked:bg-rose-600',
  }
  const groupDef = SITE_GROUPS.find(g => g.key === group || (group.startsWith('landing-') && g.key === 'landing'))
  const accent = groupDef ? accentMap[groupDef.accent] ?? accentMap.blue : accentMap.blue
  const peerCheckedPrefix = groupDef?.accent ?? 'violet'
  const switchOnBg: Record<string, string> = {
    blue: 'bg-blue-600', indigo: 'bg-indigo-600', cyan: 'bg-cyan-600',
    fuchsia: 'bg-fuchsia-600', emerald: 'bg-emerald-600', violet: 'bg-violet-600', rose: 'bg-rose-600',
  }

  const renderControl = (): ReactNode => {
    switch (item.controlType as ControlType) {
      case 'text':
        return (
          <input
            type="text"
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`input !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
          />
        )
      case 'textarea':
        return (
          <textarea
            value={(value as string) ?? ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={(cfg.rows as number) ?? 3}
            className={`input resize-none text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
          />
        )
      case 'number': {
        const min = cfg.min as number | undefined
        const max = cfg.max as number | undefined
        const step = cfg.step as number | undefined
        return (
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={(value as number) ?? 0}
              min={min}
              max={max}
              step={step ?? 1}
              onChange={(e) => {
                const raw = e.target.value
                if (raw === '') { onChange(0); return }
                const n = Number(raw)
                if (Number.isNaN(n)) return
                onChange(n)
              }}
              className={`input !w-40 !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
            />
            {(min != null || max != null) && (
              <span className="text-xs text-neutral-400">
                范围：{min ?? '−∞'} ~ {max ?? '+∞'}{step ? ` 步长 ${step}` : ''}
              </span>
            )}
          </div>
        )
      }
      case 'slider': {
        const min = (cfg.min as number) ?? 0
        const max = (cfg.max as number) ?? 100
        const step = (cfg.step as number) ?? 1
        const unit = (cfg.unit as string) ?? ''
        const cur = (value as number) ?? min
        return (
          <div className="flex items-center gap-4">
            <input
              type="range"
              min={min}
              max={max}
              step={step}
              value={cur}
              onChange={(e) => onChange(Number(e.target.value))}
              className={`h-2 flex-1 cursor-pointer appearance-none rounded-full bg-neutral-200 ${accent.split(' ')[0]}`}
            />
            <div className="flex min-w-[130px] items-center gap-2">
              <input
                type="number"
                min={min}
                max={max}
                step={step}
                value={cur}
                onChange={(e) => onChange(Number(e.target.value))}
                className={`input !w-24 !py-1.5 text-right text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
              />
              {unit && <span className="whitespace-nowrap text-xs text-neutral-500">{unit}</span>}
            </div>
          </div>
        )
      }
      case 'color': {
        const cur = (value as string) ?? '#000000'
        return (
          <div className="flex items-center gap-3">
            <label className="relative inline-flex h-9 w-14 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-neutral-200 shadow-sm transition hover:scale-[1.02]">
              <span className="absolute inset-0" style={{ background: cur }} />
              <input
                type="color"
                value={cur}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <input
              type="text"
              value={cur}
              onChange={(e) => onChange(e.target.value)}
              className={`input !w-32 !py-2 font-mono text-sm uppercase ${accent.split(' ').slice(1, 3).join(' ')}`}
              spellCheck={false}
            />
            <span
              className="inline-flex items-center rounded-md border border-neutral-200 px-2 py-1 text-[10px] font-medium text-neutral-600"
              style={{ background: `${cur}20`, color: cur }}
            >
              预览
            </span>
          </div>
        )
      }
      case 'switch': {
        const cur = Boolean(value)
        const onBg = switchOnBg[peerCheckedPrefix] ?? 'bg-violet-600'
        return (
          <label className="inline-flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              className="peer sr-only"
              checked={cur}
              onChange={(e) => onChange(e.target.checked)}
            />
            <div className={`relative h-6 w-11 rounded-full transition ${cur ? onBg : 'bg-neutral-200'}`}>
              <div
                className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all ${cur ? 'left-6' : 'left-1'}`}
              />
            </div>
            <span className={`text-sm font-medium ${cur ? 'text-neutral-800' : 'text-neutral-500'}`}>
              {cur ? '已开启' : '已关闭'}
            </span>
          </label>
        )
      }
      case 'select': {
        const options = (cfg.options as Array<{ label: string; value: string | number | boolean }>) ?? []
        const cur = value
        return (
          <div className="flex items-center gap-3">
            <select
              value={typeof cur === 'boolean' ? String(cur) : (cur as string | number)}
              onChange={(e) => {
                const raw = e.target.value
                // 尝试匹配 option 的原始类型
                const matched = options.find(o => String(o.value) === raw)
                onChange(matched ? matched.value : raw)
              }}
              className={`input !py-2 text-sm ${accent.split(' ').slice(1, 3).join(' ')}`}
            >
              {options.map(opt => (
                <option key={String(opt.value)} value={String(opt.value)}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
      }
      default:
        return (
          <input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            className="input text-sm"
          />
        )
    }
  }

  const TheIcon = groupIconFor(group)

  return (
    <div className={`group relative rounded-xl border p-4 transition ${
      dirty
        ? 'border-amber-300 bg-amber-50/40 shadow-[0_0_0_3px_rgba(251,191,36,0.12)]'
        : 'border-neutral-200 bg-white hover:border-neutral-300 hover:shadow-sm'
    }`}>
      <div className="mb-2 flex items-start gap-3">
        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-600`}>
          <TheIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-neutral-800">{item.label}</h4>
            <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500">
              {item.key}
            </code>
            <span className="chip border border-neutral-200 bg-neutral-50 text-neutral-500 !text-[10px] !py-0 !px-1.5">
              {item.controlType}
            </span>
            {dirty && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-700 !text-[10px] !py-0 !px-1.5 animate-pulse">
                已修改
              </span>
            )}
          </div>
          {item.description && (
            <p className="mt-0.5 text-xs text-neutral-500">{item.description}</p>
          )}
        </div>
        <button
          onClick={onRevert}
          disabled={!dirty}
          title={dirty ? '恢复为原始值' : '无修改'}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-neutral-300"
        >
          <Undo2 className="h-4 w-4" />
        </button>
      </div>
      <div className="pl-11">
        {renderControl()}
        {dirty && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-amber-200 bg-white/70 px-2.5 py-1.5 text-[11px] text-amber-700">
            <span className="font-medium">变更预览：</span>
            <span className="line-through text-neutral-400">{formatValueForDisplay(originalValue)}</span>
            <ChevronRight className="h-3 w-3" />
            <span className="font-semibold">{formatValueForDisplay(value)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

// =============== 迷你预览组件 ===============

// —— 1. Navbar 品牌栏预览（320×48 品牌 Logo 区） ——
function PreviewNavbarBrand({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const siteName = String(pickVal(values, items, 'brand.site_name', 'Man TV') || 'Man TV')
  const siteSubtitle = String(pickVal(values, items, 'brand.site_subtitle', 'AI 一站式创作平台') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 shadow-sm bg-white">
      <div className="h-12 flex items-center gap-2.5 px-3 border-b border-neutral-100 bg-white">
        {/* 左侧 Logo 方块 */}
        <div
          className="h-7 w-7 shrink-0 rounded-lg shadow-inner flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}cc)` }}
        >
          {siteName.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[13px] font-bold text-neutral-900">{siteName}</div>
          {siteSubtitle && (
            <div className="truncate text-[10px] text-neutral-500">{siteSubtitle}</div>
          )}
        </div>
        {/* 右侧两枚占位菜单：登录/注册按钮 颜色呼应品牌主色 */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="h-6 w-10 rounded-md bg-neutral-100"></div>
          <div
            className="h-6 w-10 rounded-md"
            style={{ backgroundColor: primaryColor }}
          ></div>
        </div>
      </div>
      <div className="px-3 py-1.5 text-[10px] text-neutral-500 bg-neutral-50/70 flex items-center justify-between">
        <span>品牌色预览：<span className="font-mono">{primaryColor}</span></span>
        <span>{siteName.length} 字 + {siteSubtitle.length} 字</span>
      </div>
    </div>
  )
}

// —— 2. Hero 首屏核心文案与 CTA 预览（360×220 首屏缩略） ——
function PreviewHeroCore({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const title = String(pickVal(values, items, 'hero.title', '用 AI 一秒点燃创意') || '')
  const subtitle = String(pickVal(values, items, 'hero.subtitle', '小说 / 漫画 / 视频 / 音乐 一站式生成') || '')
  const primaryLabel = String(pickVal(values, items, 'hero.cta_primary_label', '立即体验') || '')
  const secondaryLabel = String(pickVal(values, items, 'hero.cta_secondary_label', '了解更多') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#2563eb') || '#2563eb')
  const heroAccent = String(pickVal(values, items, 'brand.hero_accent', '#22d3ee') || '#22d3ee')
  return (
    <div
      className="overflow-hidden rounded-xl border border-white/60 shadow-inner text-white relative"
      style={{
        background: `linear-gradient(135deg, ${heroAccent}33 0%, ${primaryColor}55 55%, ${heroAccent}55 100%)`,
      }}
    >
      <div className="relative px-5 py-7">
        <div className="text-[20px] font-extrabold tracking-tight leading-snug drop-shadow-sm" style={{ color: primaryColor }}>
          {title || <span className="opacity-50 italic">[请填写首页大标题]</span>}
        </div>
        <div className="mt-1.5 text-[12px] text-neutral-700/80 leading-relaxed">
          {subtitle || <span className="opacity-50 italic">[副标题：描述产品的一句话]</span>}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <div
            className="inline-flex items-center rounded-lg px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm"
            style={{ backgroundColor: primaryColor }}
          >
            {primaryLabel || '立即体验'}
          </div>
          <div className="inline-flex items-center rounded-lg bg-white/80 px-3 py-1.5 text-[11px] font-medium text-neutral-800 ring-1 ring-black/5">
            {secondaryLabel || '了解更多'}
          </div>
        </div>
      </div>
    </div>
  )
}

// —— 3. Hero 视觉背景（颜色渐变实际渲染色块） ——
function PreviewHeroVisual({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const c1 = String(pickVal(values, items, 'hero.bg_start_color', '#6366f1') || '#6366f1')
  const c2 = String(pickVal(values, items, 'hero.bg_mid_color', '#a855f7') || '#a855f7')
  const c3 = String(pickVal(values, items, 'hero.bg_end_color', '#ec4899') || '#ec4899')
  const angle = Number(pickVal(values, items, 'hero.bg_angle', 135) ?? 135) || 135
  return (
    <div className="space-y-2">
      <div
        className="h-36 w-full rounded-xl shadow-inner ring-1 ring-black/5"
        style={{ background: `linear-gradient(${angle}deg, ${c1}, ${c2}, ${c3})` }}
      ></div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-600">
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c1 }}></span>
          <span className="font-mono">{c1}</span>
        </div>
        <ChevronRight className="h-3 w-3 text-neutral-400" />
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c2 }}></span>
          <span className="font-mono">{c2}</span>
        </div>
        <ChevronRight className="h-3 w-3 text-neutral-400" />
        <div className="inline-flex items-center gap-1 rounded-md bg-neutral-50 px-2 py-1 ring-1 ring-neutral-200">
          <span className="h-3 w-3 rounded-md ring-1 ring-black/10" style={{ backgroundColor: c3 }}></span>
          <span className="font-mono">{c3}</span>
        </div>
        <span className="ml-auto font-mono text-neutral-500">{angle}°</span>
      </div>
    </div>
  )
}

// —— 4. Hero 推荐作品展示预览（卡片占位网格） ——
function PreviewHeroRecommend({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const count = Math.min(8, Math.max(1, Number(pickVal(values, items, 'hero.recommend_count', 4) ?? 4)))
  const sort = String(pickVal(values, items, 'hero.recommend_sort', 'hot') || 'hot')
  const sortLabelMap: Record<string, string> = {
    hot: '🔥 热门推荐', latest: '🆕 最新发布', recommend: '⭐ 编辑精选', likes: '❤️ 点赞最多',
  }
  const cols = count <= 3 ? 'grid-cols-3' : count <= 4 ? 'grid-cols-4' : count <= 6 ? 'grid-cols-3' : 'grid-cols-4'
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-neutral-600">
        <span className="font-semibold text-neutral-700">推荐作品区：{sortLabelMap[sort] ?? sort}</span>
        <span>展示 {count} 个作品</span>
      </div>
      <div className={`grid gap-2 ${cols}`}>
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="space-y-1">
            <div
              className="aspect-[4/3] w-full rounded-lg ring-1 ring-black/5"
              style={{
                background: `linear-gradient(135deg, hsl(${i * 47 % 360} 70% 70%), hsl(${(i * 47 + 90) % 360} 70% 80%))`,
              }}
            ></div>
            <div className="h-2 w-4/5 rounded bg-neutral-200"></div>
            <div className="h-1.5 w-3/5 rounded bg-neutral-100"></div>
          </div>
        ))}
      </div>
    </div>
  )
}

// —— 5. 颜色系统预览（主色 + 强调色 各 4 档 swatches：50/100/200/主色） ——
function PreviewColorSystem({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const primary = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  const accent = String(pickVal(values, items, 'brand.hero_accent', '#22d3ee') || '#22d3ee')
  const pAcc = makeAccent(primary, { main: primary, light: primary, bg50: '#f5f3ff', bg100: '#ede9fe', bg200: '#ddd6fe' })
  const aAcc = makeAccent(accent,  { main: accent,  light: accent,  bg50: '#ecfeff', bg100: '#cffafe', bg200: '#a5f3fc' })
  const renderSwatch = (name: string, acc: typeof pAcc) => (
    <div className="min-w-0 flex-1 space-y-1.5">
      <div className="flex items-center gap-2">
        <div
          className="h-8 w-8 shrink-0 rounded-lg ring-1 ring-black/10 shadow-sm"
          style={{ backgroundColor: acc.main }}
          title={`主色 ${acc.main}`}
        ></div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-neutral-800">{name}</div>
          <div className="truncate font-mono text-[10px] text-neutral-500">{acc.main}</div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1 h-6 overflow-hidden rounded-md ring-1 ring-black/5">
        <div style={{ backgroundColor: acc.bg50 }} title="bg50"></div>
        <div style={{ backgroundColor: acc.bg100 }} title="bg100"></div>
        <div style={{ backgroundColor: acc.bg200 }} title="bg200"></div>
      </div>
      <div className="flex items-center justify-between px-1 text-[9px] text-neutral-500">
        <span>bg50</span><span>bg100</span><span>bg200</span>
      </div>
    </div>
  )
  return (
    <div className="flex gap-4">
      {renderSwatch('品牌主色（按钮/Tab/强调）', pAcc)}
      {renderSwatch('Hero 强调色（渐变/亮色装饰）', aAcc)}
    </div>
  )
}

// —— 6. Footer 页脚预览（版权 + 备案文案） ——
function PreviewFooter({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const copy = String(pickVal(values, items, 'brand.footer_copy', '© 2026 Man TV · 生成式人工智能服务已备案') || '')
  const beian = String(pickVal(values, items, 'brand.footer_beian', '') || '')
  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-neutral-900 text-neutral-200">
      <div className="px-4 py-4 text-center space-y-1">
        <div className="text-[11px]">{copy || <span className="opacity-50 italic">[版权文案]</span>}</div>
        {beian && (
          <div className="text-[10px] text-neutral-400 underline underline-offset-2 decoration-dotted">{beian}</div>
        )}
      </div>
      <div className="bg-black/30 px-3 py-1 text-[10px] text-neutral-400 flex items-center justify-between">
        <span className="inline-flex items-center gap-1"><Copyright className="h-3 w-3" /> Footer 区域</span>
        <span>{copy.length} 字</span>
      </div>
    </div>
  )
}

// —— 7. 4 大板块 Landing Hero 预览（Novel/Canvas/Audio/Community 共用同一模板） ——
function PreviewLandingHero({ values, items, moduleLabel, accent }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}>; moduleLabel: string; accent: string }) {
  const title = String(
    pickVal(values, items, 'title', null) ??
    pickVal(values, items, 'landing_title', null) ??
    pickVal(values, items, `${items[0]?.group}.title`, null) ??
    `${moduleLabel} 创意引擎`
  )
  const subtitle = String(
    pickVal(values, items, 'subtitle', null) ??
    pickVal(values, items, 'landing_subtitle', null) ??
    pickVal(values, items, `${items[0]?.group}.subtitle`, null) ??
    '零门槛创作、一键生成。'
  )
  const color = String(
    pickVal(values, items, 'primary_color', null) ??
    pickVal(values, items, 'accent_color', null) ??
    (accent === 'indigo' ? '#6366f1' : accent === 'cyan' ? '#06b6d4' : accent === 'pink' ? '#ec4899' : '#10b981')
  )
  return (
    <div
      className="overflow-hidden rounded-xl ring-1 ring-black/5 text-white"
      style={{ background: `linear-gradient(135deg, ${color}ee 0%, ${color}88 70%, ${color}33 100%)` }}
    >
      <div className="px-5 py-6">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[10px] font-medium backdrop-blur ring-1 ring-white/20">
          <Sparkles className="h-3 w-3" /> {moduleLabel} 独立页面（Landing）
        </div>
        <div className="mt-2.5 text-[19px] font-extrabold leading-snug drop-shadow-sm">
          {title}
        </div>
        <div className="mt-1 text-[12px] text-white/85 leading-relaxed max-w-[90%]">{subtitle}</div>
      </div>
    </div>
  )
}

// —— 8. 登录页欢迎文案预览（/login 首屏） ——
function PreviewLoginHero({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const title = String(pickVal(values, items, 'login.welcome_title', '欢迎回到 Man TV') || '')
  const subtitle = String(pickVal(values, items, 'login.welcome_subtitle', '登录后立即开始创作你的 AI 漫剧之旅') || '')
  const primaryColor = String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed')
  return (
    <div className="rounded-xl border border-neutral-200 bg-white shadow-sm overflow-hidden grid md:grid-cols-2 gap-0">
      {/* 左：品牌欢迎视觉 */}
      <div
        className="p-5 text-white hidden md:block"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${primaryColor}bb)` }}
      >
        <div className="text-[11px] opacity-90">/login 首屏左侧</div>
        <div className="mt-2 text-[17px] font-bold leading-snug drop-shadow-sm">{title}</div>
        <div className="mt-1.5 text-[11px] opacity-90 leading-relaxed">{subtitle}</div>
      </div>
      {/* 右：登录表单占位 */}
      <div className="p-4 space-y-2.5">
        <div className="md:hidden text-[14px] font-bold text-neutral-900">{title}</div>
        <div className="md:hidden text-[11px] text-neutral-500">{subtitle}</div>
        <div className="h-2 w-full rounded bg-neutral-100"></div>
        <div className="h-8 w-full rounded-md bg-neutral-50 ring-1 ring-neutral-200"></div>
        <div className="h-2 w-full rounded bg-neutral-100"></div>
        <div className="h-8 w-full rounded-md bg-neutral-50 ring-1 ring-neutral-200"></div>
        <div
          className="h-8 w-full rounded-md mt-1 text-[11px] font-semibold text-white flex items-center justify-center shadow-sm"
          style={{ backgroundColor: primaryColor }}
        >登 录</div>
      </div>
    </div>
  )
}

// —— 9. 新用户注册权益（注册成功自动发放：积分 slider 值大数字预览） ——
function PreviewLoginBonus({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const tokens = Number(pickVal(values, items, 'login.new_user_tokens', 5000) ?? 5000)
  const expire = String(pickVal(values, items, 'login.new_user_token_expire', '注册后 30 天内有效') || '')
  return (
    <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50 overflow-hidden shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="h-11 w-11 shrink-0 rounded-xl bg-amber-400 text-white flex items-center justify-center shadow-sm">
          <Gift className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-amber-800 font-semibold">新用户注册成功礼包</div>
          <div className="text-[24px] font-extrabold text-amber-700 tracking-tight leading-none mt-0.5">
            +{tokens.toLocaleString()} <span className="text-[12px] font-semibold text-amber-700/80 ml-0.5">积分</span>
          </div>
          {expire && <div className="mt-1 text-[10px] text-amber-700/80">{expire}</div>}
        </div>
        <div className="hidden sm:block shrink-0 text-right">
          <div className="rounded-lg bg-white/80 ring-1 ring-amber-200 px-2.5 py-1 text-[10px] font-mono text-amber-800">
            /register → 自动发
          </div>
        </div>
      </div>
    </div>
  )
}

// —— 11. 套餐权益与价格（Pro/企业版 两卡并排数字/积分实时预览） ——
function PreviewPricingPlans({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const proPrice = Number(pickVal(values, items, 'pricing.pro_price_monthly', 39) ?? 39)
  const proTokens = Number(pickVal(values, items, 'pricing.pro_monthly_tokens', 50000) ?? 50000)
  const bizPrice = Number(pickVal(values, items, 'pricing.business_price_monthly', 199) ?? 199)
  const bizTokens = Number(pickVal(values, items, 'pricing.business_monthly_tokens', 500000) ?? 500000)
  const showFree = Boolean(pickVal(values, items, 'pricing.show_free', true))
  const showPro = Boolean(pickVal(values, items, 'pricing.show_pro', true))
  const showBiz = Boolean(pickVal(values, items, 'pricing.show_business', true))
  const cards = [
    { visible: showFree, name: '免费版', price: '¥0', tokens: 500, color: '#64748b', main: false },
    { visible: showPro, name: 'Pro', price: `¥${proPrice}/月`, tokens: proTokens, color: '#6366f1', main: true },
    { visible: showBiz, name: '企业版', price: `¥${bizPrice}/月`, tokens: bizTokens, color: '#0f172a', main: false },
  ].filter(c => c.visible)
  const gridCls = cards.length === 1 ? 'grid-cols-1' : cards.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <div className={`grid gap-2 ${gridCls}`}>
      {cards.map((c, i) => (
        <div
          key={i}
          className={`relative rounded-lg border overflow-hidden ${c.main ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-neutral-200'}`}
        >
          <div className="h-1.5 w-full" style={{ backgroundColor: c.color }}></div>
          <div className="px-3 py-3">
            <div className="flex items-center justify-between">
              <div className="text-[11px] font-semibold text-neutral-800">{c.name}</div>
              {c.main && <span className="rounded bg-indigo-100 text-indigo-700 px-1.5 py-0.5 text-[9px] font-semibold">推荐</span>}
            </div>
            <div className="mt-1.5 text-[18px] font-extrabold tracking-tight" style={{ color: c.color }}>
              {c.price}
            </div>
            <div className="mt-1 text-[10px] text-neutral-500">每月赠送积分</div>
            <div className="mt-0.5 text-[12px] font-bold text-neutral-800">
              {Number(c.tokens).toLocaleString()}
            </div>
            <div className="mt-2.5 h-7 w-full rounded-md ring-1 text-[10px] font-semibold flex items-center justify-center"
              style={ c.main ? { backgroundColor: '#6366f1', color: '#fff' } : { borderColor: '#e2e8f0', color: '#0f172a', borderWidth: '1px' }}
            >
              {c.main ? '立即升级' : '选择方案'}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// —— 12. 全站公告横幅预览（Navbar 下方：颜色/开关/标题/链接） ——
function PreviewAnnouncement({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  const enabled = Boolean(pickVal(values, items, 'safety.announcement_enabled', true))
  const text = String(pickVal(values, items, 'safety.announcement', '🎉 最新：品牌升级 2.0，欢迎体验全新创作画布') || '')
  const link = String(pickVal(values, items, 'safety.announcement_link', '') || '')
  const bg = String(pickVal(values, items, 'safety.announcement_bg_color', '#fff7ed') || '#fff7ed')
  const fg = String(pickVal(values, items, 'safety.announcement_text_color', '#9a3412') || '#9a3412')
  if (!enabled) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 py-5 text-center text-neutral-400">
        <EyeOff className="h-5 w-5 inline-block align-text-bottom" />
        <div className="mt-1 text-[11px]">公告横幅已关闭（所有页面顶部不显示）</div>
      </div>
    )
  }
  return (
    <div className="rounded-xl overflow-hidden ring-1 ring-black/5">
      {/* 伪 Navbar */}
      <div className="h-7 bg-white border-b border-neutral-100 flex items-center px-2 gap-1">
        <div className="h-4 w-4 rounded" style={{ backgroundColor: String(pickVal(values, items, 'brand.primary_color', '#7c3aed') || '#7c3aed') }}></div>
        <div className="h-1.5 w-16 rounded bg-neutral-200"></div>
      </div>
      {/* 公告横幅本体 */}
      <div className="px-3 py-2 flex items-center gap-2 text-[11px] leading-tight"
        style={{ backgroundColor: bg, color: fg }}
      >
        <Bell className="h-3.5 w-3.5 shrink-0" />
        <div className="min-w-0 flex-1 truncate font-medium">
          {text || <span className="opacity-60 italic">[请填写公告内容]</span>}
        </div>
        {link && (
          <a className="shrink-0 underline underline-offset-2 decoration-dotted opacity-90" href="#">查看 →</a>
        )}
      </div>
      <div className="px-2 py-1 bg-white/70 border-t border-black/5 text-[10px] text-neutral-500 flex items-center justify-between">
        <span className="font-mono">bg: {bg}</span>
        <span className="font-mono">fg: {fg}</span>
      </div>
    </div>
  )
}

// —— 13. 限流阈值预览（按接口类型的"每日/每分"仪表盘小胶囊） ——
function PreviewRateLimit({ values, items }: { values: Record<string, unknown>; items: Array<{item: SiteItemMeta; group: string}> }) {
  // 宽松匹配 item 名中带 text/image/audio/video 的每日/每分限流；对不认识的 key 归到其它
  const categories: Array<{label: string; icon: IconComponent; pattern: RegExp; color: string}> = [
    { label: '文本 / 小说', icon: FileText, pattern: /(text|novel|word|chat)/i, color: '#6366f1' },
    { label: '图像 / 绘画', icon: Image, pattern: /(image|pic|paint|draw|diffus)/i, color: '#0ea5e9' },
    { label: '音频 / 配音', icon: Music, pattern: /(audio|voice|music|tts|song)/i, color: '#ec4899' },
    { label: '视频 / 漫剧', icon: Video, pattern: /(video|manga|anime|motion)/i, color: '#8b5cf6' },
  ]
  const results = categories.map(cat => {
    let daily = 0
    let minute = 0
    let found = 0
    for (const { item } of items) {
      if (!cat.pattern.test(item.key)) continue
      found++
      // 识别日限流 vs 分限流
      const v = Number(values[item.key] ?? 0) || 0
      if (/(daily|day|per_day|perday|_d_|d_limit|24h|daily_limit)/i.test(item.key)) {
        daily = Math.max(daily, v)
      } else if (/(minute|min|per_min|permin|_m_|m_limit|60s|minute_limit)/i.test(item.key)) {
        minute = Math.max(minute, v)
      } else if (/rate_limit|limit$/i.test(item.key)) {
        // 兜底按数字大小分：>= 1000 认为日，否则认为分
        if (v >= 1000) daily = Math.max(daily, v)
        else minute = Math.max(minute, v)
      }
    }
    return { ...cat, daily, minute, found }
  })
  const gridCls = results.length === 1 ? 'grid-cols-1' : results.length === 2 ? 'grid-cols-2' : results.length === 3 ? 'grid-cols-2 md:grid-cols-4' : 'grid-cols-2 md:grid-cols-4'
  return (
    <div className={`grid gap-2 ${gridCls}`}>
      {results.map((r, i) => {
        const Icon = r.icon
        return (
          <div key={i} className="rounded-xl border border-neutral-200 bg-white overflow-hidden shadow-sm">
            <div className="px-3 py-2 flex items-center gap-2"
              style={{ background: `linear-gradient(90deg, ${r.color}18, transparent)` }}
            >
              <div className="h-7 w-7 rounded-md flex items-center justify-center text-white"
                style={{ backgroundColor: r.color }}
              >
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold text-neutral-800 truncate">{r.label}</div>
                <div className="text-[9px] text-neutral-500">匹配：{r.found} 项</div>
              </div>
            </div>
            <div className="px-3 pb-2 grid grid-cols-2 gap-1.5 text-center">
              <div className="rounded-md bg-neutral-50 px-1.5 py-1.5 ring-1 ring-neutral-200">
                <div className="text-[9px] text-neutral-500">日 / 用户</div>
                <div className="text-[13px] font-extrabold text-neutral-800 leading-none mt-0.5">
                  {r.daily > 0 ? r.daily.toLocaleString() : '—'}
                </div>
              </div>
              <div className="rounded-md bg-neutral-50 px-1.5 py-1.5 ring-1 ring-neutral-200">
                <div className="text-[9px] text-neutral-500">分 / 用户</div>
                <div className="text-[13px] font-extrabold text-neutral-800 leading-none mt-0.5">
                  {r.minute > 0 ? r.minute.toLocaleString() : '—'}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// —— 预览画布 wrapper（SectionCard 内部统一的 bg/边框/说明）——
function PreviewCanvas({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="inline-flex items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-[10px] font-semibold text-neutral-600 shadow-sm">
        <Eye className="h-3 w-3" /> 迷你即时预览 · {title}
      </div>
      <div className="rounded-xl border border-neutral-200/70 bg-gradient-to-b from-white to-neutral-50/50 p-3 ring-1 ring-black/[0.02]">
        {children}
      </div>
    </div>
  )
}

// —— SectionCard 预览分派：按 section.preview 渲染对应组件 ——
function SectionMiniPreview({ row, values }: { row: SectionWithItems; values: Record<string, unknown> }) {
  const { section, moduleAccent, moduleLabel } = row
  const items = row.items
  switch (section.preview) {
    case 'navbar-brand': return <PreviewCanvas title="Navbar 左侧 Logo 区"><PreviewNavbarBrand values={values} items={items} /></PreviewCanvas>
    case 'hero-core': return <PreviewCanvas title="首页首屏 Hero"><PreviewHeroCore values={values} items={items} /></PreviewCanvas>
    case 'hero-visual': return <PreviewCanvas title="Hero 背景渐变"><PreviewHeroVisual values={values} items={items} /></PreviewCanvas>
    case 'hero-recommend': return <PreviewCanvas title="推荐作品展示"><PreviewHeroRecommend values={values} items={items} /></PreviewCanvas>
    case 'color-system': return <PreviewCanvas title="品牌色 4 档 Swatch"><PreviewColorSystem values={values} items={items} /></PreviewCanvas>
    case 'footer': return <PreviewCanvas title="页脚版权区"><PreviewFooter values={values} items={items} /></PreviewCanvas>
    case 'landing-hero': return <PreviewCanvas title={`${moduleLabel} 首屏 Hero`}><PreviewLandingHero values={values} items={items} moduleLabel={moduleLabel} accent={section.accent ?? moduleAccent} /></PreviewCanvas>
    case 'login-hero': return <PreviewCanvas title="/login 欢迎区"><PreviewLoginHero values={values} items={items} /></PreviewCanvas>
    case 'login-bonus': return <PreviewCanvas title="注册成功自动发放"><PreviewLoginBonus values={values} items={items} /></PreviewCanvas>
    case 'pricing-plans': return <PreviewCanvas title="/pricing 套餐卡片数值"><PreviewPricingPlans values={values} items={items} /></PreviewCanvas>
    case 'announcement': return <PreviewCanvas title="全站顶部公告横幅"><PreviewAnnouncement values={values} items={items} /></PreviewCanvas>
    case 'ratelimit': return <PreviewCanvas title="单用户调用上限（仪表盘）"><PreviewRateLimit values={values} items={items} /></PreviewCanvas>
    default: return null
  }
}

// ======= 分组卡片 =======
interface GroupCardProps {
  def: SiteGroupDef
  items: Array<{ item: SiteItemMeta; group: string }>
  values: Record<string, unknown>
  originalValues: Record<string, unknown>
  dirtyKeys: Set<string>
  onValueChange: (group: string, key: string, v: unknown) => void
  onRevertKey: (key: string) => void
}

function GroupCard({ def, items, values, originalValues, dirtyKeys, onValueChange, onRevertKey }: GroupCardProps) {
  const TheIcon = def.icon
  const colorBorder: Record<string, string> = {
    blue: 'border-l-blue-500', indigo: 'border-l-indigo-500', cyan: 'border-l-cyan-500',
    fuchsia: 'border-l-fuchsia-500', emerald: 'border-l-emerald-500', violet: 'border-l-violet-500',
    rose: 'border-l-rose-500', pink: 'border-l-pink-500',
  }
  const colorBadge: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-700', indigo: 'bg-indigo-100 text-indigo-700',
    cyan: 'bg-cyan-100 text-cyan-700', fuchsia: 'bg-fuchsia-100 text-fuchsia-700',
    emerald: 'bg-emerald-100 text-emerald-700', violet: 'bg-violet-100 text-violet-700',
    rose: 'bg-rose-100 text-rose-700', pink: 'bg-pink-100 text-pink-700',
  }
  const dirtyInGroup = items.filter(it => dirtyKeys.has(it.item.key)).length
  const subgroups = useMemo(() => splitToSubgroups(items, def.key), [items, def.key])

  return (
    <section
      id={`group-${def.key}`}
      className={`scroll-mt-24 rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden border-l-4 ${colorBorder[def.accent] ?? ''}`}
    >
      <header className="flex items-start gap-3 bg-gradient-to-r from-neutral-50/60 to-white px-5 py-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm ${colorBadge[def.accent] ?? ''}`}>
          <TheIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold tracking-tight text-neutral-900">{def.label}</h3>
            {def.highRisk && (
              <span className="chip border border-amber-300 bg-amber-100 text-amber-800 !text-[10px]">
                ⚠ 高风险 · 保存需确认
              </span>
            )}
            {def.sensitive && !def.highRisk && (
              <span className="chip border border-violet-300 bg-violet-100 text-violet-800 !text-[10px]">
                🔒 敏感配置
              </span>
            )}
            {dirtyInGroup > 0 && (
              <span className="chip border border-amber-300 bg-white text-amber-700 !text-[11px] animate-pulse">
                {dirtyInGroup} 项待保存
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">影响范围：{def.radius}</p>
        </div>
        <div className="text-right">
          <div className="text-xs font-medium text-neutral-500">{items.length} 项配置</div>
          <div className="mt-0.5 text-[10px] text-neutral-400">控制类型：7 种</div>
        </div>
      </header>

      {/* ========== 子分组（Subgroup）打段 ========== */}
      <div className="px-4 py-4 space-y-5 md:px-5">
        {subgroups.map((sg) => {
          const landingInfo = def.key === 'landing'
            ? Object.entries(LANDING_LABELS).find(([k]) => sg.anchor === `sg-${k}`)?.[1]
            : undefined
          return (
            <div
              key={sg.anchor}
              id={sg.anchor}
              className="scroll-mt-28 rounded-xl border border-neutral-200/60 bg-neutral-50/30 p-3 md:p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <div
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                  style={{
                    borderColor: landingInfo
                      ? colorBorder[landingInfo.accent]?.replace('border-l-', '') ?? '#e5e7eb'
                      : `var(--${def.accent}-200, #e5e7eb)`,
                    background: landingInfo
                      ? `linear-gradient(90deg, var(--${landingInfo.accent}-50, #f5f3ff), transparent)`
                      : `linear-gradient(90deg, var(--${def.accent}-50, #f5f3ff), transparent)`,
                  }}
                >
                  {landingInfo ? <landingInfo.icon className="h-3.5 w-3.5" /> : null}
                  <span>{sg.label}</span>
                </div>
                <span className="text-[10px] text-neutral-400">
                  {sg.items.length} 项 · 锚点 #{sg.anchor}
                </span>
                {sg.items.some(({ item }) => dirtyKeys.has(item.key)) && (
                  <span className="chip border border-amber-300 bg-amber-100/60 text-amber-700 !text-[10px]">
                    本段有修改
                  </span>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {sg.items.map(({ item, group }) => (
                  <ControlRow
                    key={item.key}
                    item={item}
                    group={group}
                    value={values[item.key]}
                    originalValue={originalValues[item.key]}
                    dirty={dirtyKeys.has(item.key)}
                    onChange={(v) => onValueChange(group, item.key, v)}
                    onRevert={() => onRevertKey(item.key)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ======= 审计回滚抽屉 =======
interface AuditItem {
  id: string
  group: string
  key: string
  oldValue: string | null
  newValue: string | null
  operator: string | null
  operatorName: string | null
  createdAt: string
  reason?: string | null
}

function AuditDrawer({
  open,
  onClose,
  onRollback,
}: {
  open: boolean
  onClose: () => void
  onRollback: (auditId: string) => Promise<boolean>
}) {
  const [list, setList] = useState<AuditItem[]>([])
  const [loading, setLoading] = useState(false)
  const [rollingId, setRollingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await getSiteAudit(200)
      setList(rows as AuditItem[])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) load()
  }, [open, load])

  const tryRollback = async (a: AuditItem) => {
    if (!window.confirm(`确认回滚到该版本？\n\n变更项：${a.group}.${a.key}\n恢复为：${a.oldValue ?? '(空值)'}`)) return
    setRollingId(a.id)
    try {
      const ok = await onRollback(a.id)
      if (ok) {
        setRollingId(null)
        await load()
      }
    } finally {
      setRollingId(null)
    }
  }

  const parseVal = (s: string | null): unknown => {
    if (s == null) return null
    try { return JSON.parse(s) } catch { return s }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[500]">
      <div className="absolute inset-0 bg-neutral-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col bg-white shadow-2xl animate-[slideInRight_0.25s_ease-out]">
        <header className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
              <History className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-900">变更历史（快照回滚）</h3>
              <p className="text-xs text-neutral-500">共 {list.length} 条 · 最近 200 条</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-2.5 text-xs text-neutral-500">
          <Clock className="h-3.5 w-3.5" />
          点击任意一条「回滚到此版本」可一键恢复，操作本身也会留痕。
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-neutral-100"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            刷新
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
          {loading && list.length === 0 ? (
            <div className="flex items-center justify-center py-20 text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-neutral-400">
              <Settings2 className="h-8 w-8" />
              <p className="mt-3 text-sm">暂无变更记录</p>
            </div>
          ) : (
            list.map(a => {
              const oldV = parseVal(a.oldValue)
              const newV = parseVal(a.newValue)
              return (
                <div key={a.id} className="rounded-xl border border-neutral-200 bg-neutral-50/50 p-3 hover:border-neutral-300 hover:bg-white transition">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                      {a.operatorName ? a.operatorName[0].toUpperCase() : '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-xs font-semibold text-neutral-800">{a.operatorName ?? '系统'}</span>
                        <span className="text-[10px] text-neutral-400">
                          {new Date(a.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <code className="truncate rounded bg-white px-1.5 py-0.5 font-mono text-[11px] text-neutral-700 ring-1 ring-neutral-200">
                          {a.group}.{a.key}
                        </code>
                      </div>
                      <div className="mt-2 space-y-1 rounded-lg bg-white px-2.5 py-2 ring-1 ring-neutral-200/70 text-[11px]">
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-rose-700">旧值</span>
                          <span className="break-all font-mono text-neutral-600">{formatValueForDisplay(oldV)}</span>
                        </div>
                        <div className="flex items-start gap-2">
                          <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700">新值</span>
                          <span className="break-all font-mono text-neutral-800">{formatValueForDisplay(newV)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button
                      onClick={() => tryRollback(a)}
                      disabled={rollingId === a.id}
                      className="inline-flex items-center gap-1 rounded-md border border-violet-200 bg-white px-2.5 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50 disabled:opacity-50"
                    >
                      {rollingId === a.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      回滚到此版本
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>
    </div>
  )
}

// ======= 主 FeaturesTab =======
export function FeaturesTab({
  role,
  onError,
  activeGroup,
  onChangeActiveGroup,
}: {
  role?: Role
  onError: (e: string) => void
  activeGroup: string
  onChangeActiveGroup: (g: string) => void
}) {
  const { data, reload } = useSiteConfig()

  // 本地编辑值（乐观更新层） & 原始值（用于恢复 & 判断 dirty）
  const [values, setValues] = useState<Record<string, unknown>>({})
  const [originalValues, setOriginalValues] = useState<Record<string, unknown>>({})
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(new Set())

  // 注册 dirtyKeys 的 ref 给左侧主导航栏的 FeaturesSideNav 显示 dirty badge
  const dirtyKeysRef = useRef<Set<string>>(dirtyKeys)
  dirtyKeysRef.current = dirtyKeys
  useEffect(() => { registerFeaturesDirtyKeysRef(dirtyKeysRef) }, [])

  // 审计抽屉
  const [auditOpen, setAuditOpen] = useState(false)

  // 保存状态
  const [saving, setSaving] = useState(false)
  const [saveToast, setSaveToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null)

  // ===== 初始化：从 Provider 拉的 config 同步到本地编辑层 =====
  useEffect(() => {
    if (data && Object.keys(data.config).length > 0) {
      setValues(prev => {
        // 保留已脏的编辑值，其余同步最新 config
        const next = { ...data.config }
        for (const k of dirtyKeys) if (prev[k] !== undefined) next[k] = prev[k]
        return next
      })
      setOriginalValues({ ...data.config })
    }
  }, [data.config]) // eslint-disable-line react-hooks/exhaustive-deps

  // ===== 按 PAGE_MODULES 为新分组（页面/功能区域）：把扁平 items 灌入到每个 section =====
  const sectionItems = useMemo(() => collectSectionItems(data.groups), [data.groups])

  // 所有项的 group 扁平化映射（保存时反查 group）：从 sectionItems 反向构造
  const groupOfKey = useMemo(() => {
    const m: Record<string, string> = {}
    for (const row of sectionItems.values()) {
      for (const { item, group } of row.items) {
        // section 允许多来源（如 brand/site_name 同时出现在 home/首页 多个 section），group 一律取种子的真实 group（正确）
        if (m[item.key] === undefined) m[item.key] = group
      }
    }
    return m
  }, [sectionItems])

  // ===== 编辑操作 =====
  const onValueChange = useCallback((group: string, key: string, v: unknown) => {
    setValues(prev => ({ ...prev, [key]: v }))
    setDirtyKeys(prev => {
      const orig = originalValues[key]
      const next = new Set(prev)
      if (diffValue(orig, v)) next.add(key)
      else next.delete(key)
      return next
    })
  }, [originalValues])

  const onRevertKey = useCallback((key: string) => {
    setValues(prev => ({ ...prev, [key]: originalValues[key] }))
    setDirtyKeys(prev => {
      const next = new Set(prev)
      next.delete(key)
      return next
    })
  }, [originalValues])

  const revertAll = useCallback(() => {
    if (dirtyKeys.size === 0) return
    if (!window.confirm(`撤销所有未保存修改（共 ${dirtyKeys.size} 项）？`)) return
    setValues({ ...originalValues })
    setDirtyKeys(new Set())
  }, [dirtyKeys.size, originalValues])

  // ===== 保存 =====
  const saveAll = useCallback(async () => {
    if (dirtyKeys.size === 0) return
    // 收集变更 batch
    const batch = Array.from(dirtyKeys).map(k => ({
      group: groupOfKey[k],
      key: k,
      value: values[k],
    })).filter(b => b.group)

    // 高风险二次确认
    const highRiskKeys = batch.filter(b => {
      const d = SITE_GROUPS.find(g => g.key === b.group || (b.group.startsWith('landing-') && g.key === 'landing'))
      return d?.highRisk
    })
    if (highRiskKeys.length > 0) {
      const summary = highRiskKeys.map(b => `· ${b.key} → ${formatValueForDisplay(b.value)}`).join('\n')
      if (!window.confirm(
        `你正在修改「高风险配置」\n` +
        `受影响项：${highRiskKeys.length} 项\n\n${summary}\n\n` +
        `修改后将立即对所有用户生效，确定继续？`
      )) return
    }

    setSaving(true)
    try {
      const res = await putSiteBatch(batch)
      if (res.ok) {
        // 成功：重新拉取 & 清除 dirty & 清除草稿（保存前草稿预览不再生效）
        await reload()
        setDirtyKeys(new Set())
        try { clearSiteDraft() } catch { /* ignore */ }
        setSaveToast({ type: 'ok', msg: `已保存 ${res.updated} 项配置，全站立即生效 🎉` })
        setTimeout(() => setSaveToast(null), 3500)
      }
    } catch (e) {
      onError((e as Error).message)
      setSaveToast({ type: 'err', msg: '保存失败：' + (e as Error).message })
      setTimeout(() => setSaveToast(null), 4000)
    } finally {
      setSaving(false)
    }
  }, [dirtyKeys, groupOfKey, values, reload, onError])

  // ===== 回滚 =====
  const doRollback = useCallback(async (auditId: string): Promise<boolean> => {
    try {
      const res = await rollbackSiteAudit(auditId)
      if (res.ok) {
        await reload()
        setDirtyKeys(new Set())
        setSaveToast({ type: 'ok', msg: '回滚成功，已同步最新配置' })
        setTimeout(() => setSaveToast(null), 3500)
        return true
      }
      return false
    } catch (e) {
      onError((e as Error).message)
      return false
    }
  }, [reload, onError])

  // ===== 按 activeGroup 筛选可见的页面模块 =====
  // activeGroup 可能是顶级 key（如 'novel'），也可能是子模块 key（如 'canvas.image'、'announcement'）
  const visibleModules: PageModuleDef[] = useMemo(() => {
    // announcement → 只渲染 system 模块里的 announcement section
    if (activeGroup === 'announcement') {
      return PAGE_MODULES
        .filter(m => m.key === 'system')
        .map(m => ({ ...m, sections: m.sections.filter(s => s.key === 'sys-announcement') }))
    }
    const topKey = activeGroup.includes('.') ? activeGroup.split('.')[0] : activeGroup
    return PAGE_MODULES.filter(m => m.key === topKey)
  }, [activeGroup])

  // 切换 activeGroup 时重置页面滚动位置
  // 根因：不同 group 内容高度差异大（works 很矮，system 很高），
  // 浏览器会把旧 scrollY clamp 到新 group 的 maxScroll，视觉上就是"页面跳了"
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [activeGroup])

  // 总配置项数量 & 待保存（按 sectionItems 聚合，与左栏子导航显示一致）
  const totalItems = useMemo(() => {
    let n = 0
    for (const row of sectionItems.values()) n += row.items.length
    return n
  }, [sectionItems])
  const dirtyCount = dirtyKeys.size

  // ===== 初始加载中状态 =====
  const noData = Object.keys(data.config).length === 0

  return (
    <div className="space-y-5 pb-28">
      {/* —— 「社区管理」特殊分支：直接渲染 CommunityManageTab —— */}
      {activeGroup === 'works' ? (
        <CommunityManageTab role={role} onError={onError} />
      ) : activeGroup === 'moderation' ? (
        <ModerationPanel />
      ) : (
      <>
      {/* —— 顶栏：保存相关工具 + 概要 —— */}
      <div className="rounded-2xl border border-neutral-200 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* 概要条 */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-neutral-600">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-neutral-500" />
              共 <b className="text-neutral-800">{totalItems}</b> 项配置
            </span>
            <span className="h-3 w-px bg-neutral-200" />
            <span className="inline-flex items-center gap-1.5">
              <Check className={`h-3.5 w-3.5 ${dirtyCount === 0 ? 'text-emerald-500' : 'text-neutral-400'}`} />
              待保存修改：
              <b className={dirtyCount > 0 ? 'text-amber-700' : 'text-neutral-500'}>{dirtyCount} 项</b>
            </span>
            <span className="h-3 w-px bg-neutral-200" />
            <span className="inline-flex items-center gap-1.5 text-neutral-500">
              <Clock className="h-3.5 w-3.5" />
              配置版本：{data.version ? new Date(data.version).toLocaleString('zh-CN', { hour12: false }) : '—'}
            </span>
          </div>
          {/* 保存/同步/审计 工具按钮 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => revertAll()}
              disabled={dirtyCount === 0}
              className="btn-outline !px-3 !py-1.5 text-sm disabled:opacity-50"
            >
              <Undo2 className="h-4 w-4" />
              撤销修改
            </button>
            <button
              onClick={() => saveAll()}
              disabled={dirtyCount === 0 || saving}
              className="btn-primary !px-3 !py-1.5 text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? '保存中…' : '保存修改'}
            </button>
            <button
              onClick={() => setAuditOpen(true)}
              className="btn-outline !px-3 !py-1.5 text-sm"
            >
              <History className="h-4 w-4" />
              变更历史
            </button>
            <button
              onClick={() => reload()}
              className="btn-outline !px-3 !py-1.5 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              同步最新
            </button>
          </div>
        </div>
      </div>

      {/* —— 加载状态 —— */}
      {noData ? (
        <div className="flex flex-col items-center justify-center py-24 text-neutral-400">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="mt-3 text-sm">正在加载站点配置…</p>
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          {/* —— 主区：直接平铺当前页面模块的 SectionCards —— */}
          {visibleModules.map((m) => {
            const rows: SectionWithItems[] = []
            for (const sec of m.sections) {
              const row = sectionItems.get(`${m.key}::${sec.key}`)
              if (row) rows.push(row)
            }
            // 对 novel/canvas/audio 这类只有模型管理、没有配置项的板块，跳过空占位
            if (rows.length === 0) return null
            return (
              <div key={m.key} className="space-y-4" id={`mod-${m.key}`}>
                {rows.map((row) => (
                  <SectionCard
                    key={`${row.moduleKey}::${row.section.key}`}
                    row={row}
                    values={values}
                    originalValues={originalValues}
                    dirtyKeys={dirtyKeys}
                    onValueChange={onValueChange}
                    onRevertKey={onRevertKey}
                  />
                ))}
              </div>
            )
          })}
          {/* 模型管理：按当前板块过滤渲染 */}
          {activeGroup === 'novel' && (
            <div className="space-y-4">
              <LlmPricingCompare />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-neutral-800">小说写作模型管理</h3>
                </div>
                <ModelsByType typeFilter={['novel']} onError={onError} />
              </div>
            </div>
          )}
          {activeGroup === 'canvas.image' && (
            <div className="space-y-4">
              <ImageModelCompare />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-cyan-500" />
                  <h3 className="text-sm font-bold text-neutral-800">图像生成模型管理</h3>
                </div>
                <ModelsByType typeFilter={['image']} onError={onError} />
              </div>
            </div>
          )}
          {activeGroup === 'canvas.video' && (
            <div className="space-y-4">
              <VideoModelCompare />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-violet-500" />
                  <h3 className="text-sm font-bold text-neutral-800">视频生成模型管理</h3>
                </div>
                <ModelsByType typeFilter={['video']} onError={onError} />
              </div>
            </div>
          )}
          {activeGroup === 'audio' && (
            <div className="space-y-4">
              <AudioModelCompare />
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-pink-500" />
                  <h3 className="text-sm font-bold text-neutral-800">音频创作模型管理</h3>
                </div>
                <ModelsByType typeFilter={['audio']} onError={onError} />
              </div>
            </div>
          )}
          {/* 兜底空态：仅当既没有配置项也没有模型管理时展示 */}
          {visibleModules.every(m => m.sections.length === 0)
            && !['novel', 'canvas', 'canvas.image', 'canvas.video', 'audio', 'system', 'announcement', 'works', 'moderation'].includes(activeGroup)
            && (
            <div className="rounded-2xl border border-dashed border-neutral-200 bg-white/60 py-20 text-center text-neutral-400">
              该模块下暂无配置
            </div>
          )}
        </div>
      )}

      {/* —— 底部粘性保存栏 —— */}
      {(dirtyCount > 0 || saving) && (
        <div className="fixed bottom-6 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-200 bg-white/95 px-4 py-3 shadow-[0_12px_40px_rgba(0,0,0,0.12)] backdrop-blur">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          </div>
          <div className="pr-1">
            <div className="text-sm font-semibold text-neutral-800">
              {dirtyCount} 项修改待保存
            </div>
            <div className="text-xs text-neutral-500">保存后将立即对全站生效，并写入变更日志</div>
          </div>
          <button
            onClick={revertAll}
            disabled={saving}
            className="rounded-lg px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
          >
            全部撤销
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="btn-primary !px-4 !py-2 text-sm disabled:opacity-70"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? '保存中…' : '保存全部修改'}
          </button>
        </div>
      )}

      {/* —— 保存成功/失败 Toast —— */}
      {saveToast && (
        <div className={`fixed bottom-28 left-1/2 z-[301] flex -translate-x-1/2 items-center gap-2 rounded-xl px-4 py-2.5 text-sm shadow-lg ${
          saveToast.type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
        }`}>
          {saveToast.type === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
          {saveToast.msg}
        </div>
      )}

      {/* —— 审计回滚抽屉 —— */}
      <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} onRollback={doRollback} />
      </>
      )}
    </div>
  )
}

// ===== 「板块功能」侧边栏子导航 =====
export function FeaturesSideNav({
  activeGroup,
  onChangeActiveGroup,
}: {
  activeGroup: string
  onChangeActiveGroup: (g: string) => void
}) {
  const { data, dirtyKeys } = useFeaturesNav()
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ canvas: true })

  const navItems = useMemo(() => {
    const sectionMap = collectSectionItems(data.groups)
    const modules: Array<{
      key: string; label: string; icon: IconComponent; accent: string;
      count: number; dirty: number; children?: PageModuleDef['children']
    }> = PAGE_MODULES.map(m => {
      let count = 0
      let dirty = 0
      for (const sec of m.sections) {
        const row = sectionMap.get(`${m.key}::${sec.key}`)
        if (!row) continue
        count += row.items.length
        for (const { item } of row.items) if (dirtyKeys?.has(item.key)) dirty++
      }
      return { key: m.key, label: m.label, icon: m.icon, accent: m.accent, count, dirty, children: m.children }
    })
    return [
      ...modules,
    ]
  }, [data.groups, dirtyKeys])

  const accentText: Record<string, string> = {
    blue: 'text-blue-700', indigo: 'text-indigo-700', cyan: 'text-cyan-700',
    fuchsia: 'text-fuchsia-700', emerald: 'text-emerald-700', violet: 'text-violet-700',
    rose: 'text-rose-700', pink: 'text-pink-700', slate: 'text-slate-700',
  }
  const accentSelBg: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700', indigo: 'bg-indigo-50 text-indigo-700', cyan: 'bg-cyan-50 text-cyan-700',
    fuchsia: 'bg-fuchsia-50 text-fuchsia-700', emerald: 'bg-emerald-50 text-emerald-700', violet: 'bg-violet-50 text-violet-700',
    rose: 'bg-rose-50 text-rose-700', pink: 'bg-pink-50 text-pink-700', slate: 'bg-slate-50 text-slate-700',
  }

  const toggleExpand = (key: string) => {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }))
  }

  if (navItems.length === 0) return null

  return (
    <ul className="space-y-0.5 py-0.5">
      {navItems.map((g) => {
        const Icon = g.icon
        const isChildActive = g.children?.some(c => activeGroup === c.key)
        const isActive = activeGroup === g.key || isChildActive
        const hasChildren = !!g.children?.length
        const isOpen = expanded[g.key] ?? false

        const baseCls =
          'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition'
        const stateCls = isActive
          ? (accentSelBg[g.accent] ?? accentSelBg.slate)
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'

        return (
          <li key={g.key}>
            <div className="flex items-center">
              <button
                onClick={() => {
                  if (hasChildren) {
                    // 首次展开时自动选中第一个子项
                    if (!isOpen && activeGroup !== g.children![0].key) {
                      onChangeActiveGroup(g.children![0].key)
                    }
                    toggleExpand(g.key)
                  } else {
                    onChangeActiveGroup(g.key)
                  }
                }}
                className={`flex-1 ${baseCls} ${stateCls}`}
                title={g.label}
              >
                <Icon className={`h-3.5 w-3.5 shrink-0 ${isActive ? '' : (accentText[g.accent] ?? 'text-neutral-500')}`} />
                <span className="truncate flex-1">{g.label}</span>
                {g.dirty > 0 ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                    {g.dirty}
                  </span>
                ) : null}
                {hasChildren && (
                  <ChevronRight
                    className={`h-3 w-3 shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  />
                )}
              </button>
            </div>

            {hasChildren && isOpen && (
              <ul className="ml-4 mt-0.5 space-y-0.5 border-l border-neutral-200 pl-2">
                {g.children!.map((c) => {
                  const ChildIcon = c.icon
                  const childActive = activeGroup === c.key
                  const childCls =
                    'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11px] font-medium transition'
                  const childState = childActive
                    ? (accentSelBg[c.accent] ?? accentSelBg.slate)
                    : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800'
                  return (
                    <li key={c.key}>
                      <button
                        onClick={() => onChangeActiveGroup(c.key)}
                        className={`${childCls} ${childState}`}
                      >
                        <ChildIcon className={`h-3 w-3 shrink-0 ${childActive ? '' : (accentText[c.accent] ?? 'text-neutral-400')}`} />
                        <span className="truncate flex-1">{c.label}</span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </li>
        )
      })}
    </ul>
  )
}
