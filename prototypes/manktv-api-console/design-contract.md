# MankTV API Console · Design Contract (v5 · 字节对齐前端)

> 唯一合法来源：`web/tailwind.config.js` + `web/src/components/layout/FeatureLanding.tsx`（`ACCENTS.*`）+ `web/src/assets/logo.svg`
> 冻结日期：2026-08-26；本契约所有 token 必须与前端 **字节一致**，不得自行加减色阶。

---

## 0. Scope 与产品定位
- 产品：MankTV（AI 漫剧圈）**后端开发控制台原型**，给后端工程师 / 运维 / 第三方合作伙伴使用。
- 覆盖：平台总览、API 调试台、作品队列审核、API Key 配额管理、主题与系统设置。
- 交付形态：**纯静态离线可打开**（plain HTML + CSS + vanilla JS），零 CDN，全部资源相对路径。
- 离线要求：双击 `index.html` 可运行；导航 / 交互 / Mock 数据全部内联。
- 反 AI-slop 规则：
  - 严格禁止 emoji 作为功能图标（仅 `MOCK.ICONS` inline SVG）。
  - 所有强调色必须有真实 Tailwind `DEFAULT` / `ACCENTS.main` 对应值（c500 = Tailwind DEFAULT）。
  - 所有 CTA 主按钮渐变必须来自 Logo 色带的子集（Brand `#3B82F6` → Comic `#7C3AED`，与 `FeatureLanding.tsx` `shadow-pop` 色一致）。

---

## 1. 技术栈 Tech Stack

| 维度 | 取值 |
|---|---|
| Stack | vanilla HTML + CSS + vanilla JS（纯静态） |
| 交付类型 | pure-static · offline-openable |
| 字体 | 系统自承载（PingFang SC / Microsoft YaHei / SF Mono），零 Google Fonts |
| 图标 | **Lucide inline SVG**（`MOCK.ICONS` 字典统一提供） |
| 路由 | Hash router（`#/dashboard`），单页 5 视图，无 hash 即 Dashboard |
| Mock 层 | `mock.js` 暴露 `window.MOCK`；`api.js` 暴露 `window.API.*`（Promise-based stub） |
| 自举 | `node api.js --build` 再生成 `index.html`；同步 `contract/design-contract.md` |

---

## 2. 风格层级 Style Tier
- **style tier**：`brand-themed × editorial-tech-magazine`
- **aesthetic**：编辑杂志感 × 科技 SaaS — 克制字号对比、软圆角（`14/20/28px`）、杂志式 grid、柔和光晕背景、极细边框。
- **tone keywords**：restrained（克制）、高密度信息、杂志式 Hero、品牌化但不喧宾夺主。
- **bg-texture**：
  - body：双径向光晕 `brand(.08)×comic(.07)` + `--bg-sunken`。
  - Hero：双径向光晕 + 栅格暗纹 mask（radial ellipse fade 85%），严格对齐 `FeatureLanding` Hero 美学。
- **Motion**：
  - 加载 stagger：Eyebrow / H1 / Lead / Hero / KPIs / Cards（40–60ms step）。
  - Hover：卡片 `translateY(-2px)` + `shadow-pop`；按钮 `translateY(-1px)`。
  - `prefers-reduced-motion`：仅保留 opacity fade，关闭 transform/stagger。

---

## 3. Design Tokens（字节对齐 web/tailwind.config.js）

### 3.1 中性色 ink
```
ink-50  F9FAFB · ink-100 F3F4F6 · ink-200 E5E7EB · ink-300 D1D5DB · ink-400 9CA3AF
ink-500 6B7280 · ink-600 4B5563 · ink-700 374151 · ink-800 1F2937 · ink-900 111827
```

### 3.2 品牌色 brand（控制台主色）
```
brand-50  EFF6FF · brand-100 DBEAFE · brand-200 BFDBFE · brand-300 93C5FD
brand-400 60A5FA · brand-500 3B82F6 · brand-600 2563EB · brand-700 1D4ED8
brand-800 1E40AF · brand-900 1E3A8A
```
→ brand c500 = **500 = 3B82F6**（Tailwind `brand` 无 DEFAULT，用 500）

### 3.3 6 大功能区强调色（与 `FeatureLanding.ACCENTS.main` 对齐）

| key       | 中文名 | ACCENTS.main | Tailwind DEFAULT | 50/100/200（ACCENTS bg50/bg100/bg200）|
|-----------|-------|--------------|------------------|---------------------------------------|
| novel     | 小说   | `#6366F1`     | `#6366F1` (=500) | EE F2 FF / E0 E7 FF / C7 D2 FE        |
| image     | 图像   | `#0891B2`     | `#0891B2` (=600) | EC FE FF / CF FA FE / A5 F3 FC        |
| comic     | 漫画   | `#7C3AED`     | `#7C3AED` (=600) | F5 F3 FF / ED E9 FE / DD D6 FE        |
| audio     | 音频   | `#EC4899`     | `#EC4899` (=500) | FD F2 F8 / FC E7 F3 / FB CF E8        |
| video     | 视频   | `#D97706`     | `#D97706` (=600) | FF FB EB / FE F3 C7 / FD E6 8A        |
| community | 社区   | `#16A34A`     | `#16A34A` (=600) | F0 FD F4 / DC FC E7 / BB F7 D0        |

→ **统一规则**：
  - CSS `--<key>-500` 保留完整色阶（用于健康度柱子 / spark 线条）
  - **`MOCK.TYPES.<key>.c500` = ACCENTS.main = Tailwind DEFAULT**，即 6 组 DEFAULT 不一致处使用 600（除 novel/audio）。
  - `.t-<key>` tag class 使用 `<key>-50/600` 作 bg+text，且 border 透明度一致。

### 3.4 Logo 渐变常量（来自 `web/src/assets/logo.svg`）
```
triangle 135deg 四停：#00D4FF → #1E90FF → #8B3CFF → #FF54B8
pixels 180deg 二停：  #00D4FF → #6C3CE8
```
→ 原型所有 `.grad` 文本渐变使用 triangle 四停 135deg。
→ CTA 主按钮渐变使用 `linear-gradient(135deg,#3B82F6 0%,#7C3AED 100%)`（brand→comic，与 shadow-pop 色一致，符合前端 `shadow-pop` `rgba(124,58,237,.15)` + `shadow-pop-blue` `rgba(59,130,246,.28)`）。
→ 头像默认渐变：`linear-gradient(135deg, #7C3AED, #3B82F6)`（comic→brand，与 Logo 渐变带主色调一致）。

### 3.5 语义色 Semantic
- OK：`#10B981`（emerald-500）
- Warn：`#F59E0B`（amber-500）
- Error：`#EF4444`（red-500）
- Info：`#0EA5E9`（sky-500）

### 3.6 字体 / 字号 / 行距 / 半径 / 阴影（严格对齐 tailwind.config.js）
见 v4 contract §3.6–3.8，**本次 v5 无改动**。

### 3.7 布局 & 响应式
见 v4 contract §3.9，**本次 v5 无改动**（256/60/32 主值；1100/860/640 三断点）。

---

## 4. App Shell & Canonical Nav
见 v4 contract §4（Sidebar 256 + Topbar 60 + Main；MenuBtn 在 860 切换抽屉；Ftbar 底栏）。
**v5 新增**：
  - `Ftbar` 必须显示 `v5` 版本号、`API Console · 字节对齐前端`。
  - 所有 `eyebrow` chip 必须含 Lucide icon（禁止 emoji）。
  - 所有 hero H1 / eyebrow 文案禁止 emoji 作图标。

---

## 5. 页面职责 & 路由
| # | Hash | Title | 职责 |
|---|------|-------|------|
| 1 | `#/dashboard` | Dashboard · 控制台 | Hero + 4 KPI + 健康度 8 行 + 模块流量分布 + 最近请求 7 条 |
| 2 | `#/explorer` | API Explorer · 调试台 | 300/1fr 双栏；9 组；16 接口；Req/Res Tab；发送模拟 |
| 3 | `#/queue` | Queue · 作品队列 | Seg 类型 + 状态/排序/搜索；20 件作品卡片；点击 Drawer 详情 |
| 4 | `#/keys` | Keys · 密钥管理 | 5 条 Key 卡片；筛选 / 搜索 / 创建 Modal / 回收 |
| 5 | `#/settings` | Settings · 主题与设置 | 品牌预览 + Demo 账号 + 偏好 + 7 组 Swatches 编辑 |

---

## 6. Mock Schema（与 server/prisma/seed.ts 对齐）
见 v4 contract §6。
**v5 修正**：`MOCK.WORKS` 20 条必须等于 `server/prisma/seed.ts` 的作品（`static-comic-01..05`、`static-novel-01..03`、`static-image-01..03`、`static-video-01..03`、`static-audio-01..03`、`static-commu-01..03`），并确保点赞/评论数与 `STATIC_WORKS_POOL` 前端一致。

---

## 7. 组件规范 / Acceptance
见 v4 contract §7。
**v5 新增验收项**：
  - 无 emoji 图标。
  - 所有 CTA / `.btn-primary` 渐变 = brand→comic 一致。
  - `.grad` 文本 = Logo 四色渐变一致。
  - `MOCK.SWATCHES.c500` = `ACCENTS.main`（=Tailwind DEFAULT），6 组全部正确。
  - `TYPES/MODULES/HEALTH` 的颜色变量：image/comic/video/community 使用 `--<key>-600`（DEFAULT），novel/audio 使用 `--<key>-500`。
  - Index.html Favicon = Logo SVG 四色（00D4FF/1E90FF/8B3CFF/FF54B8）。
  - `theme-color` = `#3B82F6`（light）/ `#1E3A8A`（dark）。
  - Self-Review 全项通过。

— **END** —
