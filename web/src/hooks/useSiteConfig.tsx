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

