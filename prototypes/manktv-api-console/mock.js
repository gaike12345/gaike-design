/* MankTV API Console v5 · mock.js
 * 数据对齐：server/prisma/seed.ts + web/CommunityPage STATIC_WORKS_POOL + tailwind.config.js DEFAULT/ACCENTS
 * v5 修复：color=Tailwind DEFAULT（novel/audio=500, image/comic/video/community/brand=600/500）
 */
const MOCK = {};
window.MOCK = MOCK;
/* TYPES.c500 = FeatureLanding.ACCENTS.main = Tailwind DEFAULT：
 * novel=500, audio=500, image=600, comic=600, video=600, community=600 */
MOCK.TYPES = {
  novel:     { label: "小说",   c500: "#6366F1", c50: "#EEF2FF", c100: "#E0E7FF", c200: "#C7D2FE" },
  image:     { label: "图像",   c500: "#0891B2", c50: "#ECFEFF", c100: "#CFFAFE", c200: "#A5F3FC" },
  comic:     { label: "漫画",   c500: "#7C3AED", c50: "#F5F3FF", c100: "#EDE9FE", c200: "#DDD6FE" },
  audio:     { label: "音频",   c500: "#EC4899", c50: "#FDF2F8", c100: "#FCE7F3", c200: "#FBCFE8" },
  video:     { label: "视频",   c500: "#D97706", c50: "#FFFBEB", c100: "#FEF3C7", c200: "#FDE68A" },
  community: { label: "社区",   c500: "#16A34A", c50: "#F0FDF4", c100: "#DCFCE7", c200: "#BBF7D0" }
};
MOCK.STATUSES = {
  published: { label: "已发布", cls: "tag-ok" },
  review:    { label: "审核中", cls: "tag-warn" },
  draft:     { label: "草稿",   cls: "tag-brand" },
  banned:    { label: "已下线", cls: "tag-danger" }
};
/* KPIs.c：调用 Tailwind DEFAULT（comic→600，community→600，video→600，novel/audio→500，brand→500） */
MOCK.KPIS = [
  { key:"calls",   label:"API 调用次数", value:"128,450", delta:"+12.4%", up:true,  c:"var(--brand-500)",       spark:[22,28,26,34,32,38,45,44,52,58,60,66] },
  { key:"works",   label:"生成作品数",   value:"3,872",   delta:"+8.1%",  up:true,  c:"var(--comic-600)",       spark:[10,14,18,12,24,28,30,36,40,38,46,52] },
  { key:"users",   label:"活跃用户数",   value:"1,206",   delta:"+2.3%",  up:true,  c:"var(--community-600)",   spark:[30,32,34,36,38,42,40,44,46,48,50,52] },
  { key:"credits", label:"消耗积分",     value:"528.3K",  delta:"-1.5%",  up:false, c:"var(--video-600)",       spark:[60,58,54,52,48,50,46,44,42,40,38,36] }
];
/* HEALTH.c：Tailwind DEFAULT（novel/audio=500, 其余 4 类=600） */
MOCK.HEALTH = [
  { group:"社区广场", method:"GET",  path:"/api/community/works", status:"up",   pct:96, ms:68,  c:"var(--community-600)" },
  { group:"漫画",     method:"POST", path:"/api/comic/generate",   status:"up",   pct:92, ms:124, c:"var(--comic-600)" },
  { group:"小说",     method:"POST", path:"/api/novel/generate",   status:"up",   pct:99, ms:48,  c:"var(--novel-500)" },
  { group:"图像",     method:"POST", path:"/api/image/generate",   status:"slow", pct:74, ms:340, c:"var(--image-600)" },
  { group:"视频",     method:"POST", path:"/api/video/generate",   status:"slow", pct:68, ms:520, c:"var(--video-600)" },
  { group:"音频",     method:"POST", path:"/api/audio/generate",   status:"up",   pct:90, ms:180, c:"var(--audio-500)" },
  { group:"密钥",     method:"GET",  path:"/api/keys",             status:"up",   pct:99, ms:22,  c:"var(--brand-500)" },
  { group:"认证",     method:"POST", path:"/api/auth/login",       status:"up",   pct:98, ms:44,  c:"var(--brand-700)" }
];
/* MODULES.color：Tailwind DEFAULT（novel/audio=500, image/comic/video/community=600） */
MOCK.MODULES = [
  { key:"comic",     name:"漫画 Comic",     pct:28, color:"var(--comic-600)" },
  { key:"novel",     name:"小说 Novel",     pct:20, color:"var(--novel-500)" },
  { key:"image",     name:"图像 Image",     pct:13, color:"var(--image-600)" },
  { key:"audio",     name:"音频 Audio",     pct:11, color:"var(--audio-500)" },
  { key:"video",     name:"视频 Video",     pct:12, color:"var(--video-600)" },
  { key:"community", name:"社区 Community", pct:16, color:"var(--community-600)" }
];
MOCK.GROUPS = [
  { k:"auth", name:"认证 Auth" },{ k:"community", name:"社区广场 Community" },
  { k:"works", name:"作品管理 Works" },{ k:"comic", name:"漫画生成 Comic" },
  { k:"novel", name:"小说生成 Novel" },{ k:"image", name:"图像生成 Image" },
  { k:"video", name:"视频生成 Video" },{ k:"audio", name:"音频生成 Audio" },
  { k:"keys", name:"密钥管理 Keys" }
];
function ep(id, method, path, group, desc, params, req, exRes){ return { id, method, path, group, desc, params:params||[], req, exRes, exReq:req }; }
MOCK.ENDPOINTS = [
  ep("e1","POST","/api/auth/login","auth","邮箱密码登录返回 accessToken",
    [{name:"email",type:"string",req:true,desc:"用户邮箱"},{name:"password",type:"string",req:true,desc:"密码 ≥8 位"}],
    {email:"demo@manktv.com",password:"password123"},
    {ok:true,token:"eyJhbGci...truncated",user:{id:"u_demo",name:"Demo User",role:"admin"}}),
  ep("e2","POST","/api/auth/refresh","auth","使用 refreshToken 续期",
    [{name:"refreshToken",type:"string",req:true,desc:"续期令牌"}],
    {refreshToken:"rt_xxx"},{ok:true,token:"eyJhbGci...new"}),
  ep("e3","GET","/api/community/works","community","分页获取社区作品列表",
    [{name:"type",type:"string",req:false,desc:"类型"},{name:"sort",type:"string",req:false,desc:"hot|new|comment"},
     {name:"search",type:"string",req:false,desc:"模糊查询"},{name:"page",type:"number",req:false,desc:"页码"},{name:"limit",type:"number",req:false,desc:"条数"}],null,
    {ok:true,total:20,data:[{id:"static-comic-01",type:"comic",title:"机甲少女娜娜",author:"星绘",likes:2888,commentCount:214}]}),
  ep("e4","GET","/api/community/works/:id","community","获取作品详情 + 评论",
    [{name:"id",type:"string",req:true,desc:"作品 ID"}],null,
    {ok:true,work:{id:"static-comic-01"},comments:[{user:"赛博老猫",text:"分镜太有张力"}]}),
  ep("e5","POST","/api/community/works/:id/like","community","点赞切换 (幂等)",
    [{name:"id",type:"string",req:true,desc:"作品 ID"}],null,{ok:true,liked:true,likes:2889}),
  ep("e6","POST","/api/community/works/:id/comments","community","发表评论",
    [{name:"id",type:"string",req:true,desc:"作品 ID"}],{content:"封面太帅了！模型是哪款？"},
    {ok:true,comment:{id:"c_new",user:"Demo User"}}),
  ep("e7","GET","/api/works","works","后台查询作品",
    [{name:"type",type:"string",req:false,desc:"all|comic|novel|..."},{name:"status",type:"string",req:false,desc:"状态"},
     {name:"search",type:"string",req:false,desc:"搜索"},{name:"sort",type:"string",req:false,desc:"排序"}],null,{ok:true,total:20,data:[]}),
  ep("e8","POST","/api/comic/generate","comic","提交漫画生成任务",
    [{name:"script",type:"string",req:true,desc:"分镜脚本"},{name:"styleId",type:"string",req:false,desc:"风格模板ID"},
     {name:"panels",type:"number",req:false,desc:"分镜数量4-32"}],
    {script:"娜娜初登场，机甲从天而降",styleId:"mecha-cyber-v2",panels:8},
    {ok:true,taskId:"task_c_8821",status:"queued",etaMs:28000}),
  ep("e9","POST","/api/novel/generate","novel","生成小说章节",
    [{name:"prompt",type:"string",req:true,desc:"剧情提示词"},{name:"chapters",type:"number",req:false,desc:"章节数"}],
    {prompt:"赛博朋克 2077，流浪AI少女觉醒",chapters:3},
    {ok:true,taskId:"task_n_4410",draft:{title:"霓虹下的微光",chapters:3}}),
  ep("e10","POST","/api/image/generate","image","文生图",
    [{name:"prompt",type:"string",req:true,desc:"正向提示词"},{name:"size",type:"string",req:false,desc:"尺寸"}],
    {prompt:"机甲少女，霓虹，未来都市",size:"1280x720"},
    {ok:true,taskId:"task_i_3021",urls:["/images/generated/img-3021-1.png"]}),
  ep("e11","POST","/api/video/generate","video","生成视频",
    [{name:"prompt",type:"string",req:true,desc:"镜头描述"},{name:"seconds",type:"number",req:false,desc:"时长"}],
    {prompt:"机甲腾空，镜头从地面跟随上摇",seconds:5},
    {ok:true,taskId:"task_v_0912",status:"queued",etaMs:140000}),
  ep("e12","POST","/api/audio/generate","audio","TTS/音效/BGM生成",
    [{name:"text",type:"string",req:true,desc:"目标文本"},{name:"voiceId",type:"string",req:false,desc:"音色ID"}],
    {text:"第1话 机甲少女娜娜 序章",voiceId:"narrator-warm-f"},
    {ok:true,taskId:"task_a_1177",url:"/audio/gen/a-1177.mp3",durationMs:12400}),
  ep("e13","GET","/api/keys","keys","查询API Key列表",
    [{name:"status",type:"string",req:false,desc:"active|recycled"}],null,{ok:true,data:[]}),
  ep("e14","POST","/api/keys","keys","创建新 Key（创建后仅一次可见 fullToken）",
    [{name:"name",type:"string",req:true,desc:"密钥名称"},{name:"scopes",type:"string[]",req:false,desc:"权限数组"}],
    {name:"合作伙伴后端A",scopes:["works:read","community:write","comic:generate"]},
    {ok:true,data:{id:"k_new",prefix:"sk_mk_xxx_",fullToken:"sk_mk_xxx_8abc...",status:"active"}}),
  ep("e15","DELETE","/api/keys/:id","keys","回收密钥 (软删除)",
    [{name:"id",type:"string",req:true,desc:"密钥 ID"}],null,{ok:true,data:{id:"k_old",status:"recycled"}}),
  ep("e16","GET","/api/health","auth","服务健康检查",[],null,{ok:true,service:"MankTV API"})
];
const _cov = (c1,c2,title) => ({c1,c2,title});
MOCK.WORKS = [
  { id:"static-comic-01", type:"comic", subtype:"赛博朋克", title:"机甲少女娜娜", author:"星绘",
    likes:2888, commentCount:214, status:"published", createdAt:"2026-08-23",
    tags:["机甲","热血","成长"], cov:_cov("#7C3AED","#3B82F6","娜"),
    summary:"霓虹 2087 年，流浪少女娜娜意外与退役机甲建立神经同步，踏上寻找记忆的旅程。" },
  { id:"static-comic-02", type:"comic", subtype:"校园恋爱", title:"樱花落时遇见你", author:"月岛小仓",
    likes:2140, commentCount:186, status:"published", createdAt:"2026-08-22",
    tags:["纯爱","校园","治愈"], cov:_cov("#A78BFA","#EC4899","樱"),
    summary:"转学第一天，飘落的樱花瓣下，她遇到了坐在窗边的他。" },
  { id:"static-comic-03", type:"comic", subtype:"古风水墨", title:"长安剑雨情", author:"墨染山河",
    likes:1956, commentCount:154, status:"published", createdAt:"2026-08-20",
    tags:["武侠","历史","水墨"], cov:_cov("#6366F1","#16A34A","剑"),
    summary:"盛唐长安城，一场江湖与朝堂的博弈。" },
  { id:"static-comic-04", type:"comic", subtype:"末日废土", title:"铁锈地平线", author:"GearHead",
    likes:1620, commentCount:128, status:"review", createdAt:"2026-08-19",
    tags:["末日","科幻","生存"], cov:_cov("#B45309","#7C3AED","锈"),
    summary:"百年大灾变后，幸存者在废墟中重建文明。" },
  { id:"static-novel-01", type:"novel", subtype:"科幻长篇", title:"量子玫瑰", author:"凌晨光",
    likes:1840, commentCount:201, status:"published", createdAt:"2026-08-21",
    tags:["硬科幻","量子","爱情"], cov:_cov("#6366F1","#3B82F6","玫"),
    summary:"2147 年，量子纠缠实验让物理学家与已故女友的意识在 17 个平行宇宙重逢。" },
  { id:"static-novel-02", type:"novel", subtype:"都市现实", title:"长安街上的陌生人", author:"苏晚",
    likes:1328, commentCount:178, status:"published", createdAt:"2026-08-18",
    tags:["都市","治愈","现实"], cov:_cov("#818CF8","#10B981","陌"),
    summary:"北京三环内一条老街上，七个陌生人的命运在冬夜里交集。" },
  { id:"static-image-01", type:"image", subtype:"概念设计", title:"天宫 2099 空间站", author:"Atelier",
    likes:3240, commentCount:298, status:"published", createdAt:"2026-08-24",
    tags:["概念图","科幻","太空"], cov:_cov("#0891B2","#7C3AED","站"),
    summary:"为《天宫》IP 设计的空间站概念图，融合榫卯结构与未来工业美学。" },
  { id:"static-image-02", type:"image", subtype:"角色立绘", title:"竹林少年（全身立绘）", author:"Atelier",
    likes:2180, commentCount:167, status:"published", createdAt:"2026-08-17",
    tags:["立绘","角色","东方"], cov:_cov("#22D3EE","#16A34A","竹"),
    summary:"武侠风格原创角色，青竹、流云、长剑，冷绿与青绿色调。" },
  { id:"static-video-01", type:"video", subtype:"短预告片", title:"《机甲少女娜娜》动画 PV", author:"MankTV 动画组",
    likes:3588, commentCount:342, status:"published", createdAt:"2026-08-25",
    tags:["PV","动画","热血"], cov:_cov("#D97706","#7C3AED","PV"),
    summary:"漫画《机甲少女娜娜》改编动画首发 PV，全长 90 秒。" },
  { id:"static-video-02", type:"video", subtype:"AI MV", title:"AI 导演版《星夜列车》MV", author:"光影社",
    likes:2460, commentCount:215, status:"review", createdAt:"2026-08-16",
    tags:["MV","AI 导演","实验"], cov:_cov("#FBBF24","#EC4899","列"),
    summary:"全 AI 导演作品，完全由视频生成模型 + 配乐模型协作完成。" },
  { id:"static-audio-01", type:"audio", subtype:"有声小说", title:"《量子玫瑰》第一章 有声版", author:"声之谷",
    likes:1542, commentCount:112, status:"published", createdAt:"2026-08-19",
    tags:["有声","男声","科幻"], cov:_cov("#EC4899","#6366F1","声"),
    summary:"人气作品《量子玫瑰》第一章，暖声男主音色，带 BGM 与环境音。" },
  { id:"static-audio-02", type:"audio", subtype:"OST", title:"MankTV 开场主题曲", author:"Audio Lab",
    likes:1980, commentCount:148, status:"published", createdAt:"2026-08-15",
    tags:["OST","BGM","开幕"], cov:_cov("#F472B6","#FBBF24","曲"),
    summary:"MankTV 平台官方开场曲，融合电子与管弦元素。" },
  { id:"static-commu-01", type:"community", subtype:"教程帖", title:"如何用 ComfyUI 训练 LoRA", author:"官方",
    likes:4220, commentCount:444, status:"published", createdAt:"2026-08-14",
    tags:["教程","LoRA","ComfyUI"], cov:_cov("#16A34A","#3B82F6","教"),
    summary:"官方出品：从数据采集、打标到训练参数，完整走通漫画风格 LoRA。" },
  { id:"static-commu-02", type:"community", subtype:"同人创作", title:"娜娜 × 长安街 crossover", author:"月岛小仓 × 墨染山河",
    likes:1760, commentCount:132, status:"draft", createdAt:"2026-08-20",
    tags:["联动","同人","跨作品"], cov:_cov("#4ADE80","#A78BFA","联"),
    summary:"两大热门 IP 跨作品联动 8 页番外。" },
  { id:"static-novel-03", type:"novel", subtype:"悬疑推理", title:"月光下的第七封信", author:"苏晚",
    likes:1120, commentCount:86, status:"published", createdAt:"2026-08-12",
    tags:["悬疑","推理","心理"], cov:_cov("#4F46E5","#374151","信"),
    summary:"南方小城接连收到七封死者的来信。" },
  { id:"static-image-03", type:"image", subtype:"产品摄影", title:"MankTV 周边·黑胶系列", author:"视觉组",
    likes:980, commentCount:54, status:"published", createdAt:"2026-08-11",
    tags:["产品","摄影","周边"], cov:_cov("#06B6D4","#111827","胶"),
    summary:"MankTV 第一弹周边·限定编号黑胶。" },
  { id:"static-video-03", type:"video", subtype:"vlog", title:"Vlog·研发幕后日", author:"官方号",
    likes:2100, commentCount:188, status:"published", createdAt:"2026-08-10",
    tags:["vlog","幕后","团队"], cov:_cov("#D97706","#16A34A","幕"),
    summary:"4 分钟真实幕后：从算法到美术。" },
  { id:"static-comic-05", type:"comic", subtype:"奇幻冒险", title:"深海图书馆", author:"小泽",
    likes:1460, commentCount:102, status:"published", createdAt:"2026-08-09",
    tags:["奇幻","冒险","治愈"], cov:_cov("#0891B2","#7C3AED","深"),
    summary:"传闻中的深海图书馆，少年潜入海底找回了失去的故事。" },
  { id:"static-audio-03", type:"audio", subtype:"ASMR", title:"深夜办公室·键盘 ASMR", author:"Audio Lab",
    likes:820, commentCount:44, status:"published", createdAt:"2026-08-08",
    tags:["ASMR","助眠","白噪音"], cov:_cov("#EC4899","#111827","键"),
    summary:"30 分钟白噪音，柔和的机械键盘声 + 空调声。" },
  { id:"static-commu-03", type:"community", subtype:"活动公告", title:"创作大赛 奖金池 50,000 积分", author:"运营组",
    likes:3600, commentCount:520, status:"published", createdAt:"2026-08-01",
    tags:["活动","创作","奖金"], cov:_cov("#16A34A","#D97706","奖"),
    summary:"六大赛道 + 跨类型联动奖。作品即投稿！" }
];
MOCK.KEYS = [
  { id:"k_prod_web", name:"MankTV Web Frontend", prefix:"sk_mk_wp1_", scopes:["community:read","community:write","works:read"], used: 48210, quota: 100000, createdAt:"2026-06-12", status:"active", env:"prod" },
  { id:"k_mob_app",  name:"移动端 App (iOS/Android)", prefix:"sk_mk_ma2_", scopes:["community:read","works:read","generate:*"], used: 32180, quota: 80000, createdAt:"2026-07-02", status:"active", env:"prod" },
  { id:"k_comic_q",  name:"漫画生成队列 Worker", prefix:"sk_mk_cq3_", scopes:["comic:generate","image:generate"], used: 9650, quota: 20000, createdAt:"2026-07-15", status:"active", env:"prod" },
  { id:"k_test_a",   name:"QA·回归测试 Key", prefix:"sk_mk_qa4_", scopes:["works:read","community:read"], used: 412, quota: 5000, createdAt:"2026-08-01", status:"active", env:"dev" },
  { id:"k_old_core", name:"旧版 V1 核心服务 (待迁移)", prefix:"sk_mk_old_", scopes:["generate:*"], used: 100, quota: 100, createdAt:"2026-04-20", status:"recycled", env:"legacy" }
];
MOCK.REQS = [
  { id:"r1", time:"08-25 22:14:01", method:"POST", path:"/api/comic/generate", status:202, ip:"10.2.4.12", user:"星绘", ms:284 },
  { id:"r2", time:"08-25 22:13:58", method:"GET",  path:"/api/community/works", status:200, ip:"10.2.8.44", user:"(guest)", ms:48 },
  { id:"r3", time:"08-25 22:13:42", method:"POST", path:"/api/image/generate", status:502, ip:"10.2.9.66", user:"Atelier", ms:1220 },
  { id:"r4", time:"08-25 22:13:10", method:"POST", path:"/api/auth/login", status:200, ip:"10.1.0.3", user:"demo@manktv.com", ms:44 },
  { id:"r5", time:"08-25 22:12:55", method:"POST", path:"/api/novel/generate", status:200, ip:"10.2.4.58", user:"凌晨光", ms:98 },
  { id:"r6", time:"08-25 22:12:21", method:"GET",  path:"/api/keys", status:200, ip:"10.1.0.11", user:"admin@manktv.com", ms:22 },
  { id:"r7", time:"08-25 22:11:48", method:"POST", path:"/api/video/generate", status:202, ip:"10.2.7.22", user:"MankTV 动画组", ms:512 }
];
function sw(key,label, p50,p100,p200,p300,p400,p500,p600, c500){ return { key, label, scale:[p50,p100,p200,p300,p400,p500,p600], c500:(c500||p500) }; }
/* c500 = Tailwind DEFAULT (500 or 600 per config)：
 * novel 500=6366F1, comic DEFAULT=600=7C3AED, image DEFAULT=600=0891B2,
 * video DEFAULT=600=D97706, audio DEFAULT=500=EC4899, community DEFAULT=600=16A34A,
 * brand DEFAULT=500=3B82F6
 */
MOCK.SWATCHES = [
  sw("brand","品牌 Brand","#EFF6FF","#DBEAFE","#BFDBFE","#93C5FD","#60A5FA","#3B82F6","#2563EB","#3B82F6"),
  sw("novel","小说 Novel","#EEF2FF","#E0E7FF","#C7D2FE","#A5B4FC","#818CF8","#6366F1","#4F46E5","#6366F1"),
  sw("comic","漫画 Comic","#F5F3FF","#EDE9FE","#DDD6FE","#C4B5FD","#A78BFA","#8B5CF6","#7C3AED","#7C3AED"),
  sw("image","图像 Image","#ECFEFF","#CFFAFE","#A5F3FC","#67E8F9","#22D3EE","#06B6D4","#0891B2","#0891B2"),
  sw("video","视频 Video","#FFFBEB","#FEF3C7","#FDE68A","#FCD34D","#FBBF24","#F59E0B","#D97706","#D97706"),
  sw("audio","音频 Audio","#FDF2F8","#FCE7F3","#FBCFE8","#F9A8D4","#F472B6","#EC4899","#DB2777","#EC4899"),
  sw("community","社区 Community","#F0FDF4","#DCFCE7","#BBF7D0","#86EFAC","#4ADE80","#22C55E","#16A34A","#16A34A")
];
MOCK.ICONS = {
  logo:'<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7c0-2 1.5-3 3-3h10c1.5 0 3 1 3 3v10c0 2-1.5 3-3 3H7c-1.5 0-3-1-3-3V7z"/><path d="m9 9 6 3-6 3V9z"/></svg>',
  dash:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  api:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6v12M16 6v12M3 12h3M18 12h3"/></svg>',
  queue:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  key:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="15" r="4"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/></svg>',
  settings:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
  bell:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
  menu:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>',
  close:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  plus:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  arrowUp:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>',
  arrowDown:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  like:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 1 0-7.8 7.8l1 1L12 21l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
  comment:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  zap:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h7l-1 8 10-12h-7l1-8z"/></svg>',
  eye:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  copy:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  trash:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>',
  refresh:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>',
  send:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>',
  palette:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r=".5"/><circle cx="17.5" cy="10.5" r=".5"/><circle cx="8.5" cy="7.5" r=".5"/><circle cx="6.5" cy="12.5" r=".5"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.8 0 1.5-.7 1.5-1.5 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.8.7-1.5 1.5-1.5H16a6 6 0 0 0 6-6c0-5.5-4.5-10-10-10z"/></svg>',
  shield:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  spark:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  rocket:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-1 1-2.2 0-3s-2 .3-3 0zM12 15l-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.7-.8 8.1-6 11a22 22 0 0 1-4 2z"/></svg>',
  book:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>'
};