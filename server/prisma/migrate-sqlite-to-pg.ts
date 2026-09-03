/**
 * SQLite → PostgreSQL 数据迁移脚本
 * ================================
 *
 * 用途：将 SQLite 开发数据库（dev.db）中的数据完整迁移到 PostgreSQL。
 * 适用场景：生产环境首次部署、本地开发环境数据库切换。
 *
 * 用法：
 *   1. 确保 PostgreSQL 已启动并创建好数据库
 *   2. 设置 DATABASE_URL 为 PostgreSQL 连接串
 *   3. 运行 prisma migrate deploy 初始化表结构
 *   4. 运行：npx tsx prisma/migrate-sqlite-to-pg.ts ./prisma/dev.db
 *
 * 特性：
 *   - 按外键依赖顺序导入，避免外键约束错误
 *   - 分批导入大数据表（每批 500 条）
 *   - 迁移前后计数对比，确保数据完整性
 *   - 幂等：已存在的记录会跳过（基于主键）
 *   - 支持中断续传（已导入的表可跳过）
 *
 * 回滚：
 *   - 迁移过程中如果出错，PostgreSQL 端的数据会保留
 *   - 完整回滚：DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 */

import 'dotenv/config'
import prisma from '../src/lib/prisma'
import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'

// ========== 配置 ==========
const BATCH_SIZE = 500
const SKIP_TABLES = new Set<string>([]) // 如需跳过某些表，加到这里

// ========== 表导入顺序（按外键依赖排序，父表先导入） ==========
const TABLE_ORDER = [
  'User',
  'UserQuota',
  'Subscription',
  'Project',
  'Volume',
  'Chapter',
  'Work',
  'Comment',
  'Like',
  'AIProvider',
  'AIModel',
  'GenerationLog',
  'ModerationLog',
  'UserTask',
  'PaymentOrder',
  'ModuleFeature',
  'SiteConfig',
  'SiteConfigAuditLog',
]

// SQLite 表名到 Prisma 模型名的映射（SQLite 用下划线复数，Prisma 用 Pascal 单数）
const MODEL_TO_SQLITE: Record<string, string> = {
  User: 'User',
  UserQuota: 'UserQuota',
  Subscription: 'Subscription',
  Project: 'Project',
  Volume: 'Volume',
  Chapter: 'Chapter',
  Work: 'Work',
  Comment: 'Comment',
  Like: 'Like',
  AIProvider: 'AIProvider',
  AIModel: 'AIModel',
  GenerationLog: 'GenerationLog',
  ModerationLog: 'ModerationLog',
  UserTask: 'UserTask',
  PaymentOrder: 'PaymentOrder',
  ModuleFeature: 'ModuleFeature',
  SiteConfig: 'SiteConfig',
  SiteConfigAuditLog: 'SiteConfigAuditLog',
}

// 需要转换的字段类型（SQLite → PostgreSQL）
function convertRow(row: Record<string, any>): Record<string, any> {
  const converted: Record<string, any> = {}
  for (const [key, value] of Object.entries(row)) {
    // SQLite 的 Boolean 存储为 0/1 整数，Prisma 写入 PostgreSQL 需要 true/false
    if (typeof value === 'number' && (value === 0 || value === 1)) {
      // 通过字段名猜测是否为布尔值
      if (
        key.endsWith('ed') || // enabled, handled, hidden
        key === 'placeholder' ||
        key === 'placeholder'
      ) {
        converted[key] = value === 1
        continue
      }
    }
    // DateTime 字段：SQLite 存 ISO 字符串，PostgreSQL 也接受
    // JSON 字符串字段：保持原样（Prisma 会处理）
    converted[key] = value
  }
  return converted
}

// 获取 Prisma 模型的 delegate（如 prisma.user, prisma.work）
function getPrismaModel(modelName: string): any {
  const key = modelName.charAt(0).toLowerCase() + modelName.slice(1)
  return (prisma as any)[key]
}

// ========== 主函数 ==========
async function main() {
  const sqlitePath = process.argv[2]
  if (!sqlitePath) {
    console.error('❌ 用法：npx tsx prisma/migrate-sqlite-to-pg.ts <sqlite-db-path>')
    console.error('   示例：npx tsx prisma/migrate-sqlite-to-pg.ts ./prisma/dev.db')
    process.exit(1)
  }

  const resolvedPath = path.resolve(sqlitePath)
  if (!fs.existsSync(resolvedPath)) {
    console.error(`❌ SQLite 数据库文件不存在：${resolvedPath}`)
    process.exit(1)
  }

  console.log('\n🔄 SQLite → PostgreSQL 数据迁移')
  console.log(`   SQLite 源：${resolvedPath}`)
  console.log(`   PostgreSQL：${process.env.DATABASE_URL?.replace(/:.*@/, ':***@')}`)
  console.log()

  const sqlite = new Database(resolvedPath, { readonly: true })
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const stats: Record<string, { source: number; imported: number; skipped: number }> = {}

  try {
    // 0. 预检：确认 PostgreSQL 连接
    console.log('🔍 检查 PostgreSQL 连接...')
    await prisma.$queryRaw`SELECT 1 as check`
    console.log('   ✅ PostgreSQL 连接正常')

    // 1. 按顺序导入每张表
    for (const modelName of TABLE_ORDER) {
      if (SKIP_TABLES.has(modelName)) {
        console.log(`⏭️  跳过 ${modelName}（在 SKIP_TABLES 中）`)
        continue
      }

      const sqliteTable = MODEL_TO_SQLITE[modelName]
      if (!sqliteTable) {
        console.log(`⚠️  未知模型 ${modelName}，跳过`)
        continue
      }

      // 检查 SQLite 中是否有这张表
      const tableCheck = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(sqliteTable)
      if (!tableCheck) {
        console.log(`⚠️  SQLite 中无表 ${sqliteTable}，跳过`)
        continue
      }

      // 统计源数据量
      const countRow = sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${sqliteTable}"`).get() as { cnt: number }
      const totalCount = countRow.cnt
      stats[modelName] = { source: totalCount, imported: 0, skipped: 0 }

      if (totalCount === 0) {
        console.log(`📋 ${modelName}：0 条，跳过`)
        continue
      }

      console.log(`📥 ${modelName}：共 ${totalCount} 条，开始导入...`)

      const model = getPrismaModel(modelName)
      if (!model) {
        console.log(`   ⚠️  Prisma 中无模型 ${modelName}，跳过`)
        continue
      }

      // 分批读取并写入
      let offset = 0
      let imported = 0
      let skipped = 0

      while (offset < totalCount) {
        const rows = sqlite
          .prepare(`SELECT * FROM "${sqliteTable}" ORDER BY rowid LIMIT ? OFFSET ?`)
          .all(BATCH_SIZE, offset) as Record<string, any>[]

        const createPromises: Promise<any>[] = []

        for (const row of rows) {
          const data = convertRow(row)
          // 使用 upsert：已存在则跳过，不存在则创建
          createPromises.push(
            model.upsert({
              where: { id: data.id },
              update: {},
              create: data,
            }).then(() => { imported++ })
              .catch((e: any) => {
                // 唯一键冲突等错误计为 skipped
                if (e.code === 'P2002') {
                  skipped++
                } else {
                  console.error(`   ❌ 导入 ${modelName} 失败（id=${data.id}）：`, e.message)
                  throw e
                }
              })
          )
        }

        await Promise.all(createPromises)
        offset += rows.length

        // 进度输出
        const pct = Math.min(100, Math.round((offset / totalCount) * 100))
        process.stdout.write(`   进度：${offset}/${totalCount} (${pct}%)\r`)
      }

      stats[modelName].imported = imported
      stats[modelName].skipped = skipped
      console.log(`   ✅ 完成：导入 ${imported} 条，跳过 ${skipped} 条`)
    }

    // 2. 验证：计数对比
    console.log('\n📊 迁移验证（源计数 vs 目标计数）：')
    console.log('─'.repeat(50))
    let allMatch = true

    for (const modelName of TABLE_ORDER) {
      const sqliteTable = MODEL_TO_SQLITE[modelName]
      if (!sqliteTable) continue
      if (SKIP_TABLES.has(modelName)) continue

      const tableCheck = sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(sqliteTable)
      if (!tableCheck) continue

      const sourceCount = (sqlite.prepare(`SELECT COUNT(*) as cnt FROM "${sqliteTable}"`).get() as { cnt: number }).cnt
      const model = getPrismaModel(modelName)
      const targetCount = await model.count()

      const match = sourceCount === targetCount
      if (!match) allMatch = false
      const status = match ? '✅' : '❌'
      console.log(`  ${status} ${modelName.padEnd(22)} SQLite: ${String(sourceCount).padStart(6)}  PG: ${String(targetCount).padStart(6)}`)
    }

    console.log('─'.repeat(50))
    if (allMatch) {
      console.log('\n🎉 迁移完成！所有表计数一致，数据完整性验证通过。')
    } else {
      console.log('\n⚠️  迁移完成，但部分表计数不一致，请检查上表中标记为 ❌ 的表。')
    }

  } catch (e: any) {
    console.error('\n❌ 迁移失败：', e.message)
    console.error('   已导入的数据保留在 PostgreSQL 中，可修复后重试（幂等）。')
    console.error('   如需完全回滚：DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
    process.exit(1)
  } finally {
    sqlite.close()
    await prisma.$disconnect()
  }
}

main()
