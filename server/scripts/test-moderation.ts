/**
 * 审核漏审验证脚本
 * 测试中英文混合、符号插入等绕过场景下，本地敏感词扫描是否能正确拦截
 */

import { moderateText } from '../src/lib/moderation'

const testCases = [
  // 纯中文（应该拦截）
  { name: '纯中文-色情', text: '我想看色情直播', expectBlock: true, category: 'porn' },
  { name: '纯中文-毒品', text: '教你冰毒制作方法', expectBlock: true, category: 'drug' },
  { name: '纯中文-暴力', text: '恐怖袭击详细计划', expectBlock: true, category: 'violence' },

  // 纯英文（之前会漏，现在应该拦截）
  { name: '纯英文-色情', text: 'I want to watch porn video', expectBlock: true, category: 'porn' },
  { name: '纯英文-毒品', text: 'how to make meth recipe', expectBlock: true, category: 'drug' },
  { name: '纯英文-暴力', text: 'make bomb at home tutorial', expectBlock: true, category: 'violence' },

  // 中英文混合（之前会漏，现在应该拦截）
  { name: '中英混合-色情', text: '我想看 porn 视频', expectBlock: true, category: 'porn' },
  { name: '中英混合-毒品', text: '哪里有 drug dealing 渠道', expectBlock: true, category: 'drug' },
  { name: '中英混合-赌博', text: '推荐一个 online casino', expectBlock: true, category: 'gambling' },

  // 符号插入绕过（之前可能漏，现在应该拦截）
  { name: '符号插入-色情', text: '色 情 直 播', expectBlock: true, category: 'porn' },
  { name: '符号插入-毒品', text: '贩*卖*毒*品', expectBlock: true, category: 'drug' },
  { name: '零宽字符-暴力', text: '恐\u200b怖\u200b袭击', expectBlock: true, category: 'violence' },

  // 正常内容（不应该拦截）
  { name: '正常-创作', text: '我想写一部关于侦探的小说', expectBlock: false },
  { name: '正常-英文', text: 'I love painting and drawing', expectBlock: false },
  { name: '正常-中英混合', text: '用 AI 生成 image 的方法', expectBlock: false },
  { name: '正常-技术讨论', text: 'bomb 这个词在编程中是什么意思', expectBlock: false },
]

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║         内容审核 — 漏审验证测试                 ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  let passed = 0
  let failed = 0

  for (const tc of testCases) {
    const result = await moderateText(tc.text, {
      stage: 'input',
      endpoint: '/test',
      userId: 'test-user',
    })
    const actualBlocked = !result.passed
    const expectOk = tc.expectBlock === actualBlocked

    const status = expectOk ? '✅' : '❌'
    const verdict = tc.expectBlock ? '应拦截' : '应放行'
    const actual = actualBlocked ? '已拦截' : '已放行'

    if (expectOk) {
      passed++
    } else {
      failed++
    }

    console.log(`${status} ${tc.name.padEnd(20)} — ${verdict} / ${actual}`)
    if (!expectOk) {
      console.log(`     文本: "${tc.text}"`)
      console.log(`     命中类别: ${result.categories.join(', ') || '(无)'}`)
      console.log(`     风险等级: ${result.riskLevel}`)
    } else if (tc.expectBlock && result.hits.length > 0) {
      console.log(`     命中词: ${result.hits.slice(0, 3).join(', ')}`)
    }
    console.log('')
  }

  console.log('─────────────────────────────────────────────────')
  console.log(`  总计：${testCases.length} 项 | ✅ 通过：${passed} | ❌ 失败：${failed}`)
  console.log('')

  if (failed > 0) {
    console.log('⚠️  存在漏审/误判问题，需要优化')
    process.exit(1)
  } else {
    console.log('🎉 所有测试用例通过')
    process.exit(0)
  }
}

main().catch(console.error)
