# 架构适应度函数规范

> 架构适应度函数（Architecture Fitness Function）是可自动验证的架构不变量检查。每个函数定义了"系统必须满足的属性"，以及如何度量、阈值是多少、违反时如何响应。
>
> 目的：将 ADR 中的决策转化为可执行、可验证的工程约束，防止后续迭代中架构漂移。

---

## 快速使用

```bash
# 运行全部检查
npm run arch:check

# 仅数据库一致性
npm run arch:check:db

# 仅代码静态扫描
npm run arch:check:code
```

所有检查通过返回退出码 0，有失败返回 1，可直接接入 CI 阻断合并。

检查脚本位置：`server/scripts/arch-check-*.ts`

---

## 一、身份与权限

### FF-001: 唯一超级管理员

| 属性 | 详情 |
|------|------|
| **Property** | 系统有且仅有 1 个 superadmin，且邮箱为 `admin@manktv.com` |
| **Metric** | `SELECT COUNT(*) FROM User WHERE role = 'superadmin'` 和 `SELECT email FROM User WHERE role = 'superadmin'` |
| **Threshold** | count = 1 AND email = 'admin@manktv.com' |
| **Measurement Source** | Prisma 直接查询 User 表 |
| **Evaluation Cadence** | 服务启动时 / seed 执行时 / 每次角色变更操作后 |
| **Failure Response** | 启动时：报错退出；运行时：事务回滚 + 错误日志 |
| **Local Check Path** | `server/prisma/seed.ts` 唯一性纠偏 / `server/src/routes/admin.ts` 事务内校验 |
| **ADR 关联** | ADR-001 |

### FF-002: 角色层级封闭性

| 属性 | 详情 |
|------|------|
| **Property** | 管理员只能看到/操作角色严格低于自己的用户 |
| **Metric** | 代码审查：所有 `requireRole` 调用是否使用正确的层级比较；运行时：尝试越权操作应返回 403 |
| **Threshold** | 越权操作 100% 被拦截 |
| **Measurement Source** | 集成测试 + 代码静态检查 |
| **Evaluation Cadence** | 每次代码提交（PR 审查） / 回归测试 |
| **Failure Response** | PR 不通过 / 线上告警 |
| **Local Check Path** | `server/src/middleware/auth.ts` roleLevel 比较逻辑 |
| **ADR 关联** | ADR-001 |

### FF-003: 注册接口禁止保留邮箱

| 属性 | 详情 |
|------|------|
| **Property** | `admin@manktv.com` 不能通过注册接口被占用 |
| **Metric** | 调用注册接口使用保留邮箱，应返回 403 |
| **Threshold** | 100% 拦截 |
| **Measurement Source** | 接口集成测试 |
| **Evaluation Cadence** | 每次 auth 相关代码变更 |
| **Failure Response** | 测试失败，阻止合并 |
| **Local Check Path** | `server/src/routes/auth.ts` 注册接口前置校验 |
| **ADR 关联** | ADR-001 |

### FF-004: 删除用户需二次验证

| 属性 | 详情 |
|------|------|
| **Property** | 删除用户必须验证操作者密码 |
| **Metric** | 无密码或密码错误的删除请求应返回 401 |
| **Threshold** | 100% 拦截 |
| **Measurement Source** | 接口集成测试 |
| **Evaluation Cadence** | 每次 admin 相关代码变更 |
| **Failure Response** | 测试失败，阻止合并 |
| **Local Check Path** | `server/src/routes/admin.ts` 删除接口 |
| **ADR 关联** | ADR-001 |

---

## 二、额度与计费

### FF-005: 余额恒等式

| 属性 | 详情 |
|------|------|
| **Property** | 每个用户的 `remainingTokens + usedTokens = totalTokens`（不含在途预扣） |
| **Metric** | `SELECT COUNT(*) FROM UserQuota WHERE remainingTokens + usedTokens != totalTokens` |
| **Threshold** | count = 0 |
| **Measurement Source** | 定时任务对账 / 手动对账脚本 |
| **Evaluation Cadence** | 每日凌晨 / 每次发布后 |
| **Failure Response** | 告警 + 自动修复（根据 GenerationLog 重算） |
| **Local Check Path** | 待实现：`scripts/reconcile-quota.ts` |
| **ADR 关联** | ADR-002 |

### FF-006: 额度扣减原子性

| 属性 | 详情 |
|------|------|
| **Property** | 并发下不会超扣（TOCTOU 防护） |
| **Metric** | 并发测试：同一用户同时发起 N 个生成请求，最终 usedTokens 不应超过初始余额 |
| **Threshold** | 100% 不超扣 |
| **Measurement Source** | 并发压测脚本 |
| **Evaluation Cadence** | 额度系统重大变更时 / 季度回归 |
| **Failure Response** | 阻断发布 |
| **Local Check Path** | `server/src/lib/generation.ts` updateMany + where gte 逻辑 |
| **ADR 关联** | ADR-002 |

### FF-007: 生成失败必退还

| 属性 | 详情 |
|------|------|
| **Property** | AI 生成失败时，预扣的额度必须退还 |
| **Metric** | 模拟生成失败，检查额度是否恢复 |
| **Threshold** | 100% 退还 |
| **Measurement Source** | 单元测试 + 集成测试 |
| **Evaluation Cadence** | 每次生成中间件变更 |
| **Failure Response** | 测试失败，阻止合并 |
| **Local Check Path** | `server/src/middleware/generation.ts` withGeneration try/finally |
| **ADR 关联** | ADR-002 |

### FF-008: 充值使用原子 increment

| 属性 | 详情 |
|------|------|
| **Property** | 充值到账必须使用 Prisma increment，禁止读改写 |
| **Metric** | 代码审查：billing.ts 中所有额度增加操作是否使用 increment |
| **Threshold** | 0 处读改写 |
| **Measurement Source** | 代码静态检查 / PR 审查 |
| **Evaluation Cadence** | 每次 billing 代码变更 |
| **Failure Response** | PR 不通过 |
| **Local Check Path** | `server/src/routes/billing.ts` |
| **ADR 关联** | ADR-002 |

---

## 三、内容安全

### FF-009: 双审核必走

| 属性 | 详情 |
|------|------|
| **Property** | 所有 AI 生成接口必须经过输入审核 → 生成 → 输出审核流程 |
| **Metric** | 代码审查：新增生成接口是否走 llmRoute 或 withGeneration + moderation |
| **Threshold** | 100% 覆盖 |
| **Measurement Source** | 代码审查 + 静态检查（搜索所有 AI 调用点） |
| **Evaluation Cadence** | 每次新增生成接口 |
| **Failure Response** | PR 不通过 |
| **Local Check Path** | `server/src/lib/llmRoute.ts` / `server/src/lib/moderation.ts` |
| **ADR 关联** | ADR-003 |

### FF-010: 审核记录 Append-Only

| 属性 | 详情 |
|------|------|
| **Property** | ModerationLog 表只有 create 和 read 接口，没有 update/delete |
| **Metric** | 全局搜索 ModerationLog 的 update / delete 调用 |
| **Threshold** | 0 处 |
| **Measurement Source** | 代码静态检查（grep） |
| **Evaluation Cadence** | 每次 moderation 相关变更 / 月度扫描 |
| **Failure Response** | PR 不通过 / 告警 |
| **Local Check Path** | `server/prisma/schema.prisma` ModerationLog 模型 |
| **ADR 关联** | ADR-003 |

### FF-011: 风险等级 3 级封禁生成

| 属性 | 详情 |
|------|------|
| **Property** | riskLevel >= 3 的用户调用 AI 生成接口应被拒绝 |
| **Metric** | 用 3 级风险用户调用生成接口，应返回 403 |
| **Threshold** | 100% 拒绝 |
| **Measurement Source** | 集成测试 |
| **Evaluation Cadence** | 每次生成接口变更 |
| **Failure Response** | 测试失败，阻止合并 |
| **Local Check Path** | `server/src/lib/llmRoute.ts` 风险门控 / `server/src/middleware/generation.ts` |
| **ADR 关联** | ADR-003 |

---

## 四、UID 账号

### FF-012: UID 全局唯一

| 属性 | 详情 |
|------|------|
| **Property** | User.uid 全局唯一，无重复 |
| **Metric** | `SELECT uid, COUNT(*) as c FROM User GROUP BY uid HAVING c > 1` |
| **Threshold** | 0 条重复 |
| **Measurement Source** | 数据库查询 / DB 唯一索引自动保证 |
| **Evaluation Cadence** | 每日巡检 / 每次用户创建逻辑变更 |
| **Failure Response** | 严重告警 + 紧急修复 |
| **Local Check Path** | `server/prisma/schema.prisma` User.uid @unique |
| **ADR 关联** | ADR-004 |

### FF-013: 用户创建必生成 UID

| 属性 | 详情 |
|------|------|
| **Property** | 所有用户创建路径都必须调用 uidGenerator，DB 层 uid NOT NULL 兜底 |
| **Metric** | 代码审查：所有 prisma.user.create 调用是否包含 uid 字段 |
| **Threshold** | 100% 包含 |
| **Measurement Source** | 代码静态检查（grep user.create） |
| **Evaluation Cadence** | 每次新增用户创建点 / 月度扫描 |
| **Failure Response** | PR 不通过 |
| **Local Check Path** | `server/src/lib/uidGenerator.ts` |
| **ADR 关联** | ADR-004 |

### FF-014: UID 不可修改

| 属性 | 详情 |
|------|------|
| **Property** | 任何接口不得修改 uid 字段 |
| **Metric** | 全局搜索 user.update 中是否包含 uid 赋值 |
| **Threshold** | 0 处 |
| **Measurement Source** | 代码静态检查（grep） |
| **Evaluation Cadence** | 月度扫描 |
| **Failure Response** | PR 不通过 / 告警 |
| **Local Check Path** | 全局代码 |
| **ADR 关联** | ADR-004 |

---

## 五、社区功能

### FF-015: 点赞联合唯一

| 属性 | 详情 |
|------|------|
| **Property** | 同一用户对同一作品只能点赞一次 |
| **Metric** | `SELECT workId, userId, COUNT(*) FROM Like GROUP BY workId, userId HAVING COUNT(*) > 1` |
| **Threshold** | 0 条重复 |
| **Measurement Source** | DB 联合唯一索引自动保证 |
| **Evaluation Cadence** | 每日巡检 |
| **Failure Response** | 告警 |
| **Local Check Path** | `server/prisma/schema.prisma` Like.@@unique |
| **关联不变量** | 社区功能不变量 |

### FF-016: 点赞计数一致性

| 属性 | 详情 |
|------|------|
| **Property** | Work.likesCount = 该作品的 Like 表记录数 |
| **Metric** | 抽样对比：`SELECT w.likesCount, COUNT(l.id) as actual FROM Work w LEFT JOIN Like l ON w.id = l.workId GROUP BY w.id HAVING w.likesCount != actual` |
| **Threshold** | 偏差率 < 0.1% |
| **Measurement Source** | 定时对账脚本 |
| **Evaluation Cadence** | 每日凌晨 |
| **Failure Response** | 告警 + 自动修复 |
| **Local Check Path** | 待实现：`scripts/reconcile-likes.ts` |
| **关联不变量** | 社区功能不变量 |

---

## 六、配置系统

### FF-017: 配置变更必有审计

| 属性 | 详情 |
|------|------|
| **Property** | 所有 SiteConfig 修改必须在同一事务中写入 SiteConfigAuditLog |
| **Metric** | 代码审查：setSiteConfig 是否在事务中同时写 audit log |
| **Threshold** | 100% 有审计 |
| **Measurement Source** | 代码审查 |
| **Evaluation Cadence** | 每次 siteConfig 代码变更 |
| **Failure Response** | PR 不通过 |
| **Local Check Path** | `server/src/lib/siteConfig.ts` |
| **关联不变量** | 配置系统不变量 |

---

## 七、安全中间件

### FF-018: JWT 密钥强度校验

| 属性 | 详情 |
|------|------|
| **Property** | JWT_SECRET 长度 < 16 字符时服务直接退出 |
| **Metric** | 弱密钥启动测试 |
| **Threshold** | 100% 退出 |
| **Measurement Source** | 单元测试 |
| **Evaluation Cadence** | 每次 JWT 相关代码变更 |
| **Failure Response** | 测试失败，阻止合并 |
| **Local Check Path** | `server/src/lib/jwt.ts` |
| **关联不变量** | 认证安全 |

### FF-019: 登录接口限流

| 属性 | 详情 |
|------|------|
| **Property** | 登录/注册接口有限流保护，防止暴力破解 |
| **Metric** | 超过限流阈值的请求应返回 429 |
| **Threshold** | 默认 30 次/分钟/IP |
| **Measurement Source** | 压测 + 集成测试 |
| **Evaluation Cadence** | 限流配置变更时 / 季度回归 |
| **Failure Response** | 测试失败 |
| **Local Check Path** | `server/src/middleware/rate-limit.ts` / `server/src/routes/auth.ts` |
| **关联不变量** | 安全中间件 |

---

## 验证方式汇总

| 验证方式 | 适用 FF | 频率 |
|----------|---------|------|
| DB 唯一索引（自动保证） | FF-012, FF-015 | 实时 |
| 单元测试 | FF-003, FF-004, FF-007, FF-011, FF-018, FF-019 | 每次 CI |
| 集成测试 | FF-002, FF-006, FF-011 | 每次 CI |
| 代码审查 / 静态检查 | FF-008, FF-009, FF-010, FF-013, FF-014, FF-017 | 每次 PR |
| 定时对账脚本 | FF-005, FF-016 | 每日 |
| 启动时检查 | FF-001 | 每次启动 |
| 并发压测 | FF-006 | 季度 / 重大变更 |

---

> **维护说明**：新增 ADR 或不变量时，必须同步添加对应的适应度函数，并明确验证方式和频率。
