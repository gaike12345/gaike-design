// ================================================================
// 模型积分制度 · 全局同步缓存
// ---------------------------------------------------------------
// 用途：给三大创作板块（image/video/audio）+ LLM/comic 提供"调用某模型消耗多少积分"
// 设计：
//   1) 内存 Map 缓存 model.name → costTokens，避免每次查表（每 30s 重新拉一次/管理端手动 invalidate）
//   2) 提供 getModelCost(name, typeFallback, fallbackDefault) 的多级 fallback：
//      - 命中缓存 → 返回
//      - 未命中缓存 → 查询 DB AIModel 表
//      - 仍未命中 → 按板块 type 查该 type 下 active 的平均值/最低值
//      - 仍未命中 → 返回路由传入的 fallbackDefault（旧代码里写死的硬编码）
//   3) 管理端 PATCH 更新某模型积分后 → 调用 invalidateModelCostCache() → 下一次请求立即重新拉
//
// 动态 margin 支持（2026-09 升级）：
//   - costTokens 现支持"管理后台动态调整"，不再依赖硬编码
//   - AIModel.margin 字段允许按模型单独配置毛利率倍数
//   - 默认 margin = 0（无溢价）（毛利 50%），管理后台可按模型调整
//   - 路由层 fallbackDefault 仅为 DB 故障时的终极兜底，不作为主要定价依据
// ================================================================
import prisma from '../../mank-infra/database/prisma'
import logger from '../../mank-infra/logging/logger'
import { getTokenRatioSync } from './billingConfig.service'

// ------- 缓存结构 -------
type CostEntry = { tokens: number; margin: number; loadedAt: number }
const costCache: Map<string, CostEntry> = new Map()
const CACHE_TTL_MS = 30 * 1000 // 30 秒

// 板块级兜底（同 type 下所有 active 模型的加权最小值）
const typeFallbackCache: Map<string, CostEntry> = new Map()

// TTL 过期清理（1 分钟跑一次）
setInterval(() => {
  const now = Date.now()
  for (const [k, v] of costCache.entries()) if (now - v.loadedAt > CACHE_TTL_MS) costCache.delete(k)
  for (const [k, v] of typeFallbackCache.entries()) if (now - v.loadedAt > CACHE_TTL_MS) typeFallbackCache.delete(k)
}, 60 * 1000).unref()

// ------- 预加载 -------
export async function preloadModelCosts(): Promise<void> {
  try {
    const all = await prisma.aIModel.findMany({
      where: { status: 'active' },
      select: { name: true, costTokens: true, margin: true },
    })
    const now = Date.now()
    for (const m of all) costCache.set(m.name, { tokens: m.costTokens, margin: m.margin ?? 0, loadedAt: now })
    logger.info('模型成本缓存预加载完成', { count: all.length })
  } catch (e) {
    logger.warn('模型成本缓存预加载失败，将延迟加载', { error: e instanceof Error ? e.message : String(e) })
  }
}

// ------- 失效（管理端修改积分后调用） -------
export function invalidateModelCostCache(): void {
  costCache.clear()
  typeFallbackCache.clear()
  logger.info('模型成本缓存已失效，下次请求将重新从数据库加载')
}

// ------- 读取单个模型的 costTokens（同步/异步结合） -------
export async function getModelCost(
  modelName: string | undefined | null,
  typeFallback: 'novel' | 'image' | 'audio' | 'video' | 'comic',
  fallbackDefault: number,
): Promise<number> {
  const name = (modelName || '').toString().trim()
  if (name) {
    // 1) 命中缓存
    const cached = costCache.get(name)
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.tokens
    // 2) 查 DB
    try {
      const row = await prisma.aIModel.findFirst({
        where: { name },
        select: { costTokens: true, margin: true, status: true },
      })
      if (row && row.status === 'active') {
        costCache.set(name, { tokens: row.costTokens, margin: row.margin ?? 0, loadedAt: Date.now() })
        return row.costTokens
      }
      if (row) {
        // 模型禁用：仍允许按该 cost 提示，但未来可在路由层拒绝（这里不拒绝，避免一刀切影响历史请求）
        return row.costTokens
      }
    } catch {
      /* DB 故障 → 继续走兜底 */
    }
  }

  // 3) 板块级同 type 最小值兜底
  try {
    const fb = typeFallbackCache.get(typeFallback)
    if (fb && Date.now() - fb.loadedAt < CACHE_TTL_MS) return fb.tokens
    // 聚合取该板块下所有 active 模型的平均值向下取整
    const rows = await prisma.aIModel.findMany({
      where: { type: typeFallback, status: 'active' },
      select: { costTokens: true, margin: true },
    })
    if (rows.length) {
      // 取最小值：让默认值不占用户便宜；管理端调过之后每个模型都有精准值
      const min = Math.min(...rows.map((r) => r.costTokens))
      const minMargin = Math.min(...rows.map((r) => r.margin ?? 0))
      typeFallbackCache.set(typeFallback, { tokens: min, margin: minMargin, loadedAt: Date.now() })
      return min
    }
  } catch {
    /* 继续兜底 */
  }

  // 4) 终极兜底：调用方传入的硬编码默认值（image 1000 / video 5000 / tts 500 / music 1000）
  // 注意：此为 DB 故障时的最后防线，正常运行时不应该走到这里
  // 若频繁走到这里，说明 seed 未执行或 DB 连接异常
  logger.warn('模型成本查询全部失败，使用硬编码兜底', { modelName: name, typeFallback, fallbackDefault })
  return fallbackDefault
}

// ------- 读取单个模型的 margin（用于成本估算和运营分析） -------
export async function getModelMargin(
  modelName: string | undefined | null,
): Promise<number> {
  const name = (modelName || '').toString().trim()
  if (!name) return 2.0
  const cached = costCache.get(name)
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached.margin
  try {
    const row = await prisma.aIModel.findFirst({
      where: { name },
      select: { margin: true, status: true },
    })
    if (row) {
      const margin = row.margin ?? 0
      costCache.set(name, { tokens: 0, margin, loadedAt: Date.now() }) // 仅用于 margin 缓存
      return margin
    }
  } catch {
    /* DB 故障 → 走默认 */
  }
  return 2.0
}
