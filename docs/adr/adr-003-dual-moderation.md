# ADR-003: 双审核与用户风险等级体系

## Context

根据《生成式人工智能服务管理暂行办法》，AI 生成服务必须对输入和输出进行内容安全审核。同时需要对违规用户进行分级管理，避免一刀切封禁影响正常用户体验。

核心问题：
1. **合规要求**：必须有输入+输出审核，不能直接生成
2. **性能平衡**：审核不能显著增加生成延迟
3. **降级策略**：第三方审核服务挂了怎么办
4. **用户分层**：不同违规程度的用户应有不同的处理策略

## Decision Drivers

| Driver | Priority | Evidence | Tradeoff |
| --- | --- | --- | --- |
| 合规性（双审核） | P0 | 《生成式人工智能服务管理暂行办法》第十四条 | 增加延迟和成本 |
| 零延迟兜底 | P1 | 用户体验、第三方服务可用性 | 本地词库准确率有限 |
| 用户分级管理 | P1 | 精准管控，避免误杀 | 规则设计复杂 |
| 审核记录不可篡改 | P1 | 合规审计、防抵赖 | append-only 增加存储 |
| 故障降级 | P2 | 第三方服务不可用时仍能提供服务 | 降级期间风险升高 |

## Options Considered

| Option | Benefits | Costs | Risks | Rejected Or Selected Because |
| --- | --- | --- | --- | --- |
| **双层审核（本地词库 + 第三方服务）** | 本地零延迟兜底，第三方高精度 | 两套维护成本 | 第三方挂了时只有本地审核，风险升高 | **Selected** — 兼顾性能与安全，降级风险可控 |
| 纯第三方审核 | 准确率高、维护成本低 | 延迟高（网络往返）、依赖第三方 | 第三方故障 → 服务完全不可用 | Rejected — 单点依赖风险太高，且延迟不可接受 |
| 纯本地审核 | 零延迟、完全可控 | 准确率低、维护成本高 | 漏审风险高，不合规 | Rejected — 无法满足合规要求的准确性 |
| 后置审核（先发后审） | 用户体验最好 | 违规内容已扩散 | 合规风险极高 | Rejected — 违反监管要求 |

## Decision

**采用"本地敏感词 + 第三方服务"双层审核架构，配合用户风险等级自动升降级。**

### 双审核机制

**第一层：本地敏感词扫描（零延迟兜底）**
- 6 大违规类别：政治(high)、暴恐(high)、色情(high)、赌博(medium)、毒品(high)、侮辱(medium)
- 三档严格度：loose / standard / strict（可在后台配置）
- 默认词库 + 后台可配置扩展词库（SiteConfig 可视化管理）

**第二层：服务商审核（配置 API Key 后启用）**
- 支持阿里云内容安全 Green 和智谱 Moderation API
- 服务商故障时**降级不阻断**：仅记录日志，不影响生成流程

### 用户风险等级体系

| 等级 | 名称 | 生成权限 | 说明 |
|------|------|----------|------|
| 0 | 正常 | 无限制 | 新用户默认等级 |
| 1 | 警告 | 正常生成 | 标记关注，审核更严格 |
| 2 | 限制 | 可生成但需人工复核 | 内容先审后发 |
| 3 | 封禁 | 拒绝所有 AI 生成 | 严重违规 |

**自动升降级规则**：
- high 违规：1 次 → 2 级，2 次 → 3 级
- medium 违规：2 次 → 1 级，4 次 → 2 级，6 次 → 3 级
- low 违规：3 次 → 1 级，6 次 → 2 级

### 审核记录 Append-Only

- `ModerationLog` 表：仅 create + read，无 update/delete 接口
- 截断存储 500 字，避免存储膨胀
- 记录字段：stage / endpoint / content / result / riskLevel / categories / provider

## Status

✅ Accepted — 已在 `lib/moderation.ts`、`lib/llmRoute.ts` 中实现。

## Bounded Context Map

| Context | Responsibility | Model/Language | Owned Data | Upstream Dependencies | Downstream Consumers | Translation Surface |
| --- | --- | --- | --- | --- | --- | --- |
| Content Moderation | 输入/输出审核、风险等级、审核记录 | ModerationLog, riskLevel, categories | ModerationLog, User.riskLevel | Identity（用户）、Generation（内容） | Generation（门控）、Admin（管理） | riskLevel 数值、审核结果 |
| AI Generation | 调用 AI 模型 | GenerationLog | - | Moderation（门控）、Billing（额度） | Community（作品） | 审核通过/拒绝 |

## Runtime Dependency Adoption

| Dependency | Capability Needed | Failure Mode | Timeout/Retry/Fallback | Adoption Criteria | Revisit Trigger |
| --- | --- | --- | --- | --- | --- |
| 第三方审核 API（阿里云/智谱） | 高精度内容审核 | 网络超时、服务不可用 | 超时 3s，失败降级（不阻断生成） | 配置了 API Key 才启用，无 Key 时纯本地 | 出现更优的审核方案或成本大幅变化 |
| 本地敏感词库 | 零延迟兜底审核 | 词库不全 → 漏审 | N/A（内存操作） | 无 API Key 时的必选兜底 | 监管要求升级，本地审核无法满足 |
| ModerationLog 表 | 审核记录持久化 | DB 写入失败 | 同步阻塞，失败不阻断生成（仅日志丢失） | append-only，写入性能要求不高 | 日志量过大需分表 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Decision Record | Owner |
| --- | --- | --- | --- | --- | --- |
| 第三方审核长时间不可用 | Medium | Medium | 降级到本地审核 + 加强人工巡检 + 告警 | ADR-003 | 安全负责人 |
| 本地词库漏审率高 | Medium | Medium | 定期更新词库 + 第三方审核结果反哺 | ADR-003 | 内容运营 |
| 误封正常用户 | Low | High | 风险等级梯度设计 + 申诉渠道 + 人工复核 | ADR-003 | 产品负责人 |
| 审核记录被篡改 | Low | High | append-only + 无 update/delete 接口 | ADR-003 | 技术负责人 |
| 审核延迟影响生成速度 | Medium | Low | 本地词库先拦截，第三方异步进行（可优化） | ADR-003 | 后端负责人 |

## Consequences

### 正面
- 符合监管要求的双审核机制
- 本地兜底确保第三方故障时服务可用
- 用户分级管理，精准管控，避免一刀切
- 审核记录完整可审计
- 后台可视化配置，运营可自助调整

### 负面
- 两套审核体系增加了维护成本
- 降级期间审核质量下降，需人工巡检补位
- 风险等级规则需要持续调优
- ModerationLog 表增长较快，需定期归档

## Evidence

- `server/src/lib/moderation.ts` — 双审核核心逻辑（550+ 行）
- `server/src/lib/llmRoute.ts` — LLM 路由封装，内嵌双审核流程
- `server/src/routes/adminModeration.ts` — 审核管理后台接口
- `server/prisma/schema.prisma` — ModerationLog 模型定义

## Revisit Triggers

1. **监管政策变化**：审核要求升级或降级
2. **审核漏审/误审率高**：用户投诉增多或合规检查不通过
3. **第三方审核成本过高**：调用费用超出预算
4. **用户量 > 10 万**：ModerationLog 表膨胀，需分表或归档
5. **引入新的内容类型**：如视频、3D 模型等，审核维度变化
