# MankTV 平台全面梳理报告
> 审计时间：2026-08-25
> 审计范围：5 大创作板块 + 后端管理系统 + 用户账号系统 + Prisma 数据模型

---

## 一、5 大创作板块审计

### 1.1 写作板块（Novel）

| 维度 | 现状 | 状态 |
|------|------|------|
| 前端组件 | WritingPane.tsx — 引导式创作（题材/读者/视角/篇幅）+ 编辑器 + AI 工具栏 | ✅ 较完整 |
| 模型选择器 | ❌ 无模型选择器，参数为硬编码常量 | 待接入 |
| useModelStore | ❌ 未引入 | 待接入 |
| 前端 API | textApi.ts — 调用 /api/llm/* (synopsis/outline/continue 等 8 个接口) | ✅ 已有 |
| 后端路由 | llm.ts — 21 个 LLM 接口，调用 Pollinations/OpenAI 兼容端点 | ✅ 已有 |
| 生成历史 | ❌ 后端无记录，前端无历史列表 | 待建设 |
| token 用量 | ❌ 无统计 | 待建设 |

**待办：**
- [ ] WritingPane 引入 useModelStore，fetchModels('novel')
- [ ] 添加模型下拉选择器（替代硬编码参数）
- [ ] 后端 llm.ts 每次调用写入 GenerationLog
- [ ] 前端添加"生成历史"面板

---

### 1.2 图像板块（Image）

| 维度 | 现状 | 状态 |
|------|------|------|
| 前端组件 | ImagePane.tsx — 完整文生图 + 参数面板 + 批量 + 参考图 | ✅ 完整 |
| 模型选择器 | ✅ 已接入 useModelStore，fetchModels('image')，动态渲染 + fallback | ✅ 已完成 |
| 前端 API | imageApi.ts — Pollinations 直链 + /api/image/generate 代理 | ✅ 已有 |
| 后端路由 | image.ts — /generate + /enhance-prompt | ✅ 已有 |
| 生成历史 | 前端有 useStudioStore.history（仅内存） | ⚠️ 仅前端内存 |
| token 用量 | ❌ 无统计 | 待建设 |
| ControlNet | UI 占位，标注"待 API 接入" | 待接入 |

**待办：**
- [ ] 后端 image.ts 每次调用写入 GenerationLog
- [ ] 前端生成历史持久化（存后端）
- [ ] ControlNet API 对接

---

### 1.3 漫画板块（Comic）

| 维度 | 现状 | 状态 |
|------|------|------|
| 前端组件 | ComicPane.tsx — 排版编辑器 + 多页管理 + PNG 导出 + 脚本送入 | ✅ 较完整 |
| 模型选择器 | ❌ 未引入 useModelStore | 待接入 |
| 后端路由 | 无独立 /api/comic 路由，依赖 /api/image + /api/llm | ⚠️ 依赖其他板块 |
| 生成历史 | ❌ 无记录 | 待建设 |
| token 用量 | ❌ 无统计 | 待建设 |
| AI 生成 | 无独立 AI 生成能力，复用图像板块的输出 | 待建设 |

**待办：**
- [ ] ComicPane 引入 useModelStore，fetchModels('comic')
- [ ] 添加漫画专用模型选择器（分镜生成/角色一致性等）
- [ ] 后端添加 /api/comic/* 路由（分镜拆解/角色生成）
- [ ] 生成历史记录

---

### 1.4 音频板块（Audio）

| 维度 | 现状 | 状态 |
|------|------|------|
| 前端组件 | AudioPage.tsx — TTS 文本转语音 + BGM 生成 + 音频上传 | ⚠️ 基础占位 |
| 模型选择器 | ❌ 音色为固定下拉选项，未接入 useModelStore | 待接入 |
| 前端 API | 调用 /api/audio/tts + /api/audio/music | ✅ 已有 |
| 后端路由 | audio.ts — TTS + BGM + upload，均为 MVP 占位 | ⚠️ 占位逻辑 |
| 生成历史 | ❌ 无记录 | 待建设 |
| token 用量 | ❌ 无统计 | 待建设 |

**待办：**
- [ ] AudioPage 引入 useModelStore，fetchModels('audio')
- [ ] 添加模型选择器（TTS 引擎/声音克隆/BGM 生成）
- [ ] 后端 audio.ts 对接真实 TTS API（智谱/通义）
- [ ] 生成历史记录

---

### 1.5 视频板块（Video）

| 维度 | 现状 | 状态 |
|------|------|------|
| 前端组件 | VideoPage.tsx — 文生视频 + 图生视频 + 任务轮询 | ⚠️ 基础占位 |
| 模型选择器 | ❌ 无模型选择器 | 待接入 |
| 前端 API | 调用 /api/video/text2video + /api/video/img2video + /api/video/task/:id | ✅ 已有 |
| 后端路由 | video.ts — text2video + img2video + task 轮询，内存 Map 模拟 | ⚠️ 占位逻辑 |
| 生成历史 | ❌ 无记录 | 待建设 |
| token 用量 | ❌ 无统计 | 待建设 |

**待办：**
- [ ] VideoPage 引入 useModelStore，fetchModels('video')
- [ ] 添加模型选择器（Seedance/可灵等）
- [ ] 后端 video.ts 对接真实视频 API
- [ ] 任务持久化（内存 Map → 数据库）
- [ ] 生成历史记录

---

## 二、后端管理系统审计

### 2.1 已有功能

| 功能 | 接口 | 状态 |
|------|------|------|
| 用户管理 | GET /api/admin/users, PUT /api/admin/users/:id/role | ✅ |
| 平台统计 | GET /api/admin/stats（用户/作品/评论/点赞/模型数） | ✅ |
| 模型管理 | GET/POST/PUT/DELETE /api/models, /api/providers | ✅ |
| RBAC | authRequired + requireRole('admin') | ✅ |

### 2.2 缺失功能（用户要求）

| 需求 | 需要的数据模型 | 需要的接口 | 状态 |
|------|-------------|-----------|------|
| **监控各板块调用情况** | GenerationLog | GET /api/admin/logs?type=image&... | 待建设 |
| **历史生成记录** | GenerationLog | GET /api/admin/generations | 待建设 |
| **用户 token 用量** | UserQuota | GET /api/admin/users/:id/usage | 待建设 |
| **用户剩余用量** | UserQuota | GET /api/admin/users/:id/quota | 待建设 |
| **用户历史生成记录** | GenerationLog | GET /api/admin/users/:id/generations | 待建设 |
| **用户任务列表** | UserTask | GET /api/admin/users/:id/tasks | 待建设 |

---

### 2.3 五大板块功能管理（用户要求新增）

**核心诉求**：管理员可在后端控制台管理 5 大创作板块的前端功能——新增、删减、调整布局。

#### 需要的数据模型

```prisma
model ModuleFeature {
  id          String   @id @default(cuid())
  module      String   // novel | image | comic | audio | video
  featureKey   String   // prompt_input, model_selector, negative_prompt, controlnet, batch_size...
  displayName String   // 正向提示词, 负向提示词, 模型选择, 比例...
  type        String   // input | textarea | slider | select | toggle | upload | color | custom
  status      String   @default("enabled") // enabled | disabled
  sort        Int      @default(0)  // 排序（控制前端布局顺序）
  config      String?  // JSON: { min, max, step, default, options, cols, rows, label, placeholder }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([module, featureKey])
  @@index([module])
}
```

#### 功能说明

| 管理操作 | 接口 | 效果 |
|----------|------|------|
| 查看板块功能列表 | GET /api/admin/features?module=image | 返回该板块所有功能控件配置 |
| 新增功能 | POST /api/admin/features | 前端板块出现新控件 |
| 删减功能 | DELETE /api/admin/features/:id | 前端板块移除该控件 |
| 调整排序 | PUT /api/admin/features/:id (sort) | 前端控件顺序变化 |
| 启用/禁用 | PUT /api/admin/features/:id (status) | 前端显示/隐藏该控件 |
| 修改参数 | PUT /api/admin/features/:id (config) | 前端控件 min/max/default 等变化 |

#### 前端动态渲染流程

```
管理员配置 ModuleFeature → GET /api/features?module=image → 前端按 sort 顺序 + type 动态渲染控件
```

#### 各板块预设功能清单（seed 数据）

**写作 Novel**：
- model_selector（模型选择）
- genre_select（题材选择）
- audience_select（目标读者）
- pov_select（作品视角）
- length_select（篇幅选择）
- prompt_input（创作提示词）
- editor_area（编辑区域）
- ai_toolbar（AI 工具栏：大纲/续写/优化）

**图像 Image**：
- model_selector（模型选择）
- prompt_input（正向提示词）
- negative_prompt（负向提示词）
- ratio_selector（比例选择）
- steps_slider（采样步数）
- cfg_slider（CFG 强度）
- batch_input（批量数量）
- seed_input（随机种子）
- controlnet_upload（ControlNet 参考图）
- history_panel（生成历史）

**漫画 Comic**：
- model_selector（模型选择）
- script_import（脚本送入）
- layout_editor（排版编辑器）
- page_manager（多页管理）
- png_export（PNG 导出）
- character_consistency（角色一致性，待接入）

**音频 Audio**：
- model_selector（模型选择）
- text_input（文本输入）
- voice_select（音色选择）
- music_mood（BGM 情绪）
- music_duration（BGM 时长）
- audio_upload（音频上传）
- history_panel（生成历史）

**视频 Video**：
- model_selector（模型选择）
- text2video_input（文生视频提示词）
- img2video_upload（图生视频参考图）
- duration_select（视频时长）
- quality_select（画质选择）
- task_queue（任务队列）
- polling_status（轮询状态）

---

---

## 三、用户账号系统审计

### 3.1 已有功能

| 功能 | 接口/页面 | 状态 |
|------|----------|------|
| 注册 | POST /api/auth/register + LoginPage | ✅ |
| 登录 | POST /api/auth/login + LoginPage | ✅ |
| 获取用户信息 | GET /api/auth/me | ✅ |
| 修改资料 | PUT /api/auth/profile | ✅ |
| 头像上传 | POST /api/auth/avatar | ✅ |
| 会员定价页 | PricingPage.tsx（静态展示） | ⚠️ 仅展示 |
| 订阅模型 | Subscription（schema 中已有） | ⚠️ 未完整使用 |

### 3.2 缺失功能（用户要求）

| 需求 | 需要的数据模型 | 需要的页面/接口 | 状态 |
|------|-------------|---------------|------|
| **个人中心/设置页** | — | /settings 页面 | 待建设 |
| **token 用量展示** | UserQuota | GET /api/user/quota | 待建设 |
| **充值入口** | PaymentOrder | /recharge 页面 + POST /api/billing/recharge | 待建设 |
| **会员升级** | Subscription 完善 | /upgrade 页面 + POST /api/billing/subscribe | 待建设 |
| **生成历史** | GenerationLog | GET /api/user/generations | 待建设 |
| **任务列表** | UserTask | GET /api/user/tasks | 待建设 |

---

## 四、Prisma Schema 缺失模型

当前 schema 已有：User, Project, Volume, Chapter, Work, Comment, Like, Subscription, AIProvider, AIModel

### 需要新增的模型：

#### 4.1 GenerationLog（生成记录）
```prisma
model GenerationLog {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        String   // novel | image | comic | audio | video
  modelId     String?  // 使用的 AI 模型 ID
  provider    String?  // 供应商名称
  input       String?  // JSON: 输入参数摘要
  output      String?  // JSON: 输出结果摘要（URL/文本片段）
  tokensUsed  Int      @default(0)  // token 消耗
  duration    Int      @default(0)  // 耗时(ms)
  status      String   @default("success") // success | failed | pending
  errorMsg    String?
  createdAt   DateTime @default(now())

  @@index([userId])
  @@index([type])
  @@index([createdAt])
}
```

#### 4.2 UserQuota（用户额度）
```prisma
model UserQuota {
  id              String   @id @default(cuid())
  userId          String   @unique
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  totalTokens     Int      @default(100000)  // 总额度
  usedTokens      Int      @default(0)       // 已用额度
  remainingTokens Int      @default(100000)   // 剩余额度
  planId          String   @default("free")   // free | pro | business | enterprise
  resetAt         DateTime?                   // 额度重置时间
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}
```

#### 4.3 UserTask（异步任务）
```prisma
model UserTask {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  type        String   // text2video | img2video | tts | music | lora_train
  status      String   @default("pending") // pending | processing | completed | failed
  params      String?  // JSON: 任务参数
  result      String?  // JSON: 任务结果
  progress    Int      @default(0)  // 0-100
  errorMsg    String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([userId])
  @@index([status])
}
```

#### 4.4 PaymentOrder（充值订单）
```prisma
model PaymentOrder {
  id          String   @id @default(cuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  amount      Float    // 充值金额
  tokens      Int      // 购买的 token 数
  planId      String?  // 关联的订阅计划
  status      String   @default("pending") // pending | paid | failed | refunded
  payMethod   String?  // alipay | wechat | card
  tradeNo     String?  // 第三方交易号
  createdAt   DateTime @default(now())
  paidAt      DateTime?

  @@index([userId])
  @@index([status])
}
```


#### 4.5 ModuleFeature（板块功能配置）
```prisma
model ModuleFeature {
  id          String   @id @default(cuid())
  module      String   // novel | image | comic | audio | video
  featureKey   String
  displayName String
  type        String   // input | textarea | slider | select | toggle | upload | color | custom
  status      String   @default("enabled") // enabled | disabled
  sort        Int      @default(0)
  config      String?  // JSON: { min, max, step, default, options, cols, rows, label, placeholder }
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([module, featureKey])
  @@index([module])
}
```

#### 4.6 User 模型需要扩展的关联

```prisma
model User {
  // ... 现有字段 ...
  generationLogs GenerationLog[]
  quota          UserQuota?
  tasks          UserTask[]
  payments       PaymentOrder[]
}
```

---

## 五、作品功能处理（用户要求暂时关闭）

| 要求 | 方案 |
|------|------|
| 前端只保留静态页固定 | CommunityPage 保留 STATIC_WORKS_POOL 静态数据展示 |
| 后端仍可手动移除 | 保留 /api/community/* 路由 + GET /api/admin/works 管理接口 |
| 发布功能关闭 | 前端隐藏"发布到广场"按钮，后端 POST /api/community/works 标记为维护中 |

---

## 六、执行优先级排序

### P0 — 数据模型 + 后端基础（先建设施）
1. Prisma schema 新增 GenerationLog, UserQuota, UserTask, PaymentOrder
2. User 模型扩展关联
3. prisma generate + db push
4. seed.ts 初始化 UserQuota（每用户 10 万 token）
5. seed.ts 初始化 ModuleFeature（5 板块 × 各自预设功能）

### P1 — 后端管理控制台（先有监控）
6. 新建 /api/admin/logs — 生成记录查询（支持 type/userId/时间范围过滤）
6. 新建 /api/admin/users/:id — 用户详情（含 quota/generations/tasks）
7. 新建 /api/admin/generations — 全局生成历史
8. 新建 /api/admin/features — 五大板块功能 CRUD（新增/删减/排序/启禁用/调参）
9. 新建 GET /api/features?module=image — 前端公开接口获取板块功能配置
10. AdminPage 增强：调用监控面板 + 用户详情抽屉 + 板块功能管理面板

### P2 — 用户账号系统（再有体验）
11. 新建 /api/user/quota — 查看自己的额度
12. 新建 /api/user/generations — 查看自己的生成历史
13. 新建 /api/user/tasks — 查看自己的任务
14. 新建 /api/billing/recharge — 充值接口
15. 新建 /api/billing/subscribe — 订阅升级接口
16. 前端 SettingsPage — 个人中心页面

### P3 — 5 大板块接入动态模型 + 动态功能渲染
17. WritingPane 接入 useModelStore('novel')
18. ComicPane 接入 useModelStore('comic')
19. AudioPage 接入 useModelStore('audio')
20. VideoPage 接入 useModelStore('video')
21. 各板块 AI 调用时写入 GenerationLog + 扣减 UserQuota
22. 各板块前端改用 /api/features 动态渲染功能控件（替代硬编码 UI）

### P4 — 作品功能暂时关闭
23. 前端隐藏发布按钮
24. 后端保留管理接口
