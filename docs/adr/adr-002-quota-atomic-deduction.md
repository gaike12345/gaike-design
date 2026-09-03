# ADR-002: 额度原子预扣与余额一致性

## Context

AI 生成服务按 token 计费，用户有额度账户（UserQuota），每次生成消耗一定积分。核心挑战：

1. **并发安全**：同一用户同时发起多个生成请求，可能超额消耗（TOCTOU 竞态）
2. **一致性**：`remainingTokens = totalTokens - usedTokens` 必须始终成立
3. **失败处理**：生成失败时必须退还积分，不能多扣
4. **异步任务**：视频生成等异步场景，额度扣减与任务结算需保证正确

如果额度系统出问题，直接影响营收和用户信任：多扣 = 用户投诉，少扣 = 资损。

## Decision Drivers

| Driver | Priority | Evidence | Tradeoff |
| --- | --- | --- | --- |
| 并发下不超扣 | P0 | 高频生成场景（批量出图、分镜生成） | 乐观锁需重试，影响延迟 |
| 余额恒等式 | P0 | 财务对账要求 | 预扣制增加了中间状态的复杂度 |
| 失败必退还 | P0 | 用户体验 + 合规 | 需要 try/finally 全覆盖 |
| 性能可接受 | P1 | 生成接口本身耗时长，扣减开销可忽略 | 悲观锁会显著降低并发 |
| 可审计 | P1 | 每笔消耗都要有记录 | 增加存储成本 |

## Options Considered

| Option | Benefits | Costs | Risks | Rejected Or Selected Because |
| --- | --- | --- | --- | --- |
| **原子预扣（updateMany + where gte）** | 无锁、DB 层保证、性能好 | 失败后需主动退还 | 极端情况下退还失败导致额度丢失 | **Selected** — 并发安全且性能最优，失败退还风险可通过 GenerationLog 对账修复 |
| 先查后改（select + update） | 实现简单 | 有 TOCTOU 竞态，并发下必超扣 | 超额消耗、资损 | Rejected — 并发场景下根本不安全 |
| 悲观锁（SELECT FOR UPDATE） | 强一致 | 性能差、死锁风险 | 高并发下接口超时 | Rejected — SQLite 不支持 SELECT FOR UPDATE，且性能代价过高 |
| 分布式锁（Redis） | 跨进程安全 | 引入 Redis 依赖、实现复杂 | 锁过期/释放问题 | Rejected — MVP 阶段单实例部署，复杂度收益比太低 |
| 队列串行化 | 绝对安全 | 延迟高、吞吐量低 | 用户等待时间过长 | Rejected — 生成类操作本身可并行，串行化无必要 |

## Decision

**采用数据库原子预扣模式（updateMany + where gte），配合预扣制和 GenerationLog 对账。**

具体机制：

1. **只读预检**：先查余额做友好提示（仅提示，不做扣减依据）
2. **原子预扣**：`updateMany where userId=X AND remainingTokens >= cost`，影响行数 > 0 表示成功
3. **成功结算**：生成成功后，`usedTokens += cost`（使用 increment 原子操作）
4. **失败退还**：生成失败时，`remainingTokens += cost` 退还预扣额度
5. **异步任务**：任务创建时预扣，Worker 结算时多退少补
6. **日志必写**：每次生成都写 GenerationLog（含 tokensUsed、status），用于事后对账
7. **充值原子加**：充值到账使用 `increment`，禁止读改写

余额恒等式：`remainingTokens + usedTokens + (preDeductedInFlight) = totalTokens`

> 注：预扣中的额度不在 remaining 也不在 used 中，属于中间态。正常流程下预扣时间很短（秒级），异常情况由 GenerationLog 对账修复。

## Status

✅ Accepted — 已在 `lib/generation.ts`、`middleware/generation.ts` 中实现。

## Bounded Context Map

| Context | Responsibility | Model/Language | Owned Data | Upstream Dependencies | Downstream Consumers | Translation Surface |
| --- | --- | --- | --- | --- | --- | --- |
| Billing & Quota | 额度管理、充值、订阅 | UserQuota, PaymentOrder, tokens | UserQuota.*, PaymentOrder | Identity（用户身份） | Generation（扣减）、Admin（手动充值） | token 数值、costTokens |
| AI Generation | 调用 AI 模型、生成内容 | GenerationLog, AIModel, cost | GenerationLog | Billing（额度）、Moderation（审核） | Community（发布作品） | 消耗 token 数 |

## Runtime Dependency Adoption

| Dependency | Capability Needed | Failure Mode | Timeout/Retry/Fallback | Adoption Criteria | Revisit Trigger |
| --- | --- | --- | --- | --- | --- |
| UserQuota 表（SQLite 事务） | 原子扣减 | DB 写入失败 → 无法扣减 → 拒绝生成 | N/A（同步阻塞，生成前置） | 一致性 > 可用性 | 切换 PostgreSQL 后可考虑更复杂的事务隔离 |
| GenerationLog 表 | 消费记录审计 | 写入失败 → 记录丢失 → 无法对账 | 异步重试 + 告警 | 记录完整性 | 日志量过大时考虑分表或归档 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Decision Record | Owner |
| --- | --- | --- | --- | --- | --- |
| 预扣后进程崩溃，额度永久丢失 | Low | Medium | 启动时扫描 GenerationLog 中 pending 状态的记录，自动对账退还 | ADR-002 | 后端负责人 |
| 并发量过大导致冲突频繁 | Low | Low | 原子预扣本身无冲突，但预检阶段可能误导用户 | ADR-002 | 后端负责人 |
| SQLite 单文件锁瓶颈 | Medium | Medium | 写操作串行化，但生成操作耗时远大于扣减，瓶颈在 AI 调用 | ADR-002 | 运维负责人 |
| 开发者绕过 withGeneration 直接扣减 | Medium | High | 代码审查 + 只有 generation.ts 暴露扣减函数 | ADR-002 | 技术负责人 |

## Consequences

### 正面
- 并发下绝对不会超扣（DB 层原子保证）
- 性能开销可忽略（一次 updateMany 操作）
- 无额外基础设施依赖（不依赖 Redis 等）
- GenerationLog 提供完整审计轨迹，可事后对账

### 负面
- 预扣中间态增加了理解复杂度
- 极端异常（进程崩溃）可能导致额度"悬空"，需对账修复
- 开发者必须使用 `withGeneration` 中间件，不能直接操作 UserQuota
- SQLite 单连接下写操作串行，但生成瓶颈在 AI 调用，影响可忽略

## Evidence

- `server/src/lib/generation.ts` — 额度扣减核心函数（`deductTokens`, `refundTokens`）
- `server/src/middleware/generation.ts` — `withGeneration` 中间件封装
- `server/src/routes/billing.ts` — 充值事务（原子 increment）
- `server/src/lib/taskWorker.ts` — 异步任务额度结算

## Revisit Triggers

1. **并发量 > 100 QPS**：SQLite 写锁可能成为瓶颈，考虑迁移 PostgreSQL
2. **出现资损事件**：对账发现额度不一致，需加强防护
3. **引入多实例部署**：当前单实例假设不再成立，需验证跨实例一致性
4. **用户量 > 10 万**：GenerationLog 表膨胀，需考虑分表或归档策略
5. **支持钱包/多币种**：额度模型复杂化，需重新设计账务系统
