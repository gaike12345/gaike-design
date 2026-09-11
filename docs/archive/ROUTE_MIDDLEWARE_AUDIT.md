# MankTV · 路由-中间件覆盖审计矩阵

> 扫描时间：2026/8/26 13:36:13
> 复核时间：2026/9/1（dependency-and-code-hygiene 复核）
> 共扫描 14 个路由文件，共 20 条路由，发现风险点：0（原 3 项经复核全部澄清）

| 路由文件 | 前缀 | 方法 | 路径 | Auth | 限流 | 扣费 | RBAC | 风险评估 |
|---|---|---|---|---|---|---|---|---|
| `admin.ts` | `/api/admin` | **GET** | `/users` | ✅ | — | — | ✅ | ✅ OK |
| `audio.ts` | `/api/audio` | **POST** | `/tts` | ✅ | ✅ | ✅ | — | ✅ OK |
| `auth.ts` | `/api/auth` | **POST** | `/register` | ✅ | ✅ | — | — | ✅ OK |
| `billing.ts` | `/api/billing` | **GET** | `/plans` | ✅ | — | — | — | ✅ OK |
| `comic.ts` | `/api/comic` | **POST** | `/storyboard` | ✅ | ✅ | ✅ | ✅ | ✅ OK |
| `community.ts` | `/api/community` | **GET** | `/works` | ✅ | — | — | — | ✅ OK |
| `features.ts` | `/api/features` | **GET** | `/` | ✅ 公开 | — | — | — | ✅ OK（设计公开：板块功能配置供前端公开读取） |
| `image.ts` | `/api/image` | **POST** | `/generate` | ✅ | ✅ | ✅ | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/synopsis-options` | ✅ | ✅ | ✅ | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/outline` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/worldview` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/lorebook` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/prompt-helper` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/deepseek` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/style-clone` | ✅ | ✅ | — | — | ✅ OK |
| `llm.ts` | `/api/llm` | **POST** | `/ai-erase` | ✅ | ✅ | — | — | ✅ OK |
| `projects.ts` | `/api/projects` | **GET** | `/` | ✅ 前缀级 | — | — | — | ✅ OK（authRequired 在 index.ts 前缀注册） |
| `upload.ts` | `/api/upload` | **POST** | `/image` | ✅ | ✅ | — | — | ✅ OK（router.use(authLimiter) 已补充） |
| `user.ts` | `/api/user` | **GET** | `/profile` | ✅ | — | — | — | ✅ OK |
| `video.ts` | `/api/video` | **POST** | `/text2video` | ✅ | ✅ | ✅ | — | ✅ OK |

---

## 复核说明（2026/9/1 · dependency-and-code-hygiene）

原报告 3 项风险经复核全部澄清，不再构成风险：

1. **`features.ts GET /` 缺少鉴权** → 设计即公开接口。`index.ts` 注释明确「板块功能配置（公开）」，前端需无鉴权读取功能控件配置以动态渲染 UI。无敏感数据返回。
2. **`projects.ts GET /` 缺少鉴权** → 鉴权在 `index.ts` 前缀级注册：`app.use('/api/projects', authRequired, projectRoutes)`。路由内部 `req.user!.userId` 依赖此前缀 middleware。
3. **`upload.ts POST /image` 缺少速率限制** → 已于后续修复中添加 `router.use(authLimiter)`（IP 级 30/min，动态可配）。