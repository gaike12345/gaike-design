# AI 漫剧圈后端代码质量审查报告

> 审查范围：`server/src/` 目录下所有 TypeScript 源代码
> 审查日期：2026-09-03
> 审查方式：只读静态分析

---

## 总体评价

项目整体架构清晰，采用 Express + Prisma + TypeScript 的经典技术栈，代码组织有一定规范性，实现了认证、限流、内容审核、额度管理等核心功能。安全意识较好（JWT 校验、BCrypt、角色权限、内容审核双保险）。

但仍存在若干 **高优先级安全与并发问题** 需要尽快修复，同时代码质量和类型安全方面有较大提升空间。

---

## 一、架构与组织

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 中 | `llmRoute.ts` 中 `llmRouteJson` 与 `llmRouteText` 存在大量重复逻辑 | `src/lib/llmRoute.ts:62-240` | 两个函数约 180 行代码几乎完全重复，仅在调用 LLM 的方式（JSON vs 文本）上有差异。应提取公共逻辑到共享函数中。 |
| 中 | 模块命名不一致 | 多处 | `llmRoute.ts` 放在 `lib/` 目录但实际是路由 helper；`rate-limit.ts` 用 kebab-case，其他文件用 camelCase。 |
| 低 | `src/lib/` 目录职责混杂 | `src/lib/` | 该目录同时包含基础设施（prisma.ts, redis.ts, logger.ts）、业务逻辑（moderation.ts, generation.ts, siteConfig.ts）和路由 helper（llmRoute.ts），建议拆分为 `lib/`（基础设施）、`services/`（业务逻辑）、`helpers/`（路由辅助）。 |
| 低 | 路由文件缺少统一的 validate 中间件使用模式 | `src/routes/comic.ts`, `src/routes/projects.ts` 等 | 部分路由使用 zod validate 中间件（如 video.ts），部分路由手写 if 判断（如 comic.ts, projects.ts），不统一。 |

### 循环依赖检查
未发现明显的循环依赖。模块引用方向基本为：`routes → middleware → lib → prisma`。

---

## 二、代码质量

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 高 | 审核诊断日志遗留生产代码 | `src/lib/moderation.ts:387` | `console.warn('[审核诊断] ...')` 明显是调试用的临时日志，每次审核调用都会输出，会导致生产环境日志爆炸且泄漏审核细节。应移除或改为 debug 级别并默认关闭。 |
| 中 | 管理端统计接口函数过长 | `src/routes/admin.ts:143-240` | `GET /stats` 接口函数体近 100 行，包含 13 个并行查询 + 数据格式化，难以维护。建议拆分为独立的 service 函数。 |
| 中 | 管理端删除用户函数过长 | `src/routes/admin.ts:893-977` | 约 85 行的删除用户逻辑，包含密码校验、层级校验、事务清理、审计等。建议拆分为多个步骤函数。 |
| 中 | 项目路由中权限校验模式重复 | `src/routes/projects.ts` | 几乎每个路由都重复写 `if (project.userId !== req.user!.userId) return 403`，应提取为 `requireProjectOwner` 中间件。 |
| 中 | `console.log/warn/error` 与 `logger` 混用 | 全项目 48 处 | 项目有完善的结构化 logger（`src/lib/logger.ts`），但大量代码仍直接使用 `console.*`。包括 `moderation.ts`（11处）、`redis.ts`（8处）、`taskQueue.ts`（4处）、`llmProvider.ts`（3处）等。 |
| 低 | 首页 HTML 硬编码在 index.ts 中 | `src/index.ts:171-242` | 约 70 行的 HTML 模板字符串混在入口文件中，建议抽取到独立视图文件。 |
| 低 | 无 TODO/FIXME 残留 | - | ✅ 代码中未发现任何 TODO/FIXME/HACK/XXX 标记，这一点做得很好。 |

---

## 三、性能问题

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 高 | 全局 traceId 使用 `globalThis`，并发请求会互相覆盖 | `src/middleware/request-id.ts:52,82-84` + `src/lib/logger.ts:187,191,195` | `globalThis.__traceId` 是全局变量，Node.js 单线程并发请求时，A 请求的 traceId 会被 B 请求覆盖，导致日志链路追踪完全错乱。**这是一个严重的并发 bug。** 应使用 `AsyncLocalStorage` 替代。 |
| 高 | 同步阻塞文件 I/O 操作 | `src/lib/moderation.ts:536,570-571` + `src/lib/seedSiteConfig.ts:25` | `fs.readFileSync`、`fs.existsSync`、`fs.unlinkSync` 都是同步阻塞操作，会阻塞事件循环。在上传文件内容审核场景下，如果文件较大或磁盘 I/O 繁忙，会显著影响服务吞吐量。应改为异步版本 `fs.promises.*`。 |
| 中 | 图片代理接口将整张图片加载到内存 | `src/routes/image.ts:130-131` | `await upstream.arrayBuffer()` 将整个图片读入内存后再发送。对于大图片（如 4K 分辨率 WebP 可能 5-10MB），并发请求多时会导致内存占用飙升。应使用流式 pipe 转发。 |
| 中 | 缺少 `Work.hidden` 索引 | `prisma/schema.prisma:98-117` | 社区作品列表查询条件 `hidden: false` 是高频查询（每次社区列表都用到），但没有索引，会全表扫描。建议添加 `@@index([hidden, createdAt])` 复合索引。 |
| 中 | 缺少 `GenerationLog.createdAt + type` 复合索引 | `prisma/schema.prisma:196-214` | 管理端统计接口（`admin/generations`）按天+按类型聚合，只有单列索引效率低。大数据量下 groupBy 会很慢。 |
| 中 | SSE 连接无最大连接数限制 | `src/lib/sse.ts` | 理论上可以建立无限个 SSE 连接，每个连接占用内存和定时器。恶意攻击者可以通过建立大量连接耗尽服务器内存。应设置最大连接数限制（如每用户最多 3-5 个连接）。 |
| 低 | `modelCost` 缓存清理定时器无背压 | `src/lib/modelCost.ts:25-29` | `setInterval` 每 1 分钟全量遍历 Map 清理过期条目。当缓存条目非常多时（如数千个模型），清理操作本身可能占用较长时间。可以接受，但需注意。 |
| 低 | 社区作品列表查询 likes 状态 N+1 风险 | `src/routes/community.ts:207-211` | 作品详情接口单独查询一次 like 表，这是单条查询没问题。但如果列表接口也需要 liked 状态（目前没有），则会出现 N+1。目前实现可接受。 |

---

## 四、安全问题

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 高 | `.env` 文件中包含真实的智谱 API Key | `.env:32` | `ZHIPU_API_KEY=761491ceae334aeca18ca84215284796.0sPJ9Jle1oRkpIc3` — 这是真实可用的 API Key，直接暴露在工作区。如果该目录被提交到 Git 或被未授权访问，会导致 API 费用被盗刷。应立即轮换该 Key。 |
| 高 | SSE 任务状态广播无用户隔离 | `src/lib/sse.ts:117-125` | `taskQueue.onAnyChange` 将所有任务的状态变更推送给所有连接的客户端。注释中也承认了这个问题（第 119-121 行）。攻击者可以通过 SSE 连接窃取其他用户的任务信息（prompt、结果 URL 等）。应在推送前过滤 userId，只推送给任务所属用户。 |
| 高 | 视频任务状态查询无权限校验 | `src/routes/video.ts:126-136` | `GET /api/video/task/:taskId` 虽然在 `authRequired` 之后，但没有校验任务是否属于当前用户。任何人登录后都可以通过遍历 taskId 查看其他用户的视频生成任务详情（包括 prompt、结果 URL 等）。 |
| 高 | JWT 密钥是 demo 默认值 | `.env:13` | `JWT_SECRET=manktv-demo-secret-change-me-2026-abc123xyz` — 密钥过于简单且可预测，虽然代码中校验了最小 16 字符，但如果生产环境使用此默认值，攻击者可以伪造任意用户的 JWT Token，包括管理员。 |
| 中 | 上传文件仅校验扩展名，未校验内容 | `src/middleware/upload.ts:21-28` | `fileFilter` 只检查文件扩展名。攻击者可以将恶意文件（如 HTML/JS/PHP）改名为 .jpg 上传。虽然有内容审核（只审核文件名和文本内容），但不检查 MIME type 和文件魔数。建议使用 `file-type` 库校验文件实际类型。 |
| 中 | 缺少 CSRF 保护 | 全局 | 对于需要登录的 POST/PUT/DELETE 请求（如修改用户信息、发布作品、删除账号等），没有 CSRF 防护。如果用户在登录状态下访问恶意网站，网站可以构造表单提交执行操作。建议对非 API 调用或敏感操作启用 CSRF Token。 |
| 中 | 图片签名密钥使用默认值 | `src/routes/image.ts:81` | `IMAGE_SIGNING_SECRET` 默认值为 `'img-sign-key-change-in-prod'`，生产环境如果未配置，攻击者可以伪造签名 URL 绕过审核机制。 |
| 中 | 图片代理 URL 白名单校验不充分 | `src/routes/image.ts:108` | `verifySignedUrl` 只检查 `originalUrl.startsWith('https://image.pollinations.ai/')`，但如果签名密钥泄露，攻击者可以构造任意 URL。另外，`buildImageUrl` 中 `POLLINATIONS_KEY` 作为 query param 拼接，如果代理 URL 被泄露，API Key 也会泄露。 |
| 低 | bcrypt 哈希轮数为 10 | `src/routes/auth.ts:36` | 10 轮是标准做法，但对于高安全要求场景可以提升到 12。当前可接受。 |
| 低 | 登录失败无递增延迟 | `src/routes/auth.ts` | 虽然有 IP 限流，但没有针对特定账号的登录失败递增延迟。暴力破解可以通过多 IP 分布式绕过限流。 |

---

## 五、错误处理

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 中 | 错误码体系不统一 | 多处 | 部分接口返回 `{ error: 'xxx' }`，部分返回 `{ ok: false, error: 'xxx', code: 'RATE_LIMITED' }`，还有返回 `{ ok: false, error: 'xxx', moderation: {...} }`。缺少统一的错误码规范，前端处理困难。 |
| 中 | 额度扣减相关错误静默吞掉 | `src/lib/generation.ts:77,95-98,113-115` | `atomicDeductQuota` 失败返回 `false` 但不区分是余额不足还是数据库错误；`atomicRefundQuota` 和 `recordUsedTokens` 的 catch 只打 console.error，不告警、不重试。如果数据库故障，可能出现"生成成功但额度没扣"或"生成失败但额度没退"的账务不一致。 |
| 中 | 队列数据库同步失败静默忽略 | `src/lib/taskQueue.ts:436-457` | `_syncToDb` 方法中所有数据库操作失败都被 catch 吞掉，仅打一条 warn 日志。如果数据库短暂故障，任务状态可能丢失持久化。建议加入重试机制或至少告警。 |
| 低 | 全局错误处理中间件过于简单 | `src/middleware/error.ts:8-22` | 只处理 500 错误，没有区分 Prisma 错误、Zod 校验错误、业务错误等不同类型。虽然各路由有自己的校验返回，但未被捕获的异常都会走到统一的 500，丢失了具体错误类型信息。 |
| 低 | `uncaughtException` 直接退出进程 | `src/lib/graceful-shutdown.ts:74-78` | 未捕获异常立即退出，虽然防止了数据损坏，但也可能导致正在处理的请求被强制中断。可以先等待正在处理的请求完成（设置超时）再退出。 |

---

## 六、依赖健康

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 中 | Prisma v6 是非常新的主版本 | `package.json:25` | `@prisma/client: ^6.0.0` 和 `prisma: ^6.0.0` — Prisma 6 刚发布不久，可能存在未发现的 bug 和兼容性问题。生产环境建议使用更稳定的 v5 版本，或至少锁定具体版本号而非 `^`。 |
| 中 | Zod v4 也是非常新的主版本 | `package.json:41` | `zod: ^4.5.4` — Zod v4 变动较大，且生态兼容性可能不完善。如果不是必须使用 v4 新特性，建议回退到更成熟的 v3。 |
| 中 | `better-sqlite3` 在 dependencies 中缺失但 devDependencies 中有 | `package.json` | SQLite 作为开发数据库，但 `better-sqlite3` 只在 devDependencies 中。如果生产环境也用 SQLite（不太可能），会有问题。但当前配置是合理的（开发用 SQLite，生产用 PG）。 |
| 低 | 缺少依赖安全审计配置 | - | 没有看到 `npm audit` 或 `snyk` 等安全审计工具的配置。建议在 CI 中加入依赖安全扫描。 |
| 低 | `@types/compression` 在 dependencies 而非 devDependencies | `package.json:26` | 类型定义包应该放在 devDependencies 中。虽然不影响运行，但不符合最佳实践。 |

---

## 七、可观测性

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 高 | traceId 使用全局变量导致并发错乱 | `src/middleware/request-id.ts:52` + `src/lib/logger.ts:187` | 同"性能问题"第一条。这同时也是可观测性问题——日志链路追踪完全不可靠。应使用 `AsyncLocalStorage`。 |
| 中 | 大量使用 `console.*` 而非结构化 logger | 全项目 48 处 | 项目有完善的 JSON 结构化 logger（支持脱敏、traceId、日志级别），但大量关键路径（redis 连接、审核、额度扣减、模型成本等）仍使用 `console.log/warn/error`，导致生产环境日志采集时格式不统一、缺少 traceId、无法告警。 |
| 中 | 审计日志使用 `console.info` 而非专用审计通道 | `src/routes/admin.ts:132,736,966` | 管理端的关键操作（角色变更、创建用户、删除用户）审计日志直接打 console.info，生产环境中这些日志可能和普通日志混在一起，容易被覆盖或丢失。建议写入独立的审计表或使用专用 logger。 |
| 中 | 缺少业务监控指标 | - | 没有 Prometheus 风格的 metrics 端点（如请求量、错误率、延迟分位、队列长度、积分消耗速率等）。生产环境排查问题只能靠日志，效率低。 |
| 低 | 健康检查较完善 | `src/index.ts:246-316` | ✅ 有 liveness 和 readiness 两种健康检查，检查了数据库、Redis、Worker 状态，做得不错。 |
| 低 | 无慢查询日志 | - | Prisma 日志配置只输出 warn 和 error，没有慢查询日志。数据库性能问题难以定位。建议开启 Prisma 的慢查询日志或使用数据库层面的慢查询监控。 |

---

## 八、TypeScript 质量

| 级别 | 问题 | 位置 | 说明 |
|------|------|------|------|
| 中 | `any` 类型滥用（44 处） | 多处 | 大量使用 `any` 类型，包括：`where: any`（admin.ts:540,600）、`e: any`（catch 块）、`data: any`（admin.ts:169,192,872）、`body: any`（llmRoute.ts 多处）、`payload: any`（taskQueue.ts:39）等。应逐步替换为具体类型或 `unknown` + 类型守卫。 |
| 中 | `as any` 类型断言滥用（34 处） | 多处 | 大量使用 `(req as any).user?.userId` 模式来获取用户信息。虽然已经通过 `declare global` 扩展了 Express Request 类型，但部分模块没有正确导入类型声明。应确保所有文件都能正确识别 `req.user` 的类型。 |
| 中 | 全局 Request 类型扩展分散 | `src/middleware/auth.ts:5-11` + `src/middleware/generation.ts:11-22` + `src/middleware/request-id.ts:29-37` | 三处不同的文件各自扩展了 `Express.Request` 接口，维护困难。建议统一到一个 `types/express.d.ts` 文件中。 |
| 低 | `strict: true` 已启用 | `tsconfig.json:8` | ✅ TypeScript 严格模式已开启，这是很好的实践。 |
| 低 | 部分 catch 参数未使用 `unknown` 类型 | 多处 | `catch (e)` 或 `catch (e: any)` 应该使用 `catch (e: unknown)` 配合类型守卫，这是 TypeScript 最佳实践。 |
| 低 | 返回类型缺失 | 部分函数 | 如 `llmRouteJson` 和 `llmRouteText` 没有显式返回类型，虽然 TS 可以推断，但显式声明更利于文档和维护。 |

---

## 九、按优先级排序的优化建议清单

### 🔴 P0 - 立即修复（安全/数据一致性）

1. **轮换并移除 .env 中的真实 API Key**（`.env:32`）
   - 智谱 API Key 已暴露，应立即到控制台轮换
   - 确保 `.env` 在 `.gitignore` 中（需确认）

2. **修复全局 traceId 并发 bug**（`src/middleware/request-id.ts:52` + `src/lib/logger.ts:187`）
   - 使用 `AsyncLocalStorage` 替代 `globalThis.__traceId`
   - 这是影响日志链路追踪正确性的严重并发问题

3. **修复 SSE 用户隔离问题**（`src/lib/sse.ts:117-125`）
   - 任务状态推送前校验 userId，只推送给任务所属用户
   - 防止用户间任务信息泄露

4. **修复视频任务查询越权**（`src/routes/video.ts:126-136`）
   - `GET /api/video/task/:taskId` 需校验任务归属
   - 防止遍历 taskId 窃取他人生成内容

5. **确保生产环境 JWT_SECRET 不是默认值**（`.env:13`）
   - 部署检查脚本中强制校验密钥强度
   - `.env.example` 中的默认值不应被生产环境使用

### 🟠 P1 - 高优先级（性能/安全/稳定性）

6. **移除审核诊断日志**（`src/lib/moderation.ts:387`）
   - 删除或改为 `logger.debug` 级别，避免生产环境日志爆炸

7. **替换同步文件 I/O 为异步**（`src/lib/moderation.ts:536,570-571`）
   - `fs.readFileSync` → `fs.promises.readFile`
   - `fs.existsSync` + `fs.unlinkSync` → `fs.promises.unlink`（不存在时 catch 处理）
   - 避免阻塞事件循环影响吞吐量

8. **图片代理改为流式转发**（`src/routes/image.ts:130-131`）
   - 使用 `upstream.body.pipe(res)` 替代 `arrayBuffer()`
   - 减少内存占用，支持大文件

9. **添加关键数据库索引**（`prisma/schema.prisma`）
   - `Work` 添加 `@@index([hidden, createdAt])`
   - `GenerationLog` 添加 `@@index([type, createdAt])`
   - `UserTask` 添加 `@@index([userId, status])`

10. **统一使用结构化 logger**（全项目 48 处 console.*）
    - 逐步将 `console.log/warn/error` 替换为 `logger.info/warn/error`
    - 优先替换核心路径：审核、额度、Redis、队列

### 🟡 P2 - 中优先级（代码质量/可维护性）

11. **消除 `llmRouteJson` 与 `llmRouteText` 重复代码**（`src/lib/llmRoute.ts`）
    - 提取公共逻辑到共享函数（风险门控、输入审核、输出审核、错误处理）
    - 减少约 150 行重复代码

12. **统一 validate 中间件使用模式**
    - `comic.ts`、`projects.ts` 等路由手写 if 校验改为 zod validate 中间件
    - 保持代码风格一致，减少手动校验遗漏

13. **统一错误码体系**
    - 定义全局错误码枚举（如 `VALIDATION_ERROR`、`INSUFFICIENT_QUOTA`、`FORBIDDEN` 等）
    - 所有接口返回格式统一：`{ ok, error, code, details? }`

14. **添加 SSE 连接数限制**（`src/lib/sse.ts`）
    - 每用户最多 3-5 个并发连接
    - 全局最大连接数限制

15. **提取项目权限中间件**（`src/routes/projects.ts`）
    - 新增 `requireProjectOwner` 中间件，消除重复的 userId 校验代码

### 🟢 P3 - 低优先级（优化/最佳实践）

16. **上传文件内容校验**（`src/middleware/upload.ts`）
    - 使用 `file-type` 库校验文件魔数
    - 防止扩展名欺骗

17. **统一 Express Request 类型扩展位置**
    - 将分散在 auth.ts、generation.ts、request-id.ts 中的类型声明合并到 `src/types/express.d.ts`

18. **逐步减少 `any` 使用**
    - catch 块使用 `unknown` + 类型守卫
    - `where: any` 改为 Prisma 生成的正确类型
    - `as any` 断言改为更精确的类型断言

19. **添加 Prometheus metrics 端点**
    - 请求量、错误率、延迟直方图
    - 队列深度、积分消耗速率
    - 活跃连接数

20. **考虑 Prisma/Zod 版本降级**
    - 评估 Prisma 6 和 Zod 4 的稳定性
    - 如非必须使用新特性，降级到更稳定的 v5/v3

---

## 附录：文件统计

- 总源文件数：约 48 个 `.ts` 文件
- 路由文件：18 个（`src/routes/`）
- 中间件文件：7 个（`src/middleware/`）
- 库/服务文件：约 20 个（`src/lib/`）
- 数据模型：Prisma Schema 含 18 个 Model
- 数据库索引：约 25 个单列索引，2 个唯一索引，0 个复合索引（除唯一约束外）
