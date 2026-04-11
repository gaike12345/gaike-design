import pg from 'pg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const PROJECT_REF = 'fooiwffgxqwacwsnmkco';
const DB_PASSWORD = 'SdT9B-xPqWRQOmTT-M0UNg_4yTmat3W';

// 尝试多种 Supabase 连接方式
const connectionConfigs = [
  // 方式1: 直接连接 (transient pooler)
  {
    host: `${PROJECT_REF}.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  },
  // 方式2: AWS 直接连接
  {
    host: `${PROJECT_REF}.db.supabase.co`,
    port: 5432,
    database: 'postgres',
    user: 'postgres',
    password: DB_PASSWORD,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
  },
];

const sql = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'supabase-migrations', 'site-config.sql'), 'utf-8');

async function tryConnect(config, name) {
  console.log(`\n🔌 尝试 ${name}...`);
  console.log(`   Host: ${config.host}:${config.port}`);
  
  const pool = new Pool({ ...config, max: 1 });
  const client = await pool.connect();
  
  try {
    // 测试连接
    await client.query('SELECT version();');
    console.log('   ✅ 连接成功！');
    return { pool, client };
  } catch (err) {
    console.log(`   ❌ 连接失败: ${err.message}`);
    await pool.end();
    return null;
  }
}

async function runMigration() {
  console.log('========================================');
  console.log('  盖可朋友圈 - 数据库迁移工具');
  console.log('========================================');
  
  // 读取 SQL 文件
  const migrationFile = join(dirname(fileURLToPath(import.meta.url)), 'supabase-migrations', 'site-config.sql');
  let sql;
  try {
    sql = readFileSync(migrationFile, 'utf-8');
    console.log(`\n📄 读取迁移文件: ${migrationFile}`);
    console.log(`   SQL 长度: ${sql.length} 字符`);
  } catch (err) {
    console.error(`❌ 无法读取迁移文件: ${err.message}`);
    process.exit(1);
  }
  
  // 尝试多种连接方式
  let pool = null;
  let client = null;
  
  for (const config of connectionConfigs) {
    const result = await tryConnect(config, `${config.host}:${config.port}`);
    if (result) {
      pool = result.pool;
      client = result.client;
      break;
    }
  }
  
  if (!client) {
    console.error('\n❌ 无法连接到 Supabase 数据库');
    console.error('\n可能原因:');
    console.error('  1. Supabase 项目的 Connection Pooling 设置可能被禁用');
    console.error('  2. 当前网络环境限制了外部数据库连接');
    console.error('  3. 需要在 Supabase Dashboard 中启用 Connection Pooling');
    console.error('\n解决方案:');
    console.error('  请在 Supabase SQL Editor 中手动执行以下 SQL:');
    console.error('  打开: https://supabase.com/dashboard/project/' + PROJECT_REF + '/sql/new');
    console.error('  复制 supabase-migrations/site-config.sql 的内容粘贴执行');
    process.exit(1);
  }
  
  try {
    console.log('\n📝 执行迁移 SQL...');
    console.log('---');
    console.log(sql.substring(0, 500) + '...');
    console.log('---');
    
    await client.query(sql);
    console.log('\n✅ 迁移执行成功！');
    
    // 验证表
    const tables = ['hero_config', 'about_config', 'cta_config', 'site_settings', 'case_studies'];
    console.log('\n📋 验证创建的表:');
    
    for (const table of tables) {
      try {
        const result = await client.query(`SELECT COUNT(*) FROM ${table}`);
        console.log(`   ✅ ${table}: ${result.rows[0].count} 行`);
      } catch (e) {
        console.log(`   ⚠️  ${table}: ${e.message}`);
      }
    }
    
  } catch (err) {
    console.error('\n❌ 迁移执行失败:', err.message);
    
    if (err.code === '42P07' || err.code === '42710') {
      console.log('\n💡 部分表已存在，这是正常的。');
      console.log('   如果表已存在但没有数据，需要手动插入初始数据。');
    }
    
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
  
  console.log('\n🎉 迁移完成！按任意键退出...');
}

runMigration();
