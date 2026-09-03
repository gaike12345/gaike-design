// 内容审核管理后台 API
// 双审核违规监控 + 风险用户管理 + 风险操作 + 审核配置/敏感词库管理
// 仅超级管理员可访问（requireSuperAdmin）
//
// 路由：
//   GET    /api/admin/moderation/logs              违规记录列表（分页+筛选）
//   GET    /api/admin/moderation/stats             统计概览（总数/今日/各等级/各阶段）
//   GET    /api/admin/moderation/risk-users        风险用户列表（riskLevel>0）
//   POST   /api/admin/moderation/users/:id/risk   调整用户风险等级（手动操作）
//   POST   /api/admin/moderation/logs/:id/handle   标记录已处理
//   GET    /api/admin/moderation/config            读取审核配置（开关/严格度/模式/词库）
//   PUT    /api/admin/moderation/config            更新审核配置（开关/严格度）
//   GET    /api/admin/moderation/sensitive-words   读取敏感词库（按类别）
//   PUT    /api/admin/moderation/sensitive-words   更新敏感词库（整体替换）

import { Router, Request, Response } from 'express'
import prisma from '../lib/prisma'
import { requireSuperAdmin } from '../middleware/auth'
import { getAllSiteConfigs, updateSiteConfig, invalidateSiteCache } from '../lib/siteConfig'
import { DEFAULT_SENSITIVE_WORDS } from '../lib/seedSiteConfig'

const router = Router()

// 所有审核管理接口都需要超级管理员权限
router.use(requireSuperAdmin)

// ==================== 违规记录列表 ====================
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 20))
    const result = String(req.query.result || '')   // pass | block | warning
    const riskLevel = String(req.query.riskLevel || '')  // low | medium | high
    const stage = String(req.query.stage || '')     // input | output
    const userId = String(req.query.userId || '')

    const where: any = {}
    if (result) where.result = result
    if (riskLevel) where.riskLevel = riskLevel
    if (stage) where.stage = stage
    if (userId) where.userId = userId

    const [total, items] = await Promise.all([
      prisma.moderationLog.count({ where }),
      prisma.moderationLog.findMany({
        where,
        include: {
          user: { select: { id: true, email: true, nickname: true, avatar: true, role: true, riskLevel: true, violationCount: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ ok: true, items, total, page, pageSize })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 统计概览 ====================
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [total, today, high, medium, low, inputStage, outputStage, unhandled, riskUserCount, blockedUserCount] =
      await Promise.all([
        prisma.moderationLog.count(),
        prisma.moderationLog.count({ where: { createdAt: { gte: todayStart } } }),
        prisma.moderationLog.count({ where: { riskLevel: 'high' } }),
        prisma.moderationLog.count({ where: { riskLevel: 'medium' } }),
        prisma.moderationLog.count({ where: { riskLevel: 'low' } }),
        prisma.moderationLog.count({ where: { stage: 'input' } }),
        prisma.moderationLog.count({ where: { stage: 'output' } }),
        prisma.moderationLog.count({ where: { handled: false } }),
        prisma.user.count({ where: { riskLevel: { gt: 0 } } }),
        prisma.user.count({ where: { riskLevel: { gte: 3 } } }),
      ])

    res.json({
      ok: true,
      stats: {
        total, today, unhandled,
        riskUsers: riskUserCount,
        blockedUsers: blockedUserCount,
        byLevel: { high, medium, low },
        byStage: { input: inputStage, output: outputStage },
      },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 风险用户列表 ====================
router.get('/risk-users', async (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page)) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize)) || 20))

    const where = { riskLevel: { gt: 0 } }
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, nickname: true, avatar: true, role: true,
          riskLevel: true, violationCount: true, riskUpdatedAt: true, riskNote: true,
          enabled: true, createdAt: true,
        },
        orderBy: { riskLevel: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ])

    res.json({ ok: true, items, total, page, pageSize })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 调整用户风险等级（手动操作） ====================
router.post('/users/:id/risk', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const { riskLevel, note } = req.body as { riskLevel: number; note?: string }

    if (typeof riskLevel !== 'number' || riskLevel < 0 || riskLevel > 3) {
      return res.status(400).json({ ok: false, error: 'riskLevel 必须为 0-3 的整数' })
    }

    // 不能对同级或更高权限用户操作（权限边界）
    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, role: true, nickname: true } })
    if (!target) return res.status(404).json({ ok: false, error: '用户不存在' })

    const operator = (req as any).user
    const roleRank: Record<string, number> = { user: 0, admin: 1, superadmin: 2 }
    if (roleRank[operator.role] <= roleRank[target.role]) {
      return res.status(403).json({ ok: false, error: '不能对同级或更高权限用户执行风险操作' })
    }

    await prisma.user.update({
      where: { id },
      data: {
        riskLevel,
        riskNote: note || (riskLevel === 0 ? '管理员重置风险等级' : `管理员调整风险等级为 ${riskLevel}`),
        riskUpdatedAt: new Date(),
      },
    })

    res.json({ ok: true, id, riskLevel, note })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 标记录已处理 ====================
router.post('/logs/:id/handle', async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string
    const log = await prisma.moderationLog.findUnique({ where: { id } })
    if (!log) return res.status(404).json({ ok: false, error: '记录不存在' })

    await prisma.moderationLog.update({ where: { id }, data: { handled: true } })
    res.json({ ok: true, id, handled: true })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 审核配置读取 ====================
// 返回：总开关 / 严格度 / 当前模式（local=本地敏感词 / provider=服务商API）/ 词库
router.get('/config', async (_req: Request, res: Response) => {
  try {
    const { flat } = await getAllSiteConfigs()
    const enabled = typeof flat['safety.moderation_enabled'] === 'boolean' ? flat['safety.moderation_enabled'] : true
    const level = typeof flat['safety.moderation_level'] === 'string' ? flat['safety.moderation_level'] : 'standard'
    const hasApiKey = !!process.env.MODERATION_API_KEY
    const provider = (process.env.MODERATION_PROVIDER as string) || 'aliyun'

    // 词库：合并默认词库 + DB 自定义（DB 覆盖同类别，默认类别保留）
    const dbWords = flat['safety.moderation_sensitive_words']
    const sensitiveWords: Record<string, string[]> = { ...DEFAULT_SENSITIVE_WORDS }
    if (dbWords && typeof dbWords === 'object' && !Array.isArray(dbWords)) {
      for (const [k, v] of Object.entries(dbWords as Record<string, unknown>)) {
        if (Array.isArray(v)) sensitiveWords[k] = (v as unknown[]).filter((x) => typeof x === 'string') as string[]
      }
    }

    // 各类别词数统计
    const wordCounts: Record<string, number> = {}
    for (const [k, v] of Object.entries(sensitiveWords)) wordCounts[k] = v.length

    res.json({
      ok: true,
      config: {
        enabled, level,
        mode: hasApiKey ? 'provider' : 'local',  // local=本地敏感词兜底；provider=服务商API已接入
        provider, hasApiKey,
        sensitiveWords, wordCounts,
      },
    })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 审核配置更新（开关/严格度） ====================
// 高风险变更（关闭总开关、严格度降级）前端需二次确认弹窗
router.put('/config', async (req: Request, res: Response) => {
  try {
    const { enabled, level } = req.body as { enabled?: boolean; level?: string }
    const operatorId = (req as any).user?.userId as string | undefined
    const changes: string[] = []

    if (typeof enabled === 'boolean') {
      await updateSiteConfig('safety', 'safety.moderation_enabled', enabled, operatorId)
      changes.push(`内容审核总开关 → ${enabled ? '开启' : '关闭'}`)
    }
    if (typeof level === 'string' && ['loose', 'standard', 'strict'].includes(level)) {
      await updateSiteConfig('safety', 'safety.moderation_level', level, operatorId)
      changes.push(`内容审核严格度 → ${level}`)
    }

    if (changes.length === 0) {
      return res.status(400).json({ ok: false, error: '未提供有效配置项（enabled / level）' })
    }
    res.json({ ok: true, changes })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

// ==================== 敏感词库整体更新 ====================
// 接收完整词库对象（按类别），整体替换 safety.moderation_sensitive_words
router.put('/sensitive-words', async (req: Request, res: Response) => {
  try {
    const { words } = req.body as { words: Record<string, string[]> }
    if (!words || typeof words !== 'object' || Array.isArray(words)) {
      return res.status(400).json({ ok: false, error: 'words 必须为对象（类别 → 字符串数组）' })
    }
    // 校验每个类别为字符串数组，并去重去空
    const cleaned: Record<string, string[]> = {}
    for (const [k, arr] of Object.entries(words)) {
      if (!Array.isArray(arr)) {
        return res.status(400).json({ ok: false, error: `类别 ${k} 必须为字符串数组` })
      }
      const seen = new Set<string>()
      const valid: string[] = []
      for (const w of arr) {
        if (typeof w !== 'string') {
          return res.status(400).json({ ok: false, error: `类别 ${k} 存在非字符串词条` })
        }
        const t = w.trim()
        if (t && !seen.has(t)) { seen.add(t); valid.push(t) }
      }
      cleaned[k] = valid
    }
    const operatorId = (req as any).user?.userId as string | undefined
    await updateSiteConfig('safety', 'safety.moderation_sensitive_words', cleaned, operatorId)
    const wordCounts: Record<string, number> = {}
    for (const [k, v] of Object.entries(cleaned)) wordCounts[k] = v.length
    res.json({ ok: true, words: cleaned, wordCounts })
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message })
  }
})

export default router
