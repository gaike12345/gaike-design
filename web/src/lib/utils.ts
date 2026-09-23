import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

// 统一 catch 块错误信息提取：Error 实例取 message，其余用兜底文案
export function errMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback
}

// 触发浏览器下载（创建临时 <a> 标签点击）
export function downloadFile(url: string, filename: string): void {
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}

// ==================== 颜色工具（hex 解析 / 混合 / accent 派生，自 useSiteConfig 下沉） ====================

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

// 向白色混合 percent%（0-100），输入非法时原样返回（Navbar / Pricing / Login 渐变共用）
export function lighten(hex: string, percent: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  const [r, g, b] = rgb
  return rgbHex(mix(r, 255, percent / 100), mix(g, 255, percent / 100), mix(b, 255, percent / 100))
}

// admin 对比页 Summary 卡片渐变底色类名，键为各卡 accent 名
export const ACCENT_BADGE: Record<string, string> = {
  emerald: 'from-emerald-500 to-emerald-600',
  violet:  'from-violet-500 to-violet-600',
  cyan:    'from-cyan-500 to-cyan-600',
  amber:   'from-amber-500 to-amber-600',
  pink:    'from-pink-500 to-pink-600',
  teal:    'from-teal-500 to-teal-600',
  rose:    'from-rose-500 to-rose-600',
  indigo:  'from-indigo-500 to-indigo-600',
}
