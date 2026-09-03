# ADR-004: UID 账号体系

## Context

用户需要一个简短、易记、唯一的数字账号（UID），用于登录和身份识别。邮箱作为登录标识存在以下问题：

1. **记忆成本高**：邮箱地址长，容易输错
2. **隐私顾虑**：部分用户不愿暴露邮箱
3. **微信用户无邮箱**：微信扫码登录的用户只有占位邮箱，不适合作为登录标识
4. **运营场景**：客服定位用户时，数字 ID 比邮箱更方便

## Decision Drivers

| Driver | Priority | Evidence | Tradeoff |
| --- | --- | --- | --- |
| 全局唯一性 | P0 | 作为登录标识，必须唯一 | 生成时需保证并发安全 |
| 简短易记 | P0 | 用户体验目标：6 位数字 | 位数太少会不够用，太多不好记 |
| 不可修改 | P0 | 作为稳定标识，不能变 | 用户无法自定义 |
| 首次登录自动生成 | P1 | 降低使用门槛 | 所有登录入口都要接入 |
| 与邮箱共存 | P1 | 老用户习惯邮箱登录 | 登录需支持两种方式 |

## Options Considered

| Option | Benefits | Costs | Risks | Rejected Or Selected Because |
| --- | --- | --- | --- | --- |
| **6 位自增数字（应用层生成）** | 简短、有序、可预测 | SQLite 不支持非主键 autoincrement，需应用层实现 | 并发下可能重复（需防护） | **Selected** — 用户体验最优，并发问题可通过 DB 唯一约束兜底 |
| 数据库自增主键当 UID | 实现简单、DB 保证 | SQLite 主键是 cuid（字符串），不适用 | 迁移到 PostgreSQL 时需改 | Rejected — 当前用 cuid 主键，改动太大 |
| 随机数（如 8 位） | 无规律、安全性高 | 不好记、可能碰撞 | 碰撞概率虽低但存在 | Rejected — 不好记，失去 UID 意义 |
| 用户名/昵称登录 | 用户友好 | 昵称可重复、需维护唯一性 | 用户可能忘记用户名 | Rejected — 昵称重名问题难解决，且不如数字通用 |
| 仅邮箱登录 | 实现最简单 | 记忆成本高、隐私问题 | 微信用户体验差 | Rejected — 不符合用户需求 |

## Decision

**采用 6 位自增数字 UID，从 100000 开始，应用层生成 + DB 唯一约束兜底。**

具体规则：

1. **UID 格式**：6 位及以上数字，起始值 100000
2. **生成方式**：查询当前最大 UID → +1 → 插入（依赖 DB 唯一约束防并发冲突）
3. **全局唯一**：User.uid 加唯一索引，冲突时重试生成
4. **不可修改**：任何接口不得修改 uid 字段
5. **登录兼容**：密码登录支持输入 UID 或邮箱，自动识别（纯数字 = UID）
6. **自动生成**：所有创建用户的路径（注册、邮箱验证码登录、微信登录）都必须生成 UID
7. **个人中心展示**：设置页显示 UID，支持一键复制

## Status

✅ Accepted — 已在 `lib/uidGenerator.ts` 及所有用户创建点实现。

## Bounded Context Map

| Context | Responsibility | Model/Language | Owned Data | Upstream Dependencies | Downstream Consumers | Translation Surface |
| --- | --- | --- | --- | --- | --- | --- |
| Identity & Access | 用户身份、认证、UID 生成 | User.uid, account | User.uid | None | Auth（登录）、User Profile（展示） | UID 数值 |
| Auth | 登录认证 | account, password, token | - | Identity（UID 校验） | 所有需要登录的模块 | account 字段（UID/邮箱自动识别） |

## Runtime Dependency Adoption

| Dependency | Capability Needed | Failure Mode | Timeout/Retry/Fallback | Adoption Criteria | Revisit Trigger |
| --- | --- | --- | --- | --- | --- |
| User 表（唯一索引） | UID 唯一性保证 | DB 不可用 → 无法创建用户 | 冲突时最多重试 3 次 | 唯一索引是最后防线 | 用户量 100 万+ 时考虑优化生成策略 |
| uidGenerator 模块 | UID 生成逻辑 | 逻辑 bug → 重复/跳号 | N/A | 集中管理，所有创建点统一调用 | 引入分布式 ID 生成器时替换 |

## Risk Register

| Risk | Likelihood | Impact | Mitigation | Decision Record | Owner |
| --- | --- | --- | --- | --- | --- |
| 并发创建导致 UID 冲突 | Low | Low | DB 唯一约束 + 重试 3 次 | ADR-004 | 后端负责人 |
| UID 耗尽（6 位不够用） | Very Low | Medium | 自动增长到 7 位、8 位...（无上限） | ADR-004 | 产品负责人 |
| 用户用 UID 撞库（暴力破解） | Low | Medium | 登录限流 + 密码强度要求 + 失败锁定 | ADR-004 | 安全负责人 |
| 新增用户创建点遗漏 UID 生成 | Medium | High | 代码审查 + DB 层 uid NOT NULL 约束 | ADR-004 | 技术负责人 |

## Consequences

### 正面
- 用户拥有简短易记的数字账号
- 登录方式更灵活（UID / 邮箱均可）
- 客服/运营场景下定位用户更方便
- 微信用户也有了正式的登录标识
- 个人中心展示增强了账号感知

### 负面
- 应用层生成比 DB 自增多一次查询
- 所有用户创建路径都要接入 UID 生成，容易遗漏
- UID 是顺序号，可能被用来推测用户量
- 6 位起始值（100000）在早期用户量少时看起来"假"

## Evidence

- `server/src/lib/uidGenerator.ts` — UID 生成器
- `server/src/routes/auth.ts` — 注册 + 登录（支持 UID/邮箱）
- `server/src/lib/emailCode.ts` — 邮箱验证码登录生成 UID
- `server/src/lib/wechatLogin.ts` — 微信登录生成 UID
- `web/src/pages/LoginPage.tsx` — 登录页提示支持 UID
- `web/src/pages/SettingsPage.tsx` — 个人中心展示 UID

## Revisit Triggers

1. **用户量 > 100 万**：7 位 UID，评估是否需要优化生成性能
2. **引入分布式部署**：多实例下应用层生成可能冲突增多，考虑引入分布式 ID 生成器（如雪花算法）
3. **隐私要求升级**：顺序号可能泄露商业机密，考虑随机 UID 或哈希展示
4. **支持自定义 UID/靓号**：运营需求（如付费选号）
5. **多端账号打通**：如引入手机号登录，登录标识体系扩展
