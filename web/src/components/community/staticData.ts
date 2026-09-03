// 社区静态作品池（20 件 · 跨 5 类型 · 后端空/报错时的统一兜底数据源）
// 从 CommunityPage.tsx 抽取。

import type { Author, Work } from './types'

export const STATIC_AUTHORS: Record<string, Author> = {
  mo: { id: 'u-mo', nickname: '墨流云', avatar: null },
  ling: { id: 'u-ling', nickname: '凌雪', avatar: null },
  xingye: { id: 'u-xy', nickname: '星野', avatar: null },
  yeming: { id: 'u-ym', nickname: '夜鸣', avatar: null },
  aria: { id: 'u-aria', nickname: '画师Aria', avatar: null },
  luxiao: { id: 'u-lux', nickname: '林间小鹿', avatar: null },
  mechK: { id: 'u-mk', nickname: '机械师K', avatar: null },
  luren: { id: 'u-lr', nickname: '旅人', avatar: null },
  xinghui: { id: 'u-xh', nickname: '星绘', avatar: null },
  yuexia: { id: 'u-yx', nickname: '月下狐', avatar: null },
  qingtian: { id: 'u-qt', nickname: '晴天', avatar: null },
  ashu: { id: 'u-as', nickname: '阿树', avatar: null },
  shengsheng: { id: 'u-ss', nickname: '声声主播', avatar: null },
  alan: { id: 'u-al', nickname: '阿岚', avatar: null },
  yehang: { id: 'u-yh', nickname: '夜航', avatar: null },
  lily: { id: 'u-lily', nickname: 'Lily老师', avatar: null },
  vision: { id: 'u-vs', nickname: 'Vision', avatar: null },
  moying: { id: 'u-my', nickname: '墨影坊', avatar: null },
  maoqiu: { id: 'u-mq', nickname: '毛球球', avatar: null },
  ale: { id: 'u-al2', nickname: '吃货阿乐', avatar: null },
}

const COVER = (encoded: string) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`

export const STATIC_WORKS_POOL: Work[] = [
  // —— 小说 4 本 ——
  {
    id: 'static-novel-01',
    type: 'novel',
    subtype: '古风玄幻',
    title: '云海仙踪',
    content:
      '青云之上，云海翻涌。少年背着一柄断剑走出十万大山，踏入仙门，却在第一日的灵根测试上惹出惊天异象……\n墨色长剑横空，斩断三千情丝；道心一念，成魔成仙皆在今朝。',
    author: STATIC_AUTHORS.mo,
    cover: COVER(
      'Chinese%20ancient%20fantasy%20novel%20cover%2C%20misty%20mountains%2C%20celestial%20sword%20immortal%20in%20flowing%20robes%2C%20traditional%20Chinese%20ink%20painting%20style%2C%20jade%20green%20and%20gold%20palette%2C%20cinematic%20lighting',
    ),
    likes: 2486,
    commentCount: 312,
    createdAt: '2026-08-25T09:12:00Z',
  },
  {
    id: 'static-novel-02',
    type: 'novel',
    subtype: '科幻都市',
    title: '赛博迷城',
    content:
      '2099 年的新沪城，霓虹与雨水交织。地下黑客凌在一场数据交易中意外获得一段被加密的记忆——那属于三年前死去的自己。\n义体、脑机接口、企业财阀、雨夜追杀，所有线索都指向浮空区的一座无主服务器。',
    author: STATIC_AUTHORS.ling,
    cover: COVER(
      'cyberpunk%20sci-fi%20city%20novel%20cover%2C%20neon%20lit%20skyscrapers%20at%20night%2C%20hacker%20protagonist%20in%20trench%20coat%2C%20rain%20reflections%2C%20purple%20and%20magenta%20neon%2C%20cinematic%20mood',
    ),
    likes: 1892,
    commentCount: 258,
    createdAt: '2026-08-20T14:03:00Z',
  },
  {
    id: 'static-novel-03',
    type: 'novel',
    subtype: '星际言情',
    title: '星辰彼岸',
    content:
      '她是空间站首席植物学家，他是从深空沉睡了两百年才被唤醒的实验体。在飞往半人马座的漫长旅途中，一颗会开花的星球让他们相遇……\n"如果宇宙也懂爱，那我会让所有恒星同时亮起给你看。"',
    author: STATIC_AUTHORS.xingye,
    cover: COVER(
      'interstellar%20romance%20novel%20cover%2C%20two%20astronauts%20floating%20among%20nebulae%20and%20stars%2C%20soft%20cosmic%20pink%20and%20blue%20hues%2C%20emotional%20cinematic%20composition',
    ),
    likes: 1567,
    commentCount: 194,
    createdAt: '2026-08-16T20:45:00Z',
  },
  {
    id: 'static-novel-04',
    type: 'novel',
    subtype: '悬疑惊悚',
    title: '雾隐村怪谈',
    content:
      '十年前一夜之间全村消失的雾隐村，如今因一场暴雨再度出现在地图上。民俗学教授带着三名学生踏入那里，当晚，村口那棵老槐树上挂起了第一盏写着人名的白纸灯笼……\n而灯笼上的第一个名字，正是教授自己。',
    author: STATIC_AUTHORS.yeming,
    cover: COVER(
      'mystery%20horror%20novel%20cover%2C%20eerie%20foggy%20ancient%20Chinese%20village%20at%20twilight%2C%20paper%20lanterns%20in%20mist%2C%20suspenseful%20dark%20atmosphere%2C%20blue%20grey%20palette',
    ),
    likes: 978,
    commentCount: 421,
    createdAt: '2026-08-11T22:11:00Z',
  },

  // —— 图像 4 幅 ——
  {
    id: 'static-image-01',
    type: 'image',
    subtype: '概念原画',
    title: '赛博少女肖像',
    content: 'Client：Project Orion 概念设定组｜主视觉角色肖像。霓虹都市夜景下的新一代义体少女，紫荧头盔与半透明面罩的透光测试稿。',
    author: STATIC_AUTHORS.aria,
    cover: COVER(
      'cyberpunk%20anime%20girl%20portrait%2C%20neon%20city%20background%2C%20glowing%20purple%20visor%20and%20cybernetic%20implants%2C%20detailed%20digital%20concept%20art%2C%20cinematic%20lighting',
    ),
    likes: 3201,
    commentCount: 567,
    createdAt: '2026-08-24T11:27:00Z',
  },
  {
    id: 'static-image-02',
    type: 'image',
    subtype: '治愈插画',
    title: '森林清晨',
    content: '给春日绘本《林中小屋》画的跨页。晨曦从叶缝里漏下来，小鹿第一次走出灌木丛，遇见了拎着小篮子的松果精灵。',
    author: STATIC_AUTHORS.luxiao,
    cover: COVER(
      'cozy%20forest%20morning%20illustration%2C%20sunlight%20filtering%20through%20green%20leaves%2C%20little%20deer%20and%20mossy%20stones%2C%20warm%20peaceful%20watercolor%20style%2C%20soft%20pastel%20palette',
    ),
    likes: 2044,
    commentCount: 203,
    createdAt: '2026-08-19T08:05:00Z',
  },
  {
    id: 'static-image-03',
    type: 'image',
    subtype: '科幻设定',
    title: '机甲概念设计',
    content: 'MK-07「赤焰」重型陆战机甲三视图。双肩等离子炮组展开状态；腿部液压缓冲结构经过第三次迭代，可承受 2.3 米自由落体冲击。',
    author: STATIC_AUTHORS.mechK,
    cover: COVER(
      'sci-fi%20mecha%20robot%20concept%20design%2C%20heavy%20armored%20combat%20suit%2C%20detailed%20mechanical%20blueprints%20background%2C%20industrial%20grey%20and%20orange%20accents%2C%20cinematic%20render',
    ),
    likes: 1778,
    commentCount: 188,
    createdAt: '2026-08-14T16:40:00Z',
  },
  {
    id: 'static-image-04',
    type: 'image',
    subtype: '写实摄影',
    title: '古城老街',
    content: '西南边陲的建水古城。下午五点的金色夕阳刚好打透这条巷子，卖豆腐的奶奶把招牌上的字一一点亮。',
    author: STATIC_AUTHORS.luren,
    cover: COVER(
      'photorealistic%20old%20town%20street%20in%20China%2C%20stone%20pavement%2C%20traditional%20wooden%20shop%20fronts%2C%20warm%20golden%20hour%20sunset%2C%20cinematic%20street%20photography%20composition',
    ),
    likes: 1235,
    commentCount: 96,
    createdAt: '2026-08-10T17:50:00Z',
  },

  // —— 漫画 4 部 ——
  {
    id: 'static-comic-01',
    type: 'comic',
    subtype: '赛博朋克',
    title: '机甲少女娜娜',
    content:
      '第 1 话「地下拳场的少女」：被遗弃在第九区地下拳场的 14 岁少女娜娜，在一场"自愿改造"中被装上半套军用外骨骼——代价是她必须在一年之内替财阀打满 100 场不能输的比赛。',
    author: STATIC_AUTHORS.xinghui,
    cover: COVER(
      'manga%20cyberpunk%20girl%20with%20mecha%20suit%2C%20comic%20book%20cover%20style%2C%20dynamic%20action%20pose%2C%20bold%20ink%20lines%20with%20neon%20color%20accents%2C%20Japanese%20manga%20aesthetic',
    ),
    likes: 2888,
    commentCount: 444,
    createdAt: '2026-08-23T19:22:00Z',
  },
  {
    id: 'static-comic-02',
    type: 'comic',
    subtype: '古风奇幻',
    title: '山海奇谈录',
    content: '第 3 话「九尾·枫落」：青丘山下开茶馆的少年，在一个枫红满天的黄昏收留了一只受伤的小狐狸——第二天醒来，门口站着一位红裙姑娘，尾巴还没来得及收起来。',
    author: STATIC_AUTHORS.yuexia,
    cover: COVER(
      'Chinese%20mythology%20comic%20cover%2C%20nine-tailed%20fox%20spirit%20in%20ancient%20mountains%2C%20traditional%20ink%20wash%20manga%20style%2C%20golden%20clouds%20and%20red%20leaves%2C%20vertical%20composition',
    ),
    likes: 2102,
    commentCount: 276,
    createdAt: '2026-08-18T10:58:00Z',
  },
  {
    id: 'static-comic-03',
    type: 'comic',
    subtype: '校园青春',
    title: '毕业前的告白',
    content:
      '第一话「四月的樱花树下」：高中最后一个春天，不善言辞的文学社社长终于鼓起勇气，决定在樱花开到最盛的那天——向田径队的女主将告白。但他没想到，对方也正拿着一封粉色信封，向文学社走来。',
    author: STATIC_AUTHORS.qingtian,
    cover: COVER(
      'school%20romance%20manga%20cover%2C%20boy%20and%20girl%20under%20cherry%20blossom%20tree%2C%20school%20uniforms%2C%20soft%20pink%20spring%20petals%2C%20shoujo%20manga%20art%20style%2C%20emotional%20moment',
    ),
    likes: 1650,
    commentCount: 302,
    createdAt: '2026-08-13T13:10:00Z',
  },
  {
    id: 'static-comic-04',
    type: 'comic',
    subtype: '治愈日常',
    title: '深夜食堂物语',
    content:
      '今日菜单：酱油溏心蛋拌饭 + 一杯温清酒。\n客人：刚值完大夜班的护士姐姐，她今天在手术室里站了十一个小时，进门第一句话是——"老板，能让我哭一会儿吗？不哭出声，就一碗饭的时间。"',
    author: STATIC_AUTHORS.ashu,
    cover: COVER(
      'slice%20of%20life%20manga%20cover%2C%20cozy%20late%20night%20diner%2C%20old%20chef%20behind%20counter%20with%20warm%20lantern%20light%2C%20soft%20warm%20tones%2C%20iyashikei%20style',
    ),
    likes: 987,
    commentCount: 153,
    createdAt: '2026-08-10T23:04:00Z',
  },

  // —— 音频 4 个 ——
  {
    id: 'static-audio-01',
    type: 'audio',
    subtype: '有声书',
    title: '枕边故事·星空旅人',
    content:
      '全 40 集治愈系睡前故事。每晚 10 点更新，主播声声用温柔声线陪伴你入睡。\n本周更新 EP.18「月球背面有一家只在满月开门的书店」，已登顶本周助眠榜 TOP 1。',
    author: STATIC_AUTHORS.shengsheng,
    cover: COVER(
      'audiobook%20cover%20bedtime%20stories%2C%20dreamy%20starry%20night%20sky%20with%20moon%2C%20cozy%20cabin%20window%20with%20warm%20light%2C%20soft%20purple%20and%20blue%20gradient%20palette',
    ),
    likes: 2733,
    commentCount: 512,
    createdAt: '2026-08-22T21:33:00Z',
  },
  {
    id: 'static-audio-02',
    type: 'audio',
    subtype: 'BGM 专辑',
    title: '晨间钢琴·春日',
    content:
      '原创钢琴轻音乐专辑《春日》共 12 首。\n适合：晨间唤醒 · 咖啡馆背景 · 学习/工作专注 · 阅读配乐。制作人阿岚亲自在樱花季的日光花房录制，附无钢琴版本纯自然音轨。',
    author: STATIC_AUTHORS.alan,
    cover: COVER(
      'piano%20music%20album%20cover%2C%20white%20grand%20piano%20in%20morning%20light%20window%2C%20soft%20watercolor%20flowers%2C%20warm%20beige%20and%20cream%20palette%2C%20peaceful%20elegance',
    ),
    likes: 2012,
    commentCount: 186,
    createdAt: '2026-08-17T07:20:00Z',
  },
  {
    id: 'static-audio-03',
    type: 'audio',
    subtype: '悬疑播客',
    title: '都市怪谈·第 3 季',
    content:
      'S3E06「电梯只去不存在的 13 楼」已更新。\n都市传说类悬疑播客，每期一个来自真实听众投稿的诡异经历，主播夜航低温声线 + 电影级 BGM，胆小请不要独自收听。',
    author: STATIC_AUTHORS.yehang,
    cover: COVER(
      'horror%20podcast%20cover%2C%20dark%20city%20alley%20at%20night%20with%20mysterious%20foggy%20streetlamp%20glow%2C%20eerie%20shadows%2C%20dark%20teal%20and%20orange%20palette%2C%20suspenseful%20mood',
    ),
    likes: 1433,
    commentCount: 478,
    createdAt: '2026-08-12T23:50:00Z',
  },
  {
    id: 'static-audio-04',
    type: 'audio',
    subtype: '语言学习',
    title: '英语美文跟读',
    content:
      'Lily 老师《英语美文 100 篇》系列：\n每篇 5-8 分钟，中英对照 + 词汇讲解 + 慢速/常速双版本跟读。\n今日更新 #64「Youth」——Samuel Ullman 经典散文，附发音重点标注 PDF。',
    author: STATIC_AUTHORS.lily,
    cover: COVER(
      'language%20learning%20audio%20cover%2C%20open%20classic%20literature%20book%20with%20coffee%20cup%20next%20to%20it%2C%20soft%20warm%20desk%20light%2C%20english%20calligraphy%20style%20letters%20floating',
    ),
    likes: 822,
    commentCount: 74,
    createdAt: '2026-08-11T06:40:00Z',
  },

  // —— 视频 4 个 ——
  {
    id: 'static-video-01',
    type: 'video',
    subtype: 'AI 短片',
    title: '赛博都市·夜景漫游',
    content:
      '全片 2 分 45 秒，AI 辅助生成的赛博都市夜景漫游短片。\nMan TV 全流程工作流演示：剧本生成 → 分镜 → 图像一致性 → 视频生成 → 音效配乐一键完成，发布 3 天 120w+ 播放。',
    author: STATIC_AUTHORS.vision,
    cover: COVER(
      'AI%20short%20film%20cover%20cyberpunk%20city%20night%20tour%2C%20cinematic%20wide%20shot%20of%20neon%20skyline%20with%20flying%20vehicles%2C%20Blade%20Runner%20aesthetic%2C%20ultra%20detailed%20render',
    ),
    likes: 3102,
    commentCount: 611,
    createdAt: '2026-08-21T12:08:00Z',
  },
  {
    id: 'static-video-02',
    type: 'video',
    subtype: '国风动画',
    title: '古风舞剑·水墨动画',
    content:
      '墨影坊 × 洛阳博物馆联名：国风水墨动画短片《剑器行》，致敬杜甫《观公孙大娘弟子舞剑器行》。\n3 分钟 1200 帧全手写数字毛笔笔触，已入选 Bilibili 国创榜本周 TOP 3。',
    author: STATIC_AUTHORS.moying,
    cover: COVER(
      'Chinese%20ink%20wash%20animation%20cover%2C%20ancient%20warrior%20performing%20sword%20dance%2C%20dynamic%20brushstrokes%2C%20flowing%20white%20robes%2C%20bamboo%20forest%20background',
    ),
    likes: 2504,
    commentCount: 388,
    createdAt: '2026-08-15T15:48:00Z',
  },
  {
    id: 'static-video-03',
    type: 'video',
    subtype: '治愈短片',
    title: '萌宠日常 Vlog',
    content:
      '柯基「土豆」和橘猫「年糕」的一天。\n第 47 期：今天下了今年第一场秋雨，年糕第一次踩水后甩土豆一脸——主人在沙发上笑到相机都拿不稳。\n片尾有年糕的「洗澡花絮」千万不要错过！',
    author: STATIC_AUTHORS.maoqiu,
    cover: COVER(
      'cute%20pet%20vlog%20cover%2C%20fluffy%20corgi%20puppy%20and%20tabby%20cat%20napping%20together%20on%20cozy%20sofa%2C%20warm%20living%20room%20afternoon%20light%2C%20adorable%20and%20peaceful',
    ),
    likes: 1888,
    commentCount: 234,
    createdAt: '2026-08-12T09:30:00Z',
  },
  {
    id: 'static-video-04',
    type: 'video',
    subtype: '生活记录',
    title: '美食探店·深夜拉面',
    content:
      '隐藏在老巷子里开了 28 年的「阿源拉面」，凌晨 2 点还在排队。\n独家跟拍老板的熬汤全过程——用了 32 斤猪大骨和 11 种日式酱油，慢炖 14 小时的汤底到底是什么味道？',
    author: STATIC_AUTHORS.ale,
    cover: COVER(
      'food%20vlog%20cover%20late%20night%20ramen%20shop%2C%20steamy%20bowl%20of%20tonkotsu%20ramen%20with%20egg%20and%20chashu%2C%20close%20up%20cinematic%20food%20photography%2C%20warm%20tones',
    ),
    likes: 1109,
    commentCount: 142,
    createdAt: '2026-08-13T02:55:00Z',
  },
]

// 便于详情 fallback 时快速查找
export const STATIC_WORKS_BY_ID: Map<string, Work> = new Map(
  STATIC_WORKS_POOL.map((w) => [w.id, w]),
)

// 作品功能暂时关闭 — 后端保留管理接口，前端不显示发布入口
export const PUBLISH_ENABLED = false
