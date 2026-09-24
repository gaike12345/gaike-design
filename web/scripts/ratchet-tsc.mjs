import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const pkgPath = resolve(__dirname, '..', 'package.json')

function countTscErrors() {
  try {
    execSync('npx tsc -b --pretty false', {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { count: 0, output: '', tscCrashed: false }
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '')
    const count = (output.match(/error TS\d+/g) || []).length
    return { count, output, tscCrashed: count === 0 }
  }
}

function getBaseline() {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  return pkg.ratchet?.tscMaxErrors ?? 0
}

function updateBaseline(value) {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  pkg.ratchet = { ...pkg.ratchet, tscMaxErrors: value }
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')
}

function main() {
  const baseline = getBaseline()
  const { count, output, tscCrashed } = countTscErrors()

  console.log(`   tsc -b 类型错误: ${count}`)
  console.log(`   基线:            ${baseline}`)
  console.log('')

  if (tscCrashed) {
    console.log('❌ tsc -b 非零退出但没有可识别的 error TS 行，请人工检查输出：')
    console.log(output.trimEnd().split('\n').slice(-30).join('\n'))
    process.exit(1)
  }

  if (count > baseline) {
    console.log(`❌ 超出基线：${count} > ${baseline}（新增 ${count - baseline} 个类型错误）`)
    console.log('   请修复新增错误；确属有意的类型债增长需人工上调 package.json 的 ratchet.tscMaxErrors 并在提交说明记录')
    process.exit(1)
  }

  if (count < baseline) {
    console.log(`✅ 改善！类型错误从 ${baseline} 降至 ${count}，基线自动下调`)
    updateBaseline(count)
    console.log(`   ✓ ratchet.tscMaxErrors = ${count}`)
  } else {
    console.log('➖ 与基线持平')
  }
}

main()
