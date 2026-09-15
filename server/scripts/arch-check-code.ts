/**
 * 架构适应度函数 — 代码模式静态扫描
 * =======================================
 * 扫描代码中是否存在违反架构不变量的模式
 *
 * 覆盖的适应度函数：
 *   FF-008: 充值使用原子 increment（禁止读改写额度）
 *   FF-009: 双审核必走（新生成接口是否走审核流程）
 *   FF-010: 审核记录 Append-Only（禁止 update/delete ModerationLog）
 *   FF-013: 用户创建必生成 UID
 *   FF-014: UID 不可修改
 *
 * 用法：
 *   npx tsx scripts/arch-check-code.ts
 *
 * 退出码：
 *   0 = 全部通过（无高风险问题）
 *   1 = 有高风险违规
 */

import * as fs from 'fs'
import * as path from 'path'

interface ScanRule {
  id: string
  name: string
  severity: 'high' | 'medium' | 'low'
  pattern: RegExp
  type: 'forbidden' | 'required' // forbidden: 匹配到 = 违规; required: 未匹配到 = 违规
  paths: string[] // 扫描的目录/文件模式
  ignorePaths?: string[] // 忽略的路径
  adr?: string
  explanation: string // 违规说明
}

interface ScanResult {
  ruleId: string
  ruleName: string
  severity: 'high' | 'medium' | 'low'
  file: string
  line: number
  code: string
  explanation: string
  adr?: string
}

const rules: ScanRule[] = [
  // ========== 高风险：UID 不可修改 ==========
  {
    id: 'FF-014',
    name: '禁止修改 UID',
    severity: 'high',
    pattern: /uid\s*[:=]\s*/,
    type: 'forbidden',
    paths: ['src/routes', 'src/lib'],
    ignorePaths: ['uidGenerator.ts', 'auth.ts', 'emailCode.ts', 'wechatLogin.ts', 'seed.ts'],
    adr: 'ADR-004',
    explanation: 'UID 一经生成不可修改。只有 uidGenerator 和用户创建路径可以设置 uid。',
  },

  // ========== 高风险：审核记录 Append-Only（审核结果不可改，但管理标记 handled 可改） ==========
  {
    id: 'FF-010',
    name: '审核记录 Append-Only',
    severity: 'high',
    pattern: /moderationLog\.(updateMany|delete|deleteMany)/i,
    type: 'forbidden',
    paths: ['src/'],
    ignorePaths: [],
    adr: 'ADR-003',
    explanation: 'ModerationLog 禁止批量更新/删除。单条 update 仅允许修改 handled 字段（管理标记），审核结果字段不可改。',
  },

  // ========== 高风险：额度读改写（应使用 increment/decrement 原子操作） ==========
  {
    id: 'FF-008',
    name: '禁止读改写额度',
    severity: 'high',
    pattern: /remainingTokens\s*[+\-*/]?=\s*[^{}\s]/,
    type: 'forbidden',
    paths: ['src/routes', 'src/lib'],
    ignorePaths: ['generation.ts', 'scripts/'],
    adr: 'ADR-002',
    explanation: '额度变更必须使用 Prisma { increment/decrement } 原子操作，禁止直接赋值（TOCTOU 风险）。',
  },

  // ========== 中风险：用户创建未生成 UID ==========
  {
    id: 'FF-013',
    name: '用户创建需生成 UID',
    severity: 'medium',
    pattern: /prisma\.user\.create\s*\(/,
    type: 'required',
    paths: ['src/'],
    ignorePaths: [],
    adr: 'ADR-004',
    explanation: '所有 prisma.user.create 调用必须包含 uid 字段（由 uidGenerator 生成）。',
  },

  // ========== 中风险：角色提权 ==========
  {
    id: 'FF-001b',
    name: '禁止提权为 superadmin',
    severity: 'high',
    pattern: /role\s*:\s*['"]superadmin['"]/,
    type: 'forbidden',
    paths: ['src/routes'],
    ignorePaths: ['admin.ts'],
    adr: 'ADR-001',
    explanation: '普通路由中禁止出现 superadmin 角色赋值，只能在 admin 管理接口中且有额外校验。',
  },

  // ========== 低风险：直接调用 AI 模型（可能绕过审核） ==========
  {
    id: 'FF-009',
    name: 'AI 生成需走审核流程',
    severity: 'medium',
    pattern: /fetch\(.*(pollinations|zhipu|dashscope|seedance|kling)/i,
    type: 'forbidden',
    paths: ['src/routes'],
    ignorePaths: ['admin.ts', 'models.ts', 'support.ts'],
    adr: 'ADR-003',
    explanation: '路由层直接调用 AI 供应商 API 可能绕过双审核。应通过 llmRoute 或 withGeneration 中间件。',
  },
]

function getAllFiles(dir: string, ext: string = '.ts'): string[] {
  let results: string[] = []
  if (!fs.existsSync(dir)) return results
  const list = fs.readdirSync(dir)
  for (const file of list) {
    const filePath = path.join(dir, file)
    const stat = fs.statSync(filePath)
    if (stat.isDirectory()) {
      results = results.concat(getAllFiles(filePath, ext))
    } else if (file.endsWith(ext)) {
      results.push(filePath)
    }
  }
  return results
}

function shouldIgnore(filePath: string, ignorePaths: string[]): boolean {
  return ignorePaths.some(ignore => filePath.replace(/\\/g, '/').includes(ignore))
}

function scanRule(rule: ScanRule, baseDir: string): ScanResult[] {
  const results: ScanResult[] = []

  for (const scanPath of rule.paths) {
    const fullPath = path.join(baseDir, scanPath)
    const files = getAllFiles(fullPath)

    for (const file of files) {
      const relPath = path.relative(baseDir, file)

      if (shouldIgnore(relPath, rule.ignorePaths || [])) continue

      const content = fs.readFileSync(file, 'utf-8')
      const lines = content.split('\n')

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]
        const match = line.match(rule.pattern)
        if (match) {
          // 检查是否在注释中（粗略判断）
          const trimmed = line.trim()
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
            continue
          }

          if (rule.type === 'forbidden') {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              file: relPath,
              line: i + 1,
              code: trimmed.slice(0, 100),
              explanation: rule.explanation,
              adr: rule.adr,
            })
          }
        }
      }

      // required 类型：检查 user.create 是否包含 uid
      if (rule.type === 'required' && rule.id === 'FF-013') {
        const hasUserCreate = rule.pattern.test(content)
        if (hasUserCreate) {
          // 检查 create 的 data 中是否包含 uid
          const createBlock = content.match(/prisma\.user\.create\s*\(\s*\{[\s\S]*?data\s*:\s*\{[\s\S]*?\}/)
          if (createBlock && !createBlock[0].includes('uid')) {
            results.push({
              ruleId: rule.id,
              ruleName: rule.name,
              severity: rule.severity,
              file: relPath,
              line: content.split('\n').findIndex(l => l.includes('user.create')) + 1,
              code: createBlock[0].split('\n')[0].trim().slice(0, 100),
              explanation: rule.explanation,
              adr: rule.adr,
            })
          }
        }
      }
    }
  }

  return results
}

function main() {
  const baseDir = path.resolve(__dirname, '..')

  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║      架构适应度函数 — 代码静态扫描               ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')
  console.log(`  扫描目录: ${baseDir}`)
  console.log(`  规则数量: ${rules.length}`)
  console.log('')

  const allResults: ScanResult[] = []

  for (const rule of rules) {
    const results = scanRule(rule, baseDir)
    allResults.push(...results)

    const status = results.length === 0 ? '✅ PASS' : results.some(r => r.severity === 'high') ? '❌ FAIL' : '⚠️  WARN'
    const adrTag = rule.adr ? ` [${rule.adr}]` : ''
    console.log(`${status}  ${rule.id} — ${rule.name}${adrTag} (${results.length} 处)`)

    if (results.length > 0) {
      for (const r of results.slice(0, 5)) {
        const sev = r.severity === 'high' ? '🔴' : r.severity === 'medium' ? '🟡' : '🔵'
        console.log(`         ${sev} ${r.file}:${r.line}`)
        console.log(`            ${r.code}`)
      }
      if (results.length > 5) {
        console.log(`         ... 还有 ${results.length - 5} 处`)
      }
      console.log(`         ℹ️  ${rule.explanation}`)
    }
    console.log('')
  }

  // 汇总
  const highCount = allResults.filter(r => r.severity === 'high').length
  const mediumCount = allResults.filter(r => r.severity === 'medium').length
  const lowCount = allResults.filter(r => r.severity === 'low').length

  console.log('─────────────────────────────────────────────────')
  console.log(`  总计：${allResults.length} 处问题`)
  console.log(`  🔴 高风险：${highCount} | 🟡 中风险：${mediumCount} | 🔵 低风险：${lowCount}`)
  console.log('')

  if (highCount > 0) {
    console.log('⚠️  存在高风险架构违规，请在合并前修复！')
    console.log('')
    process.exit(1)
  } else if (mediumCount > 0) {
    console.log('⚠️  存在中风险问题，建议审查。')
    console.log('')
    process.exit(0)
  } else {
    console.log('🎉 代码静态扫描通过，未发现架构违规。')
    console.log('')
    process.exit(0)
  }
}

main()
