/**
 * 架构校验总入口（CI 可用）
 * ===========================
 * 一键运行所有架构适应度函数检查
 *
 * 用法：
 *   npm run arch:check          # 运行所有检查
 *   npm run arch:check:db       # 仅数据库一致性
 *   npm run arch:check:code     # 仅代码静态扫描
 *
 * CI 集成：
 *   将 npm run arch:check 加入 CI 流水线，非零退出码即阻断合并
 */

import { execSync } from 'child_process'
import * as path from 'path'

const SCRIPTS_DIR = path.resolve(__dirname)
const tsx = 'npx tsx'

interface CheckItem {
  id: string
  name: string
  command: string
  status: 'pass' | 'fail' | 'skip'
  duration?: number
}

const checks: CheckItem[] = [
  {
    id: 'db',
    name: '数据库一致性校验',
    command: `${tsx} ${path.join(SCRIPTS_DIR, 'arch-check-db.ts')}`,
    status: 'skip',
  },
  {
    id: 'code',
    name: '代码静态扫描',
    command: `${tsx} ${path.join(SCRIPTS_DIR, 'arch-check-code.ts')}`,
    status: 'skip',
  },
]

function runCheck(check: CheckItem): CheckItem {
  console.log(`\n▶  运行检查：${check.name}`)
  const start = Date.now()
  try {
    execSync(check.command, {
      cwd: path.resolve(__dirname, '..'),
      stdio: 'inherit',
    })
    const duration = Date.now() - start
    return { ...check, status: 'pass', duration }
  } catch (e: any) {
    const duration = Date.now() - start
    return { ...check, status: 'fail', duration }
  }
}

function main() {
  const args = process.argv.slice(2)
  const only = args[0] // 'db' | 'code' | undefined

  console.log('')
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║          🏗️  架构适应度函数 — 总校验                  ║')
  console.log('╚════════════════════════════════════════════════════════╝')

  const toRun = only
    ? checks.filter(c => c.id === only)
    : checks

  if (toRun.length === 0) {
    console.log(`\n❌ 未找到检查项：${only}`)
    console.log(`   可用选项：db, code`)
    process.exit(1)
  }

  console.log(`\n   共 ${toRun.length} 项检查`)
  console.log('   ─────────────────────────────────────────────────────')

  const results = toRun.map(check => runCheck(check))

  console.log('')
  console.log('╔════════════════════════════════════════════════════════╗')
  console.log('║                     检查结果汇总                       ║')
  console.log('╠════════════════════════════════════════════════════════╣')

  for (const r of results) {
    const icon = r.status === 'pass' ? '✅' : '❌'
    const dur = r.duration ? ` (${(r.duration / 1000).toFixed(1)}s)` : ''
    console.log(`║  ${icon}  ${r.name.padEnd(24)}${dur.padStart(12)}  ║`)
  }

  console.log('╠════════════════════════════════════════════════════════╣')

  const passed = results.filter(r => r.status === 'pass').length
  const failed = results.filter(r => r.status === 'fail').length
  const total = results.length

  const allPass = failed === 0
  const summary = allPass
    ? '🎉 全部通过'
    : `⚠️  ${failed} 项失败`

  console.log(`║  ${summary} — ${passed}/${total} 通过${' '.repeat(28 - summary.length - 12 - total.toString().length * 2)}║`)
  console.log('╚════════════════════════════════════════════════════════╝')
  console.log('')

  if (!allPass) {
    console.log('💡 失败项详情请查看上方各检查输出')
    console.log('')
    process.exit(1)
  }

  console.log('💡 所有架构不变量检查通过，可以安全合并')
  console.log('')
  process.exit(0)
}

main()
