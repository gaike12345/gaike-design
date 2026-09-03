// 内容安全双审核服务
// 输入审核（preModerate）+ 输出审核（postModerate）
// 本地敏感词兜底 + 服务商 API（预留框架，MODERATION_API_KEY 配置后启用）
//
// 设计：
//   1. 本地敏感词扫描（始终执行，零延迟兜底）
//   2. 服务商审核（MODERATION_API_KEY 配置后启用，未配置时跳过，标记 placeholder）
//   3. 违规 → 写 ModerationLog（append-only）+ 自动升级 User.riskLevel
//   4. riskLevel≥3 时 llmRoute 层拒绝生成（前置门控）
//
// 合规依据：《生成式人工智能服务管理暂行办法》要求输入+输出双审核，至少两家内容安全服务

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import fetch from 'node-fetch'
import prisma from './prisma'
import { logger } from './logger'
import { cfgBool, cfgStr, getAllSiteConfigs } from './siteConfig'
import { DEFAULT_SENSITIVE_WORDS } from './seedSiteConfig'

// ==================== 敏感词词库 ====================
// 默认词库来自 seedSiteConfig.DEFAULT_SENSITIVE_WORDS（6 大违规类别，网信办审查重点）
// 运行时词库从后台 siteConfig「敏感词库」配置加载（管理员可在「内容审核」面板可视化增删）
// DB 词库与默认词库合并：DB 覆盖同类别，默认类别保留，保证基础覆盖不丢失

// 违规类别 → 风险等级映射
const CATEGORY_RISK: Record<string, 'low' | 'medium' | 'high'> = {
  political: 'high',
  violence: 'high',
  porn: 'high',
  gambling: 'medium',
  drug: 'high',
  insult: 'medium',
}

// 严格度 → 启用扫描的类别集合
//   loose    ：仅 high 类别（政治/暴恐/色情/毒品）
//   standard ：high + medium（额外赌博/侮辱）= 全 6 类
//   strict   ：全 6 类 + 英文大小写不敏感匹配
const LEVEL_CATEGORIES: Record<string, string[]> = {
  loose: ['political', 'violence', 'porn', 'drug'],
  standard: ['political', 'violence', 'porn', 'gambling', 'drug', 'insult'],
  strict: ['political', 'violence', 'porn', 'gambling', 'drug', 'insult'],
}

// 从后台配置加载词库（走 siteConfig 1 分钟缓存，零额外 DB 压力）
async function getSensitiveWords(): Promise<Record<string, string[]>> {
  try {
    const { flat } = await getAllSiteConfigs()
    const v = flat['safety.moderation_sensitive_words']
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const merged: Record<string, string[]> = { ...DEFAULT_SENSITIVE_WORDS }
      for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
        if (Array.isArray(arr)) {
          // 追加合并：默认词库 + DB 词库去重合并
          // 保证默认词库的基础覆盖不丢失，同时支持管理员新增自定义词
          const dbWords = (arr as unknown[]).filter((x) => typeof x === 'string') as string[]
          const existing = merged[k] || []
          const combined = Array.from(new Set([...existing, ...dbWords]))
          merged[k] = combined
        }
      }
      return merged
    }
  } catch { /* 配置读取失败，降级到默认词库 */ }
  return DEFAULT_SENSITIVE_WORDS
}

// 风险等级数值化（用于取最高）
const RISK_RANK = { low: 1, medium: 2, high: 3 } as const

// ==================== 类型定义 ====================
export type ModerationStage = 'input' | 'output'
export type ModerationRisk = 'low' | 'medium' | 'high'

export interface ModerationResult {
  passed: boolean
  riskLevel: ModerationRisk
  reason: string
  provider: 'local' | 'aliyun' | 'zhipu'
  categories: string[]
  hits: string[]
  placeholder?: boolean
}

// ==================== 工具函数 ====================
function truncate(s: string, n = 500): string {
  return s.length > n ? s.slice(0, n) + '...' : s
}

/**
 * 文本归一化 — 提高多语言/变体场景下的敏感词命中率
 * 处理：
 *   1. 去除特殊符号、标点、零宽字符（绕过检测的常见手段）
 *   2. 统一大小写
 *   3. 去除多余空格（中英文混排时的空格插入绕过）
 *   4. 保留中文、英文、数字
 */
// 归一化时移除的英文虚词（冠词/介词/连词/代词等）
// 避免 "make a bomb" → "makeabomb" 与词库 "makebomb" 不匹配的问题
const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
  'my', 'your', 'his', 'its', 'our', 'their', 'this', 'that', 'these', 'those',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'how', 'why',
  'not', 'no', 'nor', 'so', 'if', 'then', 'than', 'too', 'very', 'just',
  'about', 'up', 'out', 'all', 'also', 'by', 'as', 'from', 'into', 'through',
])

/**
 * 文本归一化 — 提高多语言/变体场景下的敏感词命中率
 * 处理：
 *   1. 去除特殊符号、标点、零宽字符（绕过检测的常见手段）
 *   2. 统一大小写
 *   3. 去除多余空格（中英文混排时的空格插入绕过）
 *   4. 去除英文常见虚词（避免冠词/介词插入绕过短语匹配）
 *   5. 保留中文、英文、数字
 */
function normalizeText(text: string): string {
  let result = text.toLowerCase()
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '') // 零宽字符
    .replace(/[，。！？、；：""''（）《》【】…—~\s]/g, ' ') // 中文标点+空白 → 替换为空格
    .replace(/[.,!?;:'"()\[\]{}<>@#$%^&*_+=|\\/`~-]/g, ' ') // 英文标点 → 替换为空格

  // 移除英文虚词（按词边界匹配）
  result = result.split(/\s+/).filter((w) => w && !ENGLISH_STOPWORDS.has(w)).join('')

  return result
}

function maxRisk(levels: ModerationRisk[]): ModerationRisk {
  if (levels.length === 0) return 'low'
  const max = Math.max(...levels.map((l) => RISK_RANK[l]))
  return (Object.entries(RISK_RANK).find(([, v]) => v === max)?.[0] ?? 'low') as ModerationRisk
}

// ==================== 本地敏感词扫描 ====================
function scanLocal(
  text: string,
  words: Record<string, string[]>,
  categoriesToScan: string[],
  caseInsensitive: boolean,
): { categories: string[]; hits: string[] } {
  const categories: string[] = []
  const hits: string[] = []
  // 使用归一化文本匹配，提高中英文混合、符号插入绕过等场景的命中率
  const normalizedHaystack = normalizeText(text)
  for (const cat of categoriesToScan) {
    const list = words[cat] || []
    for (const w of list) {
      const normalizedNeedle = normalizeText(w)
      if (!normalizedNeedle) continue
      if (normalizedHaystack.includes(normalizedNeedle)) {
        if (!categories.includes(cat)) categories.push(cat)
        if (hits.length < 10) hits.push(w)
      }
    }
  }
  return { categories, hits }
}

// ==================== 服务商审核 ====================
// 支持两家内容安全服务商（合规要求：至少两家）
//   - aliyun: 阿里云内容安全 Green（文本审核 TextModeration）
//   - zhipu: 智谱内容安全 Moderation API
// 通过 MODERATION_PROVIDER 环境变量选择，默认 aliyun
// 通过 MODERATION_API_KEY / MODERATION_API_SECRET 配置凭据
//
// 阿里云参数说明：
//   MODERATION_API_KEY    = AccessKeyId
//   MODERATION_API_SECRET = AccessKeySecret
//   MODERATION_REGION     = cn-shanghai（默认）
//
// 智谱参数说明：
//   MODERATION_API_KEY = 智谱 API Key（用于生成 JWT）

// 阿里云分类 → 内部分类映射
const ALIYUN_CATEGORY_MAP: Record<string, string> = {
  politics: 'political',
  violence: 'violence',
  porn: 'porn',
  contraband: 'drug',
  ad: 'low',
  abuse: 'insult',
  terrorism: 'violence',
  nude: 'porn',
  'sexual-approaching': 'porn',
  'text-other-risks': 'low',
}

// 智谱分类 → 内部分类映射
const ZHIPU_CATEGORY_MAP: Record<string, string> = {
  sensitive: 'political',
  violence: 'violence',
  porn: 'porn',
  'drug-related': 'drug',
  gambling: 'gambling',
  insult: 'insult',
  advertisement: 'low',
  other: 'low',
}

// 阿里云 RPC 签名（Signature Version 1.0）
function aliYunSign(params: Record<string, string>, accessKeySecret: string): string {
  const sorted = Object.keys(params).sort()
  const canonical = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
    .join('&')
  const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonical)}`
  return crypto
    .createHmac('sha1', `${accessKeySecret}&`)
    .update(stringToSign)
    .digest('base64')
}

// 阿里云内容安全 - 文本审核
async function scanAliyun(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const accessKeyId = process.env.MODERATION_API_KEY
  const accessKeySecret = process.env.MODERATION_API_SECRET
  const region = process.env.MODERATION_REGION || 'cn-shanghai'

  if (!accessKeyId || !accessKeySecret) return null

  try {
    const params: Record<string, string> = {
      Action: 'TextModeration',
      Version: '2022-03-02',
      Format: 'JSON',
      AccessKeyId: accessKeyId,
      SignatureMethod: 'HMAC-SHA1',
      SignatureVersion: '1.0',
      SignatureNonce: crypto.randomBytes(8).toString('hex'),
      Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      Service: 'green',
      ServiceParameters: JSON.stringify({ content: text, scenes: ['antispam'] }),
    }
    params.Signature = aliYunSign(params, accessKeySecret)

    const url = `https://green.${region}.aliyuncs.com/?${Object.entries(params)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&')}`

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    clearTimeout(timeoutId)
    const data = (await res.json()) as any

    if (data.Code !== 200) {
      console.warn('[moderation] aliyun error:', data.Message || data.Code)
      return null
    }

    const result = data.Data?.result?.[0]
    if (!result) return null

    const passed = result.suggestion === 'pass'
    if (passed) return { categories: [], passed: true, reason: '阿里云审核通过' }

    const categories: string[] = []
    const details = result.results || []
    for (const d of details) {
      const mapped = ALIYUN_CATEGORY_MAP[d.label] || 'low'
      if (!categories.includes(mapped)) categories.push(mapped)
    }

    return {
      categories,
      passed: false,
      reason: `阿里云审核违规：${details.map((d: any) => d.label).join('、')}`,
    }
  } catch (e) {
    console.error('[moderation] aliyun scan failed:', e)
    return null // 服务商故障时降级，不阻断
  }
}

// 智谱内容安全 - 文本审核
async function scanZhipu(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const apiKey = process.env.MODERATION_API_KEY
  if (!apiKey) return null

  try {
    // 智谱 Moderation API
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 5000)

    const res = await fetch('https://open.bigmodel.cn/api/paas/v4/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ input: text, model: 'text-moderation' }),
      signal: controller.signal,
    })
    clearTimeout(timeoutId)

    if (!res.ok) {
      console.warn('[moderation] zhipu error:', res.status)
      return null
    }

    const data = (await res.json()) as any
    const results = data.results || []

    if (results.length === 0 || results[0].flagged === false) {
      return { categories: [], passed: true, reason: '智谱审核通过' }
    }

    const categories: string[] = []
    const categoriesData = results[0].categories || {}
    for (const [key, flagged] of Object.entries(categoriesData)) {
      if (flagged) {
        const mapped = ZHIPU_CATEGORY_MAP[key] || 'low'
        if (!categories.includes(mapped)) categories.push(mapped)
      }
    }

    return {
      categories,
      passed: false,
      reason: `智谱审核违规：${results[0].category_scores ? Object.keys(results[0].category_scores).filter((k) => (results[0].category_scores as any)[k] > 0.5).join('、') : '违规内容'}`,
    }
  } catch (e) {
    console.error('[moderation] zhipu scan failed:', e)
    return null // 服务商故障时降级，不阻断
  }
}

// 服务商审核主入口
async function scanProvider(text: string): Promise<{
  categories: string[]
  passed: boolean
  reason: string
} | null> {
  const key = process.env.MODERATION_API_KEY
  if (!key) return null // demo 模式，跳过服务商审核

  const provider = (process.env.MODERATION_PROVIDER as 'aliyun' | 'zhipu') || 'aliyun'

  if (provider === 'zhipu') {
    return await scanZhipu(text)
  } else {
    return await scanAliyun(text)
  }
}

// ==================== 主入口：审核文本 ====================
export async function moderateText(
  text: string,
  opts: { stage: ModerationStage; endpoint: string; userId: string },
): Promise<ModerationResult> {
  const hasKey = !!process.env.MODERATION_API_KEY
  const providerName = (process.env.MODERATION_PROVIDER as 'aliyun' | 'zhipu') || 'aliyun'

  // 0. 审核总开关：关闭时直接通过（应急关闭，仅在审核故障时使用）
  const enabled = await cfgBool('safety.moderation_enabled', true)
  if (!enabled) {
    return {
      passed: true, riskLevel: 'low', reason: '审核已关闭（应急模式）',
      provider: 'local', categories: [], hits: [], placeholder: !hasKey,
    }
  }

  // 1. 读取严格度 + 词库（走 siteConfig 缓存）
  const level = await cfgStr('safety.moderation_level', 'standard')
  const categoriesToScan = LEVEL_CATEGORIES[level] || LEVEL_CATEGORIES.standard
  const caseInsensitive = level === 'strict'
  const words = await getSensitiveWords()

  // 2. 本地敏感词扫描（始终执行，按严格度限定类别）
  const local = scanLocal(text, words, categoriesToScan, caseInsensitive)
  // 诊断日志：debug 级别，生产环境默认不输出
  logger.debug('内容审核诊断', {
    stage: opts.stage,
    endpoint: opts.endpoint,
    userId: opts.userId,
    enabled,
    level,
    hitCategories: local.categories.length,
    hits: local.hits.slice(0, 5),
  })
  if (local.categories.length > 0) {
    const risk = maxRisk(local.categories.map((c) => CATEGORY_RISK[c] || 'medium'))
    return {
      passed: false,
      riskLevel: risk,
      reason: `命中本地敏感词：${local.hits.slice(0, 5).join('、')}`,
      provider: 'local',
      categories: local.categories,
      hits: local.hits,
      placeholder: !hasKey,
    }
  }

  // 3. 服务商审核（有 key 时）
  const providerResult = await scanProvider(text)
  if (providerResult && !providerResult.passed) {
    return {
      passed: false,
      riskLevel: 'medium',
      reason: providerResult.reason,
      provider: providerName,
      categories: providerResult.categories,
      hits: [],
    }
  }

  // 4. 通过
  return {
    passed: true,
    riskLevel: 'low',
    reason: '审核通过',
    provider: hasKey ? providerName : 'local',
    categories: [],
    hits: [],
    placeholder: !hasKey,
  }
}

// ==================== 记录违规 + 自动风险等级升降级 ====================
export async function recordViolation(opts: {
  userId: string
  stage: ModerationStage
  endpoint: string
  content: string
  result: ModerationResult
}): Promise<void> {
  try {
    // 1. 写 ModerationLog（append-only，无 update/delete）
    await prisma.moderationLog.create({
      data: {
        userId: opts.userId,
        stage: opts.stage,
        endpoint: opts.endpoint,
        content: truncate(opts.content, 500),
        result: 'block',
        riskLevel: opts.result.riskLevel,
        reason: opts.result.reason,
        categories: JSON.stringify(opts.result.categories),
        provider: opts.result.provider,
        placeholder: opts.result.placeholder ?? false,
      },
    })

    // 2. 自动升降级 riskLevel（基于 violationCount + 本次违规严重度）
    //    规则：
    //      high 违规：1 次即升到 2（限制），2 次升到 3（封禁）
    //      medium 违规：2 次升到 1（警告），4 次升到 2，6 次升到 3
    //      low 违规：3 次升到 1，6 次升到 2
    const user = await prisma.user.findUnique({
      where: { id: opts.userId },
      select: { riskLevel: true, violationCount: true },
    })
    if (!user) return

    const newCount = user.violationCount + 1
    let newRisk = user.riskLevel

    if (opts.result.riskLevel === 'high') {
      newRisk = newCount >= 2 ? 3 : 2
    } else if (opts.result.riskLevel === 'medium') {
      if (newCount >= 6) newRisk = 3
      else if (newCount >= 4) newRisk = Math.max(newRisk, 2)
      else if (newCount >= 2) newRisk = Math.max(newRisk, 1)
    } else {
      // low
      if (newCount >= 6) newRisk = Math.max(newRisk, 2)
      else if (newCount >= 3) newRisk = Math.max(newRisk, 1)
    }

    await prisma.user.update({
      where: { id: opts.userId },
      data: {
        violationCount: newCount,
        riskLevel: newRisk,
        riskUpdatedAt: new Date(),
      },
    })
  } catch (e) {
    // 审核记录写入失败不应阻断主流程，仅记日志
    console.error('[moderation] recordViolation failed:', e)
  }
}

// ==================== 上传文件审核 ====================
// 审核上传文件的文件名和文本类文件内容
//  - 所有文件：审核 originalname（文件名可能包含违规文字）
//  - 文本文件 (.txt)：额外审核文件内容
// 审核失败时调用方需负责删除已上传的文件

export interface UploadModerationResult {
  passed: boolean
  reason: string
  result?: ModerationResult
}

export async function moderateUpload(
  file: Express.Multer.File,
  opts: { endpoint: string; userId: string },
): Promise<UploadModerationResult> {
  const originalName = file.originalname || ''
  const ext = path.extname(originalName).toLowerCase()

  // 1. 审核文件名（所有文件类型都执行）
  const nameResult = await moderateText(originalName, {
    stage: 'input',
    endpoint: `${opts.endpoint}:filename`,
    userId: opts.userId,
  })
  if (!nameResult.passed) {
    await recordViolation({
      userId: opts.userId,
      stage: 'input',
      endpoint: `${opts.endpoint}:filename`,
      content: originalName,
      result: nameResult,
    })
    return {
      passed: false,
      reason: `文件名违规：${nameResult.reason}`,
      result: nameResult,
    }
  }

  // 2. 文本文件：审核文件内容
  const textExtensions = ['.txt', '.md', '.srt', '.vtt', '.lrc', '.csv']
  if (textExtensions.includes(ext)) {
    try {
      const content = await fs.promises.readFile(file.path, 'utf-8')
      // 文本文件只审核前 10KB，避免大文件占用过多资源
      const preview = content.slice(0, 10240)
      const contentResult = await moderateText(preview, {
        stage: 'input',
        endpoint: `${opts.endpoint}:content`,
        userId: opts.userId,
      })
      if (!contentResult.passed) {
        await recordViolation({
          userId: opts.userId,
          stage: 'input',
          endpoint: `${opts.endpoint}:content`,
          content: preview,
          result: contentResult,
        })
        return {
          passed: false,
          reason: `文件内容违规：${contentResult.reason}`,
          result: contentResult,
        }
      }
    } catch (e) {
      // 文件读取失败不阻断上传（可能是二进制文件误判等），仅记日志
      logger.error('读取上传文件内容失败', { error: (e as Error).message })
    }
  }

  return { passed: true, reason: '审核通过' }
}

// 工具：删除上传文件（审核失败时清理磁盘）— 异步非阻塞
export async function cleanupUploadedFile(filePath: string): Promise<void> {
  try {
    await fs.promises.unlink(filePath)
  } catch (e) {
    // 文件不存在或删除失败都不影响主流程
    logger.warn('清理上传文件失败', { filePath, error: (e as Error).message })
  }
}

// ==================== 风险等级门控 ====================
// riskLevel≥3 时拒绝 AI 生成（在 llmRoute 层前置检查）
export async function checkUserRiskGate(userId: string): Promise<{
  allowed: boolean
  riskLevel: number
  message?: string
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { riskLevel: true, violationCount: true, enabled: true },
  })
  if (!user) return { allowed: false, riskLevel: 0, message: '用户不存在' }
  if (!user.enabled) return { allowed: false, riskLevel: 0, message: '账号已被关闭' }
  if (user.riskLevel >= 3) {
    return {
      allowed: false,
      riskLevel: user.riskLevel,
      message: '账号因多次违规已被限制 AI 生成，请联系管理员',
    }
  }
  if (user.riskLevel === 2) {
    // 限制级：允许生成但标记需人工复核（前端可提示）
    return { allowed: true, riskLevel: 2, message: '账号处于限制观察期，生成内容将接受人工复核' }
  }
  return { allowed: user.riskLevel < 3, riskLevel: user.riskLevel }
}
