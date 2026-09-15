/**
 * oxlint baseline ratchet 脚本（CommonJS 版本，用于后端）
 * =============================
 * 自动检测当前 oxlint warnings 数量，并更新 package.json 中的 lint:check 阈值
 *
 * 用法：
 *   npm run lint:ratchet
 *
 * 工作原理：
 *   1. 运行 oxlint 获取当前 warnings 数量
 *   2. 如果当前数量 < baseline，则更新 baseline 为当前数量（向下 ratchet）
 *   3. 如果当前数量 >= baseline，则保持不变
 *   4. 如果当前数量 > baseline，则警告（有新引入的 warnings）
 *
 * CI 集成：
 *   npm run lint:check   # 使用 --max-warnings=BASELINE，超过即失败
 */

const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')

const pkgPath = resolve(__dirname, '..', 'package.json')

function getCurrentWarningCount() {
  try {
    let output
    try {
      output = execSync('npx oxlint --max-warnings=999999 --format=unix', {
        cwd: resolve(__dirname, '..'),
        encoding: 'utf8',
        timeout: 60000,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (e) {
      output = (e.stdout || '') + (e.stderr || '')
    }

    let warningCount = 0
    let errorCount = 0

    // unix 格式每行格式：path:line:col: message [Severity/rule]
    const lines = output.split('\n')
    for (const line of lines) {
      if (line.match(/\[Warning\//i)) warningCount++
      if (line.match(/\[Error\//i)) errorCount++
    }

    // 回退：default 格式的总结行
    if (warningCount === 0 && errorCount === 0) {
      const summaryMatch = output.match(/Found\s+(\d+)\s+warnings?\s+and\s+(\d+)\s+errors?/i)
      if (summaryMatch) {
        warningCount = parseInt(summaryMatch[1])
        errorCount = parseInt(summaryMatch[2])
      }
    }

    return { warningCount, errorCount }
  } catch (e) {
    console.error('运行 oxlint 失败:', e.message)
    return { warningCount: -1, errorCount: -1 }
  }
}

function getCurrentBaseline() {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const lintCheck = pkg.scripts['lint:check'] || ''
  const match = lintCheck.match(/--max-warnings=(\d+)/)
  return match ? parseInt(match[1]) : 0
}

function updateBaseline(newBaseline) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.scripts['lint:check'] = `oxlint --max-warnings=${newBaseline}`
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

function main() {
  console.log('')
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║        🔧 oxlint baseline ratchet 工具（后端）       ║')
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log('')

  const currentBaseline = getCurrentBaseline()
  const { warningCount, errorCount } = getCurrentWarningCount()

  console.log(`   当前 baseline: ${currentBaseline} warnings`)
  console.log(`   实际 warnings: ${warningCount}`)
  console.log(`   实际 errors:   ${errorCount}`)
  console.log('')

  if (warningCount < 0) {
    console.log('❌ 无法获取 oxlint 输出，请检查 oxlint 是否安装')
    process.exit(1)
  }

  if (warningCount < currentBaseline) {
    console.log(`✅ 改善！warnings 从 ${currentBaseline} 降至 ${warningCount}`)
    console.log(`   正在更新 baseline...`)
    updateBaseline(warningCount)
    console.log(`   ✓ 新 baseline 已写入 package.json: lint:check = "oxlint --max-warnings=${warningCount}"`)
    console.log('')
    console.log('💡 下次 CI 运行 lint:check 时将使用新阈值')
  } else if (warningCount === currentBaseline) {
    console.log('➖ 无变化，baseline 保持不变')
  } else {
    console.log(`⚠️  警告！warnings 从 ${currentBaseline} 增至 ${warningCount}（+${warningCount - currentBaseline}）`)
    console.log('   baseline 未更新，CI 中 lint:check 将失败')
    console.log('   请修复新增的 warnings 后重新运行')
    process.exit(1)
  }

  if (errorCount > 0) {
    console.log('')
    console.log(`⚠️  仍有 ${errorCount} 个 errors 需要修复（不纳入 baseline）`)
  }

  console.log('')
}

main()
