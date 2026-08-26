// AI漫剧圈 LLM 后端代理
//
// 接入 Pollinations 正式 API（OpenAI 兼容 chat completions）
// 1. 主路径：callLLM → POST https://gen.pollinations.ai/v1/chat/completions
//    需要 .env 配置 POLLINATIONS_API_KEY；模型可选，默认 glm（智谱，适合国内合规）
// 2. 兜底路径：模板生成器（key 未配置 / 调用失败时自动降级，保证稳定产出）
//
// 当 LLM 可用时返回 source='llm'，兜底时返回 source='template'

import 'dotenv/config'
import express from 'express'

const app = express()
const PORT = process.env.PORT || 8787

// Pollinations 配置
const POLLINATIONS_BASE = 'https://gen.pollinations.ai'
const POLLINATIONS_API_KEY = process.env.POLLINATIONS_API_KEY || ''
const POLLINATIONS_MODEL = process.env.POLLINATIONS_MODEL || 'glm'

app.use(express.json({ limit: '2mb' }))
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'ai-manjuquan-llm',
    time: new Date().toISOString(),
    llm: {
      provider: 'pollinations',
      model: POLLINATIONS_MODEL,
      apiKeyConfigured: Boolean(POLLINATIONS_API_KEY),
      endpoint: `${POLLINATIONS_BASE}/v1/chat/completions`,
    },
  })
})

// ==================== LLM 调用（OpenAI 兼容） ====================

const SYSTEM_PROMPT =
  '你是一位资深的中文漫画脚本作家，擅长把简短的主题扩展成结构完整、画面感强的脚本。' +
  '你的输出严格遵守用户指定的格式（通常是 JSON），不附加任何解释、不使用 markdown 代码块。' +
  '画面描述要具象可视化，适合直接交给 AI 绘图模型使用。'

async function callLLM(prompt, opts = {}) {
  const { seed, timeoutMs = 60000, maxRetries = 1 } = opts

  if (!POLLINATIONS_API_KEY) {
    throw new Error('POLLINATIONS_API_KEY 未配置（请复制 server/.env.example 为 .env 并填入 key）')
  }

  const body = {
    model: POLLINATIONS_MODEL,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    temperature: 0.9,
    // 部分模型支持 seed，统一传不影响兼容
    ...(seed != null ? { seed } : {}),
  }

  let lastErr
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), timeoutMs)
      const res = await fetch(`${POLLINATIONS_BASE}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${POLLINATIONS_API_KEY}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      clearTimeout(timer)

      if (!res.ok) {
        const errText = await res.text().catch(() => '')
        throw new Error(`LLM HTTP ${res.status} ${errText.slice(0, 160)}`)
      }

      const data = await res.json()
      const text = data?.choices?.[0]?.message?.content || ''
      if (!text || text.length < 5) throw new Error('LLM 返回空')
      return text
    } catch (e) {
      lastErr = e
      if (attempt < maxRetries) {
        await new Promise((r) => setTimeout(r, 1200))
      }
    }
  }
  throw lastErr || new Error('LLM 调用失败')
}

function extractJSON(text) {
  let t = text.trim()
  const codeBlock = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) t = codeBlock[1].trim()
  const startIdx = t.search(/[{[]/)
  const lastBrace = t.lastIndexOf('}')
  const lastBracket = t.lastIndexOf(']')
  const endIdx = Math.max(lastBrace, lastBracket)
  if (startIdx >= 0 && endIdx > startIdx) {
    t = t.slice(startIdx, endIdx + 1)
  }
  t = t.replace(/,(\s*[}\]])/g, '$1')
  return JSON.parse(t)
}

// ==================== 模板生成器（兜底） ====================

function detectGenre(topic) {
  const t = topic.toLowerCase()
  if (/赛博|机甲|科幻|未来|ai|机器人|太空|星际|末世/.test(t)) return 'scifi'
  if (/古风|仙侠|水墨|宫廷|江湖|侠客|武侠|仙|道/.test(t)) return 'ancient'
  if (/校园|学生|青春|恋爱|日常|少女|少年/.test(t)) return 'campus'
  if (/悬疑|推理|侦探|凶杀|迷案/.test(t)) return 'mystery'
  if (/萌|可爱|治愈|童话|小动物|猫咪/.test(t)) return 'cute'
  if (/恐怖|鬼|惊悚|诡异|灵异/.test(t)) return 'horror'
  if (/美食|料理|厨房|味道/.test(t)) return 'food'
  return 'general'
}

const TEMPLATES = {
  scifi: {
    titlePrefix: '霓虹纪元',
    synopsis: (t) => `在霓虹笼罩的未来都市，关于"${t}"的故事悄然展开，少女与机甲的命运交织。`,
    characters: [
      { name: '艾莉', desc: '银发机甲少女，眼神坚定，左臂是机械义肢', role: '主角' },
      { name: 'K', desc: '神秘黑客，黑色风衣，永远戴着全息面罩', role: '配角' },
      { name: '博士', desc: '年迈科学家，白发，实验室白袍', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '霓虹街道', shot: '远景', description: `${t}，雨夜霓虹街道，全息广告牌闪烁，机甲少女艾莉独行，金属反光`, dialogue: '又是这样的夜晚…', mood: '孤独' },
      { id: 2, location: '地下工作室', shot: '中景', description: '赛博朋克地下工作室，K 在多屏全息终端前回身，蓝色光线打在风衣上', dialogue: '艾莉，你来了。计划准备好了。', mood: '紧张' },
      { id: 3, location: '高空天台', shot: '近景', description: '艾莉站在天台边缘，俯瞰未来都市夜景，机械左臂握拳，风掀起银发', dialogue: '这一次，由我来改写。', mood: '决意' },
      { id: 4, location: '核心机房', shot: '特写', description: '巨型 AI 核心机房，红色警报灯闪烁，艾莉的机械手伸向控制台', dialogue: '系统，结束这一切。', mood: '高潮' },
      { id: 5, location: '黎明街道', shot: '远景', description: '雨后初晴的未来都市黎明，艾莉背身走向朝阳，机甲沾满硝烟却步伐坚定', dialogue: '新的开始。', mood: '希望' },
      { id: 6, location: '工作室', shot: '中景', description: 'K 在工作室看着艾莉离开的方向，全息屏幕上显示新任务，嘴角微扬', dialogue: '下次见，搭档。', mood: '余韵' },
    ],
  },
  ancient: {
    titlePrefix: '墨韵',
    synopsis: (t) => `水墨山水间，"${t}"的故事徐徐展开，侠骨柔情，江湖路远。`,
    characters: [
      { name: '云溪', desc: '白衣剑客，长发如墨，眉目清冷', role: '主角' },
      { name: '青萝', desc: '青衣女子，手持纸伞，眼含秋水', role: '配角' },
      { name: '老叟', desc: '白须老者，蓑衣斗笠，腰悬酒葫芦', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '云雾山道', shot: '远景', description: `${t}，水墨云雾缭绕的山道，白衣剑客云溪独行，远处群山含黛`, dialogue: '（鸟鸣，溪声）', mood: '空灵' },
      { id: 2, location: '竹林小筑', shot: '中景', description: '青衣女子青萝在竹林小筑前煮茶，纸伞斜倚，云溪踏月而至', dialogue: '云溪兄，茶已备好。', mood: '温润' },
      { id: 3, location: '江畔', shot: '近景', description: '江畔月夜，云溪负剑独立，衣袂翻飞，倒影映在波光粼粼的江面', dialogue: '江湖路远，此去经年。', mood: '怅然' },
      { id: 4, location: '古战场', shot: '特写', description: '残破古战场，剑光如雪，云溪出鞘，落叶纷飞间一剑封喉', dialogue: '（剑鸣）', mood: '凌厉' },
      { id: 5, location: '雪山之巅', shot: '远景', description: '雪山之巅，云溪与青萝并肩远眺，云海翻涌，朝阳初升', dialogue: '此生，有你足矣。', mood: '释然' },
      { id: 6, location: '小筑', shot: '中景', description: '竹林小筑，青萝缝衣，云溪磨剑，烟火气与江湖气并存', dialogue: '（炉火，磨剑声）', mood: '归隐' },
    ],
  },
  campus: {
    titlePrefix: '那年',
    synopsis: (t) => `关于"${t}"的青春物语，阳光、教室与未说出口的心事。`,
    characters: [
      { name: '小夏', desc: '高中生，短发校服，笑起来有酒窝', role: '主角' },
      { name: '林同学', desc: '同桌，戴眼镜，安静寡言，成绩优异', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '教室', shot: '中景', description: `${t}，午后教室阳光斜照，小夏趴在课桌上午睡，窗外蝉鸣`, dialogue: '（蝉鸣，风铃声）', mood: '慵懒' },
      { id: 2, location: '走廊', shot: '近景', description: '放学后空荡走廊，林同学抱书经过，余光瞥见小夏，脚步顿住', dialogue: '今天…也要一起走吗？', mood: '心动' },
      { id: 3, location: '操场', shot: '远景', description: '黄昏操场，小夏独自跑圈，校服被夕阳染金，影子拉长', dialogue: '再跑一圈。', mood: '倔强' },
      { id: 4, location: '天台', shot: '近景', description: '学校天台，两人并肩坐着，分享一罐汽水，远处城市灯火亮起', dialogue: '其实…我一直想跟你说。', mood: '温柔' },
      { id: 5, location: '校门口', shot: '中景', description: '毕业季校门口，樱花纷飞，两人相视而笑，手里攥着毕业册', dialogue: '以后，也要常联系啊。', mood: '不舍' },
    ],
  },
  mystery: {
    titlePrefix: '雾中',
    synopsis: (t) => `迷雾笼罩的小镇，"${t}"背后的真相逐层剥开。`,
    characters: [
      { name: '陆侦探', desc: '风衣侦探，叼着烟斗，目光如鹰', role: '主角' },
      { name: '证人', desc: '颤抖的女子，红围巾，神情慌张', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '雾夜街角', shot: '远景', description: `${t}，浓雾笼罩的街角，路灯昏黄，陆侦探踏雾而来，风衣翻飞`, dialogue: '雾，总会散的。', mood: '悬疑' },
      { id: 2, location: '案发现场', shot: '中景', description: '老式书房，地上散落文件，陆侦探蹲下检查地毯上的痕迹', dialogue: '这里，有人撒了谎。', mood: '紧绷' },
      { id: 3, location: '审讯室', shot: '近景', description: '昏暗审讯室，证人红围巾紧裹，陆侦探的烟斗烟雾缭绕', dialogue: '那晚…我真的什么都不知道。', mood: '压抑' },
      { id: 4, location: '档案室', shot: '特写', description: '陈旧档案室，陆侦探翻开泛黄卷宗，一张老照片滑落', dialogue: '（翻页声）原来如此。', mood: '真相' },
      { id: 5, location: '雨夜码头', shot: '远景', description: '雨夜码头，真相揭晓，陆侦探目送某人远去，烟斗燃尽', dialogue: '案子结了。但有些人，回不来了。', mood: '怅然' },
    ],
  },
  cute: {
    titlePrefix: '软糖',
    synopsis: (t) => `一颗软糖般的治愈小故事，关于"${t}"的温柔日常。`,
    characters: [
      { name: '小奶', desc: '圆脸小女孩，扎双马尾，穿背带裤', role: '主角' },
      { name: '橘橘', desc: '橘色胖猫，眼神慵懒，肚子圆滚滚', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '客厅', shot: '中景', description: `${t}，温馨客厅洒满午后阳光，小奶抱着橘橘蹭脸，猫咪眯眼`, dialogue: '橘橘～你最软啦！', mood: '治愈' },
      { id: 2, location: '厨房', shot: '近景', description: '小厨房，小奶踩凳子搅拌面糊，橘橘踮脚偷舔奶油', dialogue: '橘橘！不可以！', mood: '俏皮' },
      { id: 3, location: '阳台', shot: '远景', description: '傍晚阳台，小奶和橘橘依偎看夕阳，毛毯裹着两个圆滚滚的身影', dialogue: '今天的云，像棉花糖。', mood: '温柔' },
      { id: 4, location: '卧室', shot: '特写', description: '夜晚卧室，小奶睡着了，橘橘蜷在她枕边，月光洒下', dialogue: '（呼吸声，秒针）', mood: '安宁' },
    ],
  },
  horror: {
    titlePrefix: '夜话',
    synopsis: (t) => `当夜色降临，关于"${t}"的诡异传闻开始低语…`,
    characters: [
      { name: '阿清', desc: '都市青年，黑眼圈，手持手电筒', role: '主角' },
      { name: '低语', desc: '不可名状的存在，仅以声音出现', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '老宅门口', shot: '远景', description: `${t}，月光惨白，废弃老宅门半掩，阿清手电光刺破黑暗`, dialogue: '（吱呀—）', mood: '诡异' },
      { id: 2, location: '走廊', shot: '中景', description: '老宅走廊墙皮剥落，画像的眼睛似在转动，手电光扫过', dialogue: '谁…在那里？', mood: '紧绷' },
      { id: 3, location: '镜前', shot: '近景', description: '布满裂纹的镜子，镜中倒影比阿清慢半拍地回头', dialogue: '（镜面碎裂声）', mood: '惊悚' },
      { id: 4, location: '地下室', shot: '特写', description: '潮湿地下室，蜡烛摇曳，一本翻开的旧日记上字迹渗血', dialogue: '「别回头。」', mood: '窒息' },
      { id: 5, location: '黎明门口', shot: '远景', description: '黎明老宅门口，阿清踉跄而出，身后老宅在晨光中化作尘烟', dialogue: '终于…结束了。', mood: '余悸' },
    ],
  },
  food: {
    titlePrefix: '味蕾',
    synopsis: (t) => `关于"${t}"的暖心故事，烟火气里藏着人间百味。`,
    characters: [
      { name: '老陈', desc: '中年大厨，围裙系带，眼神专注', role: '主角' },
      { name: '小徒弟', desc: '年轻学徒，眼神崇拜，手持笔记本', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '清晨菜场', shot: '远景', description: `${t}，清晨菜场薄雾未散，老陈挑拣新鲜食材，露珠晶莹`, dialogue: '好料，才有好味。', mood: '专注' },
      { id: 2, location: '厨房', shot: '中景', description: '中式厨房灶火腾跃，老陈颠勺翻炒，油烟升腾，火光映脸', dialogue: '火候，是灵魂。', mood: '热烈' },
      { id: 3, location: '餐桌', shot: '近景', description: '木质餐桌，菜品摆盘精致，蒸汽袅袅，食客闭眼细嗅', dialogue: '这一口，是家的味道。', mood: '温暖' },
      { id: 4, location: '后厨', shot: '特写', description: '深夜后厨，老陈独自擦拭刀具，月光透过窗格洒下', dialogue: '（刀具擦拭声）', mood: '传承' },
    ],
  },
  general: {
    titlePrefix: '故事',
    synopsis: (t) => `一个关于"${t}"的故事，平凡中见真章。`,
    characters: [
      { name: '主角', desc: '神情坚毅，目光望向远方', role: '主角' },
      { name: '伙伴', desc: '忠实同行者，微笑相伴', role: '配角' },
    ],
    scenes: (t) => [
      { id: 1, location: '起点', shot: '远景', description: `${t}，主角站在故事起点，前景空旷，目光望向远方`, dialogue: '一切，从这里开始。', mood: '启程' },
      { id: 2, location: '途中', shot: '中景', description: '旅途中的主角与伙伴并肩前行，背景是绵延的路', dialogue: '一起走吧。', mood: '同行' },
      { id: 3, location: '转折', shot: '近景', description: '主角面遇困境，眉头紧锁，光影明暗对比强烈', dialogue: '不能就这样放弃。', mood: '坚持' },
      { id: 4, location: '高潮', shot: '特写', description: '关键时刻，主角眼神坚定，手部特写握紧拳头', dialogue: '就是现在！', mood: '爆发' },
      { id: 5, location: '终点', shot: '远景', description: '故事终章，主角回望来路，朝阳初升，前景开阔', dialogue: '原来，这就是答案。', mood: '释怀' },
    ],
  },
}

function generateScriptFromTemplate(topic, style, shots) {
  const genre = detectGenre(topic)
  const tpl = TEMPLATES[genre] || TEMPLATES.general
  const allScenes = tpl.scenes(topic)
  const scenes = allScenes.slice(0, Math.max(1, Math.min(shots || 5, allScenes.length)))
  return {
    title: `${tpl.titlePrefix}·${topic.slice(0, 6)}`,
    synopsis: tpl.synopsis(topic),
    characters: tpl.characters,
    scenes,
    genre,
  }
}

function generateStoryboardFromTemplate(script, count) {
  // 从脚本文本提取关键句，拆成分镜
  const sentences = String(script)
    .split(/[。！？\n.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5)
  const n = Math.max(2, Math.min(count || 6, sentences.length || 6))
  const shots = []
  for (let i = 0; i < n; i++) {
    const s = sentences[i] || `第 ${i + 1} 个画面`
    shots.push({
      id: i + 1,
      location: '场景' + (i + 1),
      shot: ['远景', '中景', '近景', '特写'][i % 4],
      description: s + '，画面构图饱满，光影层次丰富，细节生动',
      dialogue: '',
      mood: ['启程', '同行', '坚持', '爆发', '释怀'][i % 5],
    })
  }
  return shots
}

function generateDialogueFromTemplate(characters, scene) {
  const chars = Array.isArray(characters)
    ? characters.map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean)
    : ['主角']
  const list = chars.length ? chars : ['主角']
  const emotions = ['平静', '激动', '温柔', '坚定', '怅然']
  const lines = []
  const turn = Math.max(2, Math.min(4, list.length * 2))
  for (let i = 0; i < turn; i++) {
    const name = list[i % list.length]
    lines.push({
      character: name,
      line: `（${scene.slice(0, 8)}）这件事，我们得一起面对。`,
      emotion: emotions[i % emotions.length],
    })
  }
  return lines
}

// ==================== 业务端点 ====================

app.post('/api/llm/script', async (req, res) => {
  const { topic, style = '通用', shots = 5 } = req.body || {}
  if (!topic || typeof topic !== 'string') {
    return res.status(400).json({ ok: false, error: '缺少主题 topic' })
  }

  // 主路径：尝试 LLM
  try {
    const prompt = `你是资深漫画脚本作家。基于主题"${topic}"（风格${style}）创作短篇漫画脚本。严格以 JSON 输出（不要 markdown），结构：{"title":"标题","synopsis":"简介","characters":[{"name":"角色名","desc":"描述","role":"主角/配角"}],"scenes":[{"id":1,"location":"场景","shot":"景别","description":"画面描述(适合AI绘图)","dialogue":"对白","mood":"氛围"}]}。中文，画面描述要具象可视化，至少${shots}个分镜，直接输出JSON：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    // 兜底：模板生成器
    const data = generateScriptFromTemplate(topic, style, shots)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

app.post('/api/llm/storyboard', async (req, res) => {
  const { script, count = 6 } = req.body || {}
  if (!script) {
    return res.status(400).json({ ok: false, error: '缺少脚本 script' })
  }
  try {
    const prompt = `把下面脚本拆成${count}个漫画分镜。脚本：${script}。严格以JSON数组输出(不要markdown)：[{"id":1,"location":"场景","shot":"景别","description":"画面描述(适合AI绘图)","dialogue":"对白","mood":"氛围"}]。中文，直接输出JSON数组：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateStoryboardFromTemplate(script, count)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

app.post('/api/llm/dialogue', async (req, res) => {
  const { characters, scene, hint } = req.body || {}
  if (!characters || !scene) {
    return res.status(400).json({ ok: false, error: '缺少角色 characters 或场景 scene' })
  }
  const charList = Array.isArray(characters)
    ? characters.map((c) => c.name || c).join('、')
    : String(characters)
  try {
    const prompt = `基于角色(${charList})与场景(${scene})${hint ? '，要求' + hint : ''}，生成符合角色性格的对白。严格以JSON数组输出(不要markdown)：[{"character":"角色名","line":"对白","emotion":"情绪"}]。中文，对白口语化，每条20字内，直接输出JSON数组：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateDialogueFromTemplate(characters, scene)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

app.post('/api/llm/enhance-prompt', async (req, res) => {
  const { input } = req.body || {}
  if (!input) {
    return res.status(400).json({ ok: false, error: '缺少输入 input' })
  }
  try {
    const prompt = `把这句中文优化为高质量AI绘图Prompt(中文为主，含主体/动作/环境/光影/风格/质量词，50-100字)，不要markdown，直接输出：${input}`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const clean = text.trim().replace(/^[""""']|[""""']$/g, '').split('\n')[0]
    return res.json({ ok: true, data: { prompt: clean }, source: 'llm' })
  } catch (e) {
    // 兜底：简单包装
    const enhanced = `${input}，精致细节，柔和光影，电影质感，8k 高清，构图饱满`
    return res.json({ ok: true, data: { prompt: enhanced }, source: 'template', fallbackReason: e.message })
  }
})

// ==================== 写作板块 8 个 WR 工具 ====================

// WR-01 大纲生成：主题 + 风格 → 起承转合四幕大纲
app.post('/api/llm/outline', async (req, res) => {
  const { topic, style = '通用' } = req.body || {}
  if (!topic) return res.status(400).json({ ok: false, error: '缺少主题 topic' })
  try {
    const prompt = `你是资深故事策划。基于主题"${topic}"（风格${style}）生成四幕剧大纲。严格以JSON输出(不要markdown)：{"theme":"主题","acts":[{"id":1,"name":"起","summary":"本幕概述","beats":["关键节点1","关键节点2","关键节点3"]},{"id":2,"name":"承","summary":"","beats":[]},{"id":3,"name":"转","summary":"","beats":[]},{"id":4,"name":"合","summary":"","beats":[]}],"characters":[{"name":"角色名","role":"主角/配角","arc":"人物弧光"}]}。中文，每幕beats至少3条，直接输出JSON：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateOutlineFromTemplate(topic, style)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-05 世界观生成：主题 → 地理/历史/势力/规则
app.post('/api/llm/worldview', async (req, res) => {
  const { topic } = req.body || {}
  if (!topic) return res.status(400).json({ ok: false, error: '缺少主题 topic' })
  try {
    const prompt = `你是世界观架构师。基于主题"${topic}"构建完整世界观。严格以JSON输出(不要markdown)：{"name":"世界观名称","genre":"类型","geography":"地理设定","history":"历史背景","factions":[{"name":"势力名","desc":"描述","stance":"阵营"}],"rules":["规则1","规则2","规则3"],"culture":"文化风俗","conflicts":"核心矛盾"}。中文，直接输出JSON：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateWorldviewFromTemplate(topic)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-12 Lorebook 设定库：基于脚本/世界观抽取词条
app.post('/api/llm/lorebook', async (req, res) => {
  const { source, existing = [] } = req.body || {}
  if (!source) return res.status(400).json({ ok: false, error: '缺少源文本 source' })
  try {
    const prompt = `从下列文本抽取世界观/角色/术语词条构建Lorebook设定库。文本：${source}。严格以JSON数组输出(不要markdown)：[{"key":"词条名","category":"角色/地点/物品/术语/势力","content":"详细描述","aliases":["别名1","别名2"]}]。中文，至少5条，直接输出JSON数组：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data: { entries: data, existing }, source: 'llm' })
  } catch (e) {
    const data = generateLorebookFromTemplate(source, existing)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-19 Prompt 助手：自然语言 → 完整 AI 绘图 Prompt（多风格预设）
app.post('/api/llm/prompt-helper', async (req, res) => {
  const { input, style = '通用', ratio } = req.body || {}
  if (!input) return res.status(400).json({ ok: false, error: '缺少输入 input' })
  try {
    const prompt = `把下列自然语言转换为高质量AI绘图Prompt。输入：${input}。风格：${style}。比例：${ratio || '1:1'}。要求：中文为主，含主体/动作/服饰/环境/光影/构图/风格/质量词，80-150字。不要markdown，直接输出Prompt文本：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const clean = text.trim().replace(/^[""""']|[""""']$/g, '').split('\n')[0]
    return res.json({ ok: true, data: { prompt: clean }, source: 'llm' })
  } catch (e) {
    const data = { prompt: generatePromptFromTemplate(input, style) }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-15 DeepSeek 推理：复杂剧情节点推理（多路径选择）
app.post('/api/llm/deepseek', async (req, res) => {
  const { situation, options = [] } = req.body || {}
  if (!situation) return res.status(400).json({ ok: false, error: '缺少情境 situation' })
  try {
    const optsStr = options.length ? `可选路径：${options.join(' / ')}` : '请生成3条可能的发展路径'
    const prompt = `你是剧情推理专家。情境：${situation}。${optsStr}。严格以JSON输出(不要markdown)：{"analysis":"局势分析","paths":[{"id":1,"title":"路径标题","development":"发展推演","consequence":"后果预测","drama":"戏剧张力评分1-10"}],"recommendation":"推荐路径及理由"}。中文，至少3条路径，直接输出JSON：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateDeepseekFromTemplate(situation, options)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-14 文风模仿：上传样本文本 → 模仿文风生成新段落
app.post('/api/llm/style-clone', async (req, res) => {
  const { sample, topic } = req.body || {}
  if (!sample || !topic) return res.status(400).json({ ok: false, error: '缺少样本 sample 或主题 topic' })
  try {
    const prompt = `分析以下样本文本的文风（句式/节奏/用词/语气），然后以相同文风围绕"${topic}"创作一段200字左右的文字。样本：${sample}。不要markdown，直接输出创作文本：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const clean = text.trim().replace(/^[""""']|[""""']$/g, '')
    return res.json({ ok: true, data: { content: clean, styleFeatures: '（模板兜底未提取文风特征）' }, source: 'llm' })
  } catch (e) {
    const data = { content: generateStyleCloneFromTemplate(sample, topic), styleFeatures: '句式紧凑，节奏明快，常用白描' }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// WR-18 AI 消痕：把 AI 文本改写为更像人写的（去机审痕迹）
app.post('/api/llm/ai-erase', async (req, res) => {
  const { input, intensity = 'medium' } = req.body || {}
  if (!input) return res.status(400).json({ ok: false, error: '缺少输入 input' })
  try {
    const lvl = { light: '轻度改写（保持80%原文）', medium: '中度改写（保持60%原文，调整句式）', heavy: '深度改写（保持40%原文，重组段落）' }[intensity] || '中度改写'
    const prompt = `把下列AI痕迹明显的文本改写得更像人写的，要求${lvl}。原文：${input}。不要markdown，直接输出改写后的文本：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const clean = text.trim().replace(/^[""""']|[""""']$/g, '')
    return res.json({ ok: true, data: { content: clean, before: input }, source: 'llm' })
  } catch (e) {
    const data = { content: generateAIEraseFromTemplate(input, intensity), before: input }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// ==================== 写作板块模板生成器（兜底） ====================

function generateOutlineFromTemplate(topic, style) {
  const genre = detectGenre(topic)
  const tpl = TEMPLATES[genre] || TEMPLATES.general
  const chars = tpl.characters.map((c) => ({ name: c.name, role: c.role, arc: `${c.name}从${c.role === '主角' ? '平凡' : '边缘'}走向${c.role === '主角' ? '觉醒' : '归处'}` }))
  return {
    theme: `${style}·${topic}`,
    acts: [
      { id: 1, name: '起', summary: `${topic}的故事从一个平凡的瞬间开始，主角被卷入未知`, beats: ['开场建立日常', '触发事件出现', '主角被动卷入'] },
      { id: 2, name: '承', summary: '主角在探索中遇到同伴，逐渐理解世界规则', beats: ['结识关键伙伴', '揭示世界观设定', '初次试错与成长'] },
      { id: 3, name: '转', summary: '危机降临，主角面对艰难抉择与背叛', beats: ['突发变故', '内心挣扎与抉择', '反派真容浮现'] },
      { id: 4, name: '合', summary: '高潮决战与新秩序的建立', beats: ['终极对决', '代价与牺牲', '新的平衡与未来'] },
    ],
    characters: chars,
  }
}

function generateWorldviewFromTemplate(topic) {
  const genre = detectGenre(topic)
  const presets = {
    scifi: { name: '霓虹纪元', geography: '垂直分层的未来都市，上层浮空区，下层贫民窟', history: '第三次能源战争后，AI 与人类达成脆弱共存', factions: [{ name: '云端议会', desc: '统治浮空区的寡头集团', stance: '统治' }, { name: '地下街帮', desc: '下层贫民窟的反抗者', stance: '反抗' }], rules: ['AI 不得拥有私人记忆', '下层居民禁用全息终端', '机械义体需注册'], culture: '霓虹美学，全息广告，机械义体普及', conflicts: '人类与 AI 的边界之争' },
    ancient: { name: '云岚大陆', geography: '九州四海，名山大川，仙凡两界相邻', history: '上古封神之后，灵气稀薄，宗门并起', factions: [{ name: '清虚剑宗', desc: '正道之首，剑修大宗', stance: '正道' }, { name: '幽冥司', desc: '亦正亦邪的暗影组织', stance: '中立' }], rules: ['修士不得干预凡人王朝', '法宝传承需经天劫', '魔修禁用血祭'], culture: '飞剑御空，符箓镇邪，茶酒诗书并行', conflicts: '正魔之争与天机将变' },
    campus: { name: '青樟镇', geography: '南方小镇，有百年中学与静谧老街', history: '解放前是文人聚集地，抗战时改作中学', factions: [{ name: '学生会', desc: '校园权力中枢', stance: '秩序' }, { name: '文学社', desc: '游离主流之外的小团体', stance: '自由' }], rules: ['学生社团需指导老师', '考试周自习室通宵开放', '禁止公开表白'], culture: '蝉鸣盛夏，毕业季樱花，巷口奶茶店', conflicts: '青春理想与成人规则的拉扯' },
    general: { name: '泛世界', geography: '广袤大陆，多个城邦与荒野并存', history: '千年和平后，暗流涌动', factions: [{ name: '城邦联盟', desc: '维护秩序的松散同盟', stance: '秩序' }, { name: '流亡者', desc: '被遗忘的边缘群体', stance: '反抗' }], rules: ['魔法需登记', '商队通行需持牌', '黑夜禁出城门'], culture: '多元并存，集市繁盛', conflicts: '旧秩序与新势力的对决' },
  }
  const p = presets[genre] || presets.general
  return {
    name: p.name,
    genre,
    geography: p.geography,
    history: p.history,
    factions: p.factions,
    rules: p.rules,
    culture: p.culture,
    conflicts: p.conflicts,
  }
}

function generateLorebookFromTemplate(source, existing) {
  // 简单关键词提取（兜底）：从源文本里抓名词短语
  const entries = []
  const known = new Set((existing || []).map((e) => e.key))
  const chars = (String(source).match(/[一二三四五六七八九十百千]?[男女老少青]?(?:主角|配角|角色|剑客|少女|少年|侦探|侠客|教授|博士|猫|狗)/g) || [])
  const places = (String(source).match(/[\u4e00-\u9fa5]{2,4}(?:街道|山|海|城|林|宫|阁|殿|镇|村|界|区)/g) || [])
  const all = [...new Set([...chars, ...places])].slice(0, 8)
  all.forEach((key) => {
    if (known.has(key)) return
    entries.push({
      key,
      category: /街道|山|海|城|林|宫|阁|殿|镇|村|界|区/.test(key) ? '地点' : '角色',
      content: `从源文本中提取的${/街道|山|海|城|林|宫|阁|殿|镇|村|界|区/.test(key) ? '地点' : '角色'}：${key}，详细信息待 LLM 接入后补充。`,
      aliases: [],
    })
  })
  if (entries.length === 0) {
    entries.push({ key: '主角', category: '角色', content: '故事的中心人物，由主题推导。', aliases: ['主人公'] })
    entries.push({ key: '世界', category: '术语', content: '故事发生的世界观总称。', aliases: [] })
  }
  return { entries, existing }
}

function generatePromptFromTemplate(input, style) {
  const styleMap = {
    '科幻赛博': '赛博朋克风格，霓虹灯，雨夜，机械义体，电影质感',
    '古风仙侠': '水墨风格，山水留白，衣袂飘飘，剑光如雪',
    '校园青春': '日系动漫风格，午后阳光，校园场景，柔和光影',
    '悬疑推理': '冷峻色调，雾气笼罩，光影对比强烈，悬疑氛围',
    '萌系治愈': '治愈系插画，柔和色调，圆润线条，温馨氛围',
    '惊悚恐怖': '暗黑风格，月光惨白，氛围压抑，高对比度',
    '美食': '美食摄影风格，热气腾腾，色彩饱和，特写镜头',
    '通用': '电影质感，柔和光影，构图饱满',
  }
  const styleHint = styleMap[style] || styleMap['通用']
  return `${input}，${styleHint}，8k 高清，细节丰富，专业级构图`
}

function generateDeepseekFromTemplate(situation, options) {
  const opts = options.length ? options : ['正面突破', '迂回策略', '以退为进']
  return {
    analysis: `当前情境为"${situation}"，存在多个潜在发展方向，需评估各路径的戏剧张力与后续可延展性。`,
    paths: opts.slice(0, 3).map((o, i) => ({
      id: i + 1,
      title: o,
      development: `选择"${o}"路径后，故事向${['冲突升级', '节奏舒缓', '反转铺垫'][i % 3]}方向推进，主角将面临${['外部威胁', '内心挣扎', '关系考验'][i % 3]}。`,
      consequence: `后续可能引出${['更大危机', '新角色登场', '世界观扩展'][i % 3]}，并为高潮埋下伏笔。`,
      drama: 6 + i,
    })),
    recommendation: `推荐"${opts[0]}"路径：戏剧张力较高且符合主题走向，能为后续剧情提供清晰的延展空间。`,
  }
}

function generateStyleCloneFromTemplate(sample, topic) {
  // 兜底：直接拼接样本片段 + 主题
  const sampleSnippet = String(sample).slice(0, 60).replace(/\s+/g, '')
  return `${sampleSnippet}……${topic}的故事，就在这样的笔触里展开，字里行间有着相似的温度与节奏。`
}

function generateAIEraseFromTemplate(input, intensity) {
  const text = String(input)
  if (intensity === 'light') {
    // 轻度：替换部分虚词
    return text
      .replace(/因此/g, '所以')
      .replace(/此外/g, '另外')
      .replace(/综上所述/g, '总之')
      .replace(/首先/g, '先说')
      .replace(/其次/g, '再说')
      .replace(/最后/g, '至于最后')
  }
  if (intensity === 'heavy') {
    // 深度：重组句子顺序，分段
    const sentences = text.split(/[。！？\n.!?]+/).filter((s) => s.trim())
    const shuffled = [...sentences].reverse()
    return shuffled.join('。') + '。'
  }
  // 中度：调整句式
  return text
    .replace(/([^。！？\n]+)。/g, '$1。')
    .replace(/然而/g, '不过')
    .replace(/虽然/g, '虽说')
    .replace(/因为/g, '毕竟')
    .replace(/所以/g, '于是')
}


// ==================== 蛙蛙写作对标：小说编辑器端点 ====================

// 三选一故事梗概（一句话 → 3 个方案）
app.post('/api/llm/synopsis-options', async (req, res) => {
  const { topic, genre = '通用', audience = '全频', pov = '第三人称', length = '长篇' } = req.body || {}
  if (!topic) return res.status(400).json({ ok: false, error: '缺少主题 topic' })
  try {
    const prompt = `你是爆款小说策划。基于一句话"${topic}"（题材${genre}，受众${audience}，视角${pov}，${length}），生成3个不同走向的故事梗概方案。每个方案包含：title（书名）、synopsis（200字梗概）、tags（标签数组）。返回JSON：{"options":[{"id":"A","title":"","synopsis":"","tags":[]},...]}。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateSynopsisOptionsFromTemplate(topic, genre)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 生成总纲
app.post('/api/llm/master-outline', async (req, res) => {
  const { topic, synopsis = '', genre = '通用' } = req.body || {}
  if (!topic) return res.status(400).json({ ok: false, error: '缺少主题 topic' })
  try {
    const prompt = `你是小说总纲策划。基于主题"${topic}"和梗概"${synopsis}"（题材${genre}），生成完整总纲。包含：premise（核心设定）、theme（主题）、volumes（卷数规划，每卷含name和summary）、mainline（主线脉络3-5句）、ending（结局方向）。返回JSON。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateMasterOutlineFromTemplate(topic, genre)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 生成角色关系
app.post('/api/llm/character-relations', async (req, res) => {
  const { characters = [], topic = '' } = req.body || {}
  if (!characters.length) return res.status(400).json({ ok: false, error: '缺少角色列表 characters' })
  try {
    const prompt = `基于角色列表${JSON.stringify(characters)}和主题"${topic}"，生成角色关系图。返回JSON：{"relations":[{"from":"角色名","to":"角色名","type":"关系类型(盟友/敌对/师徒/恋人/血缘等)","desc":"关系描述"}]}。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateCharacterRelationsFromTemplate(characters)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 生成卷纲
app.post('/api/llm/volume-outline', async (req, res) => {
  const { volumeName = '第一卷', topic = '', masterOutline = '' } = req.body || {}
  try {
    const prompt = `为小说卷"${volumeName}"（主题${topic}）生成卷纲。包含：summary（卷梗概）、chapters（章节数3-10，每章含title和summary）、arc（本卷角色弧光）。返回JSON。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateVolumeOutlineFromTemplate(volumeName, topic)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 生成章纲
app.post('/api/llm/chapter-outline', async (req, res) => {
  const { chapterTitle = '第一章', volumeSummary = '', topic = '' } = req.body || {}
  try {
    const prompt = `为章节"${chapterTitle}"（卷梗概${volumeSummary}，主题${topic}）生成章纲。包含：summary（章梗概）、scenes（场景3-5，每场景含location/description/dialogue/mood）、cliffhanger（章末悬念）。返回JSON。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateChapterOutlineFromTemplate(chapterTitle, topic)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 续写正文
app.post('/api/llm/continue-text', async (req, res) => {
  const { text: existingText = '', chapterContext = '', words = 500 } = req.body || {}
  if (!existingText) return res.status(400).json({ ok: false, error: '缺少已有正文 text' })
  try {
    const prompt = `续写以下小说正文，保持文风一致，自然衔接，约${words}字。上下文：${chapterContext}。已有正文：${existingText.slice(-800)}。直接输出续写内容，不要解释：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    return res.json({ ok: true, data: { content: text.trim() }, source: 'llm' })
  } catch (e) {
    const data = { content: generateContinueTextFromTemplate(existingText, words) }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 续写情节
app.post('/api/llm/continue-plot', async (req, res) => {
  const { text: existingText = '', direction = '' } = req.body || {}
  if (!existingText) return res.status(400).json({ ok: false, error: '缺少已有正文 text' })
  try {
    const prompt = `基于已有正文续写情节发展${direction ? `，方向：${direction}` : ''}。已有正文：${existingText.slice(-600)}。返回JSON：{"development":"情节发展描述","nextScene":"下一场景建议","tension":"张力评分1-10"}。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateContinuePlotFromTemplate(existingText, direction)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 书名取名
app.post('/api/llm/book-title', async (req, res) => {
  const { topic = '', synopsis = '', genre = '通用' } = req.body || {}
  try {
    const prompt = `为小说取名。主题${topic}，梗概${synopsis}，题材${genre}。生成5个书名候选，风格各异（文艺/爽文/悬疑/直白/诗意）。返回JSON：{"titles":["","","","",""]}。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = { titles: generateBookTitlesFromTemplate(topic, genre) }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 导语生成
app.post('/api/llm/opening-line', async (req, res) => {
  const { topic = '', synopsis = '', style = '黄金开篇' } = req.body || {}
  try {
    const prompt = `为小说生成导语（${style}）。主题${topic}，梗概${synopsis}。要求开头抓人，3句以内。直接输出导语文本：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    return res.json({ ok: true, data: { content: text.trim() }, source: 'llm' })
  } catch (e) {
    const data = { content: generateOpeningLineFromTemplate(topic, style) }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 脑洞灵感
app.post('/api/llm/inspiration', async (req, res) => {
  const { keyword = '', genre = '通用' } = req.body || {}
  try {
    const prompt = `基于关键词"${keyword}"（题材${genre}）生成3个脑洞灵感。每个含title（标题）、synopsis（一句话梗概）、tags（标签）。返回JSON：{"ideas":[{"title":"","synopsis":"","tags":[]},...]}。不要markdown。`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    const data = extractJSON(text)
    return res.json({ ok: true, data, source: 'llm' })
  } catch (e) {
    const data = generateInspirationFromTemplate(keyword, genre)
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// 智能对话（智能蛙）
app.post('/api/llm/smart-chat', async (req, res) => {
  const { message = '', context = '', novelInfo = '' } = req.body || {}
  if (!message) return res.status(400).json({ ok: false, error: '缺少消息 message' })
  try {
    const prompt = `你是小说创作智能助手"智能蛙"。作者问：${message}。当前作品信息：${novelInfo}。上下文：${context}。给出专业、可执行的建议，200字以内。直接输出：`
    const text = await callLLM(prompt, { seed: Math.floor(Math.random() * 1e6) })
    return res.json({ ok: true, data: { content: text.trim() }, source: 'llm' })
  } catch (e) {
    const data = { content: `（模板回复）关于"${message}"，建议从角色动机、场景冲突、读者预期三个维度切入。当前上下文已记录，可在总纲中明确主线脉络后，按卷→章逐层细化。` }
    return res.json({ ok: true, data, source: 'template', fallbackReason: e.message })
  }
})

// ==================== 蛙蛙写作对标：模板生成器 ====================

function generateSynopsisOptionsFromTemplate(topic, genre) {
  const variants = [
    { id: 'A', title: `${topic.slice(0, 6)}·命运抉择`, synopsis: `围绕"${topic}"展开，主角在偶然事件中发现隐藏的真相，被迫踏上冒险之旅。伙伴与敌人交织，信任与背叛并存，最终在代价中完成成长。`, tags: [genre, '冒险', '成长'] },
    { id: 'B', title: `${topic.slice(0, 6)}·暗流涌动`, synopsis: `"${topic}"背后是更大的阴谋。主角从旁观者变为参与者，在抽丝剥茧中发现自己与事件的深层联系。感情线与主线并行，悬念层层递进。`, tags: [genre, '悬疑', '反转'] },
    { id: 'C', title: `${topic.slice(0, 6)}·破晓之路`, synopsis: `以"${topic}"为起点，主角从低谷逆袭。凭借独特能力与坚定意志，在困境中开辟道路。热血与温情并存，最终改写命运格局。`, tags: [genre, '热血', '逆袭'] },
  ]
  return { options: variants }
}

function generateMasterOutlineFromTemplate(topic, genre) {
  return {
    premise: `${topic}为核心设定，构建一个充满冲突与悬念的世界。`,
    theme: '成长与抉择——在命运面前，何为真正的勇气。',
    volumes: [
      { name: '第一卷·初入局', summary: '主角卷入事件，认识伙伴，初步理解世界规则' },
      { name: '第二卷·渐深入', summary: '冲突升级，真相浮现，主角面临第一次重大抉择' },
      { name: '第三卷·风云变', summary: '反派真容揭晓，联盟破裂，主角跌入低谷' },
      { name: '第四卷·终决战', summary: '绝地反击，终极对决，新秩序建立' },
    ],
    mainline: '主角从被动卷入到主动抗争，经历伙伴、背叛、觉醒、决战四个阶段，最终完成命运改写。',
    ending: '开放但带希望——主角赢了代价，输了幻想，在废墟中看见黎明。',
  }
}

function generateCharacterRelationsFromTemplate(characters) {
  const relations = []
  const types = ['盟友', '对手', '师徒', '暗恋', '血缘']
  for (let i = 0; i < characters.length; i++) {
    for (let j = i + 1; j < characters.length; j++) {
      relations.push({
        from: characters[i].name,
        to: characters[j].name,
        type: types[(i + j) % types.length],
        desc: `${characters[i].name}与${characters[j].name}之间存在${types[(i + j) % types.length]}关系，推动剧情关键转折。`,
      })
    }
  }
  return { relations }
}

function generateVolumeOutlineFromTemplate(volumeName, topic) {
  const chCount = 5
  const chapters = Array.from({ length: chCount }, (_, i) => ({
    title: `第${['一', '二', '三', '四', '五'][i]}章`,
    summary: `${volumeName}第${i + 1}章：围绕"${topic}"推进，引入新冲突点，角色关系进一步发展。`,
  }))
  return { summary: `${volumeName}：围绕"${topic}"展开，主角从初入局到逐渐深入，建立核心伙伴关系并遭遇首个重大挑战。`, chapters, arc: '主角从迷茫到觉醒的转折' }
}

function generateChapterOutlineFromTemplate(chapterTitle, topic) {
  return {
    summary: `${chapterTitle}：围绕"${topic}"推进剧情，引入新场景与冲突。`,
    scenes: [
      { location: '主场景', description: `${chapterTitle}开场，主角面对新的处境，氛围由平静转向紧张。`, dialogue: '"看来，事情没那么简单。"', mood: '悬疑' },
      { location: '转折点', description: '关键人物登场，带来新的信息与挑战，主角被迫做出选择。', dialogue: '"你确定要这么做？"', mood: '紧张' },
      { location: '收束', description: '本章事件暂告段落，但悬念留存，为下一章埋下伏笔。', dialogue: '"这只是开始。"', mood: '余韵' },
    ],
    cliffhanger: '主角收到神秘讯息，内容未明，下一章揭开。',
  }
}

function generateContinueTextFromTemplate(existingText, words) {
  const last = existingText.slice(-200)
  const connectors = ['然而，', '就在这时，', '他/她没有想到，', '时间仿佛在这一刻凝固——', '远处传来声响，']
  const c = connectors[Math.floor(Math.random() * connectors.length)]
  return `${c}模板续写内容（${words}字）：基于上文"${last.slice(-30)}..."的走向，故事将继续推进。主角面临新的抉择，场景氛围逐步升级。这段续写在LLM接入后将由真实模型生成，保持与前文一致的文风与节奏。`
}

function generateContinuePlotFromTemplate(existingText, direction) {
  return {
    development: direction ? `按"${direction}"方向推进：` : '' + '情节从当前节点向外扩展，引入新变量，张力持续上升。',
    nextScene: '建议下一场景设置在更具冲突性的环境中，让主角直面核心矛盾。',
    tension: 7,
  }
}

function generateBookTitlesFromTemplate(topic, genre) {
  const t = topic.slice(0, 4)
  return [`${t}·命运抉择`, `${t}传奇`, `我在${t}那些年`, `${t}·暗夜微光`, `${t}·终局之战`]
}

function generateOpeningLineFromTemplate(topic, style) {
  const openings = {
    '黄金开篇': `"${topic}"——这件事，要从那个改变一切的夜晚说起。`,
    '悬疑开场': `没有人想到，"${topic}"会以这样的方式开始。`,
    '直入主题': `${topic}。这就是一切的起点。`,
  }
  return openings[style] || openings['黄金开篇']
}

function generateInspirationFromTemplate(keyword, genre) {
  return {
    ideas: [
      { title: `${keyword}·逆天改命`, synopsis: `主角凭借${keyword}的特殊能力，在绝境中逆转命运`, tags: [genre, '爽文', '逆袭'] },
      { title: `${keyword}·隐世传说`, synopsis: `${keyword}背后隐藏的千年秘密逐渐浮出水面`, tags: [genre, '悬疑', '传说'] },
      { title: `${keyword}·双线交织`, synopsis: `两条时间线的${keyword}故事，最终在高潮处汇合`, tags: [genre, '烧脑', '双线'] },
    ],
  }
}

app.listen(PORT, () => {
  const keyStatus = POLLINATIONS_API_KEY
    ? `✓ 已配置（${POLLINATIONS_API_KEY.slice(0, 7)}…）`
    : '✗ 未配置（将走模板兜底）'
  console.log(`[LLM] 后端已启动：http://localhost:${PORT}`)
  console.log(`[LLM] 端点（脚本主线）：/api/llm/script | /api/llm/storyboard | /api/llm/dialogue | /api/llm/enhance-prompt`)
  console.log(`[LLM] 端点（WR 工具）：/api/llm/outline | /api/llm/worldview | /api/llm/lorebook | /api/llm/prompt-helper | /api/llm/deepseek | /api/llm/style-clone | /api/llm/ai-erase`)
  console.log(`[LLM] Provider=Pollinations  Model=${POLLINATIONS_MODEL}  APIKey=${keyStatus}`)
  console.log('[LLM] 主路径：OpenAI 兼容 chat completions → 兜底：模板生成器')
})
