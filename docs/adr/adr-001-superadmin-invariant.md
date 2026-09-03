# ADR-001: 唯一超级管理员不变量

## Context

平台需要一个最高权限角色（superadmin）来管理系统全局配置、用户角色分配、模型管理等敏感操作。如果存在多个超级管理员或超级管理员可以被随意降级，会导致：

1. **权限蔓延**：管理员可以互相提权，无法追溯最终责任人
2. **系统锁死**：如果最后一个 superadmin 把自己降级，系统将无人能管理
3. **安全风险**：入侵拿到任意 admin 账号即可提权为 superadmin
4. **合规问题**：无法满足"最高权限唯一责任人"的审计要求

## Decision Drivers

| Driver | Priority | Evidence | Tradeoff |
| --- | --- | --- | --- |
| 最高权限唯一性 | P0 | 合规审计要求、最小权限原则 | 多 superadmin 协作更灵活，但风险不可控 |
| 防止系统锁死 | P0 | 历史教训：误降级导致后台无法登录 | 需要额外的恢复机制（如数据库直接修改） |
| 操作可追溯 | P1 | 所有管理员操作需有明确责任人 | 唯一责任人成为单点 |
| 角色层级封闭性 | P1 | 只能向下操作，不能同级或向上 | 增加角色管理复杂度 |

## Options Considered

| Option | Benefits | Costs | Risks | Rejected Or Selected Because |
| --- | --- | --- | --- | --- |
| **唯一 superadmin + 邮箱锁定** | 安全、简单、可审计 | 单点故障（人） | 忘记密码需走 DB 恢复 | **Selected** — 安全优先，单点风险可通过密钥备份和紧急恢复流程缓解 |
| 多 superadmin 对等 | 容错、协作方便 | 权限蔓延、无法问责 | 一个被攻破全部沦陷 | Rejected — 违反最小权限原则，且审计无法定位责任人 |
| 多 superadmin + 二次确认 | 兼顾安全与容错 | 实现复杂、操作繁琐 | 提权流程仍可能被绕过 | Rejected — MVP 阶段复杂度过高，收益不明显 |
| 无 superadmin，配置全走代码 | 最高安全性 | 运维效率极低，配置变更需要发版 | 业务运营无法快速调整 | Rejected — 不符合产品运营需求 |

## Decision

**系统有且仅有 1 个 superadmin 角色，其邮箱固定为 `admin@manktv.com`。**

具体规则：

1. **唯一性约束**：任何时刻数据库中 `role = 'superadmin'` 的用户有且仅有 1 个
2. **邮箱绑定**：唯一 superadmin 的邮箱必须是 `admin@manktv.com`，不可修改
3. **禁止外部注册**：注册接口禁止使用 `admin@manktv.com` 邮箱
4. **禁止自降**：superadmin 不能把自己的角色降级
5. **禁止提权**：admin 不能将任何用户（包括自己）提升为 superadmin
6. **层级封闭**：只能看到/操作角色层级 **严格低于** 自己的用户
7. **删除需验证**：删除用户必须二次验证操作者密码
8. **启动纠偏**：服务启动/seed 时校验 superadmin 唯一性，若有异常自动回滚并报错

## Status

✅ Accepted — 已在 `middleware/auth.ts`、`routes/admin.ts`、`prisma/seed.ts` 中实现。

## Bounded Context Map

| Context | Responsibility | Model/Language | Owned Data | Upstream Dependencies | Downstream Consumers | Translation Surface |
| --- | --- | --- | --- | --- | --- | --- |
| Identity & Access | 认证、角色、权限 | User, roleLevel, JWT | User.role, User.email | None | Admin, Billing, Community, Moderation | 角色层级数值映射 |

## Runtime Dependency Adoption

| Dependency | Capability Needed | Failure Mode | Timeout/Retry/Fallback | Adoption Criteria | Revisit Trigger |
| --- | --- | --- | --- | --- | --- |
| User 表（Prisma/SQLite） | 角色数据持久化 | DB 不可用 → 所有登录失败 | N/A（同步阻塞） | 数据一致性 > 可用性 | 切换到 PostgreSQL 时需重新评估事务隔离级别 |
| bcryptjs | 密码哈希校验 | 库漏洞 → 密码泄露风险 | N/A | 行业标准、广泛审计 | 出现更优算法（如 Argon2）且迁移成本可接受 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Decision Record | Owner |
| --- | --- | --- | --- | --- | --- |
| superadmin 密码遗忘 | Medium | High | DB 紧急恢复文档 + 密钥备份 | ADR-001 | 运维负责人 |
| superadmin 邮箱被黑 | Low | Critical | 强密码 + 定期轮换 + 操作审计日志 | ADR-001 | 安全负责人 |
| 开发者误操作修改 role | Medium | High | seed 启动纠偏 + 代码层禁止 update role 为 superadmin | ADR-001 | 技术负责人 |
| 业务需要多个最高管理员 | Low | Medium | 用 admin 角色协作，superadmin 仅作紧急兜底 | ADR-001 | 产品负责人 |

## Consequences

### 正面
- 最高权限边界清晰，审计可定位到唯一责任人
- 防止提权攻击路径（admin → superadmin）
- 启动时自动纠偏，避免数据不一致导致的权限混乱
- 符合等保合规对"最高权限唯一"的基本要求

### 负面
- superadmin 成为人员单点，需建立紧急恢复流程
- 多人协作场景下 admin 角色权限可能不足，需要细化角色粒度
- 邮箱硬编码在代码中，更换邮箱需发版

## Evidence

- `server/src/middleware/auth.ts` — `roleLevel` 层级定义、`requireRole` 校验
- `server/src/routes/admin.ts` — 用户 CRUD、角色操作、删除二次确认
- `server/prisma/seed.ts` — 启动时唯一性纠偏逻辑
- `server/src/routes/auth.ts` — 注册接口禁止保留邮箱

## Revisit Triggers

1. **团队规模超过 20 人**：可能需要细化角色粒度（如增加 `financial_admin`、`content_admin`）
2. **合规要求变化**：如等保三级要求多人审批制
3. **出现重大安全事件**：提权漏洞或内部作案
4. **引入第三方身份提供商**：如企业 SSO，角色体系可能重构
5. **多租户架构**：每个租户需要自己的 superadmin
