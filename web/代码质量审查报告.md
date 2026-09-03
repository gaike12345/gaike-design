# AI 漫剧圈前端代码质量审查报告

> 审查范围：`c:\Users\Administrator\Desktop\AI漫剧圈\web\src`
> 技术栈：React 19 + TypeScript 6 + Vite 8 + Zustand 5 + Tailwind CSS + React Router 7
> 审查方式：只读静态分析

---

## 一、架构与组织

### 1.1 Store 碎片化严重 — 高

**问题描述**：项目中存在 **16 个 Zustand store**，其中多个 store 职责高度重叠，存在严重的状态管理碎片化和重复代码问题。

**具体位置**：
- `src/store/useCanvasStore.ts` (431 行) — 旧版图像画布 store
- `src/store/useVideoCanvasStore.ts` (448 行) — 视频画布 store
- `src/store/useUnifiedCanvasStore.ts` (703 行) — 新版统一画布 store
- `src/store/useStudioStore.ts` (213 行) — 图像生成工作室 store
- `src/store/useNovelStore.ts` (312 行) — 小说写作 store
- `src/store/useScriptGenStore.ts` (222 行) — 脚本生成 store
- `src/store/useScriptStore.ts` (398 行) — 脚本 Facade store
- `src/store/useWRToolsStore.ts` (200 行) — 写作工具 store
- `src/store/useEditorStore.ts` (25 行) — 编辑器设置 store
- `src/store/useLayoutStore.ts` (379 行) — 排版布局 store
- `src/store/useProjectStore.ts` (161 行) — 项目 store
- `src/store/useAuthStore.ts` (205 行) — 认证 store
- `src/store/useQuotaStore.ts` (67 行) — 积分 store
- `src/store/useQuotaModalStore.ts` (42 行) — 积分弹窗 store
- `src/store/useFeatureStore.ts` (52 行) — 功能配置 store
- `src/store/useModelStore.ts` (64 行) — 模型列表 store

**问题分析**：
1. `useCanvasStore`、`useVideoCanvasStore`、`useUnifiedCanvasStore` 三者包含几乎完全相同的画布交互逻辑（视口、平移、缩放、节点拖拽、连线），代码重复率超过 70%
2. `useScriptStore` 作为 Facade 聚合了 `useEditorStore`、`useWRToolsStore`、`useScriptGenStore`、`useNovelStore` 四个子 store，还重写了 `setState` 方法做分发，架构复杂且脆弱
3. `useNovelStore` 与 `useScriptGenStore` 中存在大量重复的"大纲/角色/续写"逻辑
4. 16 个 store 中至少有 3 个是遗留废弃的（`useCanvasStore`、`useVideoCanvasStore`、`useStudioStore`），但仍在代码库中

---

### 1.2 巨型组件 — 高

**问题描述**：多个组件文件超过 1000 行，职责不清，难以维护和测试。

| 文件 | 行数 | 问题 |
|------|------|------|
| `src/pages/AdminPage.tsx` | **5958 行** | 单文件近 6000 行，包含用户管理、模型管理、内容审核、站点配置、订单管理、数据分析等至少 8 个完全独立的功能模块 |
| `src/pages/SettingsPage.tsx` | 1613 行 | 个人中心所有 tab 混在一个文件 |
| `src/pages/CommunityPage.tsx` | 1600 行 | 社区广场 + 作品详情 + 发布 + 评论全部在一起 |
| `src/components/canvas/UnifiedNodes.tsx` | 1535 行 | 节点渲染 + 各类型节点面板 + 元数据定义混在一起 |
| `src/components/canvas/UnifiedCanvas.tsx` | 1299 行 | 画布容器 + 右键菜单 + 端口创建菜单 + 连线动画全部在一起 |

**建议**：AdminPage 应拆分为 `admin/` 目录下的多个页面/组件，按功能模块拆分（用户管理、模型管理、内容审核、站点配置、数据统计等）。

---

### 1.3 目录结构不够清晰 — 中

**问题描述**：组件和页面的组织缺乏层级，所有页面都平铺在 `pages/` 目录，组件也缺乏按领域分类。

**具体位置**：
- `src/pages/` 下 16 个页面文件全部平铺
- `src/components/` 下混合了 layout、ui、canvas、editor、preview、studio 等不同领域组件，但没有统一的分类规范
- `src/services/` 中的 API 服务尚可，但缺少类型定义的集中管理

---

### 1.4 直接操作 DOM 绕过 React 渲染 — 中

**问题描述**：`UnifiedCanvas.tsx` 中大量使用原生 DOM 操作（`createElementNS`、`setAttribute`、`querySelector`、`elementFromPoint`）来管理 SVG 连线，完全绕过 React 的声明式渲染。

**具体位置**：
- `src/components/canvas/UnifiedCanvas.tsx:493-564` — 连线 DOM 同步 Effect，直接创建/移除 SVG 元素
- `src/components/canvas/UnifiedCanvas.tsx:569-658` — 流光 RAF 动画，直接操作 SVG path 属性
- `src/components/canvas/UnifiedCanvas.tsx:704-718` — 端口拖拽时直接在 DOM 中创建临时连线

**风险**：
- React 的虚拟 DOM 与真实 DOM 脱节，可能导致状态不一致
- 代码可维护性差，新人上手困难
- 内存泄漏风险（事件监听器、DOM 引用需手动清理）

---

## 二、代码质量

### 2.1 画布 store 间大量重复代码 — 高

**问题描述**：三个画布 store 的核心逻辑（视口变换、节点增删、连线管理、贝塞尔曲线计算、uid 生成、canConnect 判断）高度重复。

**具体位置**（仅举典型重复项）：

| 功能 | useCanvasStore | useVideoCanvasStore | useUnifiedCanvasStore |
|------|---------------|---------------------|----------------------|
| 视口 panBy | L217-218 | L242-243 | L354-355 |
| 视口 zoomTo | L219-226 | L244-251 | L356-361 |
| addNode | L229-239 | L254-264 | L364-392 |
| removeNode | L241-248 | L266-275 | L394-401 |
| addConnection | L262-280 | L289-307 | L413-429 |
| canConnect | L199-207 | L209-217 | L300-311 |
| uid 函数 | L187-189 | L205-207 | L285-290 |
| bezierPath | - | - | L49-72 (组件内) |

**建议**：提取一个 `canvasBase` 公共模块或 `useCanvasBase` hook，将通用的画布交互逻辑复用。

---

### 2.2 魔法数字和硬编码字符串 — 中

**问题描述**：代码中散布着大量硬编码的数字和字符串，缺乏命名常量。

**典型位置**：
- `src/store/useUnifiedCanvasStore.ts:340` — `GRID_SIZE = 24`（有定义，较好）
- `src/components/canvas/UnifiedCanvas.tsx:50` — `MIN_CTRL = 40, MAX_CTRL = 240, RATIO = 0.4, MIN_BEND = 8, MAX_BEND = 56`（贝塞尔曲线参数，在组件函数内定义）
- `src/components/canvas/UnifiedCanvas.tsx:415` — `THRESHOLD = 80`（端口吸附阈值）
- `src/store/useUnifiedCanvasStore.ts:596` — `setInterval(..., 3000)`（视频轮询间隔，硬编码 3 秒）
- `src/store/useAuthStore.ts:163` — `setTimeout(..., 300)`（微信登录跳转延迟）
- `src/components/AuthGuard.tsx:64` — `setTimeout(..., 3000)`（3 秒超时兜底）
- `src/store/useUnifiedCanvasStore.ts:787` — `setTimeout(..., 500)`（保存 debounce 时间）
- `src/store/useStudioStore.ts:139` — `.slice(0, 50)`（历史记录上限 50）
- `src/store/useScriptGenStore.ts:107` — `.slice(0, 20)`（历史记录上限 20）
- `src/store/useUnifiedCanvasStore.ts:781` — `STORAGE_KEY = 'ai_canvas_state_v2'`（存储 key 散落在各文件）

---

### 2.3 `any` 类型滥用 — 高

**问题描述**：项目中存在 60+ 处 `any` 类型使用，削弱了 TypeScript 的类型安全性。

**分类统计**：

| 类别 | 数量 | 典型位置 |
|------|------|----------|
| catch error 变量 | ~15 处 | `useCanvasStore.ts:378`, `useStudioStore.ts:141`, `CommunityPage.tsx:1026` 等 |
| 类型断言 (as any) | ~27 处 | `useUnifiedCanvasStore.ts:392`, `useScriptStore.ts:444-471`, `UnifiedNodes.tsx:68` 等 |
| 函数参数/返回值 | ~20 处 | `useFeatureStore.ts:12`, `useProjectStore.ts:31`, `AdminPage.tsx` 多处 |
| icon 组件类型 | ~10 处 | `UnifiedCanvas.tsx:1112`, `ModerationPanel.tsx:573`, `AdminPage.tsx:943` 等 |

**最严重位置**：
- `src/store/useScriptStore.ts:444-471` — 重写 `setState` 的整个逻辑使用 `any`，类型完全失控
- `src/store/useUnifiedCanvasStore.ts:478,564,636` — 通过 `(src.data as any)` 访问节点数据，绕过 TypeScript 类型检查（因为 `UnifiedNodeData` 是联合类型但未做类型收窄）
- `src/pages/AdminPage.tsx` — 整个文件存在大量 `any`，包括 `orders.map((o: any) => ...)`、`toggleHidden(w: any)`、`delWork(w: any)` 等

---

### 2.4 命名不一致 — 低

**问题描述**：
1. store 文件命名混用：`useAuthStore.ts` vs `useCanvasStore.ts` vs `useEditorStore.ts`（虽然都是 `useXxxStore` 格式，但命名规范尚可）
2. 状态命名不一致：`status` vs `xxxStatus` vs `loading`
3. API 错误字段：有时用 `error`，有时用 `message`

---

## 三、性能问题

### 3.1 缺少 React.memo / useMemo 优化 — 中

**问题描述**：项目中几乎没有使用 `React.memo` 来优化组件重渲染，`useMemo` 和 `useCallback` 的使用也非常有限（主要在 AdminPage 中使用）。

**具体位置**：
- `src/components/canvas/UnifiedCanvas.tsx:950-983` — 节点列表 `nodes.map` 渲染，节点组件未使用 `React.memo`，每次 store 变化（如视口平移）都会导致所有节点重新渲染
- `src/components/canvas/UnifiedNodes.tsx` — `UBaseNode` 组件未 memo 化
- 社区页作品列表、评论列表等大列表均无虚拟化或 memo 优化

**高风险场景**：
- 画布中节点数量增多时，每次视口变化都会触发全量节点重渲染
- 社区页作品列表增长时性能会下降

---

### 3.2 画布节点无虚拟滚动 — 中

**问题描述**：画布中的节点全部渲染在 DOM 中，当节点数量较多（例如 50+ 个节点）时，即使大部分节点在视口外，也会全部参与渲染和布局计算。

**具体位置**：
- `src/components/canvas/UnifiedCanvas.tsx:950-983` — 无条件渲染全部节点

**说明**：由于画布使用绝对定位 + transform 缩放，不适合传统虚拟列表，但可以考虑基于视口的裁剪渲染（只渲染视口范围内的节点）。

---

### 3.3 RAF 动画可能导致性能问题 — 低

**问题描述**：UnifiedCanvas 中的流光动画使用 `requestAnimationFrame` 持续运行，即使没有任何激活的连线也在跑。

**具体位置**：
- `src/components/canvas/UnifiedCanvas.tsx:569-658` — 流光 RAF 动画，`useEffect` 依赖数组为空，组件挂载后永不停止

**当前有 `data-active` 判断做早期退出**，影响有限，但仍有优化空间：当没有激活连线时暂停 RAF。

---

### 3.4 Bundle 体积潜在风险 — 中

**问题描述**：项目依赖了 `konva`、`react-konva`、`jspdf`、`html2canvas` 等大型库，但从代码来看画布实际上使用的是原生 DOM + SVG 实现，Konva 可能未被充分利用。

**具体位置**：
- `package.json:16-20` — 依赖 `konva`, `react-konva`, `jspdf`
- `src/components/canvas/` 目录下使用原生 DOM + SVG 实现，未见 Konva 使用

**风险**：如果 Konva 确实未被使用，它会增加约 200KB+ 的 gzip bundle 体积。需要确认是否有其他地方在使用。

---

## 四、安全问题

### 4.1 Token 存储在 localStorage 中 — 中

**问题描述**：认证 token 存储在 `localStorage` 中，存在 XSS 攻击风险。如果页面中有任何 XSS 漏洞，攻击者可以直接读取 token。

**具体位置**：
- `src/services/api.ts:9-22` — `TOKEN_KEY = 'mank_tv_token'`，使用 localStorage 存储
- `src/store/useAuthStore.ts:10` — 引入并使用

**风险说明**：
- 相比 httpOnly Cookie，localStorage 存储 token 的 XSS 风险更高
- 目前代码中未发现明显 XSS 漏洞（无 `dangerouslySetInnerHTML`），但防御深度不足

**建议**：考虑使用 httpOnly + Secure Cookie 存储 token，或至少添加 CSP 策略降低 XSS 风险。

---

### 4.2 SettingsPage 硬编码 token key — 高

**问题描述**：`SettingsPage.tsx` 中有两处直接使用 `localStorage.getItem('token')` 读取 token，使用了错误的 key（正确的 key 是 `mank_tv_token`）。

**具体位置**：
- `src/pages/SettingsPage.tsx:564` — `localStorage.getItem('token')`
- `src/pages/SettingsPage.tsx:601` — `localStorage.getItem('token')`

**问题分析**：
1. **Key 不一致**：api.ts 中定义的 key 是 `mank_tv_token`，这里用的是 `token`，可能导致上传时鉴权失败
2. **绕过统一 API 封装**：直接使用 `fetch` 而非统一的 `uploadFile` 函数，导致 401/402 等状态码的统一处理失效
3. **重复的上传逻辑**：两处上传（banner 和 avatar）几乎完全相同，应该复用 `services/api.ts` 中的 `uploadFile` 函数

---

### 4.3 开发模式自动登录可能泄露到生产 — 高

**问题描述**：AuthGuard 中有一个开发模式自动登录的逻辑，通过 `localStorage` 中的 `mank_tv_dev_auth` 标志触发。虽然有 `import.meta.env?.DEV` 判断，但如果构建配置有问题，可能在生产环境中被意外触发。

**具体位置**：
- `src/components/AuthGuard.tsx:30-43` — Dev 模式自动登录逻辑

**问题代码**：
```typescript
const isDevBuild = import.meta.env?.DEV === true
const devBypass = isDevBuild ? localStorage.getItem('mank_tv_dev_auth') : null
if (devBypass === '1') {
  if (!getToken()) setToken('dev-token-local-injected')
  // ... 注入 DEV_USER
}
```

**风险点**：
1. `setToken('dev-token-local-injected')` — 注入伪造 token
2. 直接操作 store 的 `setState` 注入用户信息（`(store as any).setState`）
3. `DEV_USER` 硬编码在源码中

**建议**：将此逻辑移至仅开发环境的单独文件中，或使用 Vite 的 `?dev` 条件导入确保生产构建完全剔除。

---

### 4.4 前端鉴权可被绕过 — 中

**问题描述**：管理后台的角色检查仅在前端进行，虽然后端会做二次校验，但前端可以通过修改 store 中的 user.role 来看到管理后台的 UI（虽然调用 API 会失败）。

**具体位置**：
- `src/pages/AdminPage.tsx:568` — `if (!user || (user.role !== 'admin' && user.role !== 'superadmin'))`
- `src/components/layout/Navbar.tsx:160` — 管理后台入口显示判断
- `src/App.tsx:78` — `/admin` 路由仅用 `AuthGuard` 包裹，未做角色校验

**风险**：攻击者可以通过浏览器控制台修改 store 状态，看到管理后台的界面布局（虽然无法获取真实数据），增加了攻击面。

**建议**：在路由层面添加角色守卫，或在 AdminPage 加载时向后端验证角色。

---

### 4.5 Store 暴露到 window 对象 — 中

**问题描述**：`useUnifiedCanvasStore` 被挂载到 `window.__ucs` 上，虽然注释说是"开发模式便于浏览器自动化测试"，但没有环境判断，生产构建也会暴露。

**具体位置**：
- `src/store/useUnifiedCanvasStore.ts:794-796`
```typescript
if (typeof window !== 'undefined') {
  ;(window as any).__ucs = useUnifiedCanvasStore
}
```

**风险**：
- 生产环境中用户可通过控制台直接操作画布 store，可能导致意外行为
- 增加了攻击面（XSS 时可直接访问 store）

**建议**：添加 `import.meta.env.DEV` 判断，仅在开发模式下暴露。

---

## 五、错误处理

### 5.1 缺少全局错误边界（Error Boundary）— 高

**问题描述**：项目完全没有 React Error Boundary，任何组件的渲染错误都会导致整个应用白屏。

**证据**：全局搜索 `ErrorBoundary` 无任何匹配。

**具体位置**：
- `src/main.tsx:9-17` — 应用入口直接渲染，无错误边界包裹
- `src/App.tsx` — 路由层也没有错误边界

**建议**：
1. 在根级别添加错误边界，捕获渲染错误并展示降级 UI
2. 在路由级别添加错误边界，单个页面崩溃不影响全站
3. 画布等复杂组件也应添加局部错误边界

---

### 5.2 静默吞掉异常 — 高

**问题描述**：代码中有大量空的 `catch` 块，完全静默地吞掉异常，不利于问题排查和用户反馈。

**具体位置**（共 16 处）：

| 文件 | 行号 | 说明 |
|------|------|------|
| `src/services/api.ts` | 57 | 402 响应的 JSON 解析失败 |
| `src/services/api.ts` | 111 | uploadFile 的 402 JSON 解析失败 |
| `src/store/useUnifiedCanvasStore.ts` | 619 | 视频轮询异常 |
| `src/store/useUnifiedCanvasStore.ts` | 747 | localStorage 保存失败 |
| `src/components/canvas/UnifiedCanvas.tsx` | 410 | elementFromPoint 异常 |
| `src/components/canvas/UnifiedCanvas.tsx` | 454 | fallback 端口匹配异常 |
| `src/components/ModerationPanel.tsx` | 135, 149, 160, 173, 203, 220, 236, 243 | 8 处静默 catch |
| `src/pages/CommunityPage.tsx` | 87 | 社区数据加载异常 |
| `src/pages/AdminPage.tsx` | 5926 | 清除站点草稿异常 |

**最严重**：
- `src/store/useUnifiedCanvasStore.ts:619` — 视频轮询失败完全静默，用户不知道生成任务出了问题
- `src/pages/CommunityPage.tsx:87` — 社区数据加载失败静默，用户看到空白页面

**建议**：至少添加错误日志上报，或设置错误状态让 UI 展示提示。

---

### 5.3 API 错误处理不统一 — 中

**问题描述**：大部分 API 调用通过统一的 `apiFetch` 封装，但有一些地方绕过了统一封装直接使用 `fetch`。

**具体位置**：
- `src/pages/SettingsPage.tsx:559-573` — banner 上传直接用 fetch
- `src/pages/SettingsPage.tsx:597-608` — avatar 上传直接用 fetch
- `src/services/imageApi.ts:96` — pingApiEndpoint 直接用 fetch

**问题**：
- 这些直接 fetch 的调用绕过了 401 自动清 token、402 自动弹积分弹窗等统一处理
- 错误格式不一致

---

### 5.4 未处理的 Promise rejection 风险 — 中

**问题描述**：代码中有多处使用 `void` 关键字忽略 Promise，或在事件处理中调用异步函数但不处理 rejection。

**典型位置**：
- `src/store/useUnifiedCanvasStore.ts:528` — `void useQuotaStore.getState().refreshQuota({ force: true })`
- `src/store/useUnifiedCanvasStore.ts:598` — `void get().pollVideoTask(nodeId)`
- `src/components/canvas/UnifiedCanvas.tsx:160` — `void refreshQuota({ force: false })`
- `src/store/useVideoCanvasStore.ts:392` — `void get().pollTask(nodeId)`

这些 `void` 调用如果抛出异常，会变成未捕获的 Promise rejection，可能导致应用崩溃（取决于浏览器策略）。

---

## 六、状态管理

### 6.1 useScriptStore Facade 模式复杂且脆弱 — 高

**问题描述**：`useScriptStore` 采用了一种极其复杂的 Facade 模式，聚合了 4 个子 store，还重写了 `setState` 方法做状态分发。

**具体位置**：
- `src/store/useScriptStore.ts:289-419` — store 创建，订阅 4 个子 store
- `src/store/useScriptStore.ts:425-472` — 重写 `setState` 方法，按 key 分发到子 store

**问题分析**：
1. **重写 setState 是反模式**：Zustand 的内部实现可能变化，这种 hack 方式脆弱且不可维护
2. **循环同步风险**：4 个子 store 的 subscribe 都调用 sync，而 sync 又调用 set 到 facade，可能引发循环更新（虽然有 `syncing` 标志防护）
3. **性能问题**：任何一个子 store 的微小变化都会触发整个 facade 的更新，导致所有使用 facade 的组件重渲染
4. **状态来源不清晰**：开发者难以追踪某个状态到底存在哪个子 store 中

**建议**：
- 方案一：合并为单一 store，按功能分片（slices pattern）
- 方案二：彻底移除 facade，各组件直接使用对应的子 store

---

### 6.2 多 store 状态不同步风险 — 中

**问题描述**：由于同一领域的数据分散在多个 store 中，存在状态不同步的风险。

**典型例子**：
1. 小说相关数据同时存在于 `useNovelStore` 和 `useScriptStore`（facade）中
2. 画布相关数据同时存在于 `useCanvasStore`、`useVideoCanvasStore`、`useUnifiedCanvasStore` 中
3. 用户信息在 `useAuthStore` 中，但部分页面可能有本地缓存

---

### 6.3 遗留 store 未清理 — 中

**问题描述**：项目中存在多个明显是旧版本遗留的 store，但仍保留在代码库中，增加了维护成本和困惑。

**疑似遗留的 store**：
- `useCanvasStore.ts` — 旧版图像画布，可能已被 `useUnifiedCanvasStore` 替代
- `useVideoCanvasStore.ts` — 旧版视频画布，可能已被 `useUnifiedCanvasStore` 替代
- `useStudioStore.ts` — 旧版图像生成工作室，功能与 unified canvas 重叠

**风险**：
- 新开发者不知道该用哪个 store
- 维护时需要同时修改多个相似的 store
- 增加 bundle 体积

---

### 6.4 Props Drilling 不明显 — 低

**问题描述**：得益于 Zustand 的全局状态管理，props drilling 问题不严重。大部分状态通过 store 直接访问，不需要层层传递。

**少数存在的场景**：
- `UnifiedCanvas.tsx` 向子组件传递大量回调和数据（但这是组件内部组织问题，不是跨层级 drilling）

---

## 七、可访问性

### 7.1 语义化标签使用不足 — 中

**问题描述**：大量交互元素使用 `div` + `onClick` 而非语义化的 `button` 元素，缺少键盘可达性。

**典型模式**：
```typescript
<div onClick={...} className="..."> 操作按钮 </div>
```

**搜索证据**：搜索 `onClick` 返回大量结果，其中相当一部分是在 `div` 上而非 `button` 上。

**影响**：
- 键盘用户无法通过 Tab 键聚焦这些元素
- 屏幕阅读器无法正确识别为可交互元素
- 缺少 `:focus` 样式

---

### 7.2 缺少焦点管理 — 中

**问题描述**：弹窗/抽屉组件打开时没有将焦点移到弹窗内，关闭时也没有将焦点返回触发元素。

**具体位置**：
- `src/components/AuthGuard.tsx:83-114` — 未登录占位页面，点击打开登录弹窗
- `src/pages/LoginPage.tsx` — 登录弹窗（591 行），焦点管理未知
- `src/components/QuotaModal.tsx` — 积分弹窗
- `src/components/LegalModal.tsx` — 法律条款弹窗
- `src/components/canvas/UnifiedCanvas.tsx:828-866` — 删除确认弹窗

---

### 7.3 图片缺少 alt 文本 — 低

**问题描述**：部分图片可能缺少有意义的 alt 文本。

**已检查到较好的实践**：
- Navbar 中的 logo 有 alt 文本（`src/components/layout/Navbar.tsx:95`）
- 画布中的 logo 有 alt 文本（`src/components/canvas/UnifiedCanvas.tsx:738`）

但社区页面作品图片、画布生成结果图片等可能缺少适当的 alt 文本。

---

### 7.4 颜色对比度未验证 — 低

**问题描述**：项目使用自定义主题色（`primaryColor`），如果用户配置了较浅的主色，可能导致文字与背景的对比度不满足 WCAG 标准。

**具体位置**：
- `src/components/layout/Navbar.tsx:65-70` — 动态计算的渐变色和 activeStyle
- `src/hooks/useSiteConfig.tsx` — 站点配置中的主色

**建议**：添加对比度校验，或确保主色选择器只允许符合 WCAG AA 标准的颜色。

---

## 八、TypeScript 质量

### 8.1 `any` 类型广泛使用 — 高

详见 [2.3 节](#23-any-类型滥用--高)。共发现 60+ 处 `any` 使用。

**最需要优先修复的**：
1. `src/store/useScriptStore.ts:444-471` — setState 重写逻辑
2. `src/pages/AdminPage.tsx` — 约 10+ 处 any
3. `src/store/useUnifiedCanvasStore.ts` — 节点数据访问使用 `as any`

---

### 8.2 类型定义不完整 — 中

**问题描述**：部分数据结构的类型定义不完整，使用 `any` 或缺失字段类型。

**具体位置**：
- `src/store/useFeatureStore.ts:12` — `config: any`（功能配置的 config 字段）
- `src/store/useProjectStore.ts:22-27` — `payload` 字段内部全是 `unknown`
- `src/hooks/useSiteConfig.tsx:22` — `[k: string]: any`（站点配置索引签名）
- `src/store/useProjectStore.ts:31` — `mapProject(raw: any)` — 后端返回数据无类型

---

### 8.3 tsconfig 过于宽松 — 中

**问题描述**：TypeScript 配置中关闭了多项严格检查。

**具体位置**：
- `tsconfig.app.json:20` — `noUnusedLocals: false`
- `tsconfig.app.json:21` — `noUnusedParameters: false`
- 缺少 `strict: true`（虽然 `verbatimModuleSyntax` 和 `noFallthroughCasesInSwitch` 开启了，但核心的 strict 模式未显式开启）

**影响**：
- 未使用的变量和参数不会报错，代码容易积累死代码
- 缺少严格空值检查（`strictNullChecks`），可能导致运行时空值错误

---

### 8.4 组件 Props 类型不完整 — 低

**问题描述**：部分组件的 props 类型使用 `any` 而非精确类型。

**典型位置**：
- icon props 普遍使用 `any` 类型（因为是 Lucide 组件，尚可接受，但可以用 `LucideIcon` 类型）
- `src/components/ModerationPanel.tsx:573` — `icon: any`
- `src/components/canvas/UnifiedCanvas.tsx:1112` — `icon: any`

---

## 九、其他问题

### 9.1 轮询未清理导致内存泄漏 — 中

**问题描述**：视频生成的轮询定时器存储在模块级的 `pollRegistry` Map 中，但组件卸载时不会自动停止。

**具体位置**：
- `src/store/useUnifiedCanvasStore.ts:154` — `pollRegistry` 在模块级别
- `src/store/useUnifiedCanvasStore.ts:596-597` — 启动轮询
- `src/store/useVideoCanvasStore.ts:101` — 同样的模式

**风险场景**：
- 用户离开画布页面时，如果有正在进行的视频生成任务，轮询会继续在后台运行
- 多次进入/离开画布页面可能积累多个轮询

**说明**：`removeNode` 和 `clearCanvas` 会停止轮询，但页面卸载时不一定会触发这些操作。

---

### 9.2 直接操作 document.body.style — 低

**问题描述**：多个组件直接修改 `document.body.style.overflow` 来锁定滚动，但缺少统一管理，多个弹窗同时打开时可能冲突。

**具体位置**：
- `src/pages/LoginPage.tsx:116-119`
- `src/components/LegalModal.tsx:83-87`
- `src/components/layout/Navbar.tsx:45-49`
- `src/components/canvas/UnifiedCanvas.tsx:233-236`（修改 classList）

**风险**：如果两个弹窗同时打开，后关闭的那个会恢复 `overflow` 为 `''`，而实际上另一个弹窗仍然需要锁定滚动。

---

### 9.3 tsconfig 中缺少路径别名 — 低

**问题描述**：项目中使用相对路径导入（`../../store/xxx`、`../services/xxx`），没有配置路径别名，深层嵌套的组件导入路径很长且不直观。

**建议**：在 `vite.config.ts` 和 `tsconfig.json` 中配置 `@` 别名指向 `src/`。

---

## 十、按优先级排序的优化建议清单

### P0 — 必须立即修复（安全/崩溃风险）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 1 | **SettingsPage token key 错误** | `SettingsPage.tsx:564,601` | 上传功能鉴权失败 |
| 2 | **缺少全局错误边界** | `main.tsx`, `App.tsx` | 任意组件报错导致全站白屏 |
| 3 | **静默吞掉关键异常** | 16 处空 catch 块 | 问题无法排查，用户无反馈 |
| 4 | **开发模式自动登录** | `AuthGuard.tsx:30-43` | 生产环境可能被绕过鉴权 |
| 5 | **Store 暴露到 window** | `useUnifiedCanvasStore.ts:794-796` | 增加安全攻击面 |

### P1 — 高优先级（架构/性能/类型安全）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 6 | **AdminPage 巨型组件（5958 行）** | `pages/AdminPage.tsx` | 维护困难，构建性能差 |
| 7 | **useScriptStore Facade 反模式** | `store/useScriptStore.ts` | 状态管理混乱，性能差 |
| 8 | **画布 store 大量重复** | 3 个画布 store | 维护成本翻倍，bug 不同步 |
| 9 | **any 类型滥用（60+ 处）** | 多个文件 | TypeScript 形同虚设 |
| 10 | **遗留 store 未清理** | `useCanvasStore`, `useVideoCanvasStore`, `useStudioStore` | 混淆 + 无用代码体积 |
| 11 | **画布节点无 memo 优化** | `UnifiedCanvas.tsx` | 节点增多时卡顿 |
| 12 | **视频轮询可能泄漏** | `useUnifiedCanvasStore.ts` | 内存泄漏 + 后台请求 |

### P2 — 中优先级（代码质量/体验）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 13 | **API 错误处理不统一** | `SettingsPage.tsx` 直接 fetch | 绕过 401/402 统一处理 |
| 14 | **前端鉴权可被绕过看到 UI** | `AdminPage.tsx:568` | 增加攻击面 |
| 15 | **Token 存 localStorage** | `services/api.ts:9` | XSS 风险（需配合其他漏洞） |
| 16 | **语义化标签不足** | 多处 div + onClick | 可访问性差 |
| 17 | **弹窗焦点管理缺失** | 各弹窗组件 | 键盘用户体验差 |
| 18 | **魔法数字散布** | 多处硬编码值 | 可维护性差 |
| 19 | **tsconfig 检查过于宽松** | `tsconfig.app.json:20-21` | 死代码积累，空值风险 |
| 20 | **直接操作 DOM 绕过 React** | `UnifiedCanvas.tsx` | 可维护性差 |

### P3 — 低优先级（优化/规范）

| # | 问题 | 位置 | 影响 |
|---|------|------|------|
| 21 | **缺少路径别名** | vite/tsconfig 配置 | 导入路径冗长 |
| 22 | **body overflow 管理冲突** | 多个弹窗组件 | 多个弹窗时滚动锁定异常 |
| 23 | **命名不一致** | 状态/错误字段命名 | 代码阅读成本 |
| 24 | **Konva 依赖可能未使用** | `package.json` | bundle 体积增大 |
| 25 | **颜色对比度动态性** | 站点主题色配置 | 不符合可访问性标准的风险 |

---

## 总结

该项目是一个功能丰富的 AI 创作平台，技术选型（React 19 + Zustand + Vite）现代合理，代码整体可读性尚可。主要问题集中在：

1. **状态管理架构混乱** — 16 个 store、重复代码、Facade 反模式
2. **巨型组件** — AdminPage 近 6000 行，严重影响维护性
3. **TypeScript 类型安全不足** — 60+ 处 any 类型，tsconfig 检查宽松
4. **错误处理薄弱** — 无 Error Boundary、大量静默 catch
5. **安全隐患** — token key 不一致、开发模式泄漏、store 暴露到 window

建议优先处理 P0 级安全和稳定性问题，然后逐步推进 P1 级架构重构（特别是 store 的整合和 AdminPage 的拆分）。
