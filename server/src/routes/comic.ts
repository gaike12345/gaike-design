import { Router, Request } from 'express'
import prisma from '../lib/prisma'
import { authRequired, requireRole } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'
import { imageLimiter } from '../middleware/rate-limit'
import { getModelCost } from '../lib/modelCost'
import { moderateText, recordViolation, checkUserRiskGate } from '../lib/moderation'

export const COMIC_MODEL = process.env.COMIC_MODEL || 'comic-pro'

export function storyboardPanelFactor(panelCount: number): number {
  const n = Number(panelCount) || 16
  return n >= 60 ? 1.8 : n >= 32 ? 1.4 : n >= 16 ? 1.0 : 0.7
}

export function comicGeneratePanelFactor(panelCount: number): number {
  const n = Number(panelCount) || 16
  return Math.max(0.5, n / 16)
}

// 漫画分镜生成：按 panel 数量（通常一部 1 章节有 20+ 分镜）+ 模型成本
export async function estimateComicStoryboardCost(params: {
  model?: string
  panels?: number
  count?: number
}): Promise<number> {
  const panelCount = Number(params.panels) || Number(params.count) || 16
  const base = await getModelCost(params.model || COMIC_MODEL, 'comic', 800)
  return Math.max(200, Math.round(base * storyboardPanelFactor(panelCount)))
}

// 漫画正式出图（多分镜图像批量生成）
export async function estimateComicGenerateCost(params: {
  model?: string
  panels?: number
  count?: number
}): Promise<number> {
  const panelCount = Number(params.panels) || Number(params.count) || 16
  const base = await getModelCost(params.model || COMIC_MODEL, 'comic', 1500)
  return Math.max(500, Math.round(base * comicGeneratePanelFactor(panelCount)))
}

// 漫画发布（非 AI 生成，仅占用审核/存储：少量积分）
export const COMIC_PUBLISH_COST = 100
export function estimateComicPublishCost(): number {
  return COMIC_PUBLISH_COST
}

const costForStoryboard = async (req: Request): Promise<number> => {
  return estimateComicStoryboardCost({ model: req.body?.model, panels: req.body?.panels, count: req.body?.count })
}
const costForComicGenerate = async (req: Request): Promise<number> => {
  return estimateComicGenerateCost({ model: req.body?.model, panels: req.body?.panels, count: req.body?.count })
}
const costForComicPublish = COMIC_PUBLISH_COST

const router = Router()
router.use(authRequired)
router.use(imageLimiter)

// ============ 类型 ============
type PanelSpec = { panelPrompt: string; style?: string; size?: string }

// ============ 工具：占位图（Comic 面板） ============
function buildPlaceholderPanel(prompt: string, index: number, style = '日漫黑白'): string {
  const seed = encodeURIComponent(`${prompt}-${index}-${Date.now()}`)
  const styleMap: Record<string, string> = {
    '日漫黑白': 'manga%20style%2C%20monochrome%2C%20manga%20panels%2C%20high%20contrast%20ink',
    '国漫彩漫': 'chinese%20manhua%2C%20color%20illustration%2C%20comic%20panel',
    '美漫超级英雄': 'american%20comic%20style%2C%20superhero%2C%20bold%20lines',
    '韩漫条漫': 'korean%20manhwa%2C%20webtoon%20style%2C%20long%20vertical',
    '水墨国风': 'ink%20wash%20painting%2C%20chinese%20traditional%20art%2C%20wuxia',
    'Q版萌系': 'chibi%20style%2C%20cute%20kawaii%2C%20anime%20chibi',
    '赛博朋克': 'cyberpunk%20aesthetic%2C%20neon%20lights%2C%20futuristic%20city',
    '治愈系水彩': 'watercolor%20illustration%2C%20soft%20pastel%2C%20warm%20cozy',
  }
  const styleKw = styleMap[style] || styleMap['日漫黑白']
  const w = 768
  const h = 1024
  const baseUrl = process.env.IMAGE_PROVIDER_URL || 'https://image.pollinations.ai/prompt'
  const params = new URLSearchParams()
  params.set('width', String(w))
  params.set('height', String(h))
  params.set('nologo', 'true')
  params.set('model', 'turbo')
  params.set('seed', seed)
  return `${baseUrl}/${styleKw}%2C${encodeURIComponent(prompt)}?${params.toString()}`
}

// ============ 1. 分镜生成 POST /api/comic/storyboard ============
// 消耗：每章节 × 4 格 × 500 tokens（和 image/generate 同量级）
router.post('/storyboard', withGeneration('comic', costForStoryboard), requireRole('user', 'admin', 'superadmin'), async (req: Request, res) => {
  const { prompt, chapters = 1, style = '日漫黑白', layout = '2x2' } = req.body || {}
  const userId = req.user!.userId

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    res.status(400).json({ error: 'prompt 不能为空且长度至少 5 字符' })
    return
  }
  if (typeof chapters !== 'number' || chapters < 1 || chapters > 10) {
    res.status(400).json({ error: 'chapters 范围 1~10' })
    return
  }

  // 风险门控
  const riskGate = await checkUserRiskGate(userId)
  if (!riskGate.allowed) {
    return res.status(403).json({ error: riskGate.message })
  }

  // 输入审核
  const mod = await moderateText(prompt, {
    stage: 'input',
    endpoint: '/api/comic/storyboard',
    userId,
  })
  if (!mod.passed) {
    await recordViolation({ userId, stage: 'input', endpoint: '/api/comic/storyboard', content: prompt, result: mod })
    return res.status(403).json({ error: mod.reason, moderation: mod })
  }

  const panelsPerChapter: Record<string, number> = { '1x1': 1, '2x1': 2, '1x2': 2, '2x2': 4, '3x2': 6, '3x3': 9 }
  const ppc = panelsPerChapter[layout as string] ?? 4
  const storyboards = Array.from({ length: chapters }).map((_, ch) => ({
    chapter: ch + 1,
    title: `第${ch + 1}章：${String(prompt).slice(0, 10)}${ch % 2 === 0 ? '·风起' : '·云涌'}`,
    summary: `本章承接前序剧情，围绕“${String(prompt).slice(0, 20)}”推进，角色情绪${ch % 3 === 0 ? '由紧张走向释放' : ch % 3 === 1 ? '层层递进' : '出现反转'}。`,
    layout,
    style,
    panels: Array.from({ length: ppc }).map((__, i) => ({
      index: i + 1,
      sceneType: ['特写', '中景', '远景', '俯拍', '仰拍', '过肩'][i % 6],
      cameraAngle: ['平视', '45°俯角', '低角度', '鱼眼'][i % 4],
      panelPrompt: `${String(prompt).slice(0, 40)}，场景${ch * ppc + i + 1}：${['开场铺垫', '矛盾出现', '冲突升级', '高潮爆发', '转折过渡', '结局收束'][i % 6]}`,
      dialogue: [
        { speaker: '角色A', text: '这是……怎么回事？' },
        { speaker: '角色B', text: '别慌，听我解释。' },
      ].slice(0, i % 2 === 0 ? 2 : 1),
      narration: i % 3 === 0 ? '那一刻，时间仿佛静止了。' : null,
      suggestedSize: '768x1024',
    })),
  }))

  res.json({
    placeholder: true,
    style,
    layout,
    chapters: storyboards,
    totalPanels: storyboards.reduce((s, c) => s + c.panels.length, 0),
    note: 'MVP 阶段占位，生产环境对接 LLM 分镜模型（如 GLM-4 / Claude 3 Opus 漫画 prompt 模板）',
  })
})

// ============ 2. 批量出图 POST /api/comic/generate ============
router.post('/generate', withGeneration('comic', costForComicGenerate), requireRole('user', 'admin', 'superadmin'), async (req: Request, res) => {
  const { storyboard, style = '日漫黑白', size = '768x1024' } = req.body || {}
  const panels: PanelSpec[] = Array.isArray(storyboard) ? storyboard : []
  const userId = req.user!.userId

  if (panels.length === 0) {
    res.status(400).json({ error: 'storyboard 不能为空，请先调用 /storyboard 生成分镜' })
    return
  }
  if (panels.length > 60) {
    res.status(400).json({ error: 'storyboard 面板数量单次最多 60 格' })
    return
  }

  // 风险门控
  const riskGate = await checkUserRiskGate(userId)
  if (!riskGate.allowed) {
    return res.status(403).json({ error: riskGate.message })
  }

  // 输入审核：拼接所有 panel prompt 统一审核
  const allPrompts = panels.map((p) => p.panelPrompt || '').filter(Boolean).join('\n')
  if (allPrompts.trim()) {
    const mod = await moderateText(allPrompts, {
      stage: 'input',
      endpoint: '/api/comic/generate',
      userId,
    })
    if (!mod.passed) {
      await recordViolation({ userId, stage: 'input', endpoint: '/api/comic/generate', content: allPrompts.slice(0, 500), result: mod })
      return res.status(403).json({ error: mod.reason, moderation: mod })
    }
  }

  const results = panels.map((p, i) => ({
    index: i + 1,
    prompt: p.panelPrompt || `漫画分格 ${i + 1}`,
    style: p.style || style,
    size: p.size || size,
    url: buildPlaceholderPanel(p.panelPrompt || `漫画分格 ${i + 1}`, i, p.style || style),
    placeholder: true,
  }))

  res.json({
    placeholder: true,
    style,
    size,
    totalPanels: results.length,
    panels: results,
    note: 'MVP 阶段占位，生产环境走批量异步队列 + 进度回调（UserTask）',
  })
})

// ============ 3. 排版导出 POST /api/comic/publish ============
// panels 输入支持两种形式（自动归一化为 string[] URL 列表）：
//   1. string[] — URL 数组（与社区其他接口一致）
//   2. Array<{ url: string }> — /generate 返回的对象数组（取 url 字段）
// 这样前端可直传 /generate 结果，无需手动转换
router.post('/publish', withGeneration('comic', costForComicPublish), requireRole('user', 'admin', 'superadmin'), async (req: Request, res) => {
  const user = req.user!
  const { title, subtitle, coverImage, panels, tags, summary, publishToCommunity = true } = req.body || {}

  if (!title || typeof title !== 'string' || title.trim().length < 2) {
    res.status(400).json({ error: 'title 不能为空，至少 2 字符' })
    return
  }
  if (!Array.isArray(panels) || panels.length === 0) {
    res.status(400).json({ error: 'panels 不能为空数组' })
    return
  }
  if (panels.length > 200) {
    res.status(400).json({ error: 'panels 单次最多 200 格' })
    return
  }

  // 归一化 panels 为 string[]（URL 列表），兼容 /generate 的对象数组输出
  const panelUrls: string[] = panels
    .map((p: unknown) => {
      if (typeof p === 'string') return p
      if (p && typeof p === 'object' && 'url' in p) return String((p as { url: string }).url)
      return null
    })
    .filter((u: unknown): u is string => typeof u === 'string' && u.length > 0)

  if (panelUrls.length === 0) {
    res.status(400).json({ error: 'panels 中没有有效的 URL' })
    return
  }

  // 排版：生成 webtoon / 翻页两种预览 JSON（MVP 占位，生产用 Puppeteer/Canvas 渲染 PDF/PNG）
  const layoutWebtoon = {
    format: 'webtoon' as const,
    direction: 'vertical' as const,
    panelSpacing: 12,
    background: '#ffffff',
    panels: panelUrls.map((url, i) => ({ index: i + 1, url, width: 800, height: 1066 })),
    totalHeight: panelUrls.reduce((s, _, i) => s + 1066 + (i > 0 ? 12 : 0), 0),
  }

  const totalPages = Math.ceil(panelUrls.length / 4)
  const layoutBook = {
    format: 'book' as const,
    direction: 'ltr' as const,
    pages: totalPages,
    panelsPerPage: 4,
    pagesLayout: Array.from({ length: totalPages }).map((_, pg) => ({
      page: pg + 1,
      layout: '2x2',
      panels: panelUrls.slice(pg * 4, pg * 4 + 4).map((url, idx) => ({ index: pg * 4 + idx + 1, url, slot: idx })),
    })),
  }

  // 发布到社区（Work 表）
  let communityWorkId: string | null = null
  if (publishToCommunity) {
    const work = await prisma.work.create({
      data: {
        userId: user.userId,
        title: String(title),
        type: 'comic',
        subtype: Array.isArray(tags) && tags[0] ? String(tags[0]) : '原创漫画',
        content: JSON.stringify({
          subtitle,
          coverImage,
          panels: panelUrls,
          tags,
          summary,
          layoutWebtoon,
        }),
        cover: coverImage || panelUrls[0] || undefined,
        tags: Array.isArray(tags) && tags.length ? JSON.stringify(tags) : JSON.stringify(['原创', '漫画', 'AI生成']),
      },
    })
    communityWorkId = work.id
  }

  res.json({
    placeholder: true,
    title,
    subtitle: subtitle || null,
    coverImage: coverImage || panelUrls[0] || null,
    summary: summary || null,
    tags: Array.isArray(tags) ? tags : [],
    panelCount: panelUrls.length,
    communityWorkId,
    communityWorkUrl: communityWorkId ? `/works/${communityWorkId}` : null,
    exports: {
      webtoon: {
        format: 'webtoon_vertical',
        // MVP 阶段不提供独立 preview/download 端点，前端可直接使用 layout JSON 渲染
        // 生产环境对接排版引擎后，再提供真实 PDF/PNG 下载链接
        layout: layoutWebtoon,
      },
      book: {
        format: 'book_2x2',
        pages: layoutBook.pages,
        layout: layoutBook,
      },
    },
    note: 'MVP 阶段占位，生产环境对接排版引擎（Canvas/Puppeteer 合成），导出真实 PDF/PNG/ZIP',
  })
})

export default router
