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
// ================================================================
import prisma from './prisma'
import logger from './logger'

// ------- 缓存结构 -------
type CostEntry = { tokens: number; loadedAt: number }
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
      select: { name: true, costTokens: true },
    })
    const now = Date.now()
    for (const m of all) costCache.set(m.name, { tokens: m.costTokens, loadedAt: now })
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
        select: { costTokens: true, status: true },
      })
      if (row && row.status === 'active') {
        costCache.set(name, { tokens: row.costTokens, loadedAt: Date.now() })
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
      select: { costTokens: true },
    })
    if (rows.length) {
      // 取最小值：让默认值不占用户便宜；管理端调过之后每个模型都有精准值
      const min = Math.min(...rows.map((r) => r.costTokens))
      typeFallbackCache.set(typeFallback, { tokens: min, loadedAt: Date.now() })
      return min
    }
  } catch {
    /* 继续兜底 */
  }

  // 4) 终极兜底：调用方传入的硬编码默认值（image 1000 / video 5000 / tts 500 / music 1000）
  return fallbackDefault
}
