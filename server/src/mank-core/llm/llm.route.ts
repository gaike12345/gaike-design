// LLM 文本生成路由 — 21 个 AI 创作接口
import { Router } from 'express'
import { withGeneration } from '../../mank-infra/middleware/generation'
import { novelLimiter } from '../../mank-infra/middleware/rate-limit'
import { authRequired } from '../../mank-infra/middleware/auth'
import { llmRouteJson, llmRouteText } from './llmRoute'
import { sanitizeAiTaste } from './aiTasteSanitizer'
import type {
  SynopsisOptionsData, MasterOutlineData, CharacterRelationsData,
  VolumeOutlineData, ChapterOutlineData, ContinuePlotData,
  InspirationData, OutlineData, WorldviewData, LorebookData,
  DeepseekData, ScriptData, ScriptScene, DialogueLine,
} from './llmTypes'
import logger from '../../mank-infra/logging/logger'

const router = Router()
router.use(authRequired)
router.use(novelLimiter)

// ==================== 蛙蛙写作对标：小说编辑器接口 ====================

// 1. POST /synopsis-options — 三选一故事梗概
/**
 * @openapi
 * /llm/synopsis-options:
 *   post:
 *     tags: [文本生成]
 *     summary: 三选一故事梗概
 *     description: 根据题材、类型、受众生成三个差异化故事梗概方案。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string, description: 创作主题 }
 *               genre: { type: string, description: 题材类型 }
 *               audience: { type: string, description: 目标受众 }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 options:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       title: { type: string }
 *                       synopsis: { type: string }
 *                       tags: { type: array, items: { type: string } }
 *       401: { description: 未登录 }
 */
router.post('/synopsis-options', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_SYNOPSIS_OPTIONS', { userId: req.user?.userId, topic: req.body?.topic, genre: req.body?.genre })
  next()
}, llmRouteJson<SynopsisOptionsData>(
  '你是 Man TV 的 AI 创作助手，擅长根据题材、受众、视角、篇幅等维度生成差异化的故事梗概方案。请返回 JSON：{ "options": [{ "id": "A"|"B"|"C", "title": string, "synopsis": string(100-200字), "tags": string[](3-5个) }] }，三个方案风格各异。不要包含其他说明文字。',
  (body) => {
    const { topic, genre, audience } = body || {}
    return {
      options: [
        { id: 'A', title: `${topic || '未知题材'} · 曙光篇`, synopsis: `围绕「${topic || '创作主题'}」展开的第一种故事走向，主角在平凡生活中被意外卷入核心冲突，逐步揭开隐藏的真相。这是一段关于成长与抉择的旅程。`, tags: [genre || '通用', '成长', '冒险'] },
        { id: 'B', title: `${topic || '未知题材'} · 暗涌篇`, synopsis: `以「${topic || '创作主题'}」为背景的第二种走向，从反派视角切入，展现灰色地带的博弈与人性的复杂。情节紧凑，悬念层层推进。`, tags: [genre || '通用', '悬疑', '人性'] },
        { id: 'C', title: `${topic || '未知题材'} · 羁绊篇`, synopsis: `基于「${topic || '创作主题'}」的第三种走向，聚焦群像角色间的情感羁绊，以温情与热血交织的方式呈现主线，适合${audience || '全频'}读者。`, tags: [genre || '通用', '羁绊', '热血'] },
      ],
    }
  },
))

// 2. POST /master-outline — 总纲
/**
 * @openapi
 * /llm/master-outline:
 *   post:
 *     tags: [文本生成]
 *     summary: 总纲生成
 *     description: 根据主题生成小说总纲架构（核心设定、主题、分卷、主线脉络、结局）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string, description: 创作主题 }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 premise: { type: string }
 *                 theme: { type: string }
 *                 volumes: { type: array, items: { type: object, properties: { name: { type: string }, summary: { type: string } } } }
 *                 mainline: { type: string }
 *                 ending: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/master-outline', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_MASTER_OUTLINE', { userId: req.user?.userId, topic: req.body?.topic })
  next()
}, llmRouteJson<MasterOutlineData>(
  '你是 Man TV 的 AI 创作助手，擅长长篇小说的总纲架构设计。请根据主题、梗概、题材，返回 JSON：{ "premise": 核心设定, "theme": 主题, "volumes": [{ "name": 卷名, "summary": 卷摘要 }], "mainline": 主线脉络, "ending": 结局走向 }。卷数 3-5 卷。不要包含其他说明文字。',
  (body) => {
    const { topic } = body || {}
    return {
      premise: `以「${topic || '创作主题'}」为核心的世界与冲突设定。`,
      theme: '成长、抉择与命运的对抗。',
      volumes: [
        { name: '第一卷 · 起', summary: `主角登场，世界观铺陈，核心冲突的种子埋下。围绕「${topic || '主题'}」展开初段剧情。` },
        { name: '第二卷 · 承', summary: '矛盾升级，配角登场，主角能力与信念受到第一次重大考验。' },
        { name: '第三卷 · 转', summary: '局势逆转，真相浮现，主角陷入低谷并完成蜕变。' },
        { name: '第四卷 · 合', summary: '决战与收束，主线冲突解决，人物命运尘埃落定。' },
      ],
      mainline: '主角从平凡到觉醒，对抗核心反派的层层阻挠，最终达成（或失败于）终极目标。',
      ending: '开放式结局，留有续作余地。',
    }
  },
))

// 3. POST /character-relations — 角色关系
/**
 * @openapi
 * /llm/character-relations:
 *   post:
 *     tags: [文本生成]
 *     summary: 角色关系图
 *     description: 根据角色列表和主题，梳理角色之间的关系网络。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               characters: { type: array, items: { type: object, properties: { name: { type: string } } } }
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 relations: { type: array, items: { type: object, properties: { from: { type: string }, to: { type: string }, type: { type: string }, desc: { type: string } } } }
 *       401: { description: 未登录 }
 */
router.post('/character-relations', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_CHARACTER_RELATIONS', { userId: req.user?.userId })
  next()
}, llmRouteJson<CharacterRelationsData>(
  '你是 Man TV 的 AI 创作助手，擅长梳理小说角色之间的关系网络。请根据角色列表和主题，返回 JSON：{ "relations": [{ "from": 角色名, "to": 角色名, "type": 关系类型(如 朋友/敌人/师徒/恋人/宿敌), "desc": 关系描述 }] }。覆盖主要角色对。不要包含其他说明文字。',
  (body) => {
    const { characters, topic } = body || {}
    const chars: { name: string }[] = Array.isArray(characters) ? characters : []
    const names = chars.map(c => c.name || '').filter(Boolean)
    const fallbackRelations = names.length >= 2
      ? [
          { from: names[0], to: names[1], type: '盟友', desc: `${names[0]} 与 ${names[1]} 因「${topic || '共同目标'}」结成同盟，彼此信任却又各怀心事。` },
          { from: names[1] || '配角', to: names[0], type: '隐秘关联', desc: '表面合作之下，藏着未揭开的过往渊源。' },
        ]
      : [{ from: names[0] || '主角', to: '神秘人', type: '宿敌', desc: `主角与神秘人因「${topic || '旧怨'}」对立。` }]
    return { relations: fallbackRelations }
  },
))

// 4. POST /volume-outline — 卷纲
/**
 * @openapi
 * /llm/volume-outline:
 *   post:
 *     tags: [文本生成]
 *     summary: 卷纲生成
 *     description: 根据卷名和主题生成分卷大纲（摘要、章节列表、卷弧光）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               volumeName: { type: string }
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary: { type: string }
 *                 chapters: { type: array, items: { type: object, properties: { title: { type: string }, summary: { type: string } } } }
 *                 arc: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/volume-outline', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_VOLUME_OUTLINE', { userId: req.user?.userId, volumeName: req.body?.volumeName })
  next()
}, llmRouteJson<VolumeOutlineData>(
  '你是 Man TV 的 AI 创作助手，擅长分卷大纲设计。请根据卷名、主题、总纲，返回 JSON：{ "summary": 卷摘要, "chapters": [{ "title": 章名, "summary": 章摘要 }], "arc": 本卷弧光 }。章节数 5-10 章。不要包含其他说明文字。',
  (body) => {
    const { volumeName, topic } = body || {}
    return {
      summary: `${volumeName || '本卷'}围绕「${topic || '主线'}」展开，主角在新的环境中遭遇挑战并逐步成长。`,
      chapters: [
        { title: '第1章 · 风起', summary: '卷首开篇，新场景与新人物登场，埋下伏笔。' },
        { title: '第2章 · 暗流', summary: '矛盾初现，主角察觉异常，开始调查。' },
        { title: '第3章 · 试炼', summary: '主角遭遇第一次考验，能力与信念受到冲击。' },
        { title: '第4章 · 联手', summary: '新盟友加入，团队雏形建立。' },
        { title: '第5章 · 反扑', summary: '反派发力，主角陷入困境，卷末钩子显现。' },
      ],
      arc: '从被动卷入到主动出击的成长弧光。',
    }
  },
))

// 5. POST /chapter-outline — 章纲
/**
 * @openapi
 * /llm/chapter-outline:
 *   post:
 *     tags: [文本生成]
 *     summary: 章纲生成
 *     description: 根据章名、卷摘要、主题生成章节细纲（摘要、场景列表、章末钩子）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chapterTitle: { type: string }
 *               volumeSummary: { type: string }
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 summary: { type: string }
 *                 scenes: { type: array, items: { type: object, properties: { location: { type: string }, description: { type: string }, dialogue: { type: string }, mood: { type: string } } } }
 *                 cliffhanger: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/chapter-outline', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_CHAPTER_OUTLINE', { userId: req.user?.userId, chapterTitle: req.body?.chapterTitle })
  next()
}, llmRouteJson<ChapterOutlineData>(
  '你是 Man TV 的 AI 创作助手，擅长章节细纲设计。请根据章名、卷摘要、主题，返回 JSON：{ "summary": 本章摘要, "scenes": [{ "location": 场景地点, "description": 场景描述, "dialogue": 关键对白, "mood": 情绪基调 }], "cliffhanger": 章末钩子 }。场景数 3-5 个。不要包含其他说明文字。',
  (body) => {
    const { chapterTitle, volumeSummary, topic } = body || {}
    return {
      summary: `${chapterTitle || '本章'}承接「${volumeSummary || '上卷剧情'}」，推进「${topic || '主线'}」发展，关键信息揭示。`,
      scenes: [
        { location: '城镇广场', description: '人群熙攘，主角观察四周，等待接头人。', dialogue: '「你来得比我想的早。」', mood: '紧张' },
        { location: '密室', description: '昏暗灯光下，一份密档摊开在桌上。', dialogue: '「这才是真相的全部吗？」', mood: '悬疑' },
        { location: '城墙之上', description: '夜风凛冽，主角独自眺望远方，陷入沉思。', dialogue: '（内心独白）下一步，该往哪走……', mood: '沉思' },
      ],
      cliffhanger: '一个意想不到的身影出现在主角身后。',
    }
  },
))

// 6. POST /continue-text — 续写正文（返回纯文本）
/**
 * @openapi
 * /llm/continue-text:
 *   post:
 *     tags: [文本生成]
 *     summary: 续写正文
 *     description: 基于当前正文自然延续故事，附带去 AI 味处理。返回续写内容。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               text: { type: string, description: 当前正文 }
 *               chapterContext: { type: string, description: 总纲主线（续写需遵循） }
 *               words: { type: integer, description: 目标字数 }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/continue-text', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_CONTINUE_TEXT', { userId: req.user?.userId, words: req.body?.words })
  next()
}, llmRouteText<{ content: string }>(
  '你是 Man TV 的 AI 创作助手，擅长小说正文续写。任务：基于「当前正文」自然延续故事，字数贴近目标字数。\n'
  + '前置设定约束（必须严格遵循）：\n'
  + '1. 「总纲主线」是本章必须服务的主线脉络，续写情节推进方向不得偏离主线；\n'
  + '2. 严格遵循上方写作方法论中的「去AI味规则」——绝对禁用词（深吸一口气、仿佛、犹如、宛若、嘴角勾起、眼中闪过、心中一动、心头一震、眉头微皱、不由得、一丝、一抹等）出现即视为生成失败，必须改写为身体反应或动作；\n'
  + '3. 禁用破折号——/—/--; 禁用「不是A，而是B」「他/她知道……」「章末他不知道的是」等最毒句式；\n'
  + '4. 保持人物语气、视角、人称与现有正文一致; 用动作/对话/反应推进，不要单写心理活动超过2段。\n'
  + '5. 输出前自检：扫一遍禁用词清单，把所有命中项改写为身体反应或动作后，再返回最终文本。\n'
  + '直接输出续写内容，不要包含说明、标题、引号或前后缀，也不要复述前文。',
  (body) => {
    const { text } = body || {}
    return {
      // 注意：fallback 也必须遵守去AI味规则，不再使用「深吸一口气」
      content: `${(text || '').slice(-30)}……\n\n（续写占位）风从远处吹来，卷起地上的落叶。他抬眼望去，前路漫漫，却没有回头的余地。身后的脚步声由远及近，他握紧了手中的物件，迈出了下一步。`,
    }
  },
  // transform：对 LLM 返回文本做程序化清洗（与 writingPrompt.ts 的「出现即替换」规则对齐）
  // 由于 GLM-4-Flash 对负面指令的遵循力有限，单纯 prompt 无法 100% 保证无禁用词，
  // 此处做兜底替换，确保输出严格符合去AI味规则
  (text) => ({ content: sanitizeAiTaste(text) }),
  // userPromptBuilder：把 body 中的关键字段显式拼接为结构化文本，
  // 避免 LLM 在原始 JSON 中遗漏对 chapterContext（总纲主线）的引用（H18：链路一致性）
  (body) => {
    const { text = '', chapterContext = '', words = 500 } = body || {}
    const lines: string[] = []
    if (chapterContext) lines.push(`【总纲主线（本章必须服务的主线脉络，续写不得偏离）】\n${chapterContext}`)
    lines.push(`【当前正文（续写起点，不要复述）】\n${text}`)
    lines.push(`【目标字数】约 ${words} 字`)
    return lines.join('\n\n')
  },
))

// 7. POST /continue-plot — 续写情节
/**
 * @openapi
 * /llm/continue-plot:
 *   post:
 *     tags: [文本生成]
 *     summary: 续写情节
 *     description: 根据发展方向推演情节走向，返回发展描述、下一场景和张力值。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               direction: { type: string, description: 发展方向 }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 development: { type: string }
 *                 nextScene: { type: string }
 *                 tension: { type: integer }
 *       401: { description: 未登录 }
 */
router.post('/continue-plot', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_CONTINUE_PLOT', { userId: req.user?.userId })
  next()
}, llmRouteJson<ContinuePlotData>(
  '你是 Man TV 的 AI 创作助手，擅长情节推演。请根据用户提供的文本和发展方向，返回 JSON：{ "development": 情节发展描述, "nextScene": 下一场景描述, "tension": 张力值(0-100整数) }。不要包含其他说明文字。',
  (body) => {
    const { direction } = body || {}
    return {
      development: `承接现有文本，情节向「${direction || '未指定方向'}」推进，主角面临新的抉择，矛盾进一步激化。`,
      nextScene: '新的场景在黎明时分展开，关键的对话即将发生。',
      tension: 65,
    }
  },
))

// 8. POST /book-title — 书名取名（返回纯文本，解析为字符串数组）
/**
 * @openapi
 * /llm/book-title:
 *   post:
 *     tags: [文本生成]
 *     summary: 书名取名
 *     description: 根据主题、梗概、题材生成 5-8 个书名候选。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string }
 *               genre: { type: string }
 *               synopsis: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 titles: { type: array, items: { type: string } }
 *       401: { description: 未登录 }
 */
router.post('/book-title', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_BOOK_TITLE', { userId: req.user?.userId, topic: req.body?.topic, genre: req.body?.genre })
  next()
}, llmRouteText<{ titles: string[] }>(
  '你是 Man TV 的 AI 创作助手，擅长为小说起吸引人的书名。请根据主题、梗概、题材，生成 5-8 个风格各异的书名候选。直接输出书名，每行一个，不要编号、引号或其他说明。',
  (body) => {
    const { topic, genre, synopsis } = body || {}
    return {
      titles: [
        `${(topic || '无题').slice(0, 4)}之约`,
        `${genre || '幻'}境·${(topic || '征程').slice(0, 2)}`,
        `逆流的${(synopsis || '命运').slice(0, 2)}`,
        `终焉之前`,
        `${(topic || '星').slice(0, 1)}与刃`,
      ],
    }
  },
  (text) => ({
    titles: text
      .split(/\r?\n/)
      .map(t => t.replace(/^[\d.、\-*•·\s"'""]+/, '').replace(/["'""]/g, '').trim())
      .filter(Boolean)
      .slice(0, 8),
  }),
))

// 9. POST /opening-line — 导语（返回纯文本）
/**
 * @openapi
 * /llm/opening-line:
 *   post:
 *     tags: [文本生成]
 *     summary: 开篇导语
 *     description: 根据主题生成引人入胜的开篇导语（50-150 字）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/opening-line', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_OPENING_LINE', { userId: req.user?.userId, topic: req.body?.topic })
  next()
}, llmRouteText<{ content: string }>(
  '你是 Man TV 的 AI 创作助手，擅长为小说撰写引人入胜的开篇导语。请根据主题、梗概、风格，生成一段 50-150 字的导语，氛围感强、能勾起阅读欲望。直接输出导语文本，不要包含说明或标题。',
  (body) => {
    const { topic } = body || {}
    return {
      content: `所有故事，都从那个寻常又不寻常的清晨开始。\n关于「${topic || '那个主题'}」，关于一段尚未被讲述的命运——风已起，只是无人听见。`,
    }
  },
))

// 10. POST /inspiration — 脑洞灵感
/**
 * @openapi
 * /llm/inspiration:
 *   post:
 *     tags: [文本生成]
 *     summary: 脑洞灵感
 *     description: 根据关键词和题材生成 3-5 个差异化创意点子。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               keyword: { type: string }
 *               genre: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ideas: { type: array, items: { type: object, properties: { title: { type: string }, synopsis: { type: string }, tags: { type: array, items: { type: string } } } } }
 *       401: { description: 未登录 }
 */
router.post('/inspiration', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_INSPIRATION', { userId: req.user?.userId, keyword: req.body?.keyword, genre: req.body?.genre })
  next()
}, llmRouteJson<InspirationData>(
  '你是 Man TV 的 AI 创作助手，擅长脑洞创意生成。请根据关键词、题材，生成 3-5 个差异化的创意点子，返回 JSON：{ "ideas": [{ "title": 标题, "synopsis": 梗概(50-100字), "tags": 标签(2-4个) }] }。不要包含其他说明文字。',
  (body) => {
    const { keyword, genre } = body || {}
    return {
      ideas: [
        { title: `${keyword || '迷雾'} · 倒影之城`, synopsis: `以「${keyword || '关键词'}」为线索，主角发现一座只在镜中存在的城市，那里的居民过着与现实相反的人生。`, tags: [genre || '奇幻', '镜像', '悬疑'] },
        { title: `第七次重启`, synopsis: '世界在某一天突然重启，但只有主角记得一切。第七次重启时，他决定不再只是旁观者。', tags: [genre || '科幻', '时间循环', '反叛'] },
        { title: `赠梦人`, synopsis: '一个能将梦境赠予他人的职业，在一次委托中卷入了不该被梦见的事。', tags: [genre || '脑洞', '梦境', '都市'] },
      ],
    }
  },
))

// 11. POST /smart-chat — 智能对话（返回纯文本）
/**
 * @openapi
 * /llm/smart-chat:
 *   post:
 *     tags: [文本生成]
 *     summary: 智能对话
 *     description: 与 AI 创作助手「智能蛙」对话，获取创作建议、剧情推演、设定答疑。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               message: { type: string, description: 用户消息 }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/smart-chat', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_SMART_CHAT', { userId: req.user?.userId })
  next()
}, llmRouteText<{ content: string }>(
  '你是 Man TV 的 AI 创作助手「智能蛙」，擅长为小说创作者提供创作建议、剧情推演、设定答疑、卡文突破。请根据用户消息、上下文、小说信息，给出具体、可操作、有启发性的回复。直接输出回复文本，不要包含说明或前后缀。',
  (body) => {
    const { message } = body || {}
    return {
      content: `收到你的问题：「${message || ''}」\n\n这里是一条占位回复。建议从以下三个角度切入：\n1. 梳理当前情节的核心矛盾；\n2. 检查人物动机是否自洽；\n3. 尝试引入一个意外变量打破僵局。\n\n配置 LLM API Key 后，我能给出更具针对性的建议。`,
    }
  },
))

// ==================== 写作板块 WR 工具 ====================

// 12. POST /outline — 大纲生成 (WR-01)
/**
 * @openapi
 * /llm/outline:
 *   post:
 *     tags: [文本生成]
 *     summary: 大纲生成
 *     description: 根据主题和风格生成故事大纲（主题、幕结构、角色列表）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string }
 *               style: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 theme: { type: string }
 *                 acts: { type: array, items: { type: object, properties: { id: { type: integer }, name: { type: string }, summary: { type: string }, beats: { type: array, items: { type: string } } } } }
 *                 characters: { type: array, items: { type: object, properties: { name: { type: string }, role: { type: string }, arc: { type: string } } } }
 *       401: { description: 未登录 }
 */
router.post('/outline', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_OUTLINE', { userId: req.user?.userId, topic: req.body?.topic, style: req.body?.style })
  next()
}, llmRouteJson<OutlineData>(
  '你是 Man TV 的 AI 创作助手，擅长故事大纲设计(WR-01)。请根据主题、风格，返回 JSON：{ "theme": 主题, "acts": [{ "id": 序号, "name": 幕名, "summary": 幕摘要, "beats": 节拍列表(字符串数组) }], "characters": [{ "name": 角色名, "role": 角色定位, "arc": 角色弧光 }] }。幕数 3-5 幕，beats 每幕 3-6 个。不要包含其他说明文字。',
  (body) => {
    const { topic, style } = body || {}
    return {
      theme: `以「${topic || '创作主题'}」为核心的${style || '通用'}故事。`,
      acts: [
        { id: 1, name: '第一幕 · 建置', summary: '主角登场，日常世界展示，激励事件触发。', beats: ['开场定调', '主角登场', '激励事件', '第一幕转折'] },
        { id: 2, name: '第二幕 · 对抗', summary: '主角进入新世界，遭遇阻碍，中点反转。', beats: ['进入新世界', '盟友与敌人', '中点反转', '低谷时刻'] },
        { id: 3, name: '第三幕 · 解决', summary: '高潮决战，主题升华，新平衡建立。', beats: ['终极抉择', '高潮决战', '主题揭示', '新平衡'] },
      ],
      characters: [
        { name: '主角', role: '主角', arc: '从平凡到觉醒，完成自我超越。' },
        { name: '反派', role: '对手', arc: '与主角镜像，走向毁灭或救赎。' },
      ],
    }
  },
))

// 13. POST /worldview — 世界观 (WR-05)
/**
 * @openapi
 * /llm/worldview:
 *   post:
 *     tags: [文本生成]
 *     summary: 世界观构建
 *     description: 根据主题生成完整世界观（名称、题材、地理、历史、势力、规则、文化、冲突）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 name: { type: string }
 *                 genre: { type: string }
 *                 geography: { type: string }
 *                 history: { type: string }
 *                 factions: { type: array, items: { type: object, properties: { name: { type: string }, desc: { type: string }, stance: { type: string } } } }
 *                 rules: { type: array, items: { type: string } }
 *                 culture: { type: string }
 *                 conflicts: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/worldview', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_WORLDVIEW', { userId: req.user?.userId, topic: req.body?.topic })
  next()
}, llmRouteJson<WorldviewData>(
  '你是 Man TV 的 AI 创作助手，擅长世界观构建(WR-05)。请根据主题，返回 JSON：{ "name": 世界名, "genre": 题材类型, "geography": 地理, "history": 历史, "factions": [{ "name": 势力名, "desc": 描述, "stance": 立场 }], "rules": 规则数组, "culture": 文化, "conflicts": 核心冲突 }。factions 2-4 个，rules 3-6 条。不要包含其他说明文字。',
  (body) => {
    const { topic } = body || {}
    return {
      name: `${topic || '新'}世界`,
      genre: '奇幻',
      geography: '大陆中央被一条贯穿南北的山脉分隔，东岸富庶、西岸荒凉。',
      history: '千年前的「裂变之战」塑造了今日的格局，旧文明的遗产散落各处。',
      factions: [
        { name: '东岸联邦', desc: '以贸易与魔法学院为核心的城邦联盟。', stance: '秩序中立' },
        { name: '西境游牧', desc: '游走在荒原上的部族，信奉古老的自然之力。', stance: '混沌中立' },
      ],
      rules: ['魔法需消耗「源质」，源质稀缺且不可再生。', '跨越山脉需获得通行符，由联邦统一发放。', '夜间裂谷中会涌出「影兽」，禁止夜行。'],
      culture: '崇尚「契约精神」，口头承诺具备法律效力。',
      conflicts: '东岸的资源扩张与西境的领土守护之间的根本矛盾。',
    }
  },
))

// 14. POST /lorebook — 设定库 (WR-12)
/**
 * @openapi
 * /llm/lorebook:
 *   post:
 *     tags: [文本生成]
 *     summary: 设定库抽取
 *     description: 从源文本中抽取设定词条（人物/地点/物品/势力/概念/事件），支持已有词条回传。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               existing: { type: array, items: { type: object } }
 *               sourceText: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entries: { type: array, items: { type: object, properties: { key: { type: string }, category: { type: string }, content: { type: string }, aliases: { type: array, items: { type: string } } } } }
 *                 existing: { type: array, items: { type: object } }
 *       401: { description: 未登录 }
 */
router.post('/lorebook', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_LOREBOOK', { userId: req.user?.userId })
  next()
}, llmRouteJson<LorebookData>(
  '你是 Man TV 的 AI 创作助手，擅长从文本中抽取设定词条(WR-12)。请根据源文本和已有词条，返回 JSON：{ "entries": [{ "key": 词条名, "category": 分类(人物/地点/物品/势力/概念/事件), "content": 内容描述, "aliases": 别名数组 }], "existing": 原样回传的已有词条数组 }。不要包含其他说明文字。',
  (body) => {
    const { existing } = body || {}
    return {
      entries: [
        { key: '主角', category: '人物', content: `源自源文本的核心角色，承担主线推动作用。`, aliases: ['主角', '主角名'] },
        { key: '核心场景', category: '地点', content: '故事的主要发生地，具备象征意义。', aliases: ['主城'] },
      ],
      existing: Array.isArray(existing) ? existing : [],
    }
  },
))

// 15. POST /prompt-helper — Prompt 助手 (WR-19，返回纯文本)
/**
 * @openapi
 * /llm/prompt-helper:
 *   post:
 *     tags: [文本生成]
 *     summary: Prompt 助手
 *     description: 将中文自然语言描述转化为高质量 AI 绘图英文 Prompt。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input: { type: string }
 *               style: { type: string }
 *               ratio: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prompt: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/prompt-helper', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_PROMPT_HELPER', { userId: req.user?.userId, input: req.body?.input?.slice(0, 50), style: req.body?.style })
  next()
}, llmRouteText<{ prompt: string }>(
  '你是 Man TV 的 AI 创作助手，擅长将中文自然语言描述转化为高质量的 AI 绘图 Prompt(WR-19)。请根据输入、风格、比例，生成一段英文 Prompt，包含主体、场景、光影、画风、构图、质量增强词。直接输出 Prompt 文本，不要包含说明或前后缀。',
  (body) => {
    const { input, style, ratio } = body || {}
    return {
      prompt: `masterpiece, best quality, ${input || 'a subject'}, ${style || 'cinematic style'}, dramatic lighting, detailed background, ${ratio ? `aspect ratio ${ratio}, ` : ''}8k, highly detailed`,
    }
  },
  (text) => ({ prompt: text }),
))

// 16. POST /enhance-prompt — Prompt 优化（与 /prompt-helper 共用同一 system prompt，但接口名保留以兼容前端旧调用）
// H2: 统一 enhance-prompt 实现，不再在 image.ts 与 llm.ts 各维护一份
/**
 * @openapi
 * /llm/enhance-prompt:
 *   post:
 *     tags: [文本生成]
 *     summary: Prompt 优化
 *     description: 将用户中文描述翻译并扩展为高质量英文绘图 Prompt。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 prompt: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/enhance-prompt', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_ENHANCE_PROMPT', { userId: req.user?.userId, input: req.body?.input?.slice(0, 50) })
  next()
}, llmRouteText<{ prompt: string }>(
  '你是 AI 绘图 Prompt 优化助手。将用户的中文描述翻译并扩展为高质量的英文绘图 Prompt，包含主体、场景、光影、构图、风格词。只返回 Prompt 文本。',
  (body) => {
    const { input } = body || {}
    return { prompt: input || '' }
  },
  (text) => ({ prompt: text }),
))

// 17. POST /deepseek — DeepSeek 推理 (WR-15)
/**
 * @openapi
 * /llm/deepseek:
 *   post:
 *     tags: [文本生成]
 *     summary: 多路径剧情推演
 *     description: 根据情境生成多条剧情路径推演（局势分析、路径列表、推荐建议）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               situation: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 analysis: { type: string }
 *                 paths: { type: array, items: { type: object, properties: { id: { type: integer }, title: { type: string }, development: { type: string }, consequence: { type: string }, drama: { type: integer } } } }
 *                 recommendation: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/deepseek', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_DEEPSEEK', { userId: req.user?.userId })
  next()
}, llmRouteJson<DeepseekData>(
  '你是 Man TV 的 AI 创作助手，擅长多路径剧情推演(WR-15)。请根据情境和候选选项，返回 JSON：{ "analysis": 局势分析, "paths": [{ "id": 序号, "title": 路径名, "development": 发展推演, "consequence": 后果, "drama": 戏剧性(0-100整数) }], "recommendation": 推荐建议 }。paths 3-5 条。不要包含其他说明文字。',
  (body) => {
    const { situation } = body || {}
    return {
      analysis: `当前情境：「${situation || '未提供'}」。存在多条可行路径，需在风险与收益间权衡。`,
      paths: [
        { id: 1, title: '正面强攻', development: '直接对抗，速战速决。', consequence: '可能短期内解决问题，但代价高昂。', drama: 80 },
        { id: 2, title: '迂回策略', development: '从侧翼入手，寻找弱点。', consequence: '耗时较长，但风险较低。', drama: 55 },
        { id: 3, title: '借力打力', development: '利用第三方势力达成目标。', consequence: '收益最大，但后续可能受制于人。', drama: 90 },
      ],
      recommendation: '推荐路径 2，兼顾风险控制与目标达成。',
    }
  },
))

// 18. POST /style-clone — 文风模仿 (WR-14，返回纯文本 + 特征)
/**
 * @openapi
 * /llm/style-clone:
 *   post:
 *     tags: [文本生成]
 *     summary: 文风模仿
 *     description: 分析样本文风特征后，用相同文风创作指定主题的内容。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sample: { type: string, description: 样本文本 }
 *               topic: { type: string }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content: { type: string }
 *                 styleFeatures: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/style-clone', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_STYLE_CLONE', { userId: req.user?.userId, topic: req.body?.topic })
  next()
}, llmRouteText<{ content: string; styleFeatures: string }>(
  '你是 Man TV 的 AI 创作助手，擅长模仿文风写作(WR-14)。请先仔细分析样本文风的用词、句式、节奏、修辞特点，然后用相同的文风创作一段符合主题的内容。输出格式：先输出创作内容，然后另起一行输出「文风特征：」开头，后接 2-3 条文风特点总结。',
  (body) => {
    const { topic } = body || {}
    return {
      content: `（文风模仿占位）关于「${topic || '主题'}」的一段创作，参考了所提供样本的语言风格进行行文。`,
      styleFeatures: '样本展现出鲜明的叙事节奏与意象选择，已尝试在续写中保留这些特征。',
    }
  },
  (text) => {
    let content = text
    let styleFeatures = '已根据样本的用词、句式与节奏进行模仿创作。'
    const sep = text.split(/文风特征[：:]/)
    if (sep.length >= 2) {
      content = sep[0].trim()
      styleFeatures = sep.slice(1).join(' ').trim()
    }
    return { content, styleFeatures }
  },
))

// 19. POST /ai-erase — AI 消痕 (WR-18，返回纯文本)
/**
 * @openapi
 * /llm/ai-erase:
 *   post:
 *     tags: [文本生成]
 *     summary: AI 消痕
 *     description: 消除文本的 AI 生成痕迹，调整用词句式使其更自然。返回修改后的文本和原文。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               input: { type: string }
 *               intensity: { type: string, description: 修改强度（light/medium/heavy） }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 content: { type: string }
 *                 before: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/ai-erase', withGeneration('novel', 200), (req, _res, next) => {
  logger.info('CTRL_LLM_AI_ERASE', { userId: req.user?.userId, input: req.body?.input?.slice(0, 50) })
  next()
}, llmRouteText<{ content: string; before: string }>(
  '你是 Man TV 的 AI 创作助手，擅长消除文本的 AI 生成痕迹(WR-18)。请根据输入文本和强度(light/medium/heavy)，调整用词、句式、节奏，去除模板化表达、"首先其次最后"等套路、过度对仗与排比，使其更自然、更像人类写作。直接输出修改后的文本，不要包含说明或前后缀。',
  (body) => {
    const { input } = body || {}
    return {
      content: input || '（无输入文本）',
      before: input || '',
    }
  },
  (text, body) => ({
    content: text,
    before: body?.input || '',
  }),
))

// 20. POST /script — 脚本生成
/**
 * @openapi
 * /llm/script:
 *   post:
 *     tags: [文本生成]
 *     summary: 漫剧脚本生成
 *     description: 根据主题、风格、分镜数生成漫剧脚本（标题、简介、角色、场景列表、题材）。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               topic: { type: string }
 *               style: { type: string }
 *               shots: { type: integer, description: 分镜数（默认 3） }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 title: { type: string }
 *                 synopsis: { type: string }
 *                 characters: { type: array, items: { type: object, properties: { name: { type: string }, desc: { type: string }, role: { type: string } } } }
 *                 scenes: { type: array, items: { type: object, properties: { id: { type: integer }, location: { type: string }, shot: { type: string }, description: { type: string }, dialogue: { type: string }, mood: { type: string } } } }
 *                 genre: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/script', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_SCRIPT', { userId: req.user?.userId, topic: req.body?.topic, style: req.body?.style, shots: req.body?.shots })
  next()
}, llmRouteJson<ScriptData>(
  '你是 Man TV 的 AI 创作助手，擅长漫剧脚本生成。请根据主题、风格、分镜数，返回 JSON：{ "title": 标题, "synopsis": 简介, "characters": [{ "name": 角色名, "desc": 描述, "role": 定位 }], "scenes": [{ "id": 序号, "location": 地点, "shot": 镜头描述, "description": 场景描述, "dialogue": 对白, "mood": 情绪 }], "genre": 题材 }。scenes 数量按 shots 参数(默认 6)。不要包含其他说明文字。',
  (body) => {
    const { topic, style, shots } = body || {}
    const sceneCount = Math.max(1, Math.min(12, Number(shots) || 3))
    const scenes: ScriptScene[] = Array.from({ length: sceneCount }).map((_, i) => ({
      id: i + 1,
      location: i === 0 ? '开场场景' : `场景 ${i + 1}`,
      shot: i % 2 === 0 ? '中景' : '近景',
      description: `关于「${topic || '主题'}」的第 ${i + 1} 个分镜，推进剧情。`,
      dialogue: i === 0 ? `「故事，从这里开始。」` : `「继续。」`,
      mood: ['平静', '紧张', '悬疑', '激烈'][i % 4],
    }))
    return {
      title: `${topic || '新'}脚本`,
      synopsis: `围绕「${topic || '主题'}」展开的${style || '通用'}风格短剧脚本。`,
      characters: [
        { name: '主角', desc: '故事的核心推动者。', role: '主角' },
        { name: '配角', desc: '主角的同伴与对照。', role: '配角' },
      ],
      scenes,
      genre: style || '通用',
    }
  },
))

// 21. POST /storyboard — 分镜拆解
/**
 * @openapi
 * /llm/storyboard:
 *   post:
 *     tags: [文本生成]
 *     summary: 分镜拆解
 *     description: 将长脚本拆解为分镜列表，按目标数量拆分。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               count: { type: integer, description: 目标分镜数（默认 3，最大 20） }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: integer }
 *                   location: { type: string }
 *                   shot: { type: string }
 *                   description: { type: string }
 *                   dialogue: { type: string }
 *                   mood: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/storyboard', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_STORYBOARD', { userId: req.user?.userId, count: req.body?.count })
  next()
}, llmRouteJson<ScriptScene[]>(
  '你是 Man TV 的 AI 创作助手，擅长将长脚本拆解为分镜列表。请根据脚本和目标数量，返回 JSON 数组：[{ "id": 序号, "location": 地点, "shot": 镜头描述, "description": 场景描述, "dialogue": 对白, "mood": 情绪 }]。按目标数量(count 参数，默认 6)拆分。不要包含其他说明文字。',
  (body) => {
    const { count } = body || {}
    const sceneCount = Math.max(1, Math.min(20, Number(count) || 3))
    return Array.from({ length: sceneCount }).map((_, i) => ({
      id: i + 1,
      location: `分镜地点 ${i + 1}`,
      shot: ['全景', '中景', '近景', '特写'][i % 4],
      description: `基于脚本拆解的第 ${i + 1} 个分镜。`,
      dialogue: i % 2 === 0 ? `「对白 ${i + 1}」` : '',
      mood: ['平静', '紧张', '悬疑', '高潮'][i % 4],
    }))
  },
))

// 22. POST /dialogue — 对白生成
/**
 * @openapi
 * /llm/dialogue:
 *   post:
 *     tags: [文本生成]
 *     summary: 对白生成
 *     description: 根据角色列表生成场景对白，每角色至少 2 句，对话自然有冲突与节奏。
 *     security: [{ BearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               characters: { type: array, items: { type: object, properties: { name: { type: string } } } }
 *     responses:
 *       200:
 *         description: 生成成功
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   character: { type: string }
 *                   line: { type: string }
 *                   emotion: { type: string }
 *       401: { description: 未登录 }
 */
router.post('/dialogue', withGeneration('novel', 500), (req, _res, next) => {
  logger.info('CTRL_LLM_DIALOGUE', { userId: req.user?.userId })
  next()
}, llmRouteJson<DialogueLine[]>(
  '你是 Man TV 的 AI 创作助手，擅长场景对白创作。请根据角色列表、场景、提示，返回 JSON 数组：[{ "character": 角色名, "line": 台词, "emotion": 情绪(如 平静/激动/愤怒/悲伤/惊喜/恐惧) }]。每角色至少 2 句对白，对话自然、有冲突与节奏。不要包含其他说明文字。',
  (body) => {
    const { characters } = body || {}
    const charArr: any[] = Array.isArray(characters) ? characters : []
    const names = charArr.map(c => typeof c === 'string' ? c : c?.name).filter(Boolean)
    const a = names[0] || '角色甲'
    const b = names[1] || '角色乙'
    return [
      { character: a, line: `你来了。这里的气氛不太对。`, emotion: '平静' },
      { character: b, line: `我知道。所以才来的。`, emotion: '紧张' },
      { character: a, line: `那就别浪费时间了，开始吧。`, emotion: '坚定' },
      { character: b, line: `等等——你确定要这么做？`, emotion: '犹豫' },
    ]
  },
))

export default router
