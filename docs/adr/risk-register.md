# 风险登记册（Risk Register）

> 记录架构层面的已知风险、影响评估、缓解措施和状态跟踪。
>
> 风险等级 = 可能性 × 影响度
> - **Critical**：立即处理
> - **High**：近期处理
> - **Medium**：排期处理
> - **Low**：观察跟踪

---

## 一、身份与安全风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-001 | superadmin 密码遗忘或泄露 | Low | Critical | High | 强密码策略 + 定期轮换 + 操作审计 + DB 紧急恢复文档 | 🔵 Mitigated | 安全负责人 | ADR-001 |
| R-002 | 开发者误操作修改用户角色为 superadmin | Medium | High | High | 代码层禁止 update role 为 superadmin + seed 启动纠偏 + PR 审查 | 🔵 Mitigated | 技术负责人 | ADR-001 |
| R-003 | JWT 密钥泄露 | Low | Critical | High | 密钥强制长度校验 + 环境变量管理 + 定期轮换机制 | 🟡 Identified | 安全负责人 | FF-018 |
| R-004 | 暴力破解登录（UID 更易撞库） | Medium | Medium | Medium | 登录限流 + 密码强度要求 + 失败次数锁定 | 🟡 Identified | 后端负责人 | FF-019 |
| R-005 | 微信登录占位邮箱冲突 | Low | Low | Low | openId 唯一索引 + 占位邮箱用 openId 后缀生成 | 🟢 Accepted | 后端负责人 | ADR-004 |

---

## 二、数据一致性风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-006 | 预扣后进程崩溃，额度悬空 | Low | Medium | Medium | 启动时对账修复 + GenerationLog 完整记录 | 🟡 Identified | 后端负责人 | ADR-002 |
| R-007 | 并发创建用户导致 UID 冲突 | Low | Low | Low | DB 唯一索引 + 重试 3 次 | 🟢 Accepted | 后端负责人 | ADR-004 |
| R-008 | 点赞计数不一致 | Medium | Low | Medium | 事务同步更新 + 每日对账脚本（待实现） | 🟡 Identified | 后端负责人 | FF-016 |
| R-009 | 余额恒等式被打破（代码 bug） | Low | High | Medium | 原子操作 + 每日对账 + 自动修复 | 🟡 Identified | 后端负责人 | ADR-002, FF-005 |
| R-010 | SQLite 单文件锁瓶颈（高并发写） | Medium | Medium | Medium | 当前瓶颈在 AI 调用不在 DB；用户量上来后迁移 PostgreSQL | 🟡 Identified | 运维负责人 | ADR-002 |

---

## 三、内容安全风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-011 | 第三方审核服务长时间不可用 | Medium | Medium | Medium | 本地词库兜底 + 降级模式告警 + 人工巡检补位 | 🔵 Mitigated | 安全负责人 | ADR-003 |
| R-012 | 本地词库漏审率高 | Medium | Medium | Medium | 定期更新词库 + 第三方审核结果反哺 + 用户举报 | 🟡 Identified | 内容运营 | ADR-003 |
| R-013 | 误封正常用户（审核误判） | Low | High | Medium | 风险等级梯度（不直接封禁）+ 申诉渠道 + 人工复核 | 🔵 Mitigated | 产品负责人 | ADR-003 |
| R-014 | 审核记录被篡改或删除 | Low | High | Medium | append-only 设计 + 无 update/delete 接口 + 定期备份 | 🔵 Mitigated | 技术负责人 | ADR-003 |
| R-015 | 新生成接口绕过审核 | Medium | High | High | llmRoute 统一封装 + 代码审查清单 + 静态扫描 | 🔵 Mitigated | 技术负责人 | FF-009 |

---

## 四、可用性与性能风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-016 | AI 供应商服务不可用 | High | High | Critical | 多供应商 fallback + placeholder 兜底 + 状态监控 | 🔵 Mitigated | 后端负责人 | ADR-003 |
| R-017 | 视频生成等长任务失败无补偿 | Medium | Medium | Medium | 失败退还额度 + 任务状态可查 + 重试机制 | 🔵 Mitigated | 后端负责人 | ADR-002 |
| R-018 | 单实例部署，单点故障 | High | High | Critical | 健康检查 + 快速重启 + 数据持久化 | 🟡 Identified | 运维负责人 | - |
| R-019 | 上传文件存储耗尽 | Medium | Medium | Medium | 文件大小限制 + 定期清理 + 监控告警 | 🟡 Identified | 运维负责人 | - |
| R-020 | 生成请求突增导致服务过载 | Medium | Medium | Medium | 限流 + 异步队列 + 优先等级 | 🟡 Identified | 后端负责人 | FF-019 |

---

## 五、合规与法务风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-021 | 生成式 AI 服务备案要求 | High | Critical | Critical | 双审核机制 + 用户实名（待接入）+ 内容标识 | 🟡 Identified | 产品负责人 | ADR-003 |
| R-022 | 用户数据隐私合规 | Medium | High | High | 最小化数据收集 + 隐私政策 + 用户数据删除权 | 🟡 Identified | 法务/产品 | - |
| R-023 | 支付合规（无支付牌照） | Low | Critical | High | 当前为占位模式，正式接入需合规审查 | 🟢 Accepted | 商务负责人 | - |

---

## 六、运维与发布风险

| ID | 风险 | 可能性 | 影响 | 等级 | 缓解措施 | 状态 | 责任人 | 关联 ADR |
|----|------|--------|------|------|----------|------|--------|----------|
| R-024 | 数据库迁移导致数据丢失 | Low | Critical | High | 迁移前备份 + 先在测试环境验证 + 可逆迁移脚本 | 🟡 Identified | 后端负责人 | - |
| R-025 | 配置变更导致服务异常 | Medium | Medium | Medium | 配置审计日志 + 回滚功能 + 变更后验证 | 🔵 Mitigated | 后端负责人 | FF-017 |
| R-026 | 依赖库漏洞 | Medium | High | High | 定期依赖审计 + 最小依赖原则 + 锁版本 | 🟡 Identified | 技术负责人 | - |
| R-027 | 环境变量泄露（.env 提交到代码库） | Low | High | Medium | .gitignore + 代码审查 + 密钥扫描 | 🟢 Accepted | 技术负责人 | - |

---

## 风险状态说明

| 状态 | 说明 |
|------|------|
| 🔴 Open | 已识别，未处理 |
| 🟡 Identified | 已识别，有缓解计划但未完全实施 |
| 🔵 Mitigated | 已有缓解措施，残余风险可接受 |
| 🟢 Accepted | 风险已接受，无需额外措施 |
| ⚫ Closed | 风险已消除或不再相关 |

---

## 风险等级矩阵

```
影响度 →  |  Low  | Medium |  High  | Critical
----------|-------|--------|--------|----------
High      |   -   | Medium |  High  | Critical
Medium    |  Low  | Medium |  High  |   High
Low       |  Low  |   Low  | Medium |   High
```

---

## 复盘与更新

- **更新频率**：每月审查一次，或重大架构变更后即时更新
- **新增风险**：发现新风险时，立即登记并评估等级
- **关闭风险**：风险消除后更新状态为 Closed，保留记录
- **升级触发**：风险实际发生时，升级等级并启动应急预案

---

> **维护说明**：每个 ADR 中识别的风险都应同步登记到本文件。实际发生过的事故应补充到对应风险条目的"历史事件"中。
