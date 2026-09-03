# 领域上下文地图（Bounded Context Map）

> 本文档定义系统的领域上下文边界、各上下文的职责、数据所有权、以及上下文之间的关系。
>
> 关系类型说明：
> - **Partnership**：合作关系，双方共同演进
> - **Customer/Supplier**：客户/供应商，下游客户影响上游供应商的接口
> - **Conformist**：遵从者，下游完全遵从上游的模型
> - **Anti-Corruption Layer (ACL)**：防腐层，下游通过翻译层隔离上游模型
> - **Shared Kernel**：共享内核，双方共享部分模型
> - **Separate Ways**：各行其道，无集成关系

---

## 上下文总览

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Presentation Layer                            │
│  ┌──────────┐  ┌───────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │  Web 前端│  │ 管理后台  │  │  社区广场 │  │  创作者工作区    │ │
│  └────┬─────┘  └─────┬─────┘  └─────┬─────┘  └────────┬─────────┘ │
└───────┼──────────────┼──────────────┼───────────────────┼───────────┘
        │              │              │                   │
┌───────▼──────────────▼──────────────▼───────────────────▼───────────┐
│                        API Gateway / Router                          │
└───┬──────────┬──────────┬──────────┬──────────┬──────────┬──────────┘
    │          │          │          │          │          │
┌───▼──┐  ┌───▼──┐  ┌────▼────┐ ┌──▼────┐ ┌───▼───┐ ┌────▼─────┐
│Identity│  │Auth  │  │ Billing │ │ Gen   │ │Moder- │ │Community │
│ &Access│  │(登录)│  │ & Quota │ │(AI生成)│ │ation  │ │ (社区)   │
└───┬───┘  └───┬──┘  └────┬────┘ └──┬────┘ └───┬───┘ └────┬─────┘
    │          │          │         │          │          │
    │    ┌─────▼─────┐    │         │          │          │
    └────► User 表   ◄────┘         │          │          │
         └─────┬─────┘              │          │          │
               │                    │          │          │
         ┌─────▼─────┐        ┌────▼─────┐ ┌──▼──────────▼──┐
         │ UserQuota │        │Generation│ │ ModerationLog │
         └───────────┘        │  Log     │ └────────────────┘
                              └────┬─────┘
                                   │
                              ┌────▼─────┐
                              │ AIModel  │
                              │ AIProvider│
                              └──────────┘
```

---

## 各上下文详情

### 1. Identity & Access（身份与权限）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 用户账号管理、角色体系、权限校验、UID 生成 |
| **Model/Language** | User, role, roleLevel, uid, permission |
| **Owned Data** | User 表（id, uid, email, password, nickname, role, riskLevel 等） |
| **Upstream** | 无（最上游） |
| **Downstream** | Auth, Billing, Community, Moderation, Generation |
| **Relationship** | Customer/Supplier — 下游上下文依赖身份数据，但不影响身份模型 |
| **Translation Surface** | userId, roleLevel 数值映射 |
| **Owner / Check Path** | 后端负责人 / `server/src/middleware/auth.ts` |
| **关联 ADR** | ADR-001, ADR-004 |

### 2. Auth（认证登录）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 多种登录方式（密码/验证码/微信）、JWT 签发、登录状态管理 |
| **Model/Language** | token, credential, session, loginMethod |
| **Owned Data** | 无（不存储额外数据，依赖 Identity 上下文的 User 表） |
| **Upstream** | Identity & Access（用户数据） |
| **Downstream** | 所有需要登录的模块 |
| **Relationship** | Conformist — 完全遵从 Identity 的用户模型 |
| **Translation Surface** | account → uid/email 自动识别 |
| **Owner / Check Path** | 后端负责人 / `server/src/routes/auth.ts` |
| **关联 ADR** | ADR-004 |

### 3. Billing & Quota（计费与额度）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 额度账户管理、充值、订阅、套餐、消费记录 |
| **Model/Language** | tokens, quota, plan, payment, subscription |
| **Owned Data** | UserQuota, PaymentOrder, Subscription |
| **Upstream** | Identity & Access（用户身份） |
| **Downstream** | AI Generation（扣减额度）、Admin（手动充值） |
| **Relationship** | Customer/Supplier（上游：Identity）+ Customer（下游：Generation 是额度的消费者） |
| **Translation Surface** | costTokens, remainingTokens |
| **Owner / Check Path** | 后端负责人 / `server/src/lib/generation.ts` |
| **关联 ADR** | ADR-002 |

### 4. AI Generation（AI 生成）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 文本/图像/漫画/音频/视频生成、模型管理、异步任务、生成日志 |
| **Model/Language** | prompt, model, generation, task, output |
| **Owned Data** | GenerationLog, AIModel, AIProvider, UserTask, Project/Volume/Chapter |
| **Upstream** | Billing & Quota（额度）、Content Moderation（审核门控）、Identity（用户身份） |
| **Downstream** | Community（发布作品）、Canvas（画布工作流） |
| **Relationship** | ACL（防腐层）— 调用第三方 AI 服务时封装为内部模型 |
| **Translation Surface** | 统一的生成接口格式，屏蔽不同供应商差异 |
| **Owner / Check Path** | 后端负责人 / `server/src/lib/llmRoute.ts` |
| **关联 ADR** | ADR-002, ADR-003 |

### 5. Content Moderation（内容审核）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 输入/输出双审核、用户风险等级、审核记录、敏感词库 |
| **Model/Language** | moderation, riskLevel, violation, category, stage |
| **Owned Data** | ModerationLog, User.riskLevel / violationCount |
| **Upstream** | Identity & Access（用户风险等级存储在 User 表） |
| **Downstream** | AI Generation（门控）、Admin（审核管理） |
| **Relationship** | Customer/Supplier — Generation 依赖审核结果 |
| **Translation Surface** | riskLevel 数值、审核结果枚举 |
| **Owner / Check Path** | 安全负责人 / `server/src/lib/moderation.ts` |
| **关联 ADR** | ADR-003 |

### 6. Community（社区）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 作品发布、评论、点赞、社区广场、作品管理 |
| **Model/Language** | work, comment, like, feed, publish |
| **Owned Data** | Work, Comment, Like |
| **Upstream** | Identity（用户）、AI Generation（作品来源） |
| **Downstream** | 无（最下游，面向用户展示） |
| **Relationship** | Conformist — 遵从 Identity 的用户模型 |
| **Translation Surface** | userId, workId |
| **Owner / Check Path** | 后端负责人 / `server/src/routes/community.ts` |
| **关联不变量** | 点赞唯一、计数一致性 |

### 7. Admin（管理后台）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 用户管理、作品管理、订单管理、模型管理、站点配置、审核管理 |
| **Model/Language** | admin, moderation, config, dashboard |
| **Owned Data** | SiteConfig, SiteConfigAuditLog, ModuleFeature |
| **Upstream** | Identity & Access（权限校验）、其他所有上下文（管理其数据） |
| **Downstream** | 无（管理操作的终点） |
| **Relationship** | ACL（防腐层）— 管理操作通过独立接口，不与业务接口混用 |
| **Translation Surface** | 管理视图 vs 业务视图 |
| **Owner / Check Path** | 技术负责人 / `server/src/routes/admin.ts` |
| **关联 ADR** | ADR-001 |

### 8. Site Config（站点配置）

| 项目 | 内容 |
|------|------|
| **Responsibility** | 全局配置管理、可视化配置、配置审计、配置缓存 |
| **Model/Language** | config, group, key, value, audit |
| **Owned Data** | SiteConfig, SiteConfigAuditLog |
| **Upstream** | Admin（配置修改入口） |
| **Downstream** | 所有业务上下文（读取配置） |
| **Relationship** | Shared Kernel — 所有上下文共享配置读取接口 |
| **Translation Surface** | 统一的 getSiteConfig / setSiteConfig API |
| **Owner / Check Path** | 后端负责人 / `server/src/lib/siteConfig.ts` |
| **关联不变量** | 配置变更必有审计 |

---

## 上下文关系矩阵

| 上下文 | Identity | Auth | Billing | Generation | Moderation | Community | Admin | SiteConfig |
|--------|----------|------|---------|------------|------------|-----------|-------|------------|
| **Identity** | - | 上游 | 上游 | 上游 | 上游 | 上游 | 上游 | 旁侧 |
| **Auth** | 下游 | - | 无 | 旁侧 | 无 | 旁侧 | 旁侧 | 旁侧 |
| **Billing** | 下游 | 无 | - | 上游 | 无 | 无 | 下游 | 旁侧 |
| **Generation** | 下游 | 旁侧 | 下游 | - | 下游 | 上游 | 下游 | 下游 |
| **Moderation** | 下游 | 无 | 无 | 上游 | - | 无 | 下游 | 下游 |
| **Community** | 下游 | 旁侧 | 无 | 下游 | 无 | - | 下游 | 下游 |
| **Admin** | 下游 | 旁侧 | 上游 | 上游 | 上游 | 上游 | - | 上游 |
| **SiteConfig** | 旁侧 | 旁侧 | 旁侧 | 下游 | 下游 | 下游 | 下游 | - |

---

## 架构边界原则

1. **数据所有权**：每个上下文拥有自己的数据，其他上下文只能通过接口访问，不得直连修改
2. **依赖方向**：业务依赖自上而下发散，避免循环依赖
3. **防腐层**：与外部系统（AI 供应商、微信、163 邮箱）交互时必须有 ACL，屏蔽外部模型变化
4. **共享最小化**：共享内核仅限于 SiteConfig 等通用基础设施，业务数据不共享
5. **独立演进**：每个上下文可独立优化内部实现，只要对外契约不变

---

> **维护说明**：新增功能模块时，先确定其所属上下文或是否需要新建上下文，并更新本文档。
