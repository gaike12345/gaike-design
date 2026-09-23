# Man TV 后端服务代码质量审查报告

> 审查日期：2026-09-17
> 审查范围：`server/` 目录全部源代码
> 审查工具：静态代码分析 + 目录结构审查 + 依赖分析

---

## 一、依赖风险清单

### 1.1 运行时依赖（19 个）

| 包名 | 版本 | 风险等级 | 说明 |
|------|------|----------|------|
| `@prisma/client` | ^6.0.0 | ⚠️ 中 | Prisma 6 是非常新的主版本，可能存在未发现的 bug。生产环境建议锁定到具体 patch 版本并充分测试。 |
| `bcryptjs` | ^2.4.3 | ✅ 低 | 纯 JS 实现，无原生依赖，安全性经过长期验证。 |
| `compression` | ^1.8.1 | ✅ 低 | 成熟稳定的 Express 压缩中间件。 |
| `cors` | ^2.8.5 | ✅ 低 | 经典 CORS 中间件，稳定可靠。 |
| `dotenv` | ^16.4.5 | ✅ 低 | 环境变量加载，稳定。 |
| `express` | ^4.21.0 | ⚠️ 中 | Express 4 是稳定版本，但 Express 5 已发布。当前版本无已知严重漏洞，但长期维护建议关注升级路径。 |
| `express-rate-limit` | ^8.6.2 | ⚠️ 中 | 主版本 v8 较新，API 可能有变动。功能正常。 |
| `helmet` | ^8.3.0 | ⚠️ 中 | Helmet 8 是非常新的主版本。功能安全但建议关注 changelog。 |
| `ioredis` | ^6.0.0 | ⚠️ 中 | ioredis 6 新发布，生产使用前需验证稳定性。 |
| `jsonwebtoken` | ^9.0.2 | ✅ 低 | 最新稳定版，无已知漏洞。 |
| `multer` | ^1.4.5-lts.1 | ⚠️ 中 | 使用 LTS 分支而非最新版，虽然稳定但 v2 有架构改进。长期建议升级。 |
| `node-fetch` | ^3.3.2 | 💡 低 | Node.js 18+ 内置 `fetch`，如目标运行时 >=18 可考虑移除该依赖。 |
| `nodemailer` | ^9.1.1 | ✅ 低 | 成熟邮件库。 |
| `qrcode` | ^1.5.4 | ✅ 低 | 二维码生成库，稳定。 |
| `rate-limit-redis` | ^6.0.1 | ⚠️ 中 | 与 ioredis 6 配套的新版本，需配套验证。 |
| `swagger-jsdoc` | ^6.3.0 | ⚠️ 中 | 版本较老（2023 年后无大更新），但功能稳定。 |
| `swagger-ui-express` | ^5.0.1 | ✅ 低 | 稳定。 |
| `zod` | ^4.5.4 | ⚠️ 中 | Zod 4 是极新的主版本，API 变化较大。项目使用了最新版本，需关注兼容性。 |

### 1.2 开发依赖（14 个）

| 包名 | 版本 | 风险等级 | 说明 |
|------|------|----------|------|
| `better-sqlite3` | ^13.0.3 | ✅ 低 | SQLite 原生驱动，仅开发环境使用。 |
| `oxlint` | ^1.83.0 | ✅ 低 | Rust 实现的 lint 工具，性能优秀。 |
| `prisma` | ^6.0.0 | ⚠️ 中 | 与 client 同版本，新主版本需验证迁移工具稳定性。 |
| `tsx` | ^4.19.0 | ✅ 低 | TypeScript 执行器，成熟稳定。 |
| `typescript` | ^5.6.0 | ✅ 低 | 稳定版本。 |
| `vitest` | ^5.0.0 | ⚠️ 中 | Vitest 5 是新主版本，测试运行时行为可能有变化。 |

### 1.3 依赖配置问题

- **严重**：`@types/compression` 放在 `dependencies` 而非 `devDependencies`。TypeScript 类型包不应在生产依赖中。
- **注意**：`better-sqlite3` 是原生模块，仅在 `devDependencies` 中。如果生产环境使用 SQLite，需移到 `dependencies`；如果使用 PostgreSQL，则当前位置正确。
- **建议**：所有 `^` 前缀的依赖在生产部署前应运行 `npm ci` 并提交 `package-lock.json` 以锁定版本。

---

## 二、Lint 配置评估

### 配置文件：`.oxlintrc.json`

```json
{
  "plugins": ["typescript", "oxc"],
  "rules": {
    "typescript/no-unused-vars": "warn",
    "typescript/no-explicit-any": "warn",
    "no-console": "off"
  }
}
```

### 问题评估

| 问题 | 严重度 | 说明 |
|------|--------|------|
| 规则过少 | ⚠️ 中 | 仅配置了 3 条规则，大量 oxlint 内置规则使用默认值（可能是 off 或 warn）。建议显式启用更多安全和质量规则。 |
| `no-console: "off"` | ⚠️ 中 | 完全禁用 console 检查。当前代码中有 7 处 console 调用（多为启动致命错误输出，尚可接受），但建议改为 `allow: ["error", "warn"]` 禁止 `console.log` 的调试残留。 |
| `no-explicit-any: "warn"` | ⚠️ 中 | 仅警告不报错。当前有 49 处 `any` 使用，lint 无法阻止新增。建议逐步收紧为 `error`。 |
| `--max-warnings=163` | 💡 低 | `lint:check` 脚本允许 163 条警告，是 ratchet 机制（逐步收紧）。策略合理，但应持续推进降低阈值。 |
| 缺少安全规则 | ⚠️ 中 | 未启用 `no-dangerously-set-innerhtml`、`no-eval`、`security` 相关规则。虽然后端代码风险不同，但仍建议启用。 |

---

## 三、代码异味清单

### 3.1 `any` 类型滥用（49 处，涉及 22 个文件）

**严重度：高**

Top 5 重灾区文件：

| 文件 | any 数量 | 典型场景 |
|------|----------|----------|
| `mank-core/llm/llmRouteHelper.ts` | 6 处 | 泛型函数参数、fallback 回调 |
| `mank-core/models/models.route.ts` | 5 处 | Prisma 更新数据对象 |
| `mank-core/admin/adminContent.service.ts` | 5 处 | 查询条件 where 对象 |
| `mank-infra/logging/logger.ts` | 4 处 | 日志值脱敏的递归处理 |
| `mank-core/video/providers/kling.ts` | 4 处 | API 响应数据、请求体 |

**典型模式**：
1. **Prisma where/update 对象** — 可用 Prisma 生成的类型或 `Prisma.UserUpdateInput` 替代
2. **外部 API 响应** — 应定义 interface 或使用 Zod 运行时校验
3. **catch (e: any)** — 应使用 `unknown` + 类型守卫
4. **动态配置对象** — 可用泛型或 `Record<string, unknown>`

**改进建议**：将 `any` 替换策略优先级：
1. `catch (e: any)` → `catch (e: unknown)` + `if (e instanceof Error)`
2. Prisma 数据对象 → 使用 Prisma 生成的输入类型
3. API 响应 → 定义 interface + Zod 校验
4. 通用字典 → `Record<string, unknown>`

### 3.2 Console 使用（7 处，涉及 4 个文件）

**严重度：低**

所有 console 调用均为 `console.error`，用于启动时的致命错误输出（JWT 密钥缺失、审核密钥缺失、图片签名密钥缺失），且生产环境配合 `process.exit(1)` 使用。模式合理。

但建议统一使用 `logger.error` 替代 `console.error`，保持日志系统一致性。

### 3.3 TODO/FIXME

**未发现任何 TODO/FIXME/HACK/XXX 注释。** 代码整洁度良好。

### 3.4 循环依赖风险

`mank-common/utils/apiResponse.ts` 导入 `mank-infra/middleware/request-id`，而 `mank-infra/middleware/error.ts` 又导入 `mank-common/utils/apiResponse`。虽然当前未形成环，但 common 层依赖 infra 层违反了分层原则。

---

## 四、安全隐患

### 4.1 硬编码默认密钥

**严重度：中**

文件：`src/mank-common/utils/imageSigner.ts` 第 16 行

```typescript
const SIGNING_SECRET = IMAGE_SIGNING_SECRET || 'img-sign-key-change-in-prod'
```

虽然有生产环境检查（`NODE_ENV === 'production'` 时未配置会直接退出），但开发/测试环境下默认密钥是已知字符串。如果部署时忘记设置 `NODE_ENV=production` 且未配置密钥，会使用弱默认值。

**建议**：默认值改为空字符串，在所有环境下都进行强校验，开发环境也使用随机生成的密钥。

### 4.2 .env 文件中的真实密钥

**严重度：中（开发环境）**

当前 `.env` 文件中包含真实的 Pollinations API Key：`sk_Cx9ZcXvxWcQfPJWoSrCWn578XgpGcLYz`

- 本地开发环境可接受，但需确认 `.env` 已在 `.gitignore` 中
- 该 key 如果是生产环境密钥，建议立即轮换
- JWT_SECRET 使用了示例值 `manktv-demo-secret-change-me-2026-abc123xyz`，生产环境必须更换

### 4.3 Swagger 路径问题

**严重度：低**

文件：`src/mank-infra/server/swagger.ts`

```typescript
apis: [path.resolve(__dirname, '../../routes/*.ts')],
```

使用 `.ts` 文件路径生成 Swagger 文档。编译后（`dist/` 目录下是 `.js`）该路径可能失效，导致生产环境 Swagger 文档缺失路由定义。

### 4.4 已确认的安全加固项（正面）

项目已实现较为完善的安全体系，包括：
- ✅ CORS 白名单 + HTTPS 强制 + 子域名安全匹配
- ✅ Helmet.js 安全响应头（HSTS、frameguard、xssFilter 等）
- ✅ JWT 认证 + RBAC 角色层级 + 唯一超级管理员不变量
- ✅ 速率限制（IP + 用户维度，Redis 分布式限流）
- ✅ Zod 输入参数校验
- ✅ 内容审核（输入 + 输出双审核）
- ✅ 文件上传魔数校验（防止伪装图片）
- ✅ Prisma ORM 防 SQL 注入
- ✅ 密码 bcrypt 哈希（10 轮）
- ✅ 图片 URL 签名防 SSRF
- ✅ 结构化日志 + 敏感值脱敏
- ✅ 站点配置审计日志（回滚保障）

---

## 五、死代码候选

### 5.1 未使用的 Barrel 文件

| 文件 | 状态 | 说明 |
|------|------|------|
| `src/mank-common/index.ts` | ❌ 未被引用 | 定义了统一导出，但所有导入都直接走深层路径（如 `../../mank-common/errors`）。该 barrel 文件完全未使用。 |
| `src/mank-infra/index.ts` | ❌ 未被引用 | 同上，没有任何文件从 `mank-infra` 根路径导入。 |

**建议**：要么推广使用 barrel 文件简化导入路径，要么删除这两个文件避免维护成本。

### 5.2 根目录测试/调试脚本

| 文件 | 状态 | 说明 |
|------|------|------|
| `recharge-test-user.js` | ⚠️ 调试脚本 | 直接操作数据库充值积分，仅用于开发测试。应移到 `scripts/` 目录并添加 `.gitignore` 或明确标注用途。 |
| `test-writing-chain.js` | ⚠️ 集成测试脚本 | 写作链路端到端测试，硬编码测试账号密码。应移到 `tests/` 目录并参数化。 |

### 5.3 其他待确认文件

| 文件/目录 | 状态 | 说明 |
|-----------|------|------|
| `scripts/test-moderation.ts` | ⚠️ 测试脚本 | 审核功能测试脚本，建议移到 `tests/` |
| `scripts/snapshot_aimodel_*.json`（2 个） | ⚠️ 快照文件 | 模型快照数据，需确认是否仍在使用 |
| `shadow.db` | 正常 | Prisma 迁移 shadow 数据库，应在 `.gitignore` 中 |
| `dist/` | 正常 | 编译输出，应在 `.gitignore` 中 |
| `prisma/dev.db` | 正常 | SQLite 开发数据库 |

---

## 六、测试覆盖率情况

### 6.1 测试文件清单（8 个文件）

| 测试文件 | 覆盖模块 | 用例数（约） | 质量评估 |
|----------|----------|-------------|----------|
| `auth.service.test.ts` | auth.service | 4 | 覆盖登录异常分类（用户不存在/密码错/账号禁用），质量良好 |
| `imageSigner.test.ts` | imageSigner | 14 | 签名生成 + 验签 + 往返一致性，覆盖全面，质量高 |
| `uidGenerator.test.ts` | uidGenerator | 7 | UID 格式校验，边界覆盖完整 |
| `apiResponse.test.ts` | apiResponse | 14 | 统一响应体结构验证，覆盖全面 |
| `errors.test.ts` | errors | 13+ | 异常分类体系完整性验证，质量高 |
| `adminUsers.service.test.ts` | adminUsers.service | 3 | 仅覆盖用户详情查询，覆盖面较窄 |
| `tokenService.test.ts` | tokenService | 未知 | 积分流水服务测试 |
| `logger.test.ts` | logger | 未知 | 日志工具测试 |

### 6.2 覆盖率评估

**整体覆盖率：低（估计 15-25%）**

- ✅ **覆盖良好的领域**：认证逻辑、工具函数、错误处理、图片签名（核心安全模块）
- ❌ **完全未覆盖的领域**：
  - 所有路由层（20+ 个 route 文件）
  - AI 生成调用链路（image/llm/video/audio/comic）
  - 计费/积分核心业务逻辑（`costEstimator.ts`、`modelCost.ts`）
  - 中间件（auth、rate-limit、upload、generation）
  - 内容审核模块
  - 任务队列 + Worker
  - 数据库访问层

### 6.3 测试架构问题

1. **缺少集成测试**：所有测试均为单元测试，无 API 级别集成测试
2. **缺少 E2E 测试**：虽然有 `test-writing-chain.js` 手动测试脚本，但未纳入自动化测试体系
3. **覆盖率工具未配置**：`vitest` 支持 `--coverage`，但未看到覆盖率配置（如 `@vitest/coverage-v8` 依赖）
4. **测试与源码位置不一致**：测试在根目录 `tests/`，源码在 `src/`，导入路径用 `../src/...`，虽可行但更常见的是同目录 colocate 或 `__tests__` 子目录

---

## 七、Prisma 数据模型问题

### 7.1 枚举类型缺失

**严重度：中**

所有状态/类型字段均使用 `String` + 注释说明可选值，而非 Prisma `enum` 类型：

```prisma
role        String   @default("user")    // user | admin | superadmin
status      String   @default("active")  // active | expired | cancelled
type        String   // novel | image | comic | audio | video
```

**问题**：
- 数据库层面无约束，应用层 bug 可写入非法值
- TypeScript 类型不安全（Prisma Client 生成 `string` 而非联合类型）
- 迁移到 PostgreSQL 后应使用原生枚举类型

**建议**：迁移到 PostgreSQL 后，将以下字段改为 enum：
- `User.role` → `Role` (user, admin, superadmin)
- `Project.status` → `ProjectStatus` (draft, ongoing, completed)
- `Subscription.status` → `SubscriptionStatus` (active, expired, cancelled)
- `AIProvider.status` → `ProviderStatus` (active, disabled)
- `AIProvider.type` → `ProviderType` (llm, image, audio, video, multimodal)
- `AIModel.type` / `GenerationLog.type` / `Work.type` → `ContentType` (novel, image, comic, audio, video)
- `GenerationLog.status` → `GenerationStatus` (success, failed, pending)
- `TokenTransaction.type` → `TxType` (deduct, refund, recharge, ...)
- `TokenTransaction.status` → `TxStatus` (pending, settled, refunded, ...)
- `UserTask.status` → `TaskStatus` (pending, processing, completed, failed)
- `PaymentOrder.status` → `OrderStatus` (pending, paid, failed, refunded)
- `ModerationLog.stage` → `ModerationStage` (input, output)
- `ModerationLog.result` → `ModerationResult` (pass, block, warning)

### 7.2 冗余字段与数据一致性风险

**严重度：中**

`UserQuota` 模型：
```prisma
totalTokens     Int      @default(0)
usedTokens      Int      @default(0)
remainingTokens Int      @default(0)   // 剩余额度 = total - used
```

`remainingTokens` 是 `totalTokens - usedTokens` 的计算值，但作为独立字段存储。

**风险**：如果代码中只更新其中两个字段，三者会不一致。已有 `TokenTransaction` 流水表，理论上 `totalTokens` 和 `usedTokens` 都可以从流水聚合得出。

**建议**：
- 方案 A：删除 `remainingTokens`，改为计算字段（Prisma 支持 `@computed` 或应用层计算）
- 方案 B：添加数据库触发器保证一致性
- 方案 C：保留但确保所有写入通过原子事务同时更新三个字段

### 7.3 JSON 存储为 String

**严重度：低**

多个模型使用 `String?` 存储 JSON 数据（`config`、`tags`、`input`、`output`、`diffJson` 等）。

- SQLite 无原生 JSON 类型，当前做法合理
- 迁移到 PostgreSQL 后应改为 `Json` 类型，享受 JSON 查询和索引能力

### 7.4 索引设计评估

**整体良好。** 已覆盖常见查询模式：
- 用户按角色、状态索引
- 社区作品按类型、hidden+createdAt 复合索引
- 生成日志按 type+createdAt、modelId+createdAt、status+createdAt 复合索引
- 积分流水按 userId、type、status、relatedType+relatedId 索引

**潜在优化点**：
- `ModerationLog` 缺少 `[userId, createdAt]` 复合索引（用户审核历史查询）
- `GenerationLog` 的 `[userId, createdAt]` 组合查询频繁但无复合索引

### 7.5 其他数据模型问题

| 问题 | 严重度 | 说明 |
|------|--------|------|
| `User.password` 字段名 | 💡 低 | 字段名可能误导。确认存储的是 bcrypt 哈希而非明文（代码中确实使用了 bcrypt）。可考虑改名为 `passwordHash` 更明确。 |
| `Work.tags` 存储为 JSON 字符串 | 💡 低 | 标签查询（如按标签筛选作品）无法有效索引。PostgreSQL 后可考虑数组类型或单独的 Tag 关联表。 |
| `cuid()` 主键 | 💡 低 | 统一使用 cuid 没问题，但 `uuid()` 是更通用的标准。 |
| `PaymentOrder.payMethod` 无索引 | 💡 低 | 如果需要按支付方式统计，应加索引。 |
| 缺少软删除 | ⚠️ 中 | 所有模型都是硬删除（`onDelete: Cascade`），用户/作品删除后数据不可恢复。重要数据（如 User、Work）建议软删除（`deletedAt`）。 |

---

## 八、架构问题

### 8.1 分层架构评估

项目采用三层结构，整体设计清晰：

```
mank-common/    # 公共工具：错误类、JWT、响应体、图片签名
mank-core/      # 业务核心：各模块路由 + 服务 + 供应商
mank-infra/     # 基础设施：数据库、缓存、中间件、日志、队列
```

**问题**：
1. **中间件层反向依赖业务层**：`mank-infra/middleware/generation.ts` 直接导入 `mank-core/generation/generation.ts` 和 `mank-core/billing/tokenService.ts`。基础设施层不应依赖业务核心层，违反依赖倒置原则。

2. **Barrel 文件形同虚设**：`mank-common/index.ts` 和 `mank-infra/index.ts` 定义了统一导出，但实际代码全部使用深层路径导入。

### 8.2 入口文件过大

`src/index.ts` 约 410 行，承担了过多职责：
- Express app 创建和中间件配置
- 所有路由注册
- 定时任务调度（Pollinations 定价同步 + 超时任务扫描）
- 启动时初始化（预加载模型成本、启动 Worker）
- 优雅停机设置
- 根路径欢迎页 HTML（内联 200 多行 HTML 字符串）

**建议**：
- 将路由注册抽取到 `routes/index.ts`
- 将定时任务抽取到 `scheduler.ts`
- 将欢迎页 HTML 移到单独的模板文件
- 将 CORS、Helmet、压缩等中间件配置抽取到独立配置文件

### 8.3 模块边界模糊

- ~~`mank-core/llm/` 下同时有 `llm.route.ts` 和 `llmRoute.ts`，命名容易混淆~~（已解决：helper 已更名为 `llmRouteHelper.ts`）
- `mank-core/image/` 和 `mank-core/video/` 都有 `providers/` 子目录，模式一致但未抽象公共接口
- 部分业务逻辑直接写在 route 文件中（如 `models.route.ts` 500+ 行），缺少 service 层抽象

### 8.4 正面评价

- ✅ 清晰的模块划分（按业务域组织）
- ✅ 统一的错误处理体系（`AppError` 层级）
- ✅ 统一的响应体格式（`apiResponse`）
- ✅ 中间件模式使用恰当（auth、rate-limit、generation 等）
- ✅ 良好的可观测性设计（request-id、结构化日志、健康检查）
- ✅ 优雅停机实现完整
- ✅ 有架构检查脚本（`scripts/arch-check.ts`）

---

## 九、改进优先级总览

### P0 - 立即处理

1. **确认 `.env` 文件未提交到 Git** — 检查 `.gitignore` 确保敏感文件不泄露
2. **生产环境强校验所有密钥** — imageSigner 的默认密钥在非 production 环境下是已知值

### P1 - 近期修复

1. **`@types/compression` 移到 devDependencies**
2. **Prisma 枚举类型迁移** — 迁移到 PostgreSQL 后同步改造
3. **UserQuota 冗余字段一致性保障** — 添加事务保证或改为计算字段
4. **`any` 类型治理** — 优先处理 catch 块和 Prisma 数据对象（估计可消除 20+ 处）

### P2 - 中期优化

1. **增强 lint 规则** — 启用更多安全和质量规则，逐步将 `no-explicit-any` 升级为 error
2. **测试覆盖率提升** — 重点补充计费、中间件、审核模块的单元测试
3. **入口文件拆分** — 将 `index.ts` 按职责拆分为多个模块
4. **基础设施层与业务层解耦** — 通过接口/事件方式消除中间件对业务的直接依赖
5. **重要数据软删除** — User、Work 等核心数据增加 `deletedAt` 字段

### P3 - 长期改进

1. **Barrel 文件推广使用** 或 **删除未使用的 barrel 文件**
2. **集成测试体系建设** — 使用 supertest 做 API 级测试
3. **测试覆盖率门禁** — CI 中添加覆盖率阈值检查
4. **Express 5 升级评估**
5. **Node.js 原生 fetch 替代 node-fetch**（如果运行时 >= 18）

---

*报告生成时间：2026-09-17*
