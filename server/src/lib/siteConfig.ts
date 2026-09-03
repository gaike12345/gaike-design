import prisma from './prisma'
import { seedSiteConfig } from './seedSiteConfig'

// ====== 内存缓存 + 懒刷新（1 分钟 TTL） ======
interface CacheEntry { stamp: number; flat: Record<string, unknown>; list: any[] }
let CACHE: CacheEntry | null = null
const TTL_MS = 60 * 1000

export function invalidateSiteCache() { CACHE = null }

export async function getAllSiteConfigs(): Promise<{ flat: Record<string, unknown>; list: any[] }> {
  const now = Date.now()
  if (CACHE && now - CACHE.stamp < TTL_MS) return CACHE
  // 首次调用做 seed 初始化（幂等，空库塞默认，已有不覆盖 value）
  try { await seedSiteConfig() } catch (e) { /* ignore */ }
  const rows = await prisma.siteConfig.findMany({ orderBy: [{ group: 'asc' }, { sort: 'asc' }, { createdAt: 'asc' }] })
  const flat: Record<string, unknown> = {}
  for (const r of rows) {
    try { flat[r.key] = JSON.parse(r.value) } catch { flat[r.key] = r.value }
  }
  CACHE = { stamp: now, flat, list: rows }
  return CACHE
}

export async function cfgNum(key: string, fallback: number): Promise<number> {
  const { flat } = await getAllSiteConfigs()
  const v = flat[key]
  return typeof v === 'number' ? v : fallback
}
export async function cfgBool(key: string, fallback: boolean): Promise<boolean> {
  const { flat } = await getAllSiteConfigs()
  const v = flat[key]
  return typeof v === 'boolean' ? v : fallback
}
export async function cfgStr(key: string, fallback: string): Promise<string> {
  const { flat } = await getAllSiteConfigs()
  const v = flat[key]
  return typeof v === 'string' ? v : fallback
}

type TxClient = typeof prisma | Parameters<Parameters<typeof prisma['$transaction']>[0]>[0]

export async function updateSiteConfig(group: string, key: string, rawValue: unknown, operatorId: string | undefined, tx?: TxClient) {
  const db = tx ?? prisma
  const exist = await db.siteConfig.findUnique({ where: { group_key: { group, key } } })
  if (!exist) throw new Error(`配置 ${group}/${key} 不存在`)
  const newValue = JSON.stringify(rawValue)
  const oldValue = exist.value
  if (newValue === oldValue) return { unchanged: true }
  // H15: 更新配置 + 写审计日志需原子化，任一失败则整体回滚
  const updated = await db.siteConfig.update({ where: { id: exist.id }, data: { value: newValue, updatedBy: operatorId ?? null } })
  await db.siteConfigAuditLog.create({
    data: { group, key, oldValue, newValue, operator: operatorId ?? null, action: 'UPDATE' },
  })
  invalidateSiteCache()
  return { unchanged: false, updated }
}

export async function rollbackAudit(id: string, operatorId: string | undefined) {
  const audit = await prisma.siteConfigAuditLog.findUnique({ where: { id } })
  if (!audit) throw new Error('记录不存在')
  if (audit.oldValue == null) throw new Error('该记录为初次创建，无法回滚')
  const target = await prisma.siteConfig.findUnique({ where: { group_key: { group: audit.group, key: audit.key } } })
  if (!target) throw new Error('目标配置已被删除')
  const currentBefore = target.value
  // H15: 回滚配置 + 写审计日志需原子化
  await prisma.$transaction([
    prisma.siteConfig.update({ where: { id: target.id }, data: { value: audit.oldValue, updatedBy: operatorId ?? null } }),
    prisma.siteConfigAuditLog.create({
      data: { group: audit.group, key: audit.key, oldValue: currentBefore, newValue: audit.oldValue, operator: operatorId ?? null, action: 'ROLLBACK' },
    }),
  ])
  invalidateSiteCache()
  return { ok: true }
}
