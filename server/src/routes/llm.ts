// LLM 文本生成路由 — 21 个 AI 创作接口
// 每个接口 POST 方法，优先调用 LLM；失败时返回 template 占位数据
import { Router } from 'express'
import { callLlm, callLlmJson } from '../lib/llmProvider'
import { authRequired } from '../middleware/auth'
import { withGeneration } from '../middleware/generation'

const router = Router()

// 可选认证 — 有 token 则解析，无 token 也放行（后续可切换为 authRequired）
router.use(authRequired)

// ==================== 类型定义 ====================
interface SynopsisOption { id: string; title: string; synopsis: string; tags: string[] }
interface SynopsisOptionsData { options: SynopsisOption[] }

interface MasterOutlineData {
  premise: string
  theme: string
  volumes: { name: string; summary: string }[]
  mainline: string
  ending: string
}

interface CharacterRelationsData {
  relations: { from: string; to: string; type: string; desc: string }[]
}

interface VolumeOutlineData {
  summary: string
  chapters: { title: string; summary: string }[]
  arc: string
}

interface ChapterOutlineData {
  summary: string
  scenes: { location: string; description: string; dialogue: string; mood: string }[]
  cliffhanger: string
}

interface ContinuePlotData {
  development: string
  nextScene: string
  tension: number
}

interface InspirationData {
  ideas: { title: string; synopsis: string; tags: string[] }[]
}

interface OutlineAct { id: number; name: string; summary: string; beats: string[] }
interface OutlineData {
  theme: string
  acts: OutlineAct[]
  characters: { name: string; role: string; arc: string }[]
}

interface WorldviewData {
  name: string
  genre: string
  geography: string
  history: string
  factions: { name: string; desc: string; stance: string }[]
  rules: string[]
  culture: string
  conflicts: string
}

interface LorebookEntry { key: string; category: string; content: string; aliases: string[] }
interface LorebookData { entries: LorebookEntry[]; existing: LorebookEntry[] }

interface DeepseekPath { id: number; title: string; development: string; consequence: string; drama: number }
interface DeepseekData { analysis: string; paths: DeepseekPath[]; recommendation: string }

interface ScriptCharacter { name: string; desc: string; role: string }
interface ScriptScene { id: number; location: string; shot: string; description: string; dialogue: string; mood: string }
interface ScriptData {
  title: string
  synopsis: string
  characters: ScriptCharacter[]
  scenes: ScriptScene[]
  genre?: string
}

interface DialogueLine { character: string; line: string; emotion: string }

// ==================== 蛙蛙写作对标：小说编辑器接口 ====================

// 1. POST /synopsis-options — 三选一故事梗概
router.post('/synopsis-options', withGeneration('novel', 500), async (req, res) => {
  const { topic, genre, audience, pov, length } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长根据题材、受众、视角、篇幅等维度生成差异化的故事梗概方案。请返回 JSON：{ "options": [{ "id": "A"|"B"|"C", "title": string, "synopsis": string(100-200字), "tags": string[](3-5个) }] }，三个方案风格各异。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<SynopsisOptionsData>(sys, JSON.stringify({ topic, genre, audience, pov, length }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        options: [
          { id: 'A', title: `${topic || '未知题材'} · 曙光篇`, synopsis: `围绕「${topic || '创作主题'}」展开的第一种故事走向，主角在平凡生活中被意外卷入核心冲突，逐步揭开隐藏的真相。这是一段关于成长与抉择的旅程。`, tags: [genre || '通用', '成长', '冒险'] },
          { id: 'B', title: `${topic || '未知题材'} · 暗涌篇`, synopsis: `以「${topic || '创作主题'}」为背景的第二种走向，从反派视角切入，展现灰色地带的博弈与人性的复杂。情节紧凑，悬念层层推进。`, tags: [genre || '通用', '悬疑', '人性'] },
          { id: 'C', title: `${topic || '未知题材'} · 羁绊篇`, synopsis: `基于「${topic || '创作主题'}」的第三种走向，聚焦群像角色间的情感羁绊，以温情与热血交织的方式呈现主线，适合${audience || '全频'}读者。`, tags: [genre || '通用', '羁绊', '热血'] },
        ],
      } as SynopsisOptionsData,
    })
  }
})

// 2. POST /master-outline — 总纲
router.post('/master-outline', withGeneration('novel', 500), async (req, res) => {
  const { topic, synopsis, genre } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长长篇小说的总纲架构设计。请根据主题、梗概、题材，返回 JSON：{ "premise": 核心设定, "theme": 主题, "volumes": [{ "name": 卷名, "summary": 卷摘要 }], "mainline": 主线脉络, "ending": 结局走向 }。卷数 3-5 卷。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<MasterOutlineData>(sys, JSON.stringify({ topic, synopsis, genre }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
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
      } as MasterOutlineData,
    })
  }
})

// 3. POST /character-relations — 角色关系
router.post('/character-relations', withGeneration('novel', 500), async (req, res) => {
  const { characters, topic } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长梳理小说角色之间的关系网络。请根据角色列表和主题，返回 JSON：{ "relations": [{ "from": 角色名, "to": 角色名, "type": 关系类型(如 朋友/敌人/师徒/恋人/宿敌), "desc": 关系描述 }] }。覆盖主要角色对。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<CharacterRelationsData>(sys, JSON.stringify({ characters, topic }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    const chars: { name: string }[] = Array.isArray(characters) ? characters : []
    const names = chars.map(c => c.name || '').filter(Boolean)
    const fallbackRelations = names.length >= 2
      ? [
          { from: names[0], to: names[1], type: '盟友', desc: `${names[0]} 与 ${names[1]} 因「${topic || '共同目标'}」结成同盟，彼此信任却又各怀心事。` },
          { from: names[1] || '配角', to: names[0], type: '隐秘关联', desc: '表面合作之下，藏着未揭开的过往渊源。' },
        ]
      : [{ from: names[0] || '主角', to: '神秘人', type: '宿敌', desc: `主角与神秘人因「${topic || '旧怨'}」对立。` }]
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: { relations: fallbackRelations } as CharacterRelationsData,
    })
  }
})

// 4. POST /volume-outline — 卷纲
router.post('/volume-outline', withGeneration('novel', 500), async (req, res) => {
  const { volumeName, topic, masterOutline } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长分卷大纲设计。请根据卷名、主题、总纲，返回 JSON：{ "summary": 卷摘要, "chapters": [{ "title": 章名, "summary": 章摘要 }], "arc": 本卷弧光 }。章节数 5-10 章。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<VolumeOutlineData>(sys, JSON.stringify({ volumeName, topic, masterOutline }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        summary: `${volumeName || '本卷'}围绕「${topic || '主线'}」展开，主角在新的环境中遭遇挑战并逐步成长。`,
        chapters: [
          { title: '第1章 · 风起', summary: '卷首开篇，新场景与新人物登场，埋下伏笔。' },
          { title: '第2章 · 暗流', summary: '矛盾初现，主角察觉异常，开始调查。' },
          { title: '第3章 · 试炼', summary: '主角遭遇第一次考验，能力与信念受到冲击。' },
          { title: '第4章 · 联手', summary: '新盟友加入，团队雏形建立。' },
          { title: '第5章 · 反扑', summary: '反派发力，主角陷入困境，卷末钩子显现。' },
        ],
        arc: '从被动卷入到主动出击的成长弧光。',
      } as VolumeOutlineData,
    })
  }
})

// 5. POST /chapter-outline — 章纲
router.post('/chapter-outline', withGeneration('novel', 500), async (req, res) => {
  const { chapterTitle, volumeSummary, topic } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长章节细纲设计。请根据章名、卷摘要、主题，返回 JSON：{ "summary": 本章摘要, "scenes": [{ "location": 场景地点, "description": 场景描述, "dialogue": 关键对白, "mood": 情绪基调 }], "cliffhanger": 章末钩子 }。场景数 3-5 个。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<ChapterOutlineData>(sys, JSON.stringify({ chapterTitle, volumeSummary, topic }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        summary: `${chapterTitle || '本章'}承接「${volumeSummary || '上卷剧情'}」，推进「${topic || '主线'}」发展，关键信息揭示。`,
        scenes: [
          { location: '城镇广场', description: '人群熙攘，主角观察四周，等待接头人。', dialogue: '「你来得比我想的早。」', mood: '紧张' },
          { location: '密室', description: '昏暗灯光下，一份密档摊开在桌上。', dialogue: '「这才是真相的全部吗？」', mood: '悬疑' },
          { location: '城墙之上', description: '夜风凛冽，主角独自眺望远方，陷入沉思。', dialogue: '（内心独白）下一步，该往哪走……', mood: '沉思' },
        ],
        cliffhanger: '一个意想不到的身影出现在主角身后。',
      } as ChapterOutlineData,
    })
  }
})

// 6. POST /continue-text — 续写正文（使用 callLlm）
router.post('/continue-text', async (req, res) => {
  const { text, chapterContext, words } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长小说正文续写。请根据用户提供的文本、章节上下文、目标字数，自然延续故事，保持文风与人物语气一致。直接输出续写内容，不要包含说明、标题或前后缀。'
  try {
    const content = await callLlm(sys, JSON.stringify({ text, chapterContext, words }))
    res.json({ ok: true, data: { content }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        content: `${(text || '').slice(-30)}……\n\n（续写占位）风从远处吹来，卷起地上的落叶。他抬眼望去，前路漫漫，却已没有回头的余地。身后的脚步声由远及近，他握紧了手中的物件，深吸一口气，迈出了下一步。`,
      },
    })
  }
})

// 7. POST /continue-plot — 续写情节
router.post('/continue-plot', withGeneration('novel', 500), async (req, res) => {
  const { text, direction } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长情节推演。请根据用户提供的文本和发展方向，返回 JSON：{ "development": 情节发展描述, "nextScene": 下一场景描述, "tension": 张力值(0-100整数) }。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<ContinuePlotData>(sys, JSON.stringify({ text, direction }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        development: `承接现有文本，情节向「${direction || '未指定方向'}」推进，主角面临新的抉择，矛盾进一步激化。`,
        nextScene: '新的场景在黎明时分展开，关键的对话即将发生。',
        tension: 65,
      } as ContinuePlotData,
    })
  }
})

// 8. POST /book-title — 书名取名（使用 callLlm）
router.post('/book-title', async (req, res) => {
  const { topic, synopsis, genre } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长为小说起吸引人的书名。请根据主题、梗概、题材，生成 5-8 个风格各异的书名候选。直接输出书名，每行一个，不要编号、引号或其他说明。'
  try {
    const text = await callLlm(sys, JSON.stringify({ topic, synopsis, genre }))
    const titles = text
      .split(/\r?\n/)
      .map(t => t.replace(/^[\d.、\-*•·\s"'""]+/, '').replace(/["'""]/g, '').trim())
      .filter(Boolean)
      .slice(0, 8)
    res.json({ ok: true, data: { titles }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        titles: [
          `${(topic || '无题').slice(0, 4)}之约`,
          `${genre || '幻'}境·${(topic || '征程').slice(0, 2)}`,
          `逆流的${(synopsis || '命运').slice(0, 2)}`,
          `终焉之前`,
          `${(topic || '星').slice(0, 1)}与刃`,
        ],
      },
    })
  }
})

// 9. POST /opening-line — 导语（使用 callLlm）
router.post('/opening-line', async (req, res) => {
  const { topic, synopsis, style } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长为小说撰写引人入胜的开篇导语。请根据主题、梗概、风格，生成一段 50-150 字的导语，氛围感强、能勾起阅读欲望。直接输出导语文本，不要包含说明或标题。'
  try {
    const content = await callLlm(sys, JSON.stringify({ topic, synopsis, style }))
    res.json({ ok: true, data: { content }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        content: `所有故事，都从那个寻常又不寻常的清晨开始。\n关于「${topic || '那个主题'}」，关于一段尚未被讲述的命运——风已起，只是无人听见。`,
      },
    })
  }
})

// 10. POST /inspiration — 脑洞灵感
router.post('/inspiration', withGeneration('novel', 500), async (req, res) => {
  const { keyword, genre } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长脑洞创意生成。请根据关键词、题材，生成 3-5 个差异化的创意点子，返回 JSON：{ "ideas": [{ "title": 标题, "synopsis": 梗概(50-100字), "tags": 标签(2-4个) }] }。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<InspirationData>(sys, JSON.stringify({ keyword, genre }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        ideas: [
          { title: `${keyword || '迷雾'} · 倒影之城`, synopsis: `以「${keyword || '关键词'}」为线索，主角发现一座只在镜中存在的城市，那里的居民过着与现实相反的人生。`, tags: [genre || '奇幻', '镜像', '悬疑'] },
          { title: `第七次重启`, synopsis: '世界在某一天突然重启，但只有主角记得一切。第七次重启时，他决定不再只是旁观者。', tags: [genre || '科幻', '时间循环', '反叛'] },
          { title: `赠梦人`, synopsis: '一个能将梦境赠予他人的职业，在一次委托中卷入了不该被梦见的事。', tags: [genre || '脑洞', '梦境', '都市'] },
        ],
      } as InspirationData,
    })
  }
})

// 11. POST /smart-chat — 智能对话（使用 callLlm）
router.post('/smart-chat', async (req, res) => {
  const { message, context, novelInfo } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手「智能蛙」，擅长为小说创作者提供创作建议、剧情推演、设定答疑、卡文突破。请根据用户消息、上下文、小说信息，给出具体、可操作、有启发性的回复。直接输出回复文本，不要包含说明或前后缀。'
  try {
    const content = await callLlm(sys, JSON.stringify({ message, context, novelInfo }))
    res.json({ ok: true, data: { content }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        content: `收到你的问题：「${message || ''}」\n\n这里是一条占位回复。建议从以下三个角度切入：\n1. 梳理当前情节的核心矛盾；\n2. 检查人物动机是否自洽；\n3. 尝试引入一个意外变量打破僵局。\n\n配置 LLM API Key 后，我能给出更具针对性的建议。`,
      },
    })
  }
})

// ==================== 写作板块 WR 工具 ====================

// 12. POST /outline — 大纲生成 (WR-01)
router.post('/outline', async (req, res) => {
  const { topic, style } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长故事大纲设计(WR-01)。请根据主题、风格，返回 JSON：{ "theme": 主题, "acts": [{ "id": 序号, "name": 幕名, "summary": 幕摘要, "beats": 节拍列表(字符串数组) }], "characters": [{ "name": 角色名, "role": 角色定位, "arc": 角色弧光 }] }。幕数 3-5 幕，beats 每幕 3-6 个。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<OutlineData>(sys, JSON.stringify({ topic, style }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
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
      } as OutlineData,
    })
  }
})

// 13. POST /worldview — 世界观 (WR-05)
router.post('/worldview', async (req, res) => {
  const { topic } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长世界观构建(WR-05)。请根据主题，返回 JSON：{ "name": 世界名, "genre": 题材类型, "geography": 地理, "history": 历史, "factions": [{ "name": 势力名, "desc": 描述, "stance": 立场 }], "rules": 规则数组, "culture": 文化, "conflicts": 核心冲突 }。factions 2-4 个，rules 3-6 条。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<WorldviewData>(sys, JSON.stringify({ topic }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
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
      } as WorldviewData,
    })
  }
})

// 14. POST /lorebook — 设定库 (WR-12)
router.post('/lorebook', async (req, res) => {
  const { source, existing } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长从文本中抽取设定词条(WR-12)。请根据源文本和已有词条，返回 JSON：{ "entries": [{ "key": 词条名, "category": 分类(人物/地点/物品/势力/概念/事件), "content": 内容描述, "aliases": 别名数组 }], "existing": 原样回传的已有词条数组 }。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<LorebookData>(sys, JSON.stringify({ source, existing }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        entries: [
          { key: '主角', category: '人物', content: `源自源文本的核心角色，承担主线推动作用。`, aliases: ['主角', '主角名'] },
          { key: '核心场景', category: '地点', content: '故事的主要发生地，具备象征意义。', aliases: ['主城'] },
        ],
        existing: Array.isArray(existing) ? existing : [],
      } as LorebookData,
    })
  }
})

// 15. POST /prompt-helper — Prompt 助手 (WR-19，使用 callLlm)
router.post('/prompt-helper', async (req, res) => {
  const { input, style, ratio } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长将中文自然语言描述转化为高质量的 AI 绘图 Prompt(WR-19)。请根据输入、风格、比例，生成一段英文 Prompt，包含主体、场景、光影、画风、构图、质量增强词。直接输出 Prompt 文本，不要包含说明或前后缀。'
  try {
    const prompt = await callLlm(sys, JSON.stringify({ input, style, ratio }))
    res.json({ ok: true, data: { prompt }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        prompt: `masterpiece, best quality, ${input || 'a subject'}, ${style || 'cinematic style'}, dramatic lighting, detailed background, ${ratio ? `aspect ratio ${ratio}, ` : ''}8k, highly detailed`,
      },
    })
  }
})

// 别名：前端 enhancePrompt 调用 /enhance-prompt
router.post('/enhance-prompt', async (req, res) => {
  const { input, ratio } = req.body || {}
  const sys = '你是 AI 绘图 Prompt 优化助手。将用户的中文描述翻译并扩展为高质量的英文绘图 Prompt，包含主体、场景、光影、构图、风格词。只返回 Prompt 文本。'
  try {
    const prompt = await callLlm(sys, JSON.stringify({ input, ratio }))
    res.json({ ok: true, data: { prompt }, source: 'llm' })
  } catch (e: any) {
    res.json({ ok: false, error: e.message, data: { prompt: input || '' } })
  }
})

// 16. POST /deepseek — DeepSeek 推理 (WR-15)
router.post('/deepseek', async (req, res) => {
  const { situation, options } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长多路径剧情推演(WR-15)。请根据情境和候选选项，返回 JSON：{ "analysis": 局势分析, "paths": [{ "id": 序号, "title": 路径名, "development": 发展推演, "consequence": 后果, "drama": 戏剧性(0-100整数) }], "recommendation": 推荐建议 }。paths 3-5 条。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<DeepseekData>(sys, JSON.stringify({ situation, options }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        analysis: `当前情境：「${situation || '未提供'}」。存在多条可行路径，需在风险与收益间权衡。`,
        paths: [
          { id: 1, title: '正面强攻', development: '直接对抗，速战速决。', consequence: '可能短期内解决问题，但代价高昂。', drama: 80 },
          { id: 2, title: '迂回策略', development: '从侧翼入手，寻找弱点。', consequence: '耗时较长，但风险较低。', drama: 55 },
          { id: 3, title: '借力打力', development: '利用第三方势力达成目标。', consequence: '收益最大，但后续可能受制于人。', drama: 90 },
        ],
        recommendation: '推荐路径 2，兼顾风险控制与目标达成。',
      } as DeepseekData,
    })
  }
})

// 17. POST /style-clone — 文风模仿 (WR-14，使用 callLlm)
router.post('/style-clone', async (req, res) => {
  const { sample, topic } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长模仿文风写作(WR-14)。请先仔细分析样本文风的用词、句式、节奏、修辞特点，然后用相同的文风创作一段符合主题的内容。输出格式：先输出创作内容，然后另起一行输出「文风特征：」开头，后接 2-3 条文风特点总结。'
  try {
    const text = await callLlm(sys, JSON.stringify({ sample, topic }))
    let content = text
    let styleFeatures = '已根据样本的用词、句式与节奏进行模仿创作。'
    const sep = text.split(/文风特征[：:]/)
    if (sep.length >= 2) {
      content = sep[0].trim()
      styleFeatures = sep.slice(1).join(' ').trim()
    }
    res.json({ ok: true, data: { content, styleFeatures }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        content: `（文风模仿占位）关于「${topic || '主题'}」的一段创作，参考了所提供样本的语言风格进行行文。`,
        styleFeatures: '样本展现出鲜明的叙事节奏与意象选择，已尝试在续写中保留这些特征。',
      },
    })
  }
})

// 18. POST /ai-erase — AI 消痕 (WR-18，使用 callLlm)
router.post('/ai-erase', async (req, res) => {
  const { input, intensity } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长消除文本的 AI 生成痕迹(WR-18)。请根据输入文本和强度(light/medium/heavy)，调整用词、句式、节奏，去除模板化表达、"首先其次最后"等套路、过度对仗与排比，使其更自然、更像人类写作。直接输出修改后的文本，不要包含说明或前后缀。'
  try {
    const content = await callLlm(sys, JSON.stringify({ input, intensity }))
    res.json({ ok: true, data: { content, before: input || '' }, source: 'llm' })
  } catch (e: any) {
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        content: input || '（无输入文本）',
        before: input || '',
      },
    })
  }
})

// 19. POST /script — 脚本生成
router.post('/script', async (req, res) => {
  const { topic, style, shots } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长漫剧脚本生成。请根据主题、风格、分镜数，返回 JSON：{ "title": 标题, "synopsis": 简介, "characters": [{ "name": 角色名, "desc": 描述, "role": 定位 }], "scenes": [{ "id": 序号, "location": 地点, "shot": 镜头描述, "description": 场景描述, "dialogue": 对白, "mood": 情绪 }], "genre": 题材 }。scenes 数量按 shots 参数(默认 6)。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<ScriptData>(sys, JSON.stringify({ topic, style, shots }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    const sceneCount = Math.max(1, Math.min(12, Number(shots) || 3))
    const scenes: ScriptScene[] = Array.from({ length: sceneCount }).map((_, i) => ({
      id: i + 1,
      location: i === 0 ? '开场场景' : `场景 ${i + 1}`,
      shot: i % 2 === 0 ? '中景' : '近景',
      description: `关于「${topic || '主题'}」的第 ${i + 1} 个分镜，推进剧情。`,
      dialogue: i === 0 ? `「故事，从这里开始。」` : `「继续。」`,
      mood: ['平静', '紧张', '悬疑', '激烈'][i % 4],
    }))
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: {
        title: `${topic || '新'}脚本`,
        synopsis: `围绕「${topic || '主题'}」展开的${style || '通用'}风格短剧脚本。`,
        characters: [
          { name: '主角', desc: '故事的核心推动者。', role: '主角' },
          { name: '配角', desc: '主角的同伴与对照。', role: '配角' },
        ],
        scenes,
        genre: style || '通用',
      } as ScriptData,
    })
  }
})

// 20. POST /storyboard — 分镜拆解
router.post('/storyboard', async (req, res) => {
  const { script, count } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长将长脚本拆解为分镜列表。请根据脚本和目标数量，返回 JSON 数组：[{ "id": 序号, "location": 地点, "shot": 镜头描述, "description": 场景描述, "dialogue": 对白, "mood": 情绪 }]。按目标数量(count 参数，默认 6)拆分。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<ScriptScene[]>(sys, JSON.stringify({ script, count }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    const sceneCount = Math.max(1, Math.min(20, Number(count) || 3))
    const scenes: ScriptScene[] = Array.from({ length: sceneCount }).map((_, i) => ({
      id: i + 1,
      location: `分镜地点 ${i + 1}`,
      shot: ['全景', '中景', '近景', '特写'][i % 4],
      description: `基于脚本拆解的第 ${i + 1} 个分镜。`,
      dialogue: i % 2 === 0 ? `「对白 ${i + 1}」` : '',
      mood: ['平静', '紧张', '悬疑', '高潮'][i % 4],
    }))
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: scenes,
    })
  }
})

// 21. POST /dialogue — 对白生成
router.post('/dialogue', async (req, res) => {
  const { characters, scene, hint } = req.body || {}
  const sys = '你是 Mank TV 的 AI 创作助手，擅长场景对白创作。请根据角色列表、场景、提示，返回 JSON 数组：[{ "character": 角色名, "line": 台词, "emotion": 情绪(如 平静/激动/愤怒/悲伤/惊喜/恐惧) }]。每角色至少 2 句对白，对话自然、有冲突与节奏。不要包含其他说明文字。'
  try {
    const result = await callLlmJson<DialogueLine[]>(sys, JSON.stringify({ characters, scene, hint }))
    res.json({ ok: true, data: result, source: 'llm' })
  } catch (e: any) {
    const charArr: any[] = Array.isArray(characters) ? characters : []
    const names = charArr.map(c => typeof c === 'string' ? c : c?.name).filter(Boolean)
    const a = names[0] || '角色甲'
    const b = names[1] || '角色乙'
    res.json({
      ok: false,
      source: 'template',
      fallbackReason: e.message,
      error: e.message,
      data: [
        { character: a, line: `你来了。这里的气氛不太对。`, emotion: '平静' },
        { character: b, line: `我知道。所以才来的。`, emotion: '紧张' },
        { character: a, line: `那就别浪费时间了，开始吧。`, emotion: '坚定' },
        { character: b, line: `等等——你确定要这么做？`, emotion: '犹豫' },
      ] as DialogueLine[],
    })
  }
})

export default router
