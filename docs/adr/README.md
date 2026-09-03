# 架构决策记录（ADR）索引

> 本目录记录项目中不可逆或高影响的架构决策。每份 ADR 遵循统一格式，包含上下文、决策驱动、备选方案、决策内容、后果和复盘触发条件。

## 决策列表

| 编号 | 标题 | 状态 | 领域 | 最后更新 |
|------|------|------|------|----------|
| [ADR-001](./adr-001-superadmin-invariant.md) | 唯一超级管理员不变量 | ✅ Accepted | 身份与权限 | 2026-09-03 |
| [ADR-002](./adr-002-quota-atomic-deduction.md) | 额度原子预扣与余额一致性 | ✅ Accepted | 计费与额度 | 2026-09-03 |
| [ADR-003](./adr-003-dual-moderation.md) | 双审核与用户风险等级体系 | ✅ Accepted | 内容安全 | 2026-09-03 |
| [ADR-004](./adr-004-uid-account-system.md) | UID 账号体系 | ✅ Accepted | 用户身份 | 2026-09-03 |

## 关联文档

- [核心不变量与锁定清单](../核心不变量与锁定清单.md) — 全部需要锁定的业务不变量
- [架构适应度函数规范](./fitness-functions.md) — 可测试的架构不变量校验
- [领域上下文地图](./bounded-context-map.md) — 模块边界与依赖关系
- [风险登记册](./risk-register.md) — 架构风险跟踪

## ADR 状态定义

| 状态 | 说明 |
|------|------|
| Proposed | 提议中，待评审 |
| Accepted | 已采纳，正在实施或已实施 |
| Deprecated | 已废弃（需说明替代方案） |
| Superseded by N | 被第 N 号决策替代 |

## 新增 ADR 流程

1. 复制模板（见下方），命名为 `adr-NNN-title.md`
2. 填写 Context / Decision Drivers / Alternatives / Decision
3. 提交评审，更新状态为 Accepted
4. 更新本索引表
5. 同步更新 [架构适应度函数规范](./fitness-functions.md) 中对应检查项
