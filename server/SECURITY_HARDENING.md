# 安全加固总览（Security Hardening Report）

> 版本：1.1
> 日期：2026-09-02
> 范围：Mank TV 后端服务

***

## 一、安全加固清单

| 层级       | 项目                  | 状态   | 优先级 | 文件                         |
| -------- | ------------------- | ---- | --- | -------------------------- |
| **传输层**  | CORS 白名单收紧          | ✅ 完成 | P0  | `src/index.ts`             |
| **传输层**  | Helmet.js 安全响应头     | ✅ 完成 | P2  | `src/index.ts`             |
| **传输层**  | HSTS 强制 HTTPS（生产）   | ✅ 完成 | P2  | `src/index.ts`             |
| **接入层**  | JWT 认证 + RBAC       | ✅ 已有 | P0  | `middleware/auth.ts`       |
| **接入层**  | 速率限制（IP + 用户）       | ✅ 完成 | P2  | `middleware/rate-limit.ts` |
| **接入层**  | Redis 分布式限流         | ✅ 完成 | P2  | `middleware/rate-limit.ts` |
| **应用层**  | 输入参数校验（Zod）         | ✅ 完成 | P2  | `middleware/validate.ts`   |
| **应用层**  | 内容审核（输入+输出）         | ✅ 完成 | P0  | `lib/moderation.ts`        |
| **应用层**  | 文件上传校验              | ✅ 完成 | P0  | `middleware/upload.ts`     |
| **应用层**  | 原子额度扣减              | ✅ 已有 | P0  | `lib/quota.ts`             |
| **数据层**  | 密码哈希（bcrypt 10轮）    | ✅ 已有 | P0  | `routes/auth.ts`           |
| **数据层**  | SQLite → PostgreSQL | ✅ 方案 | P1  | `prisma/schema.prisma`     |
| **数据层**  | SQL 注入防护（Prisma）    | ✅ 已有 | P0  | Prisma ORM                 |
| **运维层**  | 超级管理员不变量            | ✅ 已有 | P1  | `seed.ts` + `auth.ts`      |
| **运维层**  | 审计日志（操作记录）          | ✅ 已有 | P1  | `SiteConfigAuditLog`       |
| **可观测性** | 请求 ID + 链路追踪        | ✅ 完成 | P3  | `middleware/request-id.ts` |
| **可观测性** | 结构化日志 + 脱敏          | ✅ 完成 | P3  | `lib/logger.ts`            |
| **可靠性**  | 优雅停机                | ✅ 完成 | P3  | `lib/graceful-shutdown.ts` |
| **可靠性**  | 健康检查增强（L7 + L4）     | ✅ 完成 | P3  | `src/index.ts`             |

***

## 二、各项加固详情

### 2.1 CORS 安全配置

**配置项：**

- 多域名白名单（逗号分隔）

- 生产环境强制 HTTPS

- 子域名匹配（生产环境）

- 限定方法：GET/POST/PUT/PATCH/DELETE/OPTIONS

- 限定请求头：Content-Type/Authorization/X-Requested-With

- 预检缓存：24 小时

- 未授权源告警日志

**对应风险：** CSRF 跨站请求伪造、未授权跨域数据泄露

***

### 2.2 Helmet.js 安全响应头

| 中间件                            | 作用                  | 配置值                               |
| ------------------------------ | ------------------- | --------------------------------- |
| `hidePoweredBy`                | 隐藏 X-Powered-By     | 启用                                |
| `frameguard`                   | 禁止 iframe 嵌套（防点击劫持） | `deny`                            |
| `xssFilter`                    | XSS 防护过滤器           | 启用                                |
| `noSniff`                      | 禁止 MIME 类型嗅探        | 启用                                |
| `hsts`                         | HTTP 严格传输安全（生产）     | 1年 + 子域 + preload                 |
| `permittedCrossDomainPolicies` | 跨域策略限制              | `none`                            |
| `referrerPolicy`               | Referrer 策略         | `strict-origin-when-cross-origin` |

**注意：** CSP 已禁用（API 服务不需要，由前端自行管理）。

***

### 2.3 速率限制

**模式：**

- **Memory 模式**（默认/开发）：单进程内存计数

- **Redis 模式**（生产/多实例）：Redis 原子计数，跨实例共享

**限流策略：**

| 接口组  | 默认限额    | 粒度    | 可配置          |
| ---- | ------- | ----- | ------------ |
| 认证接口 | 30 次/分钟 | IP    | ✅ SiteConfig |
| 文本生成 | 30 次/分钟 | 用户/IP | ✅ SiteConfig |
| 图像生成 | 20 次/分钟 | 用户/IP | ✅ SiteConfig |
| 音频生成 | 20 次/分钟 | 用户/IP | ✅ SiteConfig |
| 视频生成 | 5 次/分钟  | 用户/IP | ✅ SiteConfig |

**动态调整：** 管理员可在后台修改限流阈值，60 秒内自动生效。

***

### 2.4 参数校验（Zod）

**中间件：** `validate({ body?, query?, params? })`

**已接入路由：**

| 路由                         | 校验内容                                        |
| -------------------------- | ------------------------------------------- |
| POST /api/auth/register    | email + password + nickname                 |
| POST /api/auth/login       | email + password                            |
| POST /api/video/text2video | prompt + duration + model + ratio + quality |
| POST /api/video/img2video  | imageUrl + prompt + duration + model        |

**通用 Schema：**

- `commonSchemas.pagination` — 分页参数（page + pageSize）

- `commonSchemas.idParam` — ID 参数

- `commonSchemas.email` — 邮箱格式

- `commonSchemas.password` — 密码长度（6-128）

- `commonSchemas.nickname` — 昵称长度（1-32）

- `commonSchemas.url` — URL 格式

**错误响应：**

```json
{
  "error": "请求参数不合法",
  "code": "VALIDATION_ERROR",
  "details": {
    "body": {
      "email": "Invalid email",
      "password": "String must contain at least 6 character(s)"
    }
  }
}
```

***

### 2.5 内容审核

**双审核体系：**

1. **本地敏感词**：即时响应，零成本，6 大类别
2. **第三方服务商**：阿里云 / 智谱，高精度

**覆盖范围：**

- 所有 AI 生成接口（输入审核）

- 所有文件上传（文件名 + 文本内容）

- 社区发布（作品标题、内容、评论）

**风险等级自动升降级：**

- 累计违规自动升级风险等级

- 影响 AI 生成权限（警告 → 人工复核 → 封禁）

***

### 2.6 文件上传安全

| 防护项     | 实现方式                           |
| ------- | ------------------------------ |
| 文件类型白名单 | Multer fileFilter（按扩展名 + MIME） |
| 文件大小限制  | Multer limits（各端点独立配置）         |
| 文件名随机化  | UUID 重命名，防路径遍历                 |
| 内容审核    | 文件名 + 文本文件内容双审核                |
| 上传目录隔离  | 统一 UPLOAD\_DIR，禁止可执行权限         |
| 清理机制    | 审核失败自动删除文件                     |

***

## 三、安全 Headers 验证清单

部署后可用以下命令验证安全头是否生效：

```bash
# 检查响应头
curl -I http://localhost:3000/api/health

# 预期输出（生产环境）：
#   X-Frame-Options: DENY
#   X-Content-Type-Options: nosniff
#   X-DNS-Prefetch-Control: off
#   X-Download-Options: noopen
#   X-Permitted-Cross-Domain-Policies: none
#   Referrer-Policy: strict-origin-when-cross-origin
#   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

***

## 四、后续建议（P3）

| 项目        | 说明                         | 优先级 |
| --------- | -------------------------- | --- |
| 全量 Zod 接入 | 所有路由接入参数校验                 | P3  |
| 审计日志完善    | 关键操作全链路审计（登录、支付、管理操作）      | P3  |
| 敏感数据加密    | 数据库中敏感字段加密存储（手机号、支付信息）     | P3  |
| 定时安全扫描    | 集成 npm audit / Snyk 依赖漏洞扫描 | P3  |
| 日志脱敏      | 日志中自动脱敏密码、Token、邮箱等敏感信息    | P3  |
| WAF 接入    | 生产环境前置 WAF（阿里云/Cloudflare） | P3  |

***

## 五、配置快速参考

### 生产环境推荐 .env 配置

```env
# ===== 基础 =====
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://www.yourdomain.com,https://yourdomain.com

# ===== 数据库 =====
DATABASE_URL="postgresql://user:pass@localhost:5432/manktv?schema=public"

# ===== Redis（队列+限流） =====
REDIS_URL=redis://:password@localhost:6379/0

# ===== JWT =====
JWT_SECRET=your-very-long-random-secret-key-at-least-32-chars
JWT_EXPIRES_IN=7d

# ===== 内容审核 =====
MODERATION_PROVIDER=aliyun
MODERATION_API_KEY=your-aliyun-key
MODERATION_API_SECRET=your-aliyun-secret
MODERATION_REGION=cn-shanghai

# ===== 日志 =====
LOG_LEVEL=info
# 生产环境自动输出 JSON 格式日志，便于采集（ELK / Loki / etc.）
```

***

## 六、可观测性增强（P3）

### 6.1 请求 ID 与链路追踪

**中间件：** `requestId`

每个请求自动分配唯一 traceId（8 字节 hex = 16 字符），支持从上游透传：

- `X-Trace-Id`（优先）

- `X-Request-Id`（备选）

**响应头：** `X-Request-Id` 返回 traceId，方便前端和客户端排查。

**访问日志：** 请求结束时自动记录，包含：

- HTTP 方法 + 路径

- 状态码

- 响应耗时（ms）

- 客户端 IP

**慢请求告警：**

- <br />

  > 1s：WARN 级别

- <br />

  > 3s：ERROR 级别

- 4xx：WARN 级别

- 5xx：ERROR 级别

### 6.2 结构化日志与脱敏

**日志工具：** `src/lib/logger.ts`

**日志级别：** `error` > `warn` > `info` > `debug`

- 通过 `LOG_LEVEL` 环境变量控制

- 默认 `info`

**输出格式：**

- 开发环境：彩色可读文本 + emoji 前缀

- 生产环境：单行 JSON（便于 ELK / Loki 采集）

**自动脱敏规则：**

| 类型                 | 脱敏方式             | 示例                    |
| ------------------ | ---------------- | --------------------- |
| 密码/Token/Secret 字段 | 字段名匹配，值替换为 `***` | `password: "***"`     |
| 邮箱                 | 保留前 2 位 + 域名     | `al***@example.com`   |
| 手机号                | 保留前 3 后 4        | `138****8888`         |
| 身份证号               | 保留前 6 后 4        | `110101********1234`  |
| 银行卡号               | 保留前 4 后 4        | `6222 **** **** 1234` |
| JWT / Bearer Token | 值替换              | `Bearer ***`          |

**使用方式：**

```typescript
import { logger } from '../lib/logger'

const log = logger.child('auth')  // 子 Logger，带模块前缀
log.info('用户登录成功', { userId, email })
log.warn('密码错误次数过多', { userId, attemptCount })
log.error('数据库异常', { error: err.message })
```

***

## 七、可靠性增强（P3）

### 7.1 优雅停机（Graceful Shutdown）

**模块：** `src/lib/graceful-shutdown.ts`

**流程：**

```
收到 SIGTERM / SIGINT
    ↓
停止接受新连接 (server.close)
    ↓
等待进行中请求完成（最长 10s）
    ↓
关闭数据库连接 (Prisma)
    ↓
关闭 Redis 连接
    ↓
正常退出 (exit 0)
```

**超时保护：** 10 秒内未完成则强制退出，防止僵尸进程。

**异常兜底：**

- `uncaughtException`：记录错误日志后立即退出（防止数据损坏）

- `unhandledRejection`：记录告警日志，不立即退出（可观测但不中断）

### 7.2 健康检查增强

**三个端点：**

| 端点                      | 用途                        | 返回状态    |
| ----------------------- | ------------------------- | ------- |
| `GET /api/health`       | 兼容旧版（等价于 liveness）        | 200/503 |
| `GET /api/health/live`  | K8s liveness probe（存活探测）  | 200/503 |
| `GET /api/health/ready` | K8s readiness probe（就绪探测） | 200/503 |

**readiness 深度探测项：**

| 检查项   | 方法              | 状态                              |
| ----- | --------------- | ------------------------------- |
| 数据库   | `SELECT 1` + 耗时 | ✅/❌ + latencyMs                 |
| Redis | `PING` + 耗时     | ✅/❌/not\_configured + latencyMs |

**停机中状态：** 收到终止信号后，所有健康检查端点返回 503，通知负载均衡器停止转发流量。

**Kubernetes 配置参考：**

```yaml
livenessProbe:
  httpGet:
    path: /api/health/live
    port: 3000
  initialDelaySeconds: 5
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /api/health/ready
    port: 3000
  initialDelaySeconds: 3
  periodSeconds: 5
```

***

## 八、已接入 Zod 校验的路由

| 模块 | 路由                                       | 校验位置            |
| -- | ---------------------------------------- | --------------- |
| 认证 | `POST /api/auth/register`                | body            |
| 认证 | `POST /api/auth/login`                   | body            |
| 视频 | `POST /api/video/text2video`             | body            |
| 视频 | `POST /api/video/img2video`              | body            |
| 社区 | `GET /api/community/works`               | query（分页+类型+排序） |
| 社区 | `POST /api/community/works`              | body（发布作品）      |
| 社区 | `POST /api/community/works/:id/comments` | params + body   |

> 其余路由可按需接入，使用 `validate({ body?, query?, params? })` 中间件即可。

***

## 九、性能与实时性增强

### 9.1 SSE 实时任务状态推送

**端点：** `GET /api/stream/tasks`（需登录）

**模块：** `src/lib/sse.ts`

**特性：**

| 特性           | 说明                                           |
| ------------ | -------------------------------------------- |
| **实时推送**     | 任务状态变更立即推送，替代前端轮询                            |
| **自动重连**     | 浏览器原生 `EventSource` 支持断线重连 + `Last-Event-ID` |
| **心跳保活**     | 每 15s 发送注释帧，防止代理/负载均衡超时断开                    |
| **连接上限**     | 单连接 5 分钟无消息自动断开，客户端自动重连                      |
| **双通道事件**    | 通用 `task:change` 事件 + 特定 `task:{id}` 事件      |
| **Nginx 兼容** | `X-Accel-Buffering: no` 禁用代理缓冲               |

**前端接入示例：**

```javascript
const token = localStorage.getItem('token')
const es = new EventSource(`/api/stream/tasks?token=${token}`, {
  withCredentials: true,
})

// 监听所有任务变更
es.addEventListener('task:change', (e) => {
  const task = JSON.parse(e.data)
  console.log(`任务 ${task.taskId}: ${task.status}`)
})

// 或只监听特定任务
es.addEventListener(`task:${taskId}`, (e) => {
  const task = JSON.parse(e.data)
  if (task.status === 'succeeded') {
    // 跳转到结果页
  }
})

es.onerror = () => {
  console.warn('SSE 连接中断，将自动重连')
}
```

> **注意：** SSE 流不参与 Gzip 压缩（压缩会导致缓冲，破坏实时性）。

### 9.2 响应压缩（Gzip）

**中间件：** `compression`

**配置：**

| 参数        | 值           | 说明            |
| --------- | ----------- | ------------- |
| level     | 6           | 平衡压缩率与 CPU 占用 |
| threshold | 1024        | 1KB 以下响应不压缩   |
| 排除路径      | `/stream/*` | SSE 流不压缩      |

**预期效果：**

- JSON 响应压缩比约 70-85%

- 减少带宽消耗，加快大列表接口首字节后传输速度

### 9.3 缓存策略

**API 接口：** 默认 `no-store`（无缓存）

所有 `/api/*` 路径自动设置：

```
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate
Pragma: no-cache
Expires: 0
```

> 个别需要缓存的接口（如公开配置、模型列表）可在路由内自行覆盖。

**静态文件** **`/uploads/*`：**

| 文件类型     | Cache-Control                      | 说明     |
| -------- | ---------------------------------- | ------ |
| 图片/视频/音频 | `public, max-age=86400, immutable` | 1 天强缓存 |
| 其他文件     | `public, max-age=3600`             | 1 小时缓存 |
| 开发环境     | 无缓存                                | 便于调试   |

***

