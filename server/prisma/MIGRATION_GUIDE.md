# SQLite → PostgreSQL 迁移指南

> 版本：1.0
> 状态：待执行
> 适用范围：Man TV 后端服务

---

## 一、迁移决策记录

| 项目 | 内容 |
|------|------|
| **被替换** | SQLite（文件型嵌入式数据库） |
| **替换为** | PostgreSQL（关系型数据库服务） |
| **原因** | 1. 并发性能：SQLite 单写入连接限制，不支持高并发写入场景<br/>2. 生产可靠性：缺乏连接池、读写分离、主从复制等生产级特性<br/>3. 功能限制：不支持 JSONB 索引、全文搜索、窗口函数等高级特性<br/>4. 运维能力：缺少备份恢复工具链、监控指标、性能调优手段 |
| **最终状态** | 生产环境全面使用 PostgreSQL；SQLite 仅保留为本地开发可选方案 |
| **风险等级** | 中（数据迁移过程需停机或双写过渡） |
| **支持窗口** | SQLite 兼容代码保留 2 个版本周期（约 2 个月） |

---

## 二、使用情况清单

### 2.1 静态分析

| 检查项 | 结果 | 说明 |
|--------|------|------|
| Schema 中 SQLite 特有类型 | ❌ 无 | 全部使用 Prisma 标准类型 + cuid() 主键 |
| 原生 SQL 查询（$queryRaw） | ❌ 无 | 所有查询走 Prisma Client |
| SQLite 特有函数 | ❌ 无 | datetime() 等均由 Prisma 抽象 |
| 事务使用 | ✅ 兼容 | Prisma $transaction 跨数据库兼容 |
| 级联删除 | ✅ 兼容 | onDelete: Cascade 由 Prisma 管理 |
| 全文搜索 | ❌ 未使用 | 当前无 FTS 需求 |
| JSON 字段 | ✅ 兼容 | 均存储为 String，Prisma 统一处理 |

### 2.2 运行时依赖

| 模块 | 数据库操作 | 迁移影响 |
|------|-----------|---------|
| 用户认证（auth） | User 读写 | 无影响 |
| 项目管理（projects） | Project/Volume/Chapter CRUD | 无影响 |
| 社区模块（community） | Work/Comment/Like CRUD | 无影响 |
| 生成记录（generationLog） | 高频写入 | 无影响（PostgreSQL 性能更优） |
| 额度系统（userQuota） | 原子 updateMany | 无影响 |
| 管理后台（admin） | 聚合统计 | 无影响（应用层聚合） |
| 内容审核（moderationLog） | 追加写入 | 无影响 |

---

## 三、迁移批次与顺序

### 3.1 表导入顺序（按外键依赖拓扑排序）

```
批次 1：独立表
  ├── User            （无外键）
  ├── AIProvider      （无外键）
  ├── SiteConfig      （无外键）
  └── ModuleFeature   （无外键）

批次 2：一级依赖
  ├── UserQuota        → User
  ├── Subscription     → User
  ├── Project          → User
  ├── Work             → User
  ├── AIModel          → AIProvider
  ├── SiteConfigAuditLog → SiteConfig

批次 3：二级依赖
  ├── Volume           → Project
  ├── Comment          → Work, User
  ├── Like             → Work, User
  ├── GenerationLog    → User
  ├── ModerationLog    → User
  ├── UserTask         → User
  └── PaymentOrder     → User

批次 4：三级依赖
  └── Chapter          → Volume
```

### 3.2 迁移批次计划

| 批次 | 内容 | 预计数据量 | 验证方式 |
|------|------|-----------|---------|
| 第 1 批 | 基础配置（AIProvider/AIModel/ModuleFeature/SiteConfig） | ~50 条 | 配置项数量核对 |
| 第 2 批 | 用户与额度（User/UserQuota/Subscription） | 数百~数千 | 用户计数 + 额度总额对比 |
| 第 3 批 | 社区内容（Work/Comment/Like） | 数千~数万 | 作品计数 + 点赞关系验证 |
| 第 4 批 | 项目内容（Project/Volume/Chapter） | 数百~数千 | 项目计数 + 章节数对比 |
| 第 5 批 | 日志与任务（GenerationLog/ModerationLog/UserTask/PaymentOrder） | 数千~数十万 | 计数对比（抽样验证） |

---

## 四、迁移步骤详解

### 4.1 前置准备

```bash
# 1. 安装 PostgreSQL（如未安装）
# macOS: brew install postgresql
# Ubuntu: sudo apt install postgresql
# Windows: 下载安装包 https://www.postgresql.org/download/windows/

# 2. 创建数据库
psql -U postgres
CREATE DATABASE manktv;
CREATE USER manktv WITH PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE manktv TO manktv;
\q

# 3. 配置环境变量
# 修改 .env 文件中的 DATABASE_URL
DATABASE_URL="postgresql://manktv:your-password@localhost:5432/manktv?schema=public"
```

### 4.2 执行迁移

```bash
cd server

# 1. 生成 Prisma Client（适配 PostgreSQL）
npm run prisma:generate

# 2. 初始化数据库表结构
npm run prisma:migrate -- --name init
# 或生产环境：
npm run prisma:deploy

# 3. 数据迁移（从 SQLite dev.db 导入）
npx tsx prisma/migrate-sqlite-to-pg.ts ./prisma/dev.db

# 4. 一键迁移（包含表结构 + 数据）
npm run db:migrate-pg
```

### 4.3 验证迁移结果

迁移脚本会自动输出验证结果：

```
📊 迁移验证（源计数 vs 目标计数）：
──────────────────────────────────────────────────
  ✅ User                   SQLite:     23  PG:     23
  ✅ UserQuota              SQLite:     23  PG:     23
  ✅ Work                   SQLite:     20  PG:     20
  ✅ Comment                SQLite:   2456  PG:   2456
  ...
──────────────────────────────────────────────────
🎉 迁移完成！所有表计数一致，数据完整性验证通过。
```

**额外验证命令：**

```bash
# 启动服务验证
npm run dev

# 访问健康检查
curl http://localhost:3000/api/health

# 验证社区接口
curl http://localhost:3000/api/community/works?pageSize=5
```

---

## 五、回滚方案

### 5.1 迁移过程中失败

迁移脚本是**幂等**的——已导入的记录不会重复导入。修复问题后直接重新运行即可。

```bash
# 重新运行迁移脚本（会跳过已存在的记录）
npx tsx prisma/migrate-sqlite-to-pg.ts ./prisma/dev.db
```

### 5.2 迁移后发现问题

**方案 A：快速回滚到 SQLite（推荐用于开发环境）**

```bash
# 1. 修改 DATABASE_URL 回 SQLite
DATABASE_URL="file:./dev.db"

# 2. 修改 prisma/schema.prisma 的 provider
provider = "sqlite"

# 3. 重新生成 Prisma Client
npm run prisma:generate

# 4. 重启服务
npm run dev
```

**方案 B：PostgreSQL 完整重置**

```sql
-- 清空所有表，重新迁移
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO manktv;
```

```bash
# 重新部署 + 导入
npm run prisma:deploy
npx tsx prisma/migrate-sqlite-to-pg.ts ./prisma/dev.db
```

### 5.3 生产环境回滚策略

| 阶段 | 回滚方式 | 数据丢失风险 | 恢复时间 |
|------|---------|-------------|---------|
| 迁移中 | 终止迁移，继续使用 SQLite | 无 | 立即 |
| 迁移完成 24h 内 | 切回 SQLite + 重放期间写入日志 | 低（需重放期间写入） | ~1h |
| 迁移超过 7 天 | 不建议回滚，修复问题 | — | — |

---

## 六、容量与性能

### 6.1 PostgreSQL 性能增益

| 场景 | SQLite | PostgreSQL | 提升倍数 |
|------|--------|-----------|---------|
| 并发读取 | 受限于单进程 | 连接池 + 多线程 | 10~100x |
| 并发写入 | 串行（写锁） | MVCC + 行级锁 | 10~50x |
| 复杂查询 | 全表扫描居多 | B-tree / GIN 索引 | 5~20x |
| 聚合统计 | 应用层计算 | 数据库引擎优化 | 3~10x |

### 6.2 连接池配置

生产环境建议在 Prisma 中配置连接池：

```env
# .env
DATABASE_URL="postgresql://user:pass@host:5432/db?pgbouncer=true&connection_limit=10"
```

或使用 PgBouncer 作为外部连接池。

---

## 七、防止回退（Backsliding Prevention）

### 7.1 代码层面

- ✅ Prisma Schema 已切换为 `postgresql` provider
- ✅ 所有数据库操作通过 Prisma ORM（无原生 SQL）
- ✅ 类型安全：TypeScript + Prisma Client 编译时检查

### 7.2 构建检查

```bash
# 验证 schema 与 PostgreSQL 兼容
npx prisma validate

# 检查是否有未应用的迁移
npx prisma migrate status
```

### 7.3 文档引导

- `.env.example` 默认为 PostgreSQL 配置
- Schema 顶部添加迁移说明注释
- 本文档作为迁移 SOP

---

## 八、先禁用后删除（Disable before Delete）

### 阶段 1：并行运行（当前 — 迁移完成后 2 周）

- ✅ Schema 支持 PostgreSQL
- ✅ 迁移脚本可用
- ⏳ SQLite 代码路径保留（用于回滚）

### 阶段 2：禁用 SQLite（迁移稳定后）

- [ ] 移除 schema 中的 SQLite 注释
- [ ] 删除 dev.db（如有需要先备份）
- [ ] 移除 `better-sqlite3` 依赖
- [ ] 删除迁移脚本 `migrate-sqlite-to-pg.ts`

### 阶段 3：彻底清理（1 个月后无问题）

- [ ] 移除 SQLite 相关文档
- [ ] 归档 SQLite 迁移历史
- [ ] 更新架构图和技术栈描述

---

## 九、最终退休检查清单

- [x] 替换方案就绪（PostgreSQL + Prisma）
- [x] 迁移工具可用（migrate-sqlite-to-pg.ts）
- [x] 回滚方案明确（切回 SQLite）
- [x] 验证机制完整（计数对比 + 接口验证）
- [ ] 生产环境演练完成
- [ ] 监控告警配置完成
- [ ] 运维文档更新完成
- [ ] 团队培训完成

---

## 十、常见问题

### Q1: 迁移时提示 "P2002 Unique constraint failed"

A: 正常现象——迁移脚本使用 upsert 幂等导入，已存在的记录会跳过。如果大量出现，检查是否重复运行了脚本。

### Q2: 布尔字段值不对（全是 true/false）

A: SQLite 存 0/1，PostgreSQL 存 true/false。迁移脚本已自动转换，如发现遗漏请在 `convertRow()` 函数中补充字段名。

### Q3: 大数据表迁移太慢怎么办？

A: 可以调整 `BATCH_SIZE` 变量（默认 500），或使用 PostgreSQL 的 COPY 命令直接导入 CSV 导出文件。

### Q4: 可以在运行时切换数据库吗？

A: 不可以。Prisma 的 datasource provider 是编译时确定的，切换需要重新生成 Client 并重启服务。这也是为什么建议先在测试环境充分验证。

### Q5: SQLite 还能用吗？

A: 可以。将 `prisma/schema.prisma` 中的 provider 改回 `sqlite`，并将 `DATABASE_URL` 改为 SQLite 路径，然后运行 `npm run prisma:generate` 即可。
