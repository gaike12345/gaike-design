// 验证写作板块 8 个 WR 工具后端端点
const BASE = 'http://127.0.0.1:8787'

async function post(path, body) {
  try {
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await r.json()
    return { ok: r.ok, status: r.status, source: data.source, hasData: !!data.data, error: data.error, sample: JSON.stringify(data.data || {}).slice(0, 200) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

const tests = [
  ['WR-01 大纲', '/api/llm/outline', { topic: '霓虹都市中寻找失踪妹妹的机甲少女', style: '科幻赛博' }],
  ['WR-05 世界观', '/api/llm/worldview', { topic: '霓虹都市中寻找失踪妹妹的机甲少女' }],
  ['WR-12 Lorebook', '/api/llm/lorebook', { source: '艾莉是银发机甲少女，K 是神秘黑客，地下工作室在贫民窟' }],
  ['WR-19 Prompt 助手', '/api/llm/prompt-helper', { input: '少女站在雨夜霓虹街道', style: '科幻赛博' }],
  ['WR-15 DeepSeek 推理', '/api/llm/deepseek', { situation: '主角发现反派是兄长', options: ['正面突破', '迂回策略', '以退为进'] }],
  ['WR-14 文风模仿', '/api/llm/style-clone', { sample: '夜色如墨，街道寂静。她抱紧怀里的猫，缓步前行。', topic: '海边日出' }],
  ['WR-18 AI 消痕', '/api/llm/ai-erase', { input: '综上所述，AI 技术的发展首先解决了效率问题，其次降低了成本，最后改变了创作方式。', intensity: 'medium' }],
  ['WR-00 脚本主线', '/api/llm/script', { topic: '霓虹都市中寻找失踪妹妹的机甲少女', shots: 3 }],
]

;(async () => {
  for (const [name, path, body] of tests) {
    const r = await post(path, body)
    console.log(`\n[${name}]`)
    console.log(`  endpoint: ${path}`)
    console.log(`  status:   ${r.status}  ok=${r.ok}`)
    console.log(`  source:   ${r.source || '(none)'}  hasData=${r.hasData}`)
    if (r.error) console.log(`  error:    ${r.error}`)
    console.log(`  sample:   ${r.sample}`)
  }
})()
