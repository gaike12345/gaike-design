# AI漫剧圈（MankTV）Code Wiki 文档

> **项目代号**：AI漫剧圈 / MankTV  
> **文档版本**：v1.0  
> **最后更新**：2026-08-26  
> **技术栈**：React 19 + TypeScript + Vite + Express + Prisma + SQLite  

---

## 目录

1. [项目概述](#1-项目概述)
2. [系统架构总览](#2-系统架构总览)
3. [项目目录结构](#3-项目目录结构)
4. [前端架构详解](#4-前端架构详解)
5. [后端架构详解](#5-后端架构详解)
6. [数据库模型设计](#6-数据库模型设计)
7. [AI 生成模块](#7-ai-生成模块)
8. [权限与安全系统](#8-权限与安全系统)
9. [六大功能板块](#9-六大功能板块)
10. [状态管理（Zustand Stores）](#10-状态管理zustand-stores)
11. [中间件系统](#11-中间件系统)
12. [API 接口总览](#12-api-接口总览)
13. [配置与环境变量](#13-配置与环境变量)
14. [项目运行方式](#14-项目运行方式)
15. [演示账号](#15-演示账号)
16. [关键设计决策](#16-关键设计决策)

---

## 1. 项目概述

### 1.1 项目定位

**AI漫剧圈（MankTV）** 是一个面向创作者、商业客户及终端用户的 **端到端 AI 图文创作与发布平台**。提供从文案生成、图像生成、图文排版到一键发布/导出的全链路 AIGC 工作流，重点服务于漫画、条漫、短剧脚本、绘本、海报、社媒配图等图文场景。

### 1.2 核心业务目标

| 维度 | 目标 |
|------|------|
| 创作者注册 | MVP 上线 3 个月内注册 5 万创作者 |
| 付费转化 | 付费用户占比 ≥ 5% |
| 内容产出 | 月均产出图文作品 ≥ 20 万件 |
| 系统可用性 | ≥ 99.5% |
| 文生图 P95 | < 30s（标准分辨率） |

### 1.3 六大内容生产板块

平台按照 **写作 / 图像 / 音频 / 视频 / 漫画 / 社区** 六大板块组织功能：

| 板块 | 路由前缀 | 强调色 | 核心功能 |
|------|----------|--------|----------|
| 写作（Novel） | /novel /workspace/writing | Indigo #6366F1 | 大纲生成、脚本创作、分镜拆解、角色卡、世界观、设定库 |
| 图像（Image） | /image /workspace/image | Cyan #0891B2 | 文生图、图生图、LoRA、ControlNet、多参考一致性 |
| 音频（Audio） | /audio /workspace/audio | Pink #EC4899 | TTS 配音、BGM 生成、声音克隆、音轨合成 |
| 视频（Video） | /video /workspace/video | Amber #D97706 | 图生视频、文生视频、导演台、音视频合成 |
| 漫画（Comic） | /comic /workspace/comic | Violet #7C3AED | 自动排版、模板库、文字气泡、多页管理、导出 PDF/EPUB |
| 社区（Community） | /community /workspace/community | Green #16A34A | 作品广场、模型市场、做同款、创作者主页、收益分成 |

---

## 2. 系统架构总览

### 2.1 整体架构图

```
前端层 (web/)
  React 19 + Vite 8 + TypeScript 6 + Tailwind CSS + Zustand
  Landing / Workspace / Admin / Community Plaza
           | HTTPS /api/* 代理 (Vite Proxy)
           ▼
接入层 (Express)
  CORS · JSON Body · 静态文件 (/uploads) · 限流 · 认证
           |
           ▼
业务服务层 (server/src/routes/)  14 个路由模块
  Auth · LLM · Image · Audio · Video · Community ·
  Projects · Billing · Models · Admin · Features · User
           |
           ▼
中间件层 (middleware/)
  authRequired · withGeneration · rate-limit · upload · error
           |
           ▼
数据访问层 (lib/)
  Prisma ORM · JWT Module · LLM Provider ·
  Generation Lib · Quota Management
           |
           ▼
数据存储层
  SQLite (dev) → PostgreSQL (prod)
  17 张核心表
```

### 2.2 混合架构策略

项目采用 **API 集成优先 + 小型自建 GPU 集群** 的混合策略：

- **LLM / 文本生成 / 图像生成 / 视频生成**：优先通过 API 接入第三方供应商（可插拔切换）
- **LoRA 训练 / ComfyUI 工作流**：后期对接自建 GPU 集群
- **模型路由层**：供应商抽象 + 故障切换 + 缓存 + 计量能力

---

## 3. 项目目录结构

```
AI漫剧圈/
├── prototypes/              # 原型设计与 API 契约
│
├── server/                  # 后端（Express + Prisma + SQLite）
│   ├── prisma/
│   │   ├── schema.prisma    # 数据库 Schema（17 张表）
│   │   ├── migrations/      # Prisma 迁移
│   │   ├── seed.ts          # 数据库种子
│   │   └── dev.db           # SQLite 开发数据库
│   ├── src/
│   │   ├── lib/
│   │   │   ├── prisma.ts        # Prisma 单例
│   │   │   ├── jwt.ts           # JWT 签名/验证（强制密钥）
│   │   │   ├── llmProvider.ts   # LLM 供应商抽象
│   │   │   └── generation.ts    # 生成日志 + 额度扣减
│   │   ├── middleware/
│   │   │   ├── auth.ts          # 认证 + RBAC（5 种）
│   │   │   ├── generation.ts    # AI 生成中间件
│   │   │   ├── rate-limit.ts    # 按接口粒度限流
│   │   │   ├── upload.ts        # Multer 文件上传
│   │   │   └── error.ts         # 全局错误处理
│   │   ├── routes/          # 14 个路由模块
│   │   │   ├── auth.ts  llm.ts  image.ts  audio.ts
│   │   │   ├── video.ts  community.ts  projects.ts
│   │   │   ├── billing.ts  models.ts  admin.ts
│   │   │   ├── features.ts  user.ts  upload.ts
│   │   └── index.ts         # Express 应用入口
│   ├── .env                 # 环境变量
│   └── package.json
│
├── web/                     # 前端（React 19 + Vite 8）
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/      # Navbar / Footer / FeatureLanding / CreatorLayout
│   │   │   ├── editor/      # WritingPane / ImagePane / ComicPane (Konva)
│   │   │   ├── image/       # 图像板块 UI 组件
│   │   │   ├── studio/      # LayoutModeView
│   │   │   └── AuthGuard.tsx   # 路由守卫
│   │   ├── pages/           # 18 个页面组件
│   │   │   ├── HomePage  LoginPage  Workspace
│   │   │   ├── NovelLanding/WritingPage
│   │   │   ├── ImageLanding/ImagePage
│   │   │   ├── ComicLanding/ComicPage
│   │   │   ├── AudioLanding/AudioPage
│   │   │   ├── VideoLanding/VideoPage
│   │   │   ├── CommunityLanding/CommunityPage
│   │   │   ├── AdminPage  SettingsPage  PricingPage
│   │   ├── store/           # 12 个 Zustand Store
│   │   ├── services/        # API 服务层
│   │   │   ├── api.ts       # 统一 API 客户端（含 Token）
│   │   │   ├── imageApi.ts  textApi.ts  layoutApi.ts
│   │   ├── App.tsx          # 根组件（路由定义）
│   │   └── main.tsx         # 应用入口
│   ├── vite.config.ts       # Vite 配置（含 /api 代理）
│   ├── tailwind.config.js   # Tailwind 配置（6 板块强调色）
│   └── package.json
│
├── 需求文档.md              # PRD v1.2
├── AUDIT_REPORT.md          # 安全审计报告
└── CODE_WIKI.md             # 本文档
```

---

## 4. 前端架构详解

### 4.1 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | React | 19.2.8 |
| 构建工具 | Vite | 8.2.2 |
| 语言 | TypeScript | 6.0.2 |
| 路由 | React Router DOM | 7.18.2 |
| 状态管理 | Zustand | 5.0.15 |
| CSS 框架 | Tailwind CSS | 3.4.19 |
| UI 图标 | Lucide React | 1.33.0 |
| Canvas 编辑器 | Konva + React-Konva | 10.3.1 / 19.2.5 |
| PDF 导出 | jsPDF | 4.2.1 |
| 代码检查 | oxlint | 1.79.0 |

### 4.2 路由设计

**文件**：[App.tsx](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/App.tsx)

路由采用 **「Landing 预览页 → Workspace 工作区」** 双层结构：

```
/                          → HomePage
/login                     → LoginPage
/novel  /image  /comic     → *Landing（预览页，无需登录）
/audio  /video  /community
/workspace/writing         → WritingPage（需登录，AuthGuard 包裹）
/workspace/image           → ImagePage
/workspace/comic           → ComicPage
/workspace/audio           → AudioPage
/workspace/video           → VideoPage
/workspace/community       → CommunityPage
/workspace                 → Workspace 全局工作台
/admin                     → AdminPage（admin+ 角色）
/settings                  → SettingsPage（个人中心）
/pricing                   → PricingPage
/about                     → AboutPage
*                          → Navigate to /（404）
```

### 4.3 关键组件

#### FeatureLanding（功能 Landing 通用模板）

**文件**：[FeatureLanding.tsx](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/components/layout/FeatureLanding.tsx)

通过 `accent` prop 动态注入六大板块独立强调色，固定 6 段式结构：Hero → 核心能力 → 创作流程 → 精选作品 → 最终 CTA。

**六大板块强调色常量 ACCENTS**：

```typescript
novel:     { main: '#6366F1', light: '#818CF8', bg50: '#EEF2FF', ... }
image:     { main: '#0891B2', light: '#22D3EE', bg50: '#ECFEFF', ... }
audio:     { main: '#EC4899', light: '#F472B6', bg50: '#FDF2F8', ... }
video:     { main: '#D97706', light: '#F59E0B', bg50: '#FFFBEB', ... }
community: { main: '#16A34A', light: '#22C55E', bg50: '#F0FDF4', ... }
comic:     { main: '#7C3AED', light: '#8B5CF6', bg50: '#F5F3FF', ... }
```

#### Navbar（导航栏）

**文件**：[Navbar.tsx](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/components/layout/Navbar.tsx)

- `isCreator`：路径以 `/workspace` 开头时隐藏主导航，仅显示「返回首页」
- 有 token 但 user 未加载时自动调用 `fetchMe()`
- 移动端抽屉：Esc 关闭、锁滚动、路由变化自动关闭
- 管理员入口：`user.role === "admin" || "superadmin"` 时显示

#### AuthGuard（路由守卫）

- 检查 `useAuthStore.isAuthed()`（有 token 且有 user）
- 未通过 → 跳转 `/login`，携带 `redirect` 参数

### 4.4 Vite 代理配置

**文件**：[vite.config.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/vite.config.ts)

`/api/*` 请求转发到 `http://localhost:3000`，实现同源调用，避免 CORS。

---

## 5. 后端架构详解

### 5.1 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 框架 | Express | 4.21.0 |
| ORM | Prisma Client | 6.0.0 |
| 数据库 | SQLite | 开发期 |
| 认证 | jsonwebtoken | 9.0.2 |
| 密码哈希 | bcryptjs | 2.4.3 |
| 限流 | express-rate-limit | 8.6.2 |
| 文件上传 | multer | 1.4.5-lts.1 |
| HTTP 客户端 | node-fetch | 3.3.2 |
| TypeScript 执行器 | tsx | 4.19.0 |

### 5.2 应用启动流程

**文件**：[server/src/index.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/index.ts)

```
1. dotenv/config 加载 .env
2. 创建 Express app
3. CORS（FRONTEND_URL 白名单）
4. Body 解析（JSON 10mb）
5. 静态文件 /uploads → UPLOAD_DIR
6. 根路径欢迎页（后端可视化健康检查）
7. GET /api/health 健康检查
8. 注册 14 个路由模块
9. 404 中间件 → 全局错误处理
10. 监听 PORT (默认 3000)
```

### 5.3 14 个路由模块

| 路由 | 挂载路径 | 登录 | 功能 |
|------|----------|------|------|
| auth.ts | /api/auth | 部分 | 注册/登录/me/资料/头像 |
| llm.ts | /api/llm | ✓ | 21 个 LLM 创作接口 |
| image.ts | /api/image | ✓ | 文生图/图生图/Prompt优化/上传 |
| audio.ts | /api/audio | ✓ | TTS/BGM |
| video.ts | /api/video | ✓ | 图生视频/文生视频 |
| community.ts | /api/community | GET公开 | 作品/评论/点赞 |
| projects.ts | /api/projects | ✓ | 小说项目 CRUD（Project→Volume→Chapter） |
| billing.ts | /api/billing | 混合 | 订阅套餐/充值/额度 |
| models.ts | /api/models | 公开 | 模型/供应商列表 |
| admin.ts | /api/admin | ✓admin+ | 13 个管理接口（用户/统计/日志/功能/充值） |
| features.ts | /api/features | 公开 | 板块功能配置 |
| user.ts | /api/user | ✓ | 个人中心/我的作品 |
| upload.ts | /api/upload | ✓ | 通用文件上传 |

---

## 6. 数据库模型设计

**文件**：[schema.prisma](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/prisma/schema.prisma)

共 **17 张表**，8 大领域：

```
用户领域：User · UserQuota · Subscription
创作项目：Project · Volume · Chapter
社区领域：Work · Comment · Like
AI模型：AIProvider · AIModel
计费与任务：PaymentOrder · UserTask · GenerationLog
配置：ModuleFeature
```

### 6.1 核心表字段

**User（用户表）**：
- id (cuid) · email (unique) · password (bcrypt) · nickname · avatar · bio
- role：user | creator | moderator | admin | superadmin
- 关系：projects, works, comments, likes, generationLogs, quota, tasks, payments

**UserQuota（用户额度表）**：
- userId (unique 1:1)
- totalTokens / usedTokens / remainingTokens（默认 100,000）
- planId：free / pro / business / enterprise

**Work（作品表 - 社区核心）**：
- id · title · type（novel/image/audio/video/comic）· subtype
- content · cover · tags（JSON 数组字符串）
- likesCount（冗余字段，乐观 UI 更新）
- userId · createdAt
- 索引：[userId], [type]

**GenerationLog（生成记录表 - 计费核心）**：
- userId · type（novel/image/comic/audio/video）
- modelId · provider · input · output
- tokensUsed（成功才 >0）· duration(ms) · status（success/failed/pending）
- 索引：[userId], [type], [createdAt]（统计报表）

**AIProvider → AIModel（1:N）**：
- Provider：name(unique) · type · baseUrl · apiKeyEnv · config · status
- Model：name(unique) · type · tag · config · sort · status

**ModuleFeature（板块功能配置表 - 动态表单）**：
- 唯一约束 (module, featureKey)
- module：novel/image/comic/audio/video
- type：input/textarea/slider/select/toggle/upload/color/custom
- config JSON：min/max/step/default/options/cols/rows
- status：enabled/disabled · sort 排序

---

## 7. AI 生成模块

### 7.1 调用链路

```
前端调用 → 路由
  → [限流] → [认证]
  → [withGeneration 中间件]
        ├─ 1. checkQuota() 额度预检查
        ├─ 2. 记录 _genStartTime
        └─ 3. 注册 res.on('finish') 回调：写日志 + 扣减
  → Handler 执行业务（LLM Provider / Pollinations 调用）
  → 返回结果给用户
```

### 7.2 LLM 供应商抽象层

**文件**：[llmProvider.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/lib/llmProvider.ts)

```typescript
callLlm(systemPrompt, userPrompt): Promise<string>
callLlmJson<T>(systemPrompt, userPrompt): Promise<T>  // 自动 JSON 解析
```

**当前实现**：DeepSeek Chat API（OpenAI 兼容格式）

**降级策略**：
- 未配置 DEEPSEEK_API_KEY → fallbackTemplate 占位内容
- API 调用失败 → 同上，保证前端不崩溃

### 7.3 生成与额度管理

**generation.ts 库**：
- `logGeneration(params)`：写生成日志 + 成功时扣减额度
- `checkQuota(userId, requiredTokens)`：检查额度是否足够

**withGeneration 中间件**：
- 用法：`router.post('/generate', withGeneration('image', 1000), handler)`
- 执行：额度预检查 → 记录开始时间 → res.on('finish') 异步写日志+扣减（不阻塞响应）

**Token 定价**：
| 模块 | 每次 Token | 每用户每分钟限流 |
|------|-----------|-----------------|
| 写作 LLM | 500 | 30 次 |
| 图像生成 | 1000 | 20 次 |
| 音频生成 | 1000 | 20 次 |
| 视频生成 | 1000+ | 5 次 |

### 7.4 LLM 21 接口清单

**文件**：[llm.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/routes/llm.ts)

| # | 接口 | 功能 |
|---|------|------|
| 1 | /synopsis-options | 三选一故事梗概 |
| 2 | /master-outline | 总纲（3-5卷） |
| 3 | /character-relations | 角色关系网络 |
| 4 | /volume-outline | 卷纲（5-10章） |
| 5 | /chapter-outline | 章纲（3-5场景） |
| 6 | /continue-text | 正文续写 |
| 7 | /continue-plot | 情节推演 |
| 8 | /book-title | 书名取名（5-8候选） |
| 9 | /opening-line | 开篇导语 |
| 10 | /inspiration | 脑洞灵感点子 |
| 11 | /smart-chat | 智能对话助手「智能蛙」 |
| 12 | /outline | 大纲生成（3幕结构） |
| 13 | /worldview | 世界观构建 |
| 14 | /lorebook | 设定库词条抽取 |
| 15 | /prompt-helper | Prompt 优化助手 |
| 16 | /enhance-prompt | 绘图 Prompt 优化（别名） |
| 17 | /deepseek | 多路径剧情推理 |
| 18 | /style-clone | 文风模仿 |
| 19 | /ai-erase | AI 消痕降 AI 味 |
| 20 | /script | 漫剧脚本生成 |
| 21 | /storyboard | 脚本→分镜拆解 |

**通用模式**：优先 LLM → 返回 source:'llm'；失败降级模板 → source:'template'，保证前端永远有响应。

---

## 8. 权限与安全系统

### 8.1 三级角色体系

| 角色 | 权限 |
|------|------|
| superadmin | 全部：用户/角色/统计/日志/功能/充值/删除 |
| admin | 用户创建、用户充值、用户列表/详情、订单管理 |
| user | 创作、发布、个人中心 |

### 8.2 认证中间件（5 种）

**文件**：[auth.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/middleware/auth.ts)

| 中间件 | 功能 |
|--------|------|
| authRequired | 强制登录，解析 JWT → req.user，失败 401 |
| authOptional | 可选登录（公开接口区分登录态） |
| requireRole(...roles) | RBAC 角色校验，传入允许列表，失败 403 |
| requireSuperAdmin | 超级管理员专属 |
| requireAdminOrAbove | admin + superadmin 均可 |

### 8.3 JWT 安全

**文件**：[jwt.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/lib/jwt.ts)

**启动强制校验**：JWT_SECRET 未设置或 <16 字符 → `process.exit(1)` fail-fast

**Token 结构**：{ userId, email, role }，默认 7 天过期，Bearer Header 传输

### 8.4 限流系统

**文件**：[rate-limit.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/middleware/rate-limit.ts)

双维度限流（登录按 userId，未登录按 IP）：
| 限流器 | 阈值 |
|--------|------|
| authLimiter | 30 次/分/IP（登录/注册） |
| novelLimiter | 30 次/分/用户 |
| imageLimiter | 20 次/分/用户 |
| audioLimiter | 20 次/分/用户 |
| videoLimiter | 5 次/分/用户 |

### 8.5 其他安全

- 密码：bcryptjs，盐轮数 10
- CORS：仅 FRONTEND_URL 域名跨域，credentials:true
- 数据库：Prisma 参数化查询，天然防 SQL 注入

---

## 9. 六大功能板块

### 9.1 板块连贯矩阵（11 个跨板块接口）

| 源 → 目标 | 触发按钮 | 传递数据 |
|-----------|----------|----------|
| 写作 → 图像 | 送入图像生成 | 分镜画面描述 + Prompt |
| 写作 → 漫画 | 送入漫画 | 脚本 + 分镜 + 对白 |
| 写作 → 音频 | 送入配音 | 对白文本 + 角色音色绑定 |
| 图像 → 漫画 | 自动填充 | 分镜图 src |
| 图像 → 视频 | 图生视频 | 静图 src |
| 音频 → 视频 | 音视频合成 | 音轨文件 |
| 音频 → 漫画 | 动态漫配音 | 配音音轨 |
| 漫画 → 视频 | 漫画转动态漫 | 漫画页面 |
| 漫画 → 社区 | 发布到广场 | 完成作品 |
| 视频 → 社区 | 发布到广场 | 视频作品 |
| 社区 → 任意 | 做同款 | Prompt+参数自动填充 |

**状态同步机制**：
- URL ?type=/?id= 查询参数持久化，支持分享直达
- URL ↔ UI 同步使用 replaceState，不污染浏览器历史
- 点赞/评论：乐观 UI 更新（单入口状态管理）
- location.state 传递 workspace 导航参数，支持一键复制

---

## 10. 状态管理（Zustand Stores）

**位置**：[web/src/store/](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/store/)

共 12 个 Store：

| Store | 管理内容 |
|-------|----------|
| useAuthStore | 认证状态、token、用户信息（login/register/logout/fetchMe） |
| useNovelStore | 小说项目列表、当前选中项目 |
| useEditorStore | 编辑器：当前卷/章/内容、自动保存 |
| useScriptStore | 脚本数据：角色、场景、分镜、对白 |
| useScriptGenStore | 脚本生成参数与进度 |
| useWRToolsStore | WR 写作工具（19 个功能）状态 |
| useFeatureStore | 板块功能动态配置（ModuleFeature 表） |
| useModelStore | AI 模型列表、当前选中模型 |
| useLayoutStore | 漫画排版：画布、分镜格、图层、导出 PDF |
| useProjectStore | 项目数据跨板块共享 |
| useStudioStore | 工作室视图、多面板布局 |

**useAuthStore 核心**：
- isAuthed() 派生：有 token 且 user 非空
- Token 持久化：localStorage['mank_tv_token']
- 401 响应：apiFetch 自动清除 token 抛出错误

---

## 11. 中间件系统

**位置**：[server/src/middleware/](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/middleware/)

| 中间件 | 层级 | 说明 |
|--------|------|------|
| cors() | 全局最先 | 跨域 |
| express.json() | 全局 | Body 解析 |
| authRequired | 路由组 | 强制登录 |
| novelLimiter 等 | 路由组 | 限流 |
| withGeneration | 单路由 | AI 生成：额度检查+日志+扣减 |
| upload (multer) | 单路由 | 文件上传 |
| notFound | 全局末尾 | 404 |
| errorHandler | 全局最后 | 统一错误格式 |

---

## 12. API 接口总览

### 12.1 认证（/api/auth）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /register | 注册（创建 User + UserQuota） |
| POST | /login | 登录（返回 JWT） |
| GET | /me | 当前用户信息 |
| PUT | /profile | 更新昵称/简介 |
| POST | /avatar | 上传头像 |

### 12.2 图像（/api/image，需登录）

| 方法 | 路径 | Token | 说明 |
|------|------|-------|------|
| POST | /generate | 1000 | 文生图（Pollinations，batch 1-4） |
| POST | /img2img | 1000 | 图生图 |
| POST | /enhance-prompt | 200 | LLM 优化英文绘图 Prompt |
| POST | /upload | - | 图片上传素材库 |

### 12.3 社区（/api/community）

| 方法 | 路径 | 登录 | 说明 |
|------|------|------|------|
| GET | /works | 否 | 作品列表，?page=&limit=&type=&sort=latest\|hot |
| GET | /works/:id | 否 | 作品详情 |
| POST | /works | ✓ | 发布作品 |
| GET | /works/:id/comments | 否 | 评论列表 |
| POST | /works/:id/comments | ✓ | 发表评论 |
| DELETE | /comments/:id | ✓ | 删除自己的评论 |
| POST | /works/:id/like | ✓ | 切换点赞（幂等） |

### 12.4 管理后台（/api/admin，admin+）

**文件**：[admin.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/routes/admin.ts)

| # | 方法 | 路径 | 权限 | 说明 |
|---|------|------|------|------|
| 1 | GET | /users | admin+ | 用户列表，含作品/评论 _count，?role=过滤 |
| 2 | PUT | /users/:id/role | superadmin | 改角色（不能改自己） |
| 3 | GET | /stats | superadmin | 平台全局统计 |
| 4 | GET | /logs | superadmin | 生成记录，多条件查询+分页 |
| 5 | GET | /users/:id | admin+ | 用户详情（quota+最近生成+任务+用量） |
| 6 | GET | /generations | superadmin | N天生成统计（按类型/按天/TOP用户） |
| 7 | GET | /features | admin+ | 板块功能配置列表 |
| 8 | POST | /features | superadmin | 新增板块功能 |
| 9 | PUT | /features/:id | superadmin | 更新板块功能 |
| 10 | DELETE | /features/:id | superadmin | 删除板块功能 |
| 11 | GET | /payments | admin+ | 充值订单列表 |
| 12 | POST | /users | admin+ | 管理员创建用户（自动初始化额度） |
| 13 | POST | /users/:id/recharge | admin+ | 给用户充值 Token + 记录订单 |

---

## 13. 配置与环境变量

**文件**：[server/.env](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/.env)

| 变量 | 必须 | 默认 | 说明 |
|------|------|------|------|
| PORT | 否 | 3000 | 后端端口 |
| JWT_SECRET | **✓ ≥16 字符** | - | 启动强制校验，不满足直接退出 |
| JWT_EXPIRES_IN | 否 | 7d | Token 有效期 |
| DATABASE_URL | 否 | file:./dev.db | SQLite → 生产 PostgreSQL |
| FRONTEND_URL | 否 | http://localhost:5176 | CORS 白名单 |
| DEEPSEEK_API_KEY | 否 | '' | LLM API Key（空→模板兜底） |
| DEEPSEEK_BASE_URL | 否 | https://api.deepseek.com/v1 | DeepSeek 基地址 |
| IMAGE_PROVIDER_URL | 否 | https://image.pollinations.ai/prompt | 图像 API |
| UPLOAD_DIR | 否 | ./uploads | 文件上传目录 |

---

## 14. 项目运行方式

### 14.1 启动后端

```bash
cd server
npm install
npx prisma generate      # 生成 Prisma Client
npx prisma migrate dev   # 执行迁移
npm run seed             # 播种演示账号（可选）
npm run dev              # 开发启动 → http://localhost:3000
# 打开可看到后端欢迎页（接口列表示例账号）
```

### 14.2 启动前端

```bash
cd web
npm install
npm run dev              # 开发启动 → http://localhost:5176
                         # /api/* 自动代理到 :3000
```

### 14.3 验证步骤

```bash
# 后端健康检查
curl http://localhost:3000/api/health
# → {"ok":true,"service":"Mank TV API",...}

# 前端浏览器访问：http://localhost:5176
# 使用下面演示账号登录测试
```

---

## 15. 演示账号

| 角色 | 邮箱 | 密码 | 额度 |
|------|------|------|------|
| Super Admin | admin@manktv.com | password123 | 999,000,000 tokens |
| User | demo@manktv.com | password123 | 100,000 tokens |

> 由 `npm run seed` 种子脚本创建

---

## 16. 关键设计决策

1. **功能骨架优先，API Key 后续**：所有 AI 接口有模板兜底，保证无 API Key 时系统完整可运行
2. **双模式页面 Landing → Workspace**：先预览介绍 → 点击才进入真正创作 IDE
3. **先检查后异步扣减**：请求到达预检查额度 → 响应发送后 → success 才扣，不阻塞响应且失败不扣
4. **限流双维度**：登录按 userId，未登录按 IP，防止绕过
5. **动态板块功能**：ModuleFeature 表驱动编辑器控件，运行时调整无需改前端代码
6. **JWT 硬启动校验**：绝不允许使用弱密钥，启动即 fail-fast
7. **六大板块强调色差异化**：每个功能区独立 Tailwind 色系 + ACCENTS，视觉快速区分

---

## 附录：核心文件速查

| 需求 | 文件 |
|------|------|
| 产品需求 PRD | [需求文档.md](file:///c:/Users/Administrator/Desktop/AI漫剧圈/需求文档.md) |
| 数据库表结构 | [server/prisma/schema.prisma](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/prisma/schema.prisma) |
| 后端入口 | [server/src/index.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/index.ts) |
| 前端路由 | [web/src/App.tsx](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/App.tsx) |
| JWT 安全 | [server/src/lib/jwt.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/lib/jwt.ts) |
| 权限中间件 | [server/src/middleware/auth.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/middleware/auth.ts) |
| 限流配置 | [server/src/middleware/rate-limit.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/middleware/rate-limit.ts) |
| 额度与扣减 | [server/src/lib/generation.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/lib/generation.ts) + generation.ts 中间件 |
| LLM 21 接口 | [server/src/routes/llm.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/routes/llm.ts) |
| 管理后台 13 接口 | [server/src/routes/admin.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/src/routes/admin.ts) |
| 前端 API 客户端 | [web/src/services/api.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/services/api.ts) |
| 前端认证 Store | [web/src/store/useAuthStore.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/src/store/useAuthStore.ts) |
| Tailwind 主题色 | [web/tailwind.config.js](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/tailwind.config.js) |
| 后端环境变量 | [server/.env](file:///c:/Users/Administrator/Desktop/AI漫剧圈/server/.env) |
| Vite 代理配置 | [web/vite.config.ts](file:///c:/Users/Administrator/Desktop/AI漫剧圈/web/vite.config.ts) |
