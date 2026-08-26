/* MankTV API Console v5 · api.js
 * 浏览器模式：全局 API / 渲染 5 页 SPA
 * Node CLI 模式：运行 `node api.js --build` 生成 index.html（用于规避大文件写入限制）
 * v5 修复：版本号 v5；移除 emoji 图标作 UI；eyebrow 带 Lucide icon；Ftbar v5；字节对齐前端
 */
const __isNode = (typeof window === "undefined") && !!process;
if (__isNode) {
  /* --- Node-only: build index.html and exit --- */
  (function buildIndex() {
    if (process.argv.indexOf("--build") < 0) { console.log("Use: node api.js --build"); process.exit(2); }
    var fs = require("fs"), path = require("path"), os = require("os");
    var out = path.join(__dirname, "index.html");
    var contractDir = path.join(__dirname, "contract");
    var NL = os.EOL || "\n";
    var L = [];
    L.push("<!doctype html>");
    L.push("<html lang=\"zh-CN\">");
    L.push("<head>");
    L.push("<meta charset=\"utf-8\"/>");
    L.push("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1,viewport-fit=cover\"/>");
    // theme-color 对齐 brand 主色（light=3B82F6, dark=1E3A8A；Contract v5 对齐）
    L.push("<meta name=\"theme-color\" content=\"#3B82F6\" media=\"(prefers-color-scheme: light)\"/>");
    L.push("<meta name=\"theme-color\" content=\"#1E3A8A\" media=\"(prefers-color-scheme: dark)\"/>");
    L.push("<meta name=\"color-scheme\" content=\"light dark\"/>");
    L.push("<meta name=\"description\" content=\"MankTV AI漫剧圈 API Console - 后端开发控制台原型，v5 字节对齐前端 Design Tokens\"/>");
    L.push("<meta name=\"author\" content=\"MankTV · AI漫剧圈\"/>");
    L.push("<title>MankTV · API Console v5</title>");
    // Favicon = Logo 四色渐变：00D4FF → 1E90FF → 8B3CFF → FF54B8
    var favSvg = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='%2300D4FF'/><stop offset='0.35' stop-color='%231E90FF'/><stop offset='0.7' stop-color='%238B3CFF'/><stop offset='1' stop-color='%23FF54B8'/></linearGradient></defs><path d='M9 4C15 4 25 4 29 15c2 5 1 12 -6 15s-16 1 -20 -3c-3 -2 -3 -5 -2 -9 L1 13 C1 8 3 5 9 4 z' fill='url(%23g)'/><rect x='1' y='11' width='4' height='4' rx='1' fill='url(%23g)'/><rect x='7' y='8' width='6' height='6' rx='1.5' fill='url(%23g)'/><rect x='1' y='17' width='6' height='6' rx='1.5' fill='url(%23g)'/><rect x='8' y='23' width='4' height='4' rx='1' fill='url(%23g)'/></svg>";
    L.push("<link rel=\"icon\" type=\"image/svg+xml\" href=\"data:image/svg+xml;utf8," + favSvg + "\"/>");
    L.push("<link rel=\"stylesheet\" href=\"styles.css\"/>");
    L.push("</head>");
    L.push("<body class=\"is-loading\">");
    L.push("<a class=\"skip-link\" href=\"#mainContent\">跳转到主内容</a>");
    // 使用 app-shell（与 design-contract 4.1 对齐：sidebar + main>tb+mc+ftbar）
    L.push("<div class=\"app-shell\" id=\"app\">");
    L.push("  <aside id=\"sidebar\" class=\"sb\" aria-label=\"主导航\"></aside>");
    L.push("  <section class=\"main\">");
    L.push("    <header id=\"topbar\" class=\"tb\" role=\"banner\"></header>");
    L.push("    <main id=\"mainContent\" class=\"mc\" tabindex=\"-1\" role=\"main\"></main>");
    L.push("    <footer class=\"ftbar\" id=\"ftbar\"></footer>");
    L.push("  </section>");
    L.push("</div>");
    L.push("<noscript><div style=\"padding:40px;color:#B91C1C;background:#FEF2F2\">此原型需要启用 JavaScript / This prototype requires JavaScript.</div></noscript>");
    L.push("<script src=\"mock.js\"></script>");
    L.push("<script src=\"api.js\"></script>");
    L.push("</body>");
    L.push("</html>");
    fs.writeFileSync(out, L.join(NL) + NL, "utf8");
    console.log("[Build OK] index.html →", out, fs.statSync(out).size, "bytes");

    // 同步契约：保证 contract/ 目录下的 design-contract.md == 根目录版本（版本一致）
    try {
      if (!fs.existsSync(contractDir)) fs.mkdirSync(contractDir, { recursive: true });
      var srcContract = path.join(__dirname, "design-contract.md");
      var dstContract = path.join(contractDir, "design-contract.md");
      if (fs.existsSync(srcContract)) {
        fs.writeFileSync(dstContract, fs.readFileSync(srcContract, "utf8"), "utf8");
        console.log("[Sync OK] contract/design-contract.md ← design-contract.md");
      }
    } catch (err) {
      console.log("[Sync WARN] contract sync failed:", err.message || err);
    }
    process.exit(0);
  })();
}
/* --- Browser runtime below (safe-guarded) --- */
const API_BASE = "http://localhost:3000";
const API = {};
window.API = API;
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const h = (tag, attrs, children) => {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === "class") el.className = attrs[k];
    else if (k === "style") el.setAttribute("style", attrs[k]);
    else if (k.startsWith("on") && typeof attrs[k] === "function") el.addEventListener(k.slice(2), attrs[k]);
    else if (k === "html") el.innerHTML = attrs[k];
    else if (attrs[k] !== false && attrs[k] != null) el.setAttribute(k, attrs[k]);
  }
  const kids = Array.isArray(children) ? children : [children];
  for (const c of kids) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { c.forEach(x => x && el.appendChild(typeof x === "string" ? document.createTextNode(x) : x)); continue; }
    el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return el;
};
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, x => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const IC = (k) => MOCK.ICONS[k] || "";
const fmt = (n) => (typeof n === "number" ? n.toLocaleString() : n);
const methCls = (m) => "m-" + m.toLowerCase();
let toastTimer = null;
function toast(msg, kind) {
  let t = document.querySelector(".toast");
  if (!t) { t = h("div", { class: "toast", role: "status", "aria-live": "polite" }); document.body.appendChild(t); }
  t.className = "toast toast-" + (kind || "success") + " is-open";
  t.innerHTML = "<span>" + (IC("spark") || "") + "</span><div>" + esc(msg) + "</div>";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-open"), 2200);
}
function copyText(txt, okMsg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast(okMsg || "已复制"));
  } else {
    const ta = document.createElement("textarea"); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); toast(okMsg || "已复制"); } catch (e) { toast("复制失败", "error"); }
    document.body.removeChild(ta);
  }
}
function statusTag(st) {
  const s = MOCK.STATUSES[st] || { label: st, cls: "tag" };
  return "<span class=\"tag " + s.cls + "\">" + s.label + "</span>";
}
/* ---- Stub APIs ---- */
API.getKpi = () => Promise.resolve({ ok: true, data: MOCK.KPIS });
API.getHealth = () => Promise.resolve({ ok: true, data: MOCK.HEALTH });
API.getModules = () => Promise.resolve({ ok: true, data: MOCK.MODULES });
API.getRequests = () => Promise.resolve({ ok: true, data: MOCK.REQS });
API.listEndpoints = (q) => {
  let list = MOCK.ENDPOINTS.slice();
  if (q && q.group && q.group !== "all") list = list.filter(e => e.group === q.group);
  if (q && q.search) {
    const k = String(q.search).toLowerCase();
    list = list.filter(e => (e.method + " " + e.path + " " + (e.desc || "")).toLowerCase().includes(k));
  }
  return Promise.resolve({ ok: true, data: list });
};
API.getGroups = () => Promise.resolve({ ok: true, data: MOCK.GROUPS });
API.getEndpoint = (id) => Promise.resolve({ ok: true, data: MOCK.ENDPOINTS.find(e => e.id === id) || null });
API.sendEndpoint = (id) => {
  const ep = MOCK.ENDPOINTS.find(e => e.id === id);
  if (!ep) return Promise.reject(new Error("endpoint not found"));
  return new Promise(res => setTimeout(() => {
    const slow = ep.path.indexOf("video") >= 0 || ep.path.indexOf("image") >= 0;
    const status = slow ? 202 : 200;
    const ms = 30 + Math.floor(Math.random() * (ep.method === "POST" ? 260 : 110));
    res({ ok: true, data: { status, ms, simulated: true, example: ep.exRes } });
  }, 520));
};
API.getWorks = (q) => {
  let ws = MOCK.WORKS.slice();
  if (q && q.type && q.type !== "all") ws = ws.filter(w => w.type === q.type);
  if (q && q.status && q.status !== "all") ws = ws.filter(w => w.status === q.status);
  if (q && q.search) {
    const k = String(q.search).toLowerCase();
    ws = ws.filter(w => (w.title + " " + w.author + " " + (w.subtype || "")).toLowerCase().includes(k));
  }
  if (q && q.sort === "hot") ws.sort((a, b) => b.likes - a.likes);
  if (q && q.sort === "new") ws.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (q && q.sort === "comment") ws.sort((a, b) => b.commentCount - a.commentCount);
  const limit = (q && q.limit) || 50;
  return Promise.resolve({ ok: true, total: ws.length, data: ws.slice(0, limit) });
};
API.getWork = (id) => Promise.resolve({ ok: true, data: MOCK.WORKS.find(w => w.id === id) || null });
API.getKeys = () => Promise.resolve({ ok: true, data: MOCK.KEYS.slice() });
API.createKey = (payload) => {
  payload = payload || {};
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let rnd = ""; for (let i = 0; i < 28; i++) rnd += chars[Math.floor(Math.random() * chars.length)];
  const nk = {
    id: "k_" + Math.random().toString(36).slice(2, 8),
    name: payload.name || "未命名密钥",
    prefix: "sk_mk_" + Math.random().toString(36).slice(2, 5) + "_",
    scopes: Array.isArray(payload.scopes) ? payload.scopes.slice() : ["works:read"],
    used: 0, quota: payload.quota || 10000,
    createdAt: new Date().toISOString().slice(0, 10),
    status: "active", env: payload.env || "dev"
  };
  nk.fullToken = nk.prefix + rnd;
  MOCK.KEYS.unshift(nk);
  return Promise.resolve({ ok: true, data: nk });
};
API.recycleKey = (id) => {
  const k = MOCK.KEYS.find(x => x.id === id);
  if (k) k.status = "recycled";
  return Promise.resolve({ ok: true, data: { id, status: "recycled" } });
};
API.getSwatches = () => Promise.resolve({ ok: true, data: MOCK.SWATCHES.slice() });
API.resetSwatch = (key) => {
  const s = MOCK.SWATCHES.find(x => x.key === key);
  if (!s) return Promise.reject(new Error("unknown swatch"));
  return Promise.resolve({ ok: true, data: s });
};
API.updateSwatch = (key, hex500) => {
  const s = MOCK.SWATCHES.find(x => x.key === key);
  if (!s) return Promise.reject(new Error("unknown swatch"));
  s.c500 = String(hex500).toUpperCase();
  return Promise.resolve({ ok: true, data: s });
};
/* ---- Router / Shell ---- */
const NAV = [
  { k: "dashboard", label: "控制台", group: "总览", icon: "dash", count: null },
  { k: "explorer", label: "API 调试台", group: "总览", icon: "api", count: MOCK.ENDPOINTS.length },
  { k: "queue", label: "作品队列", group: "总览", icon: "queue", count: MOCK.WORKS.length },
  { k: "keys", label: "密钥管理", group: "系统", icon: "key", count: MOCK.KEYS.filter(k=>k.status==="active").length },
  { k: "settings", label: "主题与设置", group: "系统", icon: "settings", count: null }
];
const PAGE_TITLES = {
  dashboard: ["总览", "控制台 · Dashboard"],
  explorer:  ["总览", "API 调试台 · Explorer"],
  queue:     ["总览", "作品队列 · Queue"],
  keys:      ["系统", "密钥管理 · Keys"],
  settings:  ["系统", "主题与设置 · Settings"]
};
const state = { page: "dashboard", activeEp: "e3", drawerId: null };
function renderShell() {
  const sb = document.getElementById("sidebar");
  sb.innerHTML = "<div class=\"brand\"><div class=\"brand-logo\">" + IC("logo") + "</div><div class=\"grow\"><div class=\"brand-name\">Mank<span class=\"grad\">TV</span></div><div class=\"brand-sub\">API Console · v5</div></div></div><nav class=\"sb-nav\" id=\"navList\"></nav><div class=\"sb-foot\"><div class=\"av\">A</div><div class=\"grow\"><div style=\"font-weight:600\">Admin · 管理员</div><div class=\"caption\">admin@manktv.com</div></div><button class=\"tb-ic\" title=\"设置\" data-go=\"settings\" aria-label=\"Settings\">" + IC("settings") + "</button></div>";
  const navList = document.getElementById("navList");
  let lastGroup = null;
  for (const n of NAV) {
    if (n.group !== lastGroup) { navList.appendChild(h("div", { class: "sb-group" }, n.group)); lastGroup = n.group; }
    const cls = "sb-item" + (state.page === n.k ? " is-active" : "");
    const item = h("button", { class: cls, "data-go": n.k, type: "button" }, [
      h("span", { html: IC(n.icon) }), h("span", { class: "sb-dot" }),
      h("span", { class: "grow" }, n.label),
      n.count ? h("span", { class: "sb-count" }, String(n.count)) : null
    ]);
    navList.appendChild(item);
  }
  const tb = document.getElementById("topbar");
  const crumbs = PAGE_TITLES[state.page] || ["总览", "页面"];
  tb.innerHTML = "<button class=\"tb-ic\" id=\"menuBtn\" aria-label=\"菜单\">" + IC("menu") + "</button><div class=\"tb-crumbs\"><span>MankTV</span><span class=\"sep\">/</span><span>" + crumbs[0] + "</span><span class=\"sep\">/</span><strong>" + crumbs[1] + "</strong></div><div class=\"tb-search\" role=\"search\"><span>" + IC("search") + "</span><input placeholder=\"搜索 Endpoint / Works / Keys…\" id=\"topSearch\" aria-label=\"Search\" /><span class=\"kbd mono\">Ctrl K</span></div><button class=\"tb-ic\" title=\"最近请求\" id=\"refreshBtn\" aria-label=\"刷新\">" + IC("refresh") + "</button><button class=\"tb-ic\" title=\"通知\" aria-label=\"通知\">" + IC("bell") + "<span style=\"position:absolute;margin-left:12px;margin-bottom:16px;width:8px;height:8px;border-radius:50%;background:var(--err-500);box-shadow:0 0 0 2px var(--bg-elev);\"></span></button><button class=\"tb-cta\" id=\"newKeyCta\">" + IC("plus") + "<span>创建密钥</span></button>";
  // Ftbar（Contract v5：必须显示 v5、字节对齐前端字样）
  const ft = document.getElementById("ftbar");
  if (ft) ft.innerHTML = "<span>© " + new Date().getFullYear() + " MankTV · AI漫剧圈</span><span class=\"sep\">·</span><span>API Console v5 · 字节对齐前端</span><span class=\"sep\">·</span><span class=\"mono\">" + API_BASE + "</span><span class=\"sep\">·</span><span style=\"margin-left:auto\"><span class=\"tag tag-ok\">" + IC("shield") + " 离线原型</span></span>";
  document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("is-open"));
  document.getElementById("newKeyCta").addEventListener("click", () => openKeyModal());
  document.getElementById("refreshBtn").addEventListener("click", () => { toast("数据已刷新", "success"); renderPage(); });
  document.querySelectorAll(".sb-item, [data-go]").forEach(el => el.addEventListener("click", (e) => {
    const go = el.getAttribute("data-go"); if (go) goto(go);
  }));
  sb.querySelector("[data-go='settings']")?.addEventListener("click", () => goto("settings"));
}
function goto(p) {
  if (!NAV.find(n => n.k === p)) return;
  state.page = p;
  document.getElementById("sidebar").classList.remove("is-open");
  window.location.hash = "#/" + p;
  renderShell(); renderPage();
  document.querySelector(".mc")?.scrollTo({ top: 0, behavior: "smooth" });
}
function renderPage() {
  const mc = document.getElementById("mainContent");
  mc.innerHTML = "";
  switch (state.page) {
    case "dashboard": mc.appendChild(renderDashboard()); break;
    case "explorer": mc.appendChild(renderExplorer()); break;
    case "queue": mc.appendChild(renderQueue()); break;
    case "keys": mc.appendChild(renderKeys()); break;
    case "settings": mc.appendChild(renderSettings()); break;
  }
}
/* ---- Page 1: Dashboard ---- */
function renderDashboard() {
  const wrap = h("div");
  const head = h("div", { class: "page-head" }, [
    // Contract v5：eyebrow 含 Lucide icon；文案禁止 emoji
    h("span", { class: "eyebrow" }, [h("span", { html: IC("spark") }), h("span", { class: "pulse" }), "v5 · 字节对齐前端 · Editorial Tech Magazine"]),
    h("h1", { class: "h1" }, ["欢迎回来，这里是 ", h("span", { class: "grad" }, "MankTV"), " 控制台"]),
    h("p", { class: "lead" }, "一站式监控平台调用、调试生成接口、审阅作品队列、管理密钥与主题配色。")
  ]);
  const hero = h("section", { class: "hero" }, [
    h("div", { class: "hero-body" }, [
      h("div", { class: "row gap-2" }, [
        h("span", { class: "tag tag-brand" }, [h("span", { html: IC("rocket") }), "实时连接"]),
        h("span", { class: "tag tag-ok" }, [h("span", { html: IC("shield") }), "合规备案 就绪"])
      ]),
      h("h2", { class: "h1", style: "margin-top:16px" }, [
        "作品世界的 ", h("span", { class: "grad" }, "调度中枢")
      ]),
      h("p", { class: "lead", style: "margin-top:12px" }, "接入 6 大生成模块、20 条 v1 接口、双审核流水线。原型模式下所有数据来自 MOCK；接真实后端时仅需替换 api.js 的 fetchJson 调用。"),
      h("div", { class: "hero-actions" }, [
        h("button", { class: "btn btn-primary btn-lg", onclick: () => goto("explorer") }, [h("span", { html: IC("api") }), "打开 API 调试台"]),
        h("button", { class: "btn btn-ghost btn-lg", onclick: () => goto("queue") }, [h("span", { html: IC("queue") }), "浏览作品队列"]),
        h("button", { class: "btn btn-soft btn-lg", onclick: () => goto("keys") }, [h("span", { html: IC("key") }), "管理密钥"])
      ])
    ])
  ]);
  const kpiRow = h("div", { class: "grid gr-4 gap-5", style: "margin-top:var(--s-8)" });
  const icMap = { calls: "zap", works: "book", users: "spark", credits: "shield" };
  for (const k of MOCK.KPIS) {
    const iconK = icMap[k.key] || "zap";
    const kpi = h("div", { class: "kpi", style: "--kpi-c:" + k.c });
    const sparkHtml = (k.spark || []).map(v => "<i style=\"height:" + v + "%\"></i>").join("");
    kpi.innerHTML = "<div class=\"kpi-ic\">" + IC(iconK) + "</div><div class=\"kpi-lbl\">" + k.label + "</div><div class=\"kpi-val\">" + k.value + "</div><span class=\"kpi-delta " + (k.up ? "" : "is-down") + "\">" + (k.up ? IC("arrowUp") : IC("arrowDown")) + " " + k.delta + "</span><div class=\"kpi-foot\"><div class=\"kpi-spark\">" + sparkHtml + "</div><span>近 12 小时</span></div>";
    kpiRow.appendChild(kpi);
  }
  const cols = h("div", { class: "grid gr-as gap-5", style: "margin-top:var(--s-8)" });
  const healthCard = h("div", { class: "card" });
  healthCard.innerHTML = "<div class=\"card-hd\"><div><h3>接口健康度</h3><p class=\"caption\" style=\"margin:4px 0 0\">P95 成功率 · 延迟 (ms)</p></div><button class=\"btn btn-soft btn-sm\" id=\"healthRerun\">" + IC("refresh") + " 刷新</button></div><div class=\"card-bd\">" + MOCK.HEALTH.map(h => {
    const statusHtml = h.status === "up" ? "<span class=\"tag tag-ok\">UP · " + h.pct + "%</span>" : "<span class=\"tag tag-warn\">SLOW · " + h.pct + "%</span>";
    return "<div class=\"hl\"><div>" + h.group + "</div><div class=\"hl-bar\"><i style=\"width:" + h.pct + "%;--c:" + h.c + "\"></i></div><div>" + statusHtml + "</div><div class=\"hl-ms\">" + h.ms + " ms</div><div class=\"row\" style=\"justify-content:flex-end\"><span class=\"meth " + methCls(h.method) + "\">" + h.method + "</span></div></div>";
  }).join("") + "</div>";
  const rightCol = h("div", { class: "stack gap-5" });
  const moduleCard = h("div", { class: "card" });
  const maxPct = Math.max(...MOCK.MODULES.map(m => m.pct));
  moduleCard.innerHTML = "<div class=\"card-hd\"><div><h3>模块流量分布</h3><p class=\"caption\" style=\"margin:4px 0 0\">社区 · 漫画 · 视频 · 图像 · 音频 · 小说</p></div><span class=\"tag tag-brand\">" + MOCK.MODULES.reduce((s, m) => s + m.pct, 0) + "%</span></div><div class=\"card-bd stack gap-4\">" + MOCK.MODULES.map(m => "<div><div class=\"row-b\" style=\"margin-bottom:6px\"><div class=\"row gap-2\"><span style=\"width:10px;height:10px;border-radius:3px;background:" + m.color + ";display:inline-block\"></span><span style=\"font-weight:600\">" + m.name + "</span></div><span class=\"mono caption\">" + m.pct + "%</span></div><div class=\"hl-bar\" style=\"height:10px\"><i style=\"width:" + (m.pct / maxPct * 100) + "%;--c:" + m.color + "\"></i></div></div>").join("") + "</div>";
  const reqCard = h("div", { class: "card" });
  reqCard.innerHTML = "<div class=\"card-hd\"><div><h3>最近请求</h3><p class=\"caption\" style=\"margin:4px 0 0\">最新 7 条 · 可在调试台复现</p></div><button class=\"btn-link\" data-go=\"explorer\">查看全部 →</button></div><div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>时间</th><th>方法</th><th>路径</th><th>状态</th><th>用户</th><th>延迟</th></tr></thead><tbody>" + MOCK.REQS.map(r => {
    const statCls = r.status >= 500 ? "tag-danger" : (r.status >= 400 ? "tag-warn" : (r.status >= 200 && r.status < 300 ? "tag-ok" : "tag-brand"));
    return "<tr><td class=\"mono caption\">" + r.time + "</td><td><span class=\"meth " + methCls(r.method) + "\">" + r.method + "</span></td><td><div class=\"path\">" + r.path + "</div></td><td><span class=\"tag " + statCls + "\">" + r.status + "</span></td><td>" + esc(r.user) + "</td><td class=\"mono\">" + r.ms + " ms</td></tr>";
  }).join("") + "</tbody></table></div>";
  rightCol.appendChild(moduleCard); rightCol.appendChild(reqCard);
  cols.appendChild(healthCard); cols.appendChild(rightCol);
  wrap.appendChild(head); wrap.appendChild(hero); wrap.appendChild(kpiRow); wrap.appendChild(cols);
  setTimeout(() => {
    const btn = document.getElementById("healthRerun");
    if (btn) btn.addEventListener("click", () => toast("已重新采集健康度样本"));
    reqCard.querySelector("[data-go]")?.addEventListener("click", () => goto("explorer"));
  }, 0);
  return wrap;
}
/* ---- Page 2: Explorer ---- */
function renderExplorer() {
  const wrap = h("div");
  wrap.appendChild(h("div", { class: "page-head" }, [
    h("span", { class: "eyebrow" }, [h("span", { html: IC("api") }), "Endpoints · " + MOCK.ENDPOINTS.length + " 条接口"]),
    h("h1", { class: "h1" }, ["API 调试台 ", h("span", { class: "grad" }, "Explorer")]),
    h("p", { class: "lead" }, "按分类浏览所有 v1 接口，直接填入参数并发送请求，查看返回示例、耗时与状态。")
  ]));
  const shell = h("div", { class: "explorer" });
  const left = h("div", { class: "ex-left" });
  left.innerHTML = "<div class=\"ex-search\"><div class=\"field\"><select class=\"select\" id=\"exGroup\"><option value=\"all\">全部分组</option>" + MOCK.GROUPS.map(g => "<option value=\"" + g.k + "\">" + g.name + "</option>").join("") + "</select></div><div class=\"field\" style=\"margin-top:8px\"><input class=\"input\" id=\"exSearch\" placeholder=\"搜索 path / desc…\"/></div></div><div class=\"ex-list\" id=\"exList\"></div>";
  const right = h("div", { class: "ex-right" });
  shell.appendChild(left); shell.appendChild(right);
  wrap.appendChild(shell);
  const bindAndPaint = () => {
    const listEl = document.getElementById("exList");
    const paintRight = () => {
      const ep = MOCK.ENDPOINTS.find(e => e.id === state.activeEp) || MOCK.ENDPOINTS[0];
      state.activeEp = ep.id;
      const groupName = (MOCK.GROUPS.find(g => g.k === ep.group) || {}).name || ep.group;
      const paramHtml = ep.params && ep.params.length
        ? "<div class=\"params\"><div class=\"pr-row\" style=\"background:var(--bg-sunken);font-weight:700;letter-spacing:.04em;color:var(--text-sub);font-size:12px;text-transform:uppercase\"><div>名称</div><div>类型</div><div>说明</div><div>必需</div></div>" + ep.params.map(p => "<div class=\"pr-row\"><div class=\"pr-name\">" + p.name + "</div><div class=\"mono\">" + p.type + "</div><div>" + (p.desc || "") + "</div><div>" + (p.req ? "<span class=\"pr-req\">必填</span>" : "<span class=\"caption\">可选</span>") + "</div></div>").join("") + "</div>"
        : "<div class=\"empty\" style=\"padding:32px\"><div class=\"empty-ic\" style=\"width:48px;height:48px;border-radius:16px\">" + IC("spark") + "</div><div><strong>无参数</strong></div><div class=\"caption\">这是一个无参接口</div></div>";
      const reqHtml = ep.exReq
        ? "<div class=\"code\"><span class=\"c\">// " + ep.method + " " + ep.path + "</span>\n" + syntaxJson(JSON.stringify(ep.exReq, null, 2), "payload") + "</div>"
        : "<div class=\"muted\" style=\"padding:8px 4px\">该接口无 Request Body。</div>";
      right.innerHTML = "<div class=\"exr-head\"><div class=\"row gap-3\"><span class=\"meth " + methCls(ep.method) + "\">" + ep.method + "</span><div class=\"path\" style=\"font-size:14px;color:var(--text);font-weight:600\">" + ep.path + "</div><span class=\"tag tag-brand\">" + groupName + "</span></div><div class=\"h2\" style=\"font-size:20px\">" + ep.desc + "</div><div class=\"exr-meta\"><button class=\"btn btn-primary\" id=\"exSend\">" + IC("send") + " 发送请求</button><button class=\"btn btn-ghost\" id=\"exCopyCurl\">" + IC("copy") + " 复制 cURL</button><span class=\"tag\" id=\"exStatus\" style=\"display:none\"></span></div></div><div class=\"exr-body\"><div><div class=\"sec-title\">路径 / Query 参数</div>" + paramHtml + "</div><div><div class=\"tabs\" role=\"tablist\"><button class=\"tab is-active\" data-tab=\"req\">请求体示例</button><button class=\"tab\" data-tab=\"res\">响应结果</button></div><div class=\"ex-tab\" data-pane=\"req\" style=\"margin-top:14px\">" + reqHtml + "</div><div class=\"ex-tab\" data-pane=\"res\" style=\"display:none;margin-top:14px\"><div class=\"code\" id=\"exRes\"><span class=\"c\">// 点击\"发送请求\"以查看实时响应（以下为示例）</span>\n" + syntaxJson(JSON.stringify(ep.exRes, null, 2), "example") + "</div></div></div></div>";
      right.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
        right.querySelectorAll(".tab").forEach(x => x.classList.remove("is-active"));
        t.classList.add("is-active");
        right.querySelectorAll(".ex-tab").forEach(p => {
          p.style.display = p.getAttribute("data-pane") === t.getAttribute("data-tab") ? "" : "none";
        });
      }));
      document.getElementById("exSend")?.addEventListener("click", async () => {
        const btn = document.getElementById("exSend"); const tag = document.getElementById("exStatus");
        btn.disabled = true; btn.innerHTML = IC("zap") + " 发送中…"; tag.style.display = "none";
        const r = await API.sendEndpoint(ep.id); const ok = r.data.status < 400;
        tag.style.display = "inline-flex"; tag.className = "tag " + (ok ? "tag-ok" : "tag-danger");
        tag.textContent = "HTTP " + r.data.status + " · " + r.data.ms + " ms" + (r.data.simulated ? " · Sim" : "");
        const pane = right.querySelector('[data-pane="res"]'); pane.style.display = "";
        right.querySelectorAll(".tab").forEach(x => x.classList.toggle("is-active", x.getAttribute("data-tab") === "res"));
        document.getElementById("exRes").innerHTML = "<span class=\"c\">// " + new Date().toLocaleTimeString() + " · simulated</span>\n" + syntaxJson(JSON.stringify(r.data.example, null, 2), "response");
        btn.disabled = false; btn.innerHTML = IC("send") + " 重新发送";
        toast("已发送 " + ep.method + " " + ep.path);
      });
      document.getElementById("exCopyCurl")?.addEventListener("click", () => {
        const hdrs = ep.method === "GET" ? "" : " -H 'Content-Type: application/json'" + (ep.exReq ? " -d '" + JSON.stringify(ep.exReq) + "'" : "");
        copyText("curl -X " + ep.method + " '" + API_BASE + ep.path + "'" + hdrs, "cURL 已复制");
      });
    };
    const paintList = () => {
      const g = document.getElementById("exGroup").value;
      const s = document.getElementById("exSearch").value;
      API.listEndpoints({ group: g, search: s }).then(r => {
        listEl.innerHTML = "";
        r.data.forEach(e => {
          const gn = (MOCK.GROUPS.find(x => x.k === e.group) || {}).name || "";
          const row = h("button", { type: "button", class: "ex-item" + (state.activeEp === e.id ? " is-active" : ""), "data-id": e.id }, [
            h("span", { class: "meth " + methCls(e.method) }, e.method),
            h("div", { class: "grow" }, [
              h("div", { class: "path", style: "font-weight:600;color:var(--text)" }, e.path),
              h("div", { class: "ep-group" }, gn)
            ]),
            h("span", { class: "caption", title: e.desc }, "→")
          ]);
          row.addEventListener("click", () => { state.activeEp = e.id; paintList(); paintRight(); });
          listEl.appendChild(row);
        });
        if (r.data.length === 0) listEl.innerHTML = "<div class=\"empty\" style=\"padding:24px\"><div class=\"empty-ic\" style=\"width:48px;height:48px;border-radius:16px\">" + IC("search") + "</div><strong>无匹配接口</strong><div class=\"caption\">试试其他关键字</div></div>";
      });
    };
    document.getElementById("exGroup").addEventListener("change", paintList);
    document.getElementById("exSearch").addEventListener("input", paintList);
    paintList(); paintRight();
  };
  setTimeout(bindAndPaint, 0);
  return wrap;
}
function syntaxJson(json, name) {
  const colored = json.replace(/(".*?")/g, '<span class="s">$1</span>').replace(/(:\s*)(\d+|true|false|null)/g, '$1<span class="n">$2</span>');
  return "<span class=\"k\">const</span> " + name + " = " + colored + ";";
}
/* ---- Page 3: Queue 作品队列 ---- */
let Q = { type: "all", status: "all", search: "", sort: "hot" };
function renderQueue() {
  const wrap = h("div");
  wrap.appendChild(h("div", { class: "page-head" }, [
    h("span", { class: "eyebrow" }, [h("span", { html: IC("book") }), "作品队列 · " + MOCK.WORKS.length + " 件作品"]),
    h("h1", { class: "h1" }, ["作品数据中心 ", h("span", { class: "grad" }, "Queue")]),
    h("p", { class: "lead" }, "卡片视图浏览全部作品，查看审核状态、子类型、热度、点赞和评论。点击卡片打开详情抽屉。")
  ]));
  const toolbar = h("div", { class: "toolbar" });
  let segHtml = "<button data-type=\"all\" class=\"is-on\">全部</button>";
  for (const [k, v] of Object.entries(MOCK.TYPES)) segHtml += "<button data-type=\"" + k + "\"><span style=\"display:inline-block;width:7px;height:7px;border-radius:50%;background:" + v.c500 + ";margin-right:6px\"></span>" + v.label + "</button>";
  toolbar.innerHTML = "<div class=\"seg\" id=\"segType\">" + segHtml + "</div><select class=\"select\" id=\"qStatus\" style=\"max-width:160px\"><option value=\"all\">所有状态</option><option value=\"published\">已发布</option><option value=\"review\">审核中</option><option value=\"draft\">草稿</option><option value=\"banned\">已下线</option></select><select class=\"select\" id=\"qSort\" style=\"max-width:160px\"><option value=\"hot\">排序 · 最热</option><option value=\"new\">排序 · 最新</option><option value=\"comment\">排序 · 评论</option></select><input class=\"input\" id=\"qSearch\" placeholder=\"搜索 标题 / 作者 / 子类型…\" /><span class=\"muted\" id=\"qCount\" style=\"margin-left:auto\"></span>";
  const grid = h("div", { class: "works-grid" });
  wrap.appendChild(toolbar); wrap.appendChild(grid);
  const wCard = (w) => {
    const c = document.createElement("div");
    const accent = (MOCK.TYPES[w.type] || {}).c500 || "var(--brand-500)";
    c.className = "wcard"; c.style.setProperty("--accent", accent);
    const st = MOCK.STATUSES[w.status] || { cls: "tag", label: w.status };
    const typeMeta = MOCK.TYPES[w.type] || { label: "" };
    const tagHtml = (w.tags || []).slice(0, 3).map(t => "<span class=\"tag\">" + esc(t) + "</span>").join("");
    c.innerHTML = "<div class=\"wc-cov\" style=\"--c1:" + w.cov.c1 + ";--c2:" + w.cov.c2 + "\"><svg viewBox=\"0 0 64 40\" width=\"60%\" height=\"60%\"><defs><linearGradient id=\"g_" + w.id + "\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"rgba(255,255,255,.55)\"/><stop offset=\"100%\" stop-color=\"rgba(255,255,255,.15)\"/></linearGradient></defs><rect x=\"2\" y=\"2\" width=\"60\" height=\"36\" rx=\"6\" fill=\"url(#g_" + w.id + ")\" stroke=\"rgba(255,255,255,.4)\"/><text x=\"50%\" y=\"54%\" text-anchor=\"middle\" font-size=\"14\" font-weight=\"800\" fill=\"#fff\" style=\"font-family:ui-sans-serif,system-ui,-apple-system,'PingFang SC','Microsoft YaHei'\">" + w.cov.title + "</text><circle cx=\"52\" cy=\"10\" r=\"3.2\" fill=\"rgba(255,255,255,.5)\"/><path d=\"M4 32 L18 24 L26 28 L42 18 L58 28\" stroke=\"rgba(255,255,255,.65)\" stroke-width=\"1.4\" fill=\"none\" stroke-linecap=\"round\" stroke-linejoin=\"round\"/></svg><div class=\"wc-tags\"><span class=\"tag t-" + w.type + "\">" + typeMeta.label + "</span>" + (w.subtype ? "<span class=\"tag tag-brand\">" + esc(w.subtype) + "</span>" : "") + "</div><div class=\"wc-stat\">" + statusTag(w.status) + "</div></div><div class=\"wc-bd\"><div class=\"wc-ttl\">" + esc(w.title) + "</div><div class=\"wc-sub\"><div class=\"av\" style=\"width:20px;height:20px;font-size:10px;background:linear-gradient(135deg," + w.cov.c1 + "," + w.cov.c2 + ")\">" + (w.author || "?").slice(0, 1) + "</div><span>" + esc(w.author) + " · " + esc(w.createdAt) + "</span></div><div class=\"row gap-2 wrap\">" + tagHtml + "</div></div><div class=\"wc-ft\"><div class=\"wc-meta\"><i>" + IC("like") + " <span class=\"mono\">" + fmt(w.likes) + "</span></i><i>" + IC("comment") + " <span class=\"mono\">" + fmt(w.commentCount) + "</span></i></div><button class=\"btn-link openDrawer\" data-id=\"" + w.id + "\">详情 →</button></div>";
    c.addEventListener("click", (e) => {
      const btn = e.target.closest(".openDrawer");
      if (btn) e.stopPropagation();
      openDrawer(w.id);
    });
    return c;
  };
  const paint = () => {
    API.getWorks(Q).then(r => {
      grid.innerHTML = "";
      if (!r.data.length) {
        grid.appendChild(h("div", { style: "grid-column:1/-1" }, [
          h("div", { class: "empty" }, [h("div", { class: "empty-ic" }, IC("book")), h("h3", { class: "h3" }, "暂无作品"), h("div", { class: "caption" }, "试试调整筛选条件或清空搜索。")])
        ]));
      } else r.data.forEach(w => grid.appendChild(wCard(w)));
      const qc = document.getElementById("qCount"); if (qc) qc.textContent = "共 " + r.total + " 件 · 展示 " + r.data.length + " 件";
    });
  };
  setTimeout(() => {
    const seg = toolbar.querySelector("#segType");
    seg.querySelectorAll("button").forEach(b => b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach(x => x.classList.remove("is-on")); b.classList.add("is-on");
      Q.type = b.getAttribute("data-type"); paint();
    }));
    toolbar.querySelector("#qStatus").addEventListener("change", e => { Q.status = e.target.value; paint(); });
    toolbar.querySelector("#qSort").addEventListener("change", e => { Q.sort = e.target.value; paint(); });
    toolbar.querySelector("#qSearch").addEventListener("input", e => { Q.search = e.target.value; paint(); });
    paint();
  }, 0);
  return wrap;
}
/* Work Drawer */
function openDrawer(id) {
  state.drawerId = id;
  let mask = document.querySelector(".drawer-mask");
  let dr = document.querySelector(".drawer");
  if (!mask) { mask = h("div", { class: "drawer-mask", onclick: closeDrawer }); document.body.appendChild(mask); }
  if (!dr) {
    dr = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true" }, [
      h("header", { class: "d-head" }, [h("div", { class: "h3" }, "作品详情"), h("button", { class: "d-close", onclick: closeDrawer, "aria-label": "关闭" }, h("span", { html: IC("close") }))]),
      h("div", { class: "d-body", id: "drBody" })
    ]);
    document.body.appendChild(dr);
  }
  API.getWork(id).then(r => {
    const w = r.data; if (!w) { closeDrawer(); return; }
    const accent = (MOCK.TYPES[w.type] || {}).c500 || "var(--brand-500)";
    const typeMeta = MOCK.TYPES[w.type] || { label: "" };
    const tagsHtml = (w.tags || []).map(t => "<span class=\"tag\">" + esc(t) + "</span>").join("");
    const comments = (w.recentComments && w.recentComments.length ? w.recentComments : [
      { user: "官方号", text: "这是来自 MOCK 的占位评论数据，接入后端会替换为真实评论。", time: "刚刚" }
    ]).map(c => "<div class=\"row gap-3\" style=\"align-items:flex-start\"><div class=\"av\" style=\"width:32px;height:32px;font-size:12px;background:linear-gradient(135deg,var(--brand-500),var(--comic-500))\">" + (c.user || "?").slice(0, 1) + "</div><div class=\"grow\"><div class=\"row gap-2\"><strong>" + esc(c.user) + "</strong><span class=\"caption mono\">" + esc(c.time || "") + "</span></div><div style=\"color:var(--text-sub);margin-top:4px\">" + esc(c.text) + "</div></div></div>").join("");
    const shareUrl = location.protocol + "//" + location.host + location.pathname + "?type=" + w.type + "&id=" + w.id;
    document.getElementById("drBody").innerHTML = "<div class=\"d-cover\" style=\"--c1:" + w.cov.c1 + ";--c2:" + w.cov.c2 + "\"><svg viewBox=\"0 0 64 40\" width=\"40%\" height=\"40%\"><defs><linearGradient id=\"g2_" + w.id + "\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"><stop offset=\"0%\" stop-color=\"rgba(255,255,255,.55)\"/><stop offset=\"100%\" stop-color=\"rgba(255,255,255,.15)\"/></linearGradient></defs><rect x=\"2\" y=\"2\" width=\"60\" height=\"36\" rx=\"6\" fill=\"url(#g2_" + w.id + ")\" stroke=\"rgba(255,255,255,.45)\"/><text x=\"50%\" y=\"55%\" text-anchor=\"middle\" font-size=\"15\" font-weight=\"800\" fill=\"#fff\">" + w.cov.title + "</text></svg></div><div class=\"d-info\"><span class=\"tag t-" + w.type + "\">" + typeMeta.label + "</span>" + (w.subtype ? "<span class=\"tag tag-brand\">" + esc(w.subtype) + "</span>" : "") + statusTag(w.status) + "<span class=\"caption mono\">" + esc(w.createdAt) + "</span></div><div><div class=\"h2\" style=\"font-size:24px\">" + esc(w.title) + "</div><div class=\"row gap-3\" style=\"margin-top:10px;color:var(--text-sub);font-size:14px\"><div class=\"row gap-2\"><div class=\"av\" style=\"width:28px;height:28px;font-size:11px;background:linear-gradient(135deg," + w.cov.c1 + "," + w.cov.c2 + ")\">" + (w.author || "?").slice(0, 1) + "</div><span><strong style=\"color:var(--text)\">" + esc(w.author) + "</strong> · 作者</span></div><div class=\"row gap-2\">" + IC("like") + "<span class=\"mono\">" + fmt(w.likes) + "</span></div><div class=\"row gap-2\">" + IC("comment") + "<span class=\"mono\">" + fmt(w.commentCount) + "</span></div></div></div><div class=\"card\" style=\"--accent:" + accent + "\"><div class=\"card-hd\"><h3>作品简介</h3><span class=\"tag t-" + w.type + "\">" + typeMeta.label + "</span></div><div class=\"card-bd\"><p style=\"margin:0;color:var(--text-sub);line-height:1.75\">" + esc(w.summary || "暂无简介") + "</p><div class=\"row gap-2 wrap\" style=\"margin-top:14px\">" + tagsHtml + "</div></div><div class=\"card-ft\"><div class=\"mono caption\">ID: " + w.id + "</div><div>接入后端后可读取 / 编辑完整元数据</div></div></div><div class=\"card\"><div class=\"card-hd\"><h3>最新评论 (样例)</h3><span class=\"caption mono\">" + fmt(w.commentCount) + " 条</span></div><div class=\"card-bd stack gap-4\">" + comments + "</div><div class=\"card-ft\"><div class=\"row gap-3\"><button class=\"btn btn-soft btn-sm\" onclick=\"copyText(decodeURIComponent('" + encodeURIComponent(shareUrl) + "'),'分享链接已复制')\">" + IC("copy") + " 复制分享链接</button><button class=\"btn btn-ghost btn-sm\">" + IC("eye") + " 在社区广场预览</button></div><div style=\"color:var(--text-mute);font-size:12px\">原型模式下均为模拟操作</div></div></div>";
    document.querySelector(".drawer-mask").classList.add("is-open");
    document.querySelector(".drawer").classList.add("is-open");
  });
}
function closeDrawer() {
  state.drawerId = null;
  const m = document.querySelector(".drawer-mask"); if (m) m.classList.remove("is-open");
  const d = document.querySelector(".drawer"); if (d) d.classList.remove("is-open");
}
window.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });
/* ---- Page 4: Keys 密钥管理 ---- */
function renderKeys() {
  const wrap = h("div");
  wrap.appendChild(h("div", { class: "page-head" }, [
    h("span", { class: "eyebrow" }, [h("span", { html: IC("key") }), "Keys · " + MOCK.KEYS.length + " 条密钥"]),
    h("h1", { class: "h1" }, ["密钥管理 ", h("span", { class: "grad" }, "Keys")]),
    h("p", { class: "lead" }, "管理各环境 / 各客户端的 API Key，控制权限 scope、配额与回收。创建时 fullToken 仅展示一次。")
  ]));
  const bar = h("div", { class: "toolbar" });
  bar.appendChild(h("div", { class: "seg", id: "keySeg" }, [
    h("button", { class: "is-on", "data-kf": "all" }, "全部"),
    h("button", { "data-kf": "active" }, "运行中"),
    h("button", { "data-kf": "recycled" }, "已回收")
  ]));
  bar.appendChild(h("input", { class: "input", id: "keySearch", placeholder: "按名称 / prefix 搜索…" }));
  bar.appendChild(h("span", { style: "margin-left:auto" }));
  bar.appendChild(h("button", { class: "btn btn-primary", onclick: openKeyModal }, [h("span", { html: IC("plus") }), "创建新密钥"]));
  const grid = h("div", { class: "keys-grid" });
  wrap.appendChild(bar); wrap.appendChild(grid);
  const paint = () => {
    const f = bar.querySelector("#keySeg button.is-on").getAttribute("data-kf");
    const s = bar.querySelector("#keySearch").value.trim().toLowerCase();
    API.getKeys().then(r => {
      let ks = r.data;
      if (f !== "all") ks = ks.filter(k => k.status === f);
      if (s) ks = ks.filter(k => (k.name + " " + k.prefix + " " + k.id).toLowerCase().includes(s));
      grid.innerHTML = "";
      ks.forEach(k => {
        const card = h("div", { class: "kcard" });
        const envTag = k.env === "prod" ? "tag-ok" : (k.env === "dev" ? "tag-brand" : "tag-warn");
        const pct = Math.max(0, Math.min(100, k.quota ? (k.used / k.quota * 100) : 0));
        const scopeHtml = (k.scopes || []).slice(0, 3).map(sc => "<span class=\"tag\">" + esc(sc) + "</span>").join("") + ((k.scopes || []).length > 3 ? "<span class=\"tag\">+" + (k.scopes.length - 3) + "</span>" : "");
        const midHtml = k.fullToken ? esc(k.fullToken.slice(k.prefix.length, 16)) + "<span style=\"opacity:.55\">…</span>" : esc(k.status === "recycled" ? "•••••••• (已回收)" : "•••••••• (仅创建时展示)");
        const copyBtn = k.fullToken ? "<button class=\"btn btn-soft btn-sm copyToken\" data-tok=\"" + esc(k.fullToken) + "\">" + IC("copy") + " 复制</button>" : "";
        card.innerHTML = "<div class=\"kcard-hd\"><div><div class=\"kcard-name\">" + esc(k.name) + "</div><div class=\"kcard-scope\"><span class=\"tag " + envTag + "\">" + k.env.toUpperCase() + "</span><span class=\"tag " + (k.status === "active" ? "tag-ok" : "tag-danger") + "\">" + (k.status === "active" ? "运行中" : "已回收") + "</span>" + scopeHtml + "</div></div><button class=\"tb-ic recKey\" title=\"回收密钥\" aria-label=\"回收\" data-id=\"" + k.id + "\">" + IC("trash") + "</button></div><div class=\"kcard-token\"><div style=\"display:flex;justify-content:space-between;align-items:center;gap:10px;position:relative;z-index:2\"><div class=\"grow mono\" style=\"overflow:hidden;text-overflow:ellipsis;white-space:nowrap\">" + esc(k.prefix) + midHtml + "</div><div class=\"row gap-2\" style=\"position:relative;z-index:2\">" + copyBtn + "<button class=\"btn btn-ghost btn-sm rotateKey\" title=\"轮换到期提醒\">" + IC("refresh") + "</button></div></div></div><div><div class=\"row-b\" style=\"margin-bottom:8px;font-size:13px\"><div><strong class=\"mono\">" + fmt(k.used) + "</strong> <span class=\"muted\">/ " + fmt(k.quota) + " 积分</span></div><div class=\"muted\">" + Math.round(pct) + "% 已用</div></div><div class=\"kcard-usage\"><i style=\"width:" + pct + "%\"></i></div></div><div class=\"kcard-foot\"><div class=\"caption mono\">ID: " + esc(k.id) + " · 创建 " + esc(k.createdAt) + "</div><button class=\"btn-link\" data-go=\"explorer\">用它调试 →</button></div>";
        grid.appendChild(card);
      });
      if (!ks.length) grid.appendChild(h("div", { style: "grid-column:1/-1" }, [h("div", { class: "empty" }, [h("div", { class: "empty-ic" }, IC("key")), h("h3", { class: "h3" }, "暂无匹配的密钥"), h("div", { class: "caption" }, "点击右上角创建新密钥。")])]));
      grid.querySelectorAll(".copyToken").forEach(b => b.addEventListener("click", () => copyText(b.getAttribute("data-tok"), "Token 已复制 (原型模式)")));
      grid.querySelectorAll(".recKey").forEach(b => b.addEventListener("click", () => {
        API.recycleKey(b.getAttribute("data-id")).then(() => { toast("密钥已回收", "warn"); paint(); });
      }));
      grid.querySelectorAll("[data-go='explorer']").forEach(b => b.addEventListener("click", () => goto("explorer")));
    });
  };
  setTimeout(() => {
    bar.querySelectorAll("#keySeg button").forEach(b => b.addEventListener("click", () => {
      bar.querySelectorAll("#keySeg button").forEach(x => x.classList.remove("is-on"));
      b.classList.add("is-on"); paint();
    }));
    bar.querySelector("#keySearch").addEventListener("input", paint);
    paint();
  }, 0);
  return wrap;
}
/* Create Key Modal */
let keyModal = null;
function openKeyModal() {
  if (!keyModal) {
    keyModal = h("div", { class: "modal-mask", role: "dialog", "aria-modal": "true" });
    const scopeOpts = ["works:read", "works:write", "community:read", "community:write", "comic:generate", "novel:generate", "image:generate", "video:generate", "audio:generate", "generate:*", "keys:admin"];
    const scopesHtml = scopeOpts.map((s, idx) => "<label style=\"display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;border:1px solid var(--line);background:var(--bg-elev);cursor:pointer\"><input type=\"checkbox\" value=\"" + s + "\" " + (s === "works:read" ? "checked" : "") + "/><span class=\"mono\" style=\"font-size:12px\">" + s + "</span></label>").join("");
    keyModal.innerHTML = "<div class=\"modal\"><div class=\"modal-hd\"><div class=\"h3\">创建新 API 密钥</div><button class=\"d-close mClose\" aria-label=\"关闭\">" + IC("close") + "</button></div><div class=\"modal-bd\"><div class=\"field\"><label>密钥名称</label><input class=\"input\" id=\"nk_name\" placeholder=\"例如：合作伙伴后端 A\"/></div><div class=\"fg\"><div class=\"field grow\"><label>环境</label><select class=\"select\" id=\"nk_env\"><option value=\"dev\">dev</option><option value=\"prod\">prod</option><option value=\"legacy\">legacy</option></select></div><div class=\"field grow\"><label>配额 (积分)</label><input class=\"input mono\" id=\"nk_quota\" type=\"number\" value=\"10000\"/></div></div><div class=\"field\"><label>权限 Scopes（至少选择一个）</label><div class=\"row wrap gap-2\" id=\"nk_scope\">" + scopesHtml + "</div></div><div class=\"muted\" style=\"font-size:12px\">" + IC("shield") + " 原型模式下，创建的密钥仅保存在 MOCK。接入后端请替换为 POST /api/keys。</div></div><div class=\"modal-ft\"><button class=\"btn btn-ghost mClose\">取消</button><button class=\"btn btn-primary\" id=\"nk_submit\">" + IC("plus") + " 立即创建</button></div></div>";
    document.body.appendChild(keyModal);
    keyModal.addEventListener("click", e => { if (e.target === keyModal) closeKeyModal(); });
    keyModal.querySelectorAll(".mClose").forEach(x => x.addEventListener("click", closeKeyModal));
    keyModal.querySelector("#nk_submit").addEventListener("click", () => {
      const name = keyModal.querySelector("#nk_name").value.trim() || "未命名密钥";
      const env = keyModal.querySelector("#nk_env").value;
      const quota = Math.max(1, parseInt(keyModal.querySelector("#nk_quota").value || "10000", 10));
      const scopes = Array.from(keyModal.querySelectorAll("#nk_scope input:checked")).map(x => x.value);
      if (!scopes.length) { toast("请至少选择一个 scope", "warn"); return; }
      API.createKey({ name, scopes, quota, env }).then(r => {
        closeKeyModal();
        toast("创建成功！Token 仅显示一次", "success");
        if (state.page === "keys") renderPage();
        setTimeout(() => copyText(r.data.fullToken, "完整 Token 已复制，请立即保存！"), 300);
      });
    });
  }
  keyModal.classList.add("is-open");
}
function closeKeyModal() { if (keyModal) keyModal.classList.remove("is-open"); }
/* ---- Page 5: Settings 主题与设置 ---- */
function renderSettings() {
  const wrap = h("div");
  wrap.appendChild(h("div", { class: "page-head" }, [
    h("span", { class: "eyebrow" }, [h("span", { html: IC("palette") }), "Settings · 主题与系统配置"]),
    h("h1", { class: "h1" }, ["主题 · 调色板 ", h("span", { class: "grad" }, "Swatches")]),
    h("p", { class: "lead" }, "所有强调色（Brand / Novel / Comic / Image / Video / Audio / Community）与 MankTV 前端 tailwind.config.js 一致，可在此预览并即时编辑 500 色。")
  ]));
  const firstRow = h("div", { class: "grid gr-2 gap-5" });
  const left = h("div", { class: "card" });
  const typeCards = [
    ["novel", "小说", "--novel-500"], ["image", "图像", "--image-500"], ["comic", "漫画", "--comic-500"],
    ["audio", "音频", "--audio-500"], ["video", "视频", "--video-500"], ["community", "社区", "--community-500"]
  ].map(([k, label, cvar]) => "<div style=\"border-radius:var(--r-lg);padding:14px;background:var(--bg-surface);border:1px solid var(--line);box-shadow:var(--sh-soft)\"><div style=\"display:flex;align-items:center;gap:8px;margin-bottom:10px\"><span style=\"width:12px;height:12px;border-radius:4px;background:var(" + cvar + ");display:inline-block\"></span><strong style=\"font-size:14px\">" + label + "</strong></div><div style=\"height:36px;border-radius:10px;background:linear-gradient(135deg,var(" + cvar + "),color-mix(in srgb,var(" + cvar + ") 40%,#fff));box-shadow:var(--sh-card)\"></div><div style=\"margin-top:10px\" class=\"mono caption\">t-" + k + " · cls</div></div>").join("");
  left.innerHTML = "<div class=\"card-hd\"><div><h3>品牌化预览</h3><p class=\"caption\" style=\"margin:4px 0 0\">用于校验 Header / Gradient / 按钮在不同功能区色下的观感</p></div><span class=\"tag tag-brand\">与 web/ 同源</span></div><div class=\"card-bd stack gap-4\"><div style=\"padding:18px;border-radius:var(--r-lg);background:linear-gradient(135deg,var(--brand-50),var(--comic-50));border:1px solid var(--line)\"><div class=\"row gap-3\"><div class=\"brand-logo\">" + IC("logo") + "</div><div><div style=\"font-weight:800;font-size:18px\">Mank<span class=\"grad\">TV</span></div><div class=\"caption\">AI 漫剧圈 · 品牌化预览面板</div></div></div><div class=\"hero-actions\" style=\"margin-top:18px\"><button class=\"btn btn-primary\">" + IC("rocket") + " 立即开始</button><button class=\"btn btn-ghost\">" + IC("book") + " 查看文档</button><button class=\"btn btn-soft\">" + IC("shield") + " 合规备案</button></div></div><div style=\"display:grid;grid-template-columns:repeat(3,1fr);gap:12px\">" + typeCards + "</div></div>";
  const right = h("div", { class: "card" });
  right.innerHTML = "<div class=\"card-hd\"><div><h3>接入与 Demo 账号</h3><p class=\"caption\" style=\"margin:4px 0 0\">原型 → 真后端的切换只需启用 api.js 的 fetchJson</p></div><span class=\"tag tag-ok\">Ready</span></div><div class=\"card-bd stack gap-4\"><div class=\"field\"><label>API Base URL</label><div class=\"row gap-2\"><input class=\"input mono\" id=\"apiBase\" value=\"" + API_BASE + "\"/><button class=\"btn btn-soft\" id=\"saveBase\">" + IC("send") + " 保存到 localStorage</button></div></div><div><div class=\"sec-title\">演示账号</div><div class=\"tbl-wrap\"><table class=\"tbl\"><thead><tr><th>角色</th><th>邮箱</th><th>密码</th><th>说明</th></tr></thead><tbody><tr><td><span class=\"tag tag-ok\">管理员</span></td><td class=\"mono\">admin@manktv.com</td><td class=\"mono\">password123</td><td>全部权限</td></tr><tr><td><span class=\"tag tag-brand\">普通用户</span></td><td class=\"mono\">demo@manktv.com</td><td class=\"mono\">password123</td><td>创作 · 社区</td></tr></tbody></table></div></div><div><div class=\"sec-title\">偏好设置</div><div class=\"row-b\" style=\"padding:10px 0;border-bottom:1px dashed var(--line)\"><div><strong>暗色模式（跟随系统）</strong><div class=\"caption\">当前 styles.css 已内置 prefers-color-scheme</div></div><div class=\"seg\"><button class=\"is-on\">自动</button><button>开</button><button>关</button></div></div><div class=\"row-b\" style=\"padding:10px 0;border-bottom:1px dashed var(--line)\"><div><strong>减少动画 (reduced motion)</strong><div class=\"caption\">原型遵循 prefers-reduced-motion</div></div><div class=\"seg\"><button class=\"is-on\">跟随系统</button><button>开启</button></div></div><div class=\"row-b\" style=\"padding:10px 0\"><div><strong>首次显示欢迎条</strong><div class=\"caption\">登录后首次进入控制台显示 hero banner</div></div><div class=\"seg\"><button class=\"is-on\">显示</button><button>隐藏</button></div></div></div></div><div class=\"card-ft\"><div>原型 · 数据存于内存 / localStorage</div><div class=\"row gap-2\"><button class=\"btn btn-ghost btn-sm\" id=\"resetAll\">重置原型数据</button><button class=\"btn btn-primary btn-sm\" id=\"gotoDash\">返回控制台</button></div></div>";
  firstRow.appendChild(left); firstRow.appendChild(right);
  wrap.appendChild(firstRow);
  const paletteSec = h("div", { style: "margin-top:var(--s-8)" });
  paletteSec.appendChild(h("div", { class: "row-b", style: "margin-bottom:var(--s-5)" }, [
    h("div", { class: "stack gap-2" }, [h("h2", { class: "h2" }, "调色板 Palette"), h("p", { class: "caption" }, "每一行的 7 个色阶 50→100→200→300→400→500→600 均与 web/tailwind.config.js 一一对应；修改 500 色会同步刷新样式与 MOCK。")]),
    h("button", { class: "btn btn-ghost", id: "resetAllSw" }, [h("span", { html: IC("refresh") }), "全部重置"])
  ]));
  const swGrid = h("div", { class: "swatch-grid", id: "swGrid" });
  paletteSec.appendChild(swGrid);
  wrap.appendChild(paletteSec);
  setTimeout(() => {
    const paintSw = () => {
      API.getSwatches().then(r => {
        swGrid.innerHTML = "";
        r.data.forEach(s => {
          const card = h("div", { class: "sw" });
          const barsHtml = s.scale.map(c => "<i style=\"background:" + c + "\"></i>").join("");
          card.innerHTML = "<div class=\"sw-head\"><div class=\"row gap-2\"><div style=\"width:14px;height:14px;border-radius:5px;background:" + s.scale[5] + ";box-shadow:var(--sh-soft)\"></div><strong>" + s.label + "</strong><span class=\"mono caption\">" + s.key + "</span></div><button class=\"btn-link resSw\" data-key=\"" + s.key + "\">" + IC("refresh") + " 重置</button></div><div class=\"sw-bars\">" + barsHtml + "</div><div class=\"sw-cols\"><span>50</span><span>100</span><span>200</span><span>300</span><span>400</span><span>500</span><span>600</span></div><div class=\"sw-input\"><input class=\"input\" type=\"color\" value=\"" + s.c500 + "\" data-key=\"" + s.key + "\" /><input class=\"input\" type=\"text\" value=\"" + s.c500.toUpperCase() + "\" maxlength=\"7\" data-key=\"" + s.key + "\" /><button class=\"btn btn-soft btn-sm applySw\" data-key=\"" + s.key + "\">应用 500</button></div>";
          swGrid.appendChild(card);
        });
        swGrid.querySelectorAll(".resSw").forEach(b => b.addEventListener("click", () => {
          API.resetSwatch(b.getAttribute("data-key")).then(rr => { toast(rr.data.label + " 已重置"); paintSw(); });
        }));
        swGrid.querySelectorAll('input[type="color"]').forEach(i => {
          i.addEventListener("input", () => i.parentElement.querySelector('input[type="text"]').value = i.value.toUpperCase());
        });
        swGrid.querySelectorAll('input[type="text"]').forEach(i => {
          i.addEventListener("input", () => {
            const v = i.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) i.parentElement.querySelector('input[type="color"]').value = v;
          });
        });
        swGrid.querySelectorAll(".applySw").forEach(b => b.addEventListener("click", () => {
          const k = b.getAttribute("data-key");
          const v = b.parentElement.querySelector('input[type="color"]').value;
          API.updateSwatch(k, v).then(() => {
            document.documentElement.style.setProperty("--" + k + "-500", v);
            toast(k + " · 500 色已应用到 CSS 变量");
            paintSw();
          });
        }));
      });
    };
    paintSw();
    document.getElementById("saveBase").addEventListener("click", () => {
      const v = document.getElementById("apiBase").value.trim();
      localStorage.setItem("manktv.apiBase", v);
      toast("已保存 API Base: " + v);
    });
    const ls = localStorage.getItem("manktv.apiBase"); if (ls) document.getElementById("apiBase").value = ls;
    document.getElementById("resetAllSw").addEventListener("click", () => { paintSw(); toast("调色板已从 MOCK 重载"); });
    document.getElementById("resetAll").addEventListener("click", () => toast("原型重置：刷新页面即可恢复 MOCK 初始状态", "warn"));
    document.getElementById("gotoDash").addEventListener("click", () => goto("dashboard"));
  }, 0);
  return wrap;
}
/* ---- Boot ---- */
window.addEventListener("DOMContentLoaded", () => {
  renderShell();
  const hash = (window.location.hash || "").replace(/^#\//, "");
  if (NAV.find(n => n.k === hash)) state.page = hash;
  renderPage();
  // 完成初始渲染 → 清除 is-loading，启动 stagger 动画
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.body.classList.remove("is-loading"));
  });
  window.addEventListener("hashchange", () => {
    const h = (window.location.hash || "").replace(/^#\//, "");
    if (NAV.find(n => n.k === h) && h !== state.page) { state.page = h; renderShell(); renderPage(); }
  });
});
/* — END api.js — */
