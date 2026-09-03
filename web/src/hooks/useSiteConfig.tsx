import { useEffect, useState, useCallback, createContext, useContext } from 'react'
import { api } from '../services/api'

export type ControlType = 'text' | 'textarea' | 'number' | 'slider' | 'color' | 'switch' | 'select'

export interface SiteItemMeta {
  id: string
  key: string
  controlType: ControlType
  label: string
  description?: string | null
  sort: number
  icon?: string | null
  config?: {
    min?: number
    max?: number
    step?: number
    unit?: string
    rows?: number
    placeholder?: string
    options?: Array<{ label: string; value: string | number | boolean }>
    [k: string]: unknown
  } | null
  updatedAt?: string | null
}

export interface SiteConfigData {
  version: number
  config: Record<string, any>
  groups: Record<string, SiteItemMeta[]>
}

const DEFAULT: SiteConfigData = { version: 0, config: {}, groups: {} }
const DRAFT_KEY = 'site.draft'

// —— 草稿（保存前预览用）工具：sessionStorage + URL ?draft=1 激活 ——
type SiteDraftPayload = {
  ts: number
  /** 只存被修改过的 key → value（增量，只覆盖改过的） */
  overrides: Record<string, any>
  /** 草稿过期时间（ms，默认 15 分钟），避免旧草稿持续影响 */
  expireAt: number
}
const DRAFT_TTL = 15 * 60 * 1000

function isDraftEnabledByUrl(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.href
  return /[?#&]draft=1(?:&|$|#)/.test(h)
}
function readDraftIfEnabled(): Record<string, any> | null {
  if (typeof window === 'undefined') return null
  if (!isDraftEnabledByUrl()) return null
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SiteDraftPayload
    if (typeof parsed !== 'object' || !parsed) return null
    if (parsed.expireAt && parsed.expireAt < Date.now()) {
      window.sessionStorage.removeItem(DRAFT_KEY)
      return null
    }
    return parsed.overrides ?? {}
  } catch {
    return null
  }
}
/** 把当前编辑态写入草稿（保存前预览专用）；传 null/undefined/空对象 等价于清除草稿 */
export function writeSiteDraft(overrides: Record<string, any> | null | undefined) {
  if (typeof window === 'undefined') return
  if (!overrides || Object.keys(overrides).length === 0) {
    window.sessionStorage.removeItem(DRAFT_KEY)
    return
  }
  const payload: SiteDraftPayload = {
    ts: Date.now(),
    overrides,
    expireAt: Date.now() + DRAFT_TTL,
  }
  window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(payload))
}
/** 清除草稿（用户主动取消、或真正保存成功后调用） */
export function clearSiteDraft() {
  if (typeof window === 'undefined') return
  window.sessionStorage.removeItem(DRAFT_KEY)
}

const Ctx = createContext<{
  data: SiteConfigData
  reload: () => Promise<void>
  get: <T = any>(key: string, fallback: T) => T
  dirty: boolean
} | null>(null)

// ============ Context Provider：App.tsx 顶部挂载 ============
export function SiteConfigProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<SiteConfigData>(DEFAULT)
  const [dirty, setDirty] = useState(0)
  // draftTick：监听 sessionStorage（跨 iframe/跨 tab 更新）变化时让 get 重新走覆盖
  const [draftTick, setDraftTick] = useState(0)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onStorage = (e: StorageEvent) => {
      if (e.key === DRAFT_KEY) setDraftTick((n) => n + 1)
    }
    window.addEventListener('storage', onStorage)
    // 注意：同一 tab 内写 sessionStorage 不会触发 storage 事件；这里额外 1s 轮询检测，保证预览 iframe 内即时生效
    let lastSeenRaw: string | null = window.sessionStorage.getItem(DRAFT_KEY)
    const t = setInterval(() => {
      const now = window.sessionStorage.getItem(DRAFT_KEY)
      if (now !== lastSeenRaw) {
        lastSeenRaw = now
        setDraftTick((n) => n + 1)
      }
    }, 1000)
    return () => {
      window.removeEventListener('storage', onStorage)
      clearInterval(t)
    }
  }, [])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/site/config')
      if (!res.ok) return
      const json = (await res.json()) as SiteConfigData
      setData(json)
    } catch {
      /* 不打扰用户 */
    }
  }, [])
  useEffect(() => {
    load()
    const t = setInterval(load, 15000) // 15s 后台轮询，保证即时生效
    return () => clearInterval(t)
  }, [load, dirty])
  const get = useCallback(
    <T,>(key: string, fallback: T): T => {
      // 1) 草稿覆盖（优先级最高）：保存前预览专用
      const draft = readDraftIfEnabled()
      if (draft && Object.prototype.hasOwnProperty.call(draft, key)) {
        const dv = draft[key]
        return dv === undefined ? fallback : (dv as T)
      }
      // 2) 正常从 API 拉到的最新 config
      const v = data.config?.[key]
      return v === undefined ? fallback : (v as T)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, draftTick],
  )
  return (
    <Ctx.Provider value={{ data, reload: async () => { setDirty(n => n + 1); await load() }, get, dirty: dirty > 0 }}>
      {children}
    </Ctx.Provider>
  )
}

// ============ 业务用 hook ============
export function useSiteConfig() {
  const c = useContext(Ctx)
  if (!c) {
    // 若 Provider 未挂载，退化为默认值避免 crash
    return {
      data: DEFAULT,
      reload: async () => {},
      get: <T,>(_k: string, fallback: T): T => fallback,
      dirty: false,
    }
  }
  return c
}

// ============ 便捷：品牌与 CSS 变量 ============
export function useSiteThemeVars() {
  const { get } = useSiteConfig()
  return {
    siteName: get('brand.site_name', 'Man TV'),
    siteSlogan: get('brand.site_slogan', 'AI 驱动的一站式创作平台'),
    primaryColor: get('brand.primary_color', '#7c3aed'),
    heroAccent: get('brand.hero_accent', '#22d3ee'),
    footerCopy: get('brand.footer_copy', '© 2026 Man TV · 生成式人工智能服务已备案'),
    announcement: get('safety.announcement', '') as string,
    announcementLink: get('safety.announcement_link', '') as string,
  }
}

// ============ 超级管理员：保存单条配置 ============
export async function putSiteConfig(group: string, key: string, value: unknown) {
  const res = await api.put<{ ok: boolean; value: unknown }>(`/api/site/config/${group}/${key}`, { value })
  return res
}
export async function putSiteBatch(items: { group: string; key: string; value: unknown }[]) {
  const res = await api.put<{ ok: boolean; updated: number }>('/api/site/batch', { items })
  return res
}
export async function getSiteAudit(limit = 100) {
  const res = await api.get<{ items: Array<Record<string, unknown>> }>(`/api/site/audit?limit=${limit}`)
  return res.items
}
export async function rollbackSiteAudit(id: string) {
  const res = await api.post<{ ok: boolean }>(`/api/site/audit/${id}/rollback`, {})
  return res
}

// ============== 通用颜色工具（给 Landing accent、Navbar 渐变等用） ==============
export interface AccentColors {
  main: string; light: string; bg50: string; bg100: string; bg200: string
}
export function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
function mix(a: number, b: number, t: number) { return Math.round(a + (b - a) * t) }
export function rgbHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map(n => n.toString(16).padStart(2, '0')).join('')
}
export function makeAccent(hex: string, fallback: AccentColors): AccentColors {
  const rgb = hexToRgb(hex)
  if (!rgb) return fallback
  const [r, g, b] = rgb
  const light = rgbHex(mix(r, 255, 0.45), mix(g, 255, 0.45), mix(b, 255, 0.45))
  const bg50 = rgbHex(mix(r, 255, 0.92), mix(g, 255, 0.92), mix(b, 255, 0.92))
  const bg100 = rgbHex(mix(r, 255, 0.85), mix(g, 255, 0.85), mix(b, 255, 0.85))
  const bg200 = rgbHex(mix(r, 255, 0.72), mix(g, 255, 0.72), mix(b, 255, 0.72))
  return { main: hex, light, bg50, bg100, bg200 }
}
