# 任务队列迁移指南：内存 → Redis

> 版本：1.0
> 状态：可执行
> 适用范围：视频生成任务、音频生成任务、漫画批量生成等异步任务

---

## 一、迁移决策记录

| 项目 | 内容 |
|------|------|
| **被替换** | 内存 Map + setTimeout（单进程内存队列） |
| **替换为** | Redis List + Hash + Pub/Sub（分布式队列） |
| **原因** | 1. 单进程限制：内存队列无法跨实例共享任务状态<br/>2. 进程重启丢失：服务重启后所有进行中的任务状态丢失<br/>3. 无持久化：任务结果仅存内存，TTL 清理后无法追溯<br/>4. 无法水平扩展：多实例部署时任务重复消费 |
| **最终状态** | 生产环境使用 Redis 队列；内存队列保留为开发/降级模式 |
| **风险等级** | 低（自动降级机制保障） |
| **支持窗口** | 内存队列永久保留（作为降级和开发模式） |

---

## 二、架构对比

### 2.1 旧架构（内存队列）

```
┌──────────────────────────────────┐
│         Express 进程 A            │
│  ┌─────────────────────────────┐ │
│  │  Map<string, Task>          │ │
│  │  (仅当前进程可见)            │ │
│  └─────────────────────────────┘ │
│           ↑ 轮询                 │
│  ┌─────────────────────────────┐ │
│  │  video.ts 路由               │ │
│  └─────────────────────────────┘ │
└──────────────────────────────────┘

（多实例时各进程任务独立，状态不共享）
```

### 2.2 新架构（Redis 队列）

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│ Express  A  │    │ Express  B  │    │ Express  C  │
└──────┬──────┘    └──────┬──────┘    └──────┬──────┘
       │                  │                  │
       └──────────────────┼──────────────────┘
                          │
              ┌───────────▼────────────┐
              │      Redis 服务         │
              │  ┌──────────────────┐  │
              │  │ List: 任务队列    │  │ ← BRPOP 消费
              │  │ Hash: 任务状态    │  │ ← 状态读写
              │  │ PubSub: 状态通知  │  │ ← 实时推送
              │  └──────────────────┘  │
              └───────────┬────────────┘
                          │ 持久化兜底
              ┌───────────▼────────────┐
              │   UserTask 数据表       │
              │   (PostgreSQL)          │
              └────────────────────────┘
```

### 2.3 特性对比

| 特性 | 内存队列 | Redis 队列 |
|------|---------|-----------|
| 多实例共享 | ❌ | ✅ |
| 进程重启保留 | ❌ | ✅（Redis 持久化） |
| 状态持久化 | ❌（1h TTL） | ✅（6h + 数据库） |
| 实时通知 | ❌（轮询） | ✅（Pub/Sub） |
| 任务积压监控 | ❌ | ✅（LLEN 查看队列长度） |
| 并发控制 | ❌ | ✅（单消费者模式） |
| 开发零依赖 | ✅ | ❌（需 Redis） |
| 自动降级 | — | ✅（Redis 故障时切回内存） |

---

## 三、迁移步骤

### 3.1 前置准备

```bash
# 1. 安装 Redis（如未安装）
# macOS:    brew install redis
# Ubuntu:   sudo apt install redis-server
# Windows:  下载安装包 https://github.com/microsoftarchive/redis/releases
# Docker:   docker run -d -p 6379:6379 redis:7-alpine

# 2. 验证 Redis 运行
redis-cli ping
# 输出: PONG

# 3. 安装依赖（已包含在 package.json）
cd server && npm install
```

### 3.2 配置环境变量

在 `.env` 文件中添加 Redis 配置：

```env
# 方式一：连接串（推荐）
REDIS_URL=redis://:your-password@localhost:6379/0

# 方式二：单独配置
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

**不配置 Redis？** 服务自动降级为内存队列，功能完全可用，仅不支持多实例共享。

### 3.3 验证迁移

```bash
# 1. 启动服务
npm run dev

# 2. 查看启动日志，确认 Redis 连接
# 预期输出：
#   [Redis] 连接中...
#   [Redis] 连接就绪，队列服务可用
#   [TaskQueue] 使用 Redis 后端

# 3. 测试视频任务
curl -X POST http://localhost:3000/api/video/text2video \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-token>" \
  -d '{"prompt":"a cat dancing", "duration":5}'

# 4. 检查任务状态
curl http://localhost:3000/api/video/task/<task-id>

# 5. 在 Redis 中验证数据
redis-cli
> KEYS manktv:task:*
> HGETALL manktv:task:vid_xxxxxx
> LLEN manktv:task:queue:text2video
```

---

## 四、降级与回滚

### 4.1 自动降级机制

服务启动时会自动检测 Redis 可用性：

```
Redis 配置存在 + 连接成功  → 使用 Redis 后端
Redis 配置存在 + 连接失败  → 启动时降级到内存，日志告警
Redis 配置不存在          → 直接使用内存后端（开发模式）
```

**运行中 Redis 故障**：当前版本为"尽力而为"模式——已提交到 Redis 的任务在 Redis 恢复后继续可用；故障期间新任务写入内存队列。

### 4.2 手动回滚

如果 Redis 导致问题，可立即回滚到纯内存模式：

```bash
# 方法 1：注释掉 Redis 环境变量
# .env 文件中注释 REDIS_URL 或 REDIS_HOST

# 方法 2：设置空值
REDIS_URL=

# 重启服务
npm run dev
```

**影响**：
- 已在 Redis 中的任务状态会暂时不可见（任务列表仍可从数据库查询）
- 新任务写入内存队列
- 功能完全可用，仅丧失多实例共享能力

### 4.3 数据一致性保障

| 场景 | 数据安全 | 说明 |
|------|---------|------|
| Redis 正常运行 | ✅ 双重保障 | Redis + UserTask 双写 |
| Redis 短时故障 | ✅ 内存接管 | 新任务走内存，旧任务从 DB 兜底 |
| Redis 长时间故障 | ⚠️ 部分丢失 | 内存中的任务在进程重启后丢失 |
| 进程重启 | ✅ 可恢复 | 从 Redis 和 UserTask 恢复 |
| Redis + DB 同时故障 | ❌ 完全丢失 | 极端情况，需要备份恢复 |

---

## 五、Redis Key 规范

| Key 模式 | 类型 | 用途 | TTL |
|----------|------|------|-----|
| `manktv:task:queue:{type}` | List | 待消费任务队列 | 永久（消费后删除） |
| `manktv:task:item:{id}` | Hash | 任务详情与状态 | 6 小时 |
| Pub/Sub Channel | — | `manktv:task:status` | — |

### Key 设计原则

1. **统一前缀**：`manktv:task:` 避免与其他业务冲突
2. **分类命名**：队列按任务类型分 List，支持独立消费
3. **TTL 策略**：任务详情 6 小时自动清理，队列中任务无 TTL
4. **数据库兜底**：UserTask 表永久保存（可定期归档）

---

## 六、生产环境建议

### 6.1 Redis 配置

```conf
# redis.conf
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly yes
appendfsync everysec
```

### 6.2 连接池

使用 PMA（ProxySQL-like）或直接限制 Prisma 连接数：

```env
# 单实例连接数建议：CPU 核心数 × 2 + 1
# 对于 Node.js 单线程，5-10 个连接足够
# ioredis 默认单连接，如需连接池可使用 ioredis Cluster 模式
```

### 6.3 监控指标

| 指标 | 告警阈值 | 说明 |
|------|---------|------|
| 队列长度 | > 100 且持续增长 | 消费能力不足 |
| 任务平均等待时间 | > 30s | 队列积压 |
| Redis 内存使用率 | > 80% | 需扩容或清理 |
| Redis 连接数 | > 100 | 连接泄漏 |

---

## 七、常见问题

### Q1: 不配置 Redis 会怎样？

A: 自动使用内存队列，功能完全可用。适合单机部署和开发环境。多实例部署必须配置 Redis。

### Q2: Redis 连接失败会影响正常请求吗？

A: 不会。Redis 连接是异步的，失败时自动降级到内存模式。用户请求不会被阻塞。

### Q3: 任务状态在哪里看？

A: 三重查询路径：
1. **实时状态**：Redis Hash（最快，6h TTL）
2. **用户任务列表**：`/api/user/tasks`（从 UserTask 表读取，永久保存）
3. **管理后台**：`/api/admin/tasks`（全量任务查询）

### Q4: 如何清空队列？

```bash
# 清空所有视频队列
redis-cli DEL manktv:task:queue:text2video manktv:task:queue:img2video

# 清空所有任务数据（谨慎！）
redis-cli KEYS "manktv:task:*" | xargs redis-cli DEL
```

### Q5: 可以用 Redis Cluster 吗？

A: 可以。将 `REDIS_URL` 换成集群节点地址，或在代码中使用 `Redis.Cluster` 模式。当前代码使用单节点模式，升级到 Cluster 只需修改 `redis.ts` 中的初始化逻辑。

### Q6: 漫画/音频等其他任务也用这个队列吗？

A: 目前视频任务已接入。漫画和音频任务仍是同步/占位实现，后续迁移到异步队列时直接复用 `taskQueue` 服务即可，无需重新实现。
