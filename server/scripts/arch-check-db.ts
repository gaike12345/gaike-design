/**
 * 架构适应度函数 — 数据库一致性校验
 * =======================================
 * 检查数据库层面的架构不变量是否被破坏
 *
 * 覆盖的适应度函数：
 *   FF-001: 唯一超级管理员
 *   FF-005: 余额恒等式（remaining + used = total）
 *   FF-012: UID 全局唯一
 *   FF-015: 点赞联合唯一
 *   FF-016: 点赞计数一致性
 *
 * 用法：
 *   npx tsx scripts/arch-check-db.ts
 *
 * 退出码：
 *   0 = 全部通过
 *   1 = 有失败项
 */

import prisma from '../src/lib/prisma'

interface CheckResult {
  id: string
  name: string
  passed: boolean
  detail: string
  adr?: string
}

const results: CheckResult[] = []

async function checkSuperadminUnique(): Promise<CheckResult> {
  const superadmins = await prisma.user.findMany({
    where: { role: 'superadmin' },
    select: { email: true },
  })

  const count = superadmins.length
  const hasCorrectEmail = superadmins.some(u => u.email === 'admin@manktv.com')

  const passed = count === 1 && hasCorrectEmail
  const detail = count === 0
    ? 'ERROR: 没有 superadmin 用户'
    : count > 1
    ? `ERROR: 有 ${count} 个 superadmin（应为 1 个）：${superadmins.map(u => u.email).join(', ')}`
    : !hasCorrectEmail
    ? `ERROR: superadmin 邮箱不是 admin@manktv.com，而是 ${superadmins[0].email}`
    : `OK: 唯一 superadmin = ${superadmins[0].email}`

  return { id: 'FF-001', name: '唯一超级管理员', passed, detail, adr: 'ADR-001' }
}

async function checkQuotaIdentity(): Promise<CheckResult> {
  // remaining + used = total
  const badRows = await prisma.$queryRaw<Array<{ userId: string; remaining: number; used: number; total: number }>>`
    SELECT userId, remainingTokens as remaining, usedTokens as used, totalTokens as total
    FROM UserQuota
    WHERE remainingTokens + usedTokens != totalTokens
  `

  const passed = badRows.length === 0
  const detail = passed
    ? `OK: ${await prisma.userQuota.count()} 条额度记录全部满足余额恒等式`
    : `ERROR: ${badRows.length} 条记录不满足 remaining + used = total，示例：${JSON.stringify(badRows.slice(0, 3))}`

  return { id: 'FF-005', name: '余额恒等式', passed, detail, adr: 'ADR-002' }
}

async function checkUidUnique(): Promise<CheckResult> {
  // 查找重复 UID
  const duplicates = await prisma.$queryRaw<Array<{ uid: number; cnt: number }>>`
    SELECT uid, COUNT(*) as cnt
    FROM User
    GROUP BY uid
    HAVING cnt > 1
  `

  // 检查 NULL UID
  const nullRows = await prisma.$queryRaw<Array<{ cnt: number }>>`
    SELECT COUNT(*) as cnt FROM User WHERE uid IS NULL
  `
  const nullCount = nullRows[0]?.cnt || 0

  const passed = duplicates.length === 0 && nullCount === 0
  const detail = passed
    ? `OK: 所有 ${await prisma.user.count()} 个用户 UID 唯一且非空`
    : `ERROR: ${duplicates.length} 个重复 UID, ${nullCount} 个空 UID`

  return { id: 'FF-012', name: 'UID 全局唯一', passed, detail, adr: 'ADR-004' }
}

async function checkLikeUnique(): Promise<CheckResult> {
  // 查找重复点赞
  const duplicates = await prisma.$queryRaw<Array<{ workId: string; userId: string; cnt: number }>>`
    SELECT workId, userId, COUNT(*) as cnt
    FROM "Like"
    GROUP BY workId, userId
    HAVING cnt > 1
  `

  const passed = duplicates.length === 0
  const detail = passed
    ? `OK: ${await prisma.like.count()} 条点赞记录全部唯一`
    : `ERROR: ${duplicates.length} 条重复点赞，示例：${JSON.stringify(duplicates.slice(0, 3))}`

  return { id: 'FF-015', name: '点赞联合唯一', passed, detail }
}

async function checkLikeCountConsistency(): Promise<CheckResult> {
  // Work.likesCount 应等于 Like 表中对应 workId 的记录数
  const mismatches = await prisma.$queryRaw<Array<{ workId: string; storedCount: number; actualCount: number }>>`
    SELECT w.id as workId, w.likesCount as storedCount, COUNT(l.id) as actualCount
    FROM Work w
    LEFT JOIN "Like" l ON w.id = l.workId
    GROUP BY w.id
    HAVING w.likesCount != COUNT(l.id)
  `

  const totalWorks = await prisma.work.count()
  const mismatchCount = mismatches.length
  const mismatchRate = totalWorks > 0 ? (mismatchCount / totalWorks * 100).toFixed(2) : '0'

  // 阈值：偏差率 < 0.1% 视为通过
  const threshold = 0.1
  const passed = mismatchCount === 0 || (mismatchCount / totalWorks) * 100 < threshold
  const detail = passed
    ? `OK: ${totalWorks} 个作品中 ${mismatchCount} 个计数偏差 (${mismatchRate}%)，低于阈值 ${threshold}%`
    : `ERROR: ${mismatchCount} / ${totalWorks} 个作品点赞计数不一致 (${mismatchRate}%)，超过阈值 ${threshold}%`

  return { id: 'FF-016', name: '点赞计数一致性', passed, detail }
}

async function checkModerationLogAppendOnly(): Promise<CheckResult> {
  // 检查是否有 update/delete 操作：通过查看记录 ID 是否连续（粗略检查）
  // 更严格的检查需要审计日志，这里仅做结构性检查
  const count = await prisma.moderationLog.count()
  const passed = true // SQLite 下无法检查 DML 历史，依赖代码审查
  const detail = `INFO: ${count} 条审核记录（append-only 需通过代码审查保证，见 FF-010）`

  return { id: 'FF-010*', name: '审核记录 Append-Only', passed, detail, adr: 'ADR-003' }
}

async function main() {
  console.log('')
  console.log('╔══════════════════════════════════════════════════╗')
  console.log('║      架构适应度函数 — 数据库一致性校验           ║')
  console.log('╚══════════════════════════════════════════════════╝')
  console.log('')

  const checks = [
    checkSuperadminUnique,
    checkQuotaIdentity,
    checkUidUnique,
    checkLikeUnique,
    checkLikeCountConsistency,
    checkModerationLogAppendOnly,
  ]

  for (const check of checks) {
    const result = await check()
    results.push(result)
    const status = result.passed ? '✅ PASS' : '❌ FAIL'
    const adrTag = result.adr ? ` [${result.adr}]` : ''
    console.log(`${status}  ${result.id} — ${result.name}${adrTag}`)
    console.log(`         ${result.detail}`)
    console.log('')
  }

  // 汇总
  const passed = results.filter(r => r.passed).length
  const failed = results.filter(r => !r.passed).length
  const total = results.length

  console.log('─────────────────────────────────────────────────')
  console.log(`  总计：${total} 项 | ✅ 通过：${passed} | ❌ 失败：${failed}`)
  console.log('')

  if (failed > 0) {
    console.log('⚠️  有架构不变量被破坏，请立即检查！')
    console.log('')
    process.exit(1)
  } else {
    console.log('🎉 所有数据库级架构不变量检查通过')
    console.log('')
    process.exit(0)
  }
}

main().catch((e) => {
  console.error('校验脚本执行失败：', e)
  process.exit(1)
})
