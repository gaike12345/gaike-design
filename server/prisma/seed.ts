/**
 * 数据库初始化脚本
 * =================
 * $ npm run seed
 *
 * 写入：
 * 1. 2 个演示登录用户（可直接登录前端 /login）
 * 2. 20 位作者（对应前端 STATIC_AUTHORS，每位就是作品的发布者）
 * 3. 20 件社区作品（与前端 CommunityPage.tsx 的 STATIC_WORKS_POOL 完全对齐：
 *    type / subtype / title / content / cover / likesCount / commentCount / createdAt）
 * 4. 每件作品按 commentCount 数量生成 demo 评论
 *
 * 幂等：重复执行时先 DELETE 旧数据再 INSERT，不会造成重复。
 */

import 'dotenv/config'
import prisma from '../src/lib/prisma'
import bcrypt from 'bcryptjs'
import { generateNextUid } from '../src/lib/uidGenerator'

// ========== 共用工具 ==========
const COVER = (encoded: string) =>
  `https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=${encoded}&image_size=landscape_4_3`

// 演示账号密码统一为 `password123`
const PASSWORD_HASH = bcrypt.hashSync('password123', 10)

// ========== 1) 20 位作者（与前端 STATIC_AUTHORS 同昵称/顺序） ==========
type AuthorSeed = {
  key: string
  nickname: string
  email: string
  bio: string
}

const AUTHORS: AuthorSeed[] = [
  { key: 'mo',     nickname: '墨流云',   email: 'moliu.yun@manktv.demo', bio: '擅长古风玄幻，十二年网文老笔杆。' },
  { key: 'ling',   nickname: '凌雪',     email: 'ling.xue@manktv.demo',  bio: '赛博科幻作者，霓虹雨夜型人格。' },
  { key: 'xingye', nickname: '星野',     email: 'xing.ye@manktv.demo',   bio: '写星辰大海，也写人类微小的爱。' },
  { key: 'yeming', nickname: '夜鸣',     email: 'ye.ming@manktv.demo',   bio: '民俗悬疑作家，擅长把鸡皮疙瘩写进字里行间。' },
  { key: 'aria',   nickname: '画师Aria', email: 'aria@manktv.demo',      bio: '概念原画 / 角色设定，八年游戏美术经验。' },
  { key: 'luxiao', nickname: '林间小鹿', email: 'luxiao@manktv.demo',    bio: '只画温柔的事物：阳光、植物、小动物。' },
  { key: 'mechK',  nickname: '机械师K',  email: 'mech.k@manktv.demo',    bio: '硬科幻机甲爱好者，三视图与内部结构控。' },
  { key: 'luren',  nickname: '旅人',     email: 'lu.ren@manktv.demo',    bio: '背着相机走完大半个中国的摄影师。' },
  { key: 'xinghui',nickname: '星绘',     email: 'xing.hui@manktv.demo',  bio: '黑白漫画主笔，线条狂热爱好者。' },
  { key: 'yuexia', nickname: '月下狐',   email: 'yuexia@manktv.demo',    bio: '古风奇幻漫画家，狐狸尾巴本人。' },
  { key: 'qingtian',nickname:'晴天',     email: 'qing.tian@manktv.demo', bio: '校园青春向，吃糖选手。' },
  { key: 'ashu',   nickname: '阿树',     email: 'a.shu@manktv.demo',     bio: '治愈日常漫画家，深夜食堂常驻。' },
  { key: 'shengsheng',nickname:'声声主播',email:'shengsheng@manktv.demo',bio: '配音演员，夜间电台主播，声控党福利。' },
  { key: 'alan',   nickname: '阿岚',     email: 'a.lan@manktv.demo',     bio: '独立音乐人，擅长钢琴 / Lo-fi / 轻音乐。' },
  { key: 'yehang', nickname: '夜航',     email: 'ye.hang@manktv.demo',   bio: '悬疑播客主理人，低温声线代表人。' },
  { key: 'lily',   nickname: 'Lily老师', email: 'lily.teacher@manktv.demo', bio: '英语教育 15 年，带你读遍英文美文。' },
  { key: 'vision', nickname: 'Vision',   email: 'vision@manktv.demo',    bio: 'AI 影像创作者，全流程工作流实验派。' },
  { key: 'moying', nickname: '墨影坊',   email: 'moying.fang@manktv.demo', bio: '国风动画工作室，数字水墨技术研发。' },
  { key: 'maoqiu', nickname: '毛球球',   email: 'maoqiu.qiu@manktv.demo', bio: '柯基「土豆」和橘猫「年糕」的铲屎官。' },
  { key: 'ale',    nickname: '吃货阿乐', email: 'a.le@manktv.demo',      bio: '探店 Vlog 博主，280 斤体重是职业勋章。' },
]

// ========== 2) 20 件社区作品（与前端 CommunityPage.tsx STATIC_WORKS_POOL 完全一致） ==========
type WorkSeed = {
  id: string
  type: 'novel' | 'image' | 'comic' | 'audio' | 'video'
  subtype: string
  title: string
  content: string
  cover: string
  authorKey: AuthorSeed['key']
  likesCount: number
  commentCount: number
  createdAt: string
}

const WORKS: WorkSeed[] = [
  { id:'static-novel-01', type:'novel', subtype:'古风玄幻', title:'云海仙踪',
    content:'青云之上，云海翻涌。少年背着一柄断剑走出十万大山，踏入仙门，却在第一日的灵根测试上惹出惊天异象……\n墨色长剑横空，斩断三千情丝；道心一念，成魔成仙皆在今朝。',
    cover:COVER('Chinese%20ancient%20fantasy%20novel%20cover%2C%20misty%20mountains%2C%20celestial%20sword%20immortal%20in%20flowing%20robes%2C%20traditional%20Chinese%20ink%20painting%20style%2C%20jade%20green%20and%20gold%20palette%2C%20cinematic%20lighting'),
    authorKey:'mo', likesCount:2486, commentCount:312, createdAt:'2026-08-25T09:12:00Z'},
  { id:'static-novel-02', type:'novel', subtype:'科幻都市', title:'赛博迷城',
    content:'2099 年的新沪城，霓虹与雨水交织。地下黑客凌在一场数据交易中意外获得一段被加密的记忆——那属于三年前死去的自己。\n义体、脑机接口、企业财阀、雨夜追杀，所有线索都指向浮空区的一座无主服务器。',
    cover:COVER('cyberpunk%20sci-fi%20city%20novel%20cover%2C%20neon%20lit%20skyscrapers%20at%20night%2C%20hacker%20protagonist%20in%20trench%20coat%2C%20rain%20reflections%2C%20purple%20and%20magenta%20neon%2C%20cinematic%20mood'),
    authorKey:'ling', likesCount:1892, commentCount:258, createdAt:'2026-08-20T14:03:00Z'},
  { id:'static-novel-03', type:'novel', subtype:'星际言情', title:'星辰彼岸',
    content:'她是空间站首席植物学家，他是从深空沉睡了两百年才被唤醒的实验体。在飞往半人马座的漫长旅途中，一颗会开花的星球让他们相遇……\n"如果宇宙也懂爱，那我会让所有恒星同时亮起给你看。"',
    cover:COVER('interstellar%20romance%20novel%20cover%2C%20two%20astronauts%20floating%20among%20nebulae%20and%20stars%2C%20soft%20cosmic%20pink%20and%20blue%20hues%2C%20emotional%20cinematic%20composition'),
    authorKey:'xingye', likesCount:1567, commentCount:194, createdAt:'2026-08-16T20:45:00Z'},
  { id:'static-novel-04', type:'novel', subtype:'悬疑惊悚', title:'雾隐村怪谈',
    content:'十年前一夜之间全村消失的雾隐村，如今因一场暴雨再度出现在地图上。民俗学教授带着三名学生踏入那里，当晚，村口那棵老槐树上挂起了第一盏写着人名的白纸灯笼……\n而灯笼上的第一个名字，正是教授自己。',
    cover:COVER('mystery%20horror%20novel%20cover%2C%20eerie%20foggy%20ancient%20Chinese%20village%20at%20twilight%2C%20paper%20lanterns%20in%20mist%2C%20suspenseful%20dark%20atmosphere%2C%20blue%20grey%20palette'),
    authorKey:'yeming', likesCount:978, commentCount:421, createdAt:'2026-08-11T22:11:00Z'},
  { id:'static-image-01', type:'image', subtype:'概念原画', title:'赛博少女肖像',
    content:'Client：Project Orion 概念设定组｜主视觉角色肖像。霓虹都市夜景下的新一代义体少女，紫荧头盔与半透明面罩的透光测试稿。',
    cover:COVER('cyberpunk%20anime%20girl%20portrait%2C%20neon%20city%20background%2C%20glowing%20purple%20visor%20and%20cybernetic%20implants%2C%20detailed%20digital%20concept%20art%2C%20cinematic%20lighting'),
    authorKey:'aria', likesCount:3201, commentCount:567, createdAt:'2026-08-24T11:27:00Z'},
  { id:'static-image-02', type:'image', subtype:'治愈插画', title:'森林清晨',
    content:'给春日绘本《林中小屋》画的跨页。晨曦从叶缝里漏下来，小鹿第一次走出灌木丛，遇见了拎着小篮子的松果精灵。',
    cover:COVER('cozy%20forest%20morning%20illustration%2C%20sunlight%20filtering%20through%20green%20leaves%2C%20little%20deer%20and%20mossy%20stones%2C%20warm%20peaceful%20watercolor%20style%2C%20soft%20pastel%20palette'),
    authorKey:'luxiao', likesCount:2044, commentCount:203, createdAt:'2026-08-19T08:05:00Z'},
  { id:'static-image-03', type:'image', subtype:'科幻设定', title:'机甲概念设计',
    content:'MK-07「赤焰」重型陆战机甲三视图。双肩等离子炮组展开状态；腿部液压缓冲结构经过第三次迭代，可承受 2.3 米自由落体冲击。',
    cover:COVER('sci-fi%20mecha%20robot%20concept%20design%2C%20heavy%20armored%20combat%20suit%2C%20detailed%20mechanical%20blueprints%20background%2C%20industrial%20grey%20and%20orange%20accents%2C%20cinematic%20render'),
    authorKey:'mechK', likesCount:1778, commentCount:188, createdAt:'2026-08-14T16:40:00Z'},
  { id:'static-image-04', type:'image', subtype:'写实摄影', title:'古城老街',
    content:'西南边陲的建水古城。下午五点的金色夕阳刚好打透这条巷子，卖豆腐的奶奶把招牌上的字一一点亮。',
    cover:COVER('photorealistic%20old%20town%20street%20in%20China%2C%20stone%20pavement%2C%20traditional%20wooden%20shop%20fronts%2C%20warm%20golden%20hour%20sunset%2C%20cinematic%20street%20photography%20composition'),
    authorKey:'luren', likesCount:1235, commentCount:96, createdAt:'2026-08-10T17:50:00Z'},
  { id:'static-comic-01', type:'comic', subtype:'赛博朋克', title:'机甲少女娜娜',
    content:'第 1 话「地下拳场的少女」：被遗弃在第九区地下拳场的 14 岁少女娜娜，在一场"自愿改造"中被装上半套军用外骨骼——代价是她必须在一年之内替财阀打满 100 场不能输的比赛。',
    cover:COVER('manga%20cyberpunk%20girl%20with%20mecha%20suit%2C%20comic%20book%20cover%20style%2C%20dynamic%20action%20pose%2C%20bold%20ink%20lines%20with%20neon%20color%20accents%2C%20Japanese%20manga%20aesthetic'),
    authorKey:'xinghui', likesCount:2888, commentCount:444, createdAt:'2026-08-23T19:22:00Z'},
  { id:'static-comic-02', type:'comic', subtype:'古风奇幻', title:'山海奇谈录',
    content:'第 3 话「九尾·枫落」：青丘山下开茶馆的少年，在一个枫红满天的黄昏收留了一只受伤的小狐狸——第二天醒来，门口站着一位红裙姑娘，尾巴还没来得及收起来。',
    cover:COVER('Chinese%20mythology%20comic%20cover%2C%20nine-tailed%20fox%20spirit%20in%20ancient%20mountains%2C%20traditional%20ink%20wash%20manga%20style%2C%20golden%20clouds%20and%20red%20leaves%2C%20vertical%20composition'),
    authorKey:'yuexia', likesCount:2102, commentCount:276, createdAt:'2026-08-18T10:58:00Z'},
  { id:'static-comic-03', type:'comic', subtype:'校园青春', title:'毕业前的告白',
    content:'第一话「四月的樱花树下」：高中最后一个春天，不善言辞的文学社社长终于鼓起勇气，决定在樱花开到最盛的那天——向田径队的女主将告白。但他没想到，对方也正拿着一封粉色信封，向文学社走来。',
    cover:COVER('school%20romance%20manga%20cover%2C%20boy%20and%20girl%20under%20cherry%20blossom%20tree%2C%20school%20uniforms%2C%20soft%20pink%20spring%20petals%2C%20shoujo%20manga%20art%20style%2C%20emotional%20moment'),
    authorKey:'qingtian', likesCount:1650, commentCount:302, createdAt:'2026-08-13T13:10:00Z'},
  { id:'static-comic-04', type:'comic', subtype:'治愈日常', title:'深夜食堂物语',
    content:'今日菜单：酱油溏心蛋拌饭 + 一杯温清酒。\n客人：刚值完大夜班的护士姐姐，她今天在手术室里站了十一个小时，进门第一句话是——"老板，能让我哭一会儿吗？不哭出声，就一碗饭的时间。"',
    cover:COVER('slice%20of%20life%20manga%20cover%2C%20cozy%20late%20night%20diner%2C%20old%20chef%20behind%20counter%20with%20warm%20lantern%20light%2C%20soft%20warm%20tones%2C%20iyashikei%20style'),
    authorKey:'ashu', likesCount:987, commentCount:153, createdAt:'2026-08-10T23:04:00Z'},
  { id:'static-audio-01', type:'audio', subtype:'有声书', title:'枕边故事·星空旅人',
    content:'全 40 集治愈系睡前故事。每晚 10 点更新，主播声声用温柔声线陪伴你入睡。\n本周更新 EP.18「月球背面有一家只在满月开门的书店」，已登顶本周助眠榜 TOP 1。',
    cover:COVER('audiobook%20cover%20bedtime%20stories%2C%20dreamy%20starry%20night%20sky%20with%20moon%2C%20cozy%20cabin%20window%20with%20warm%20light%2C%20soft%20purple%20and%20blue%20gradient%20palette'),
    authorKey:'shengsheng', likesCount:2733, commentCount:512, createdAt:'2026-08-22T21:33:00Z'},
  { id:'static-audio-02', type:'audio', subtype:'BGM 专辑', title:'晨间钢琴·春日',
    content:'原创钢琴轻音乐专辑《春日》共 12 首。\n适合：晨间唤醒 · 咖啡馆背景 · 学习/工作专注 · 阅读配乐。制作人阿岚亲自在樱花季的日光花房录制，附无钢琴版本纯自然音轨。',
    cover:COVER('piano%20music%20album%20cover%2C%20white%20grand%20piano%20in%20morning%20light%20window%2C%20soft%20watercolor%20flowers%2C%20warm%20beige%20and%20cream%20palette%2C%20peaceful%20elegance'),
    authorKey:'alan', likesCount:2012, commentCount:186, createdAt:'2026-08-17T07:20:00Z'},
  { id:'static-audio-03', type:'audio', subtype:'悬疑播客', title:'都市怪谈·第 3 季',
    content:'S3E06「电梯只去不存在的 13 楼」已更新。\n都市传说类悬疑播客，每期一个来自真实听众投稿的诡异经历，主播夜航低温声线 + 电影级 BGM，胆小请不要独自收听。',
    cover:COVER('horror%20podcast%20cover%2C%20dark%20city%20alley%20at%20night%20with%20mysterious%20foggy%20streetlamp%20glow%2C%20eerie%20shadows%2C%20dark%20teal%20and%20orange%20palette%2C%20suspenseful%20mood'),
    authorKey:'yehang', likesCount:1433, commentCount:478, createdAt:'2026-08-12T23:50:00Z'},
  { id:'static-audio-04', type:'audio', subtype:'语言学习', title:'英语美文跟读',
    content:'Lily 老师《英语美文 100 篇》系列：\n每篇 5-8 分钟，中英对照 + 词汇讲解 + 慢速/常速双版本跟读。\n今日更新 #64「Youth」——Samuel Ullman 经典散文，附发音重点标注 PDF。',
    cover:COVER('language%20learning%20audio%20cover%2C%20open%20classic%20literature%20book%20with%20coffee%20cup%20next%20to%20it%2C%20soft%20warm%20desk%20light%2C%20english%20calligraphy%20style%20letters%20floating'),
    authorKey:'lily', likesCount:822, commentCount:74, createdAt:'2026-08-11T06:40:00Z'},
  { id:'static-video-01', type:'video', subtype:'AI 短片', title:'赛博都市·夜景漫游',
    content:'全片 2 分 45 秒，AI 辅助生成的赛博都市夜景漫游短片。\nMan TV 全流程工作流演示：剧本生成 → 分镜 → 图像一致性 → 视频生成 → 音效配乐一键完成，发布 3 天 120w+ 播放。',
    cover:COVER('AI%20short%20film%20cover%20cyberpunk%20city%20night%20tour%2C%20cinematic%20wide%20shot%20of%20neon%20skyline%20with%20flying%20vehicles%2C%20Blade%20Runner%20aesthetic%2C%20ultra%20detailed%20render'),
    authorKey:'vision', likesCount:3102, commentCount:611, createdAt:'2026-08-21T12:08:00Z'},
  { id:'static-video-02', type:'video', subtype:'国风动画', title:'古风舞剑·水墨动画',
    content:'墨影坊 × 洛阳博物馆联名：国风水墨动画短片《剑器行》，致敬杜甫《观公孙大娘弟子舞剑器行》。\n3 分钟 1200 帧全手写数字毛笔笔触，已入选 Bilibili 国创榜本周 TOP 3。',
    cover:COVER('Chinese%20ink%20wash%20animation%20cover%2C%20ancient%20warrior%20performing%20sword%20dance%2C%20dynamic%20brushstrokes%2C%20flowing%20white%20robes%2C%20bamboo%20forest%20background'),
    authorKey:'moying', likesCount:2504, commentCount:388, createdAt:'2026-08-15T15:48:00Z'},
  { id:'static-video-03', type:'video', subtype:'治愈短片', title:'萌宠日常 Vlog',
    content:'柯基「土豆」和橘猫「年糕」的一天。\n第 47 期：今天下了今年第一场秋雨，年糕第一次踩水后甩土豆一脸——主人在沙发上笑到相机都拿不稳。\n片尾有年糕的「洗澡花絮」千万不要错过！',
    cover:COVER('cute%20pet%20vlog%20cover%2C%20fluffy%20corgi%20puppy%20and%20tabby%20cat%20napping%20together%20on%20cozy%20sofa%2C%20warm%20living%20room%20afternoon%20light%2C%20adorable%20and%20peaceful'),
    authorKey:'maoqiu', likesCount:1888, commentCount:234, createdAt:'2026-08-12T09:30:00Z'},
  { id:'static-video-04', type:'video', subtype:'生活记录', title:'美食探店·深夜拉面',
    content:'隐藏在老巷子里开了 28 年的「阿源拉面」，凌晨 2 点还在排队。\n独家跟拍老板的熬汤全过程——用了 32 斤猪大骨和 11 种日式酱油，慢炖 14 小时的汤底到底是什么味道？',
    cover:COVER('food%20vlog%20cover%20late%20night%20ramen%20shop%2C%20steamy%20bowl%20of%20tonkotsu%20ramen%20with%20egg%20and%20chashu%2C%20close%20up%20cinematic%20food%20photography%2C%20warm%20tones'),
    authorKey:'ale', likesCount:1109, commentCount:142, createdAt:'2026-08-13T02:55:00Z'},
]

// ========== 3) 评论模板（按每件作品 commentCount 生成） ==========
const COMMENT_TEMPLATES = [
  '太喜欢这个风格了！已经关注大大 🥹',
  '一口气看完，起鸡皮疙瘩，后续在哪看？',
  '封面太好看了，请问可以用作头像吗？',
  '催更催更！这个题材我能追一万年 🫶',
  '这个分镜/节奏真的好棒，学废了！',
  '睡前听/看的，结果激动到现在还没睡着……',
  '作者大大是什么神仙，为什么每一件作品都正好戳我审美！',
  '强烈建议影视化/出书/出实体专辑！',
  '从主页推荐过来的，看完直接关注，谢谢算法 🙏',
  '这个角色我可以！画得/写得/做得太有魅力了 ❤️',
  '今天刷到第五遍了，还是会停下来慢慢品。',
  '细节控狂喜，看了三遍发现好多伏笔！',
  '请问是 AI 辅助的吗？质感真的好到不像人类作品……',
  '同求教程/笔刷/配乐/使用到的工作流！',
  '虽然不是我平时看的类型，但点开后：哦这该死的好看。',
  '评论区打卡：第 999 条是我的！',
  '已经分享给三个朋友了，都说要追更！',
  '看到这个作品的瞬间，我知道今天的摸鱼时间有归处了。',
  '这个结尾/高潮/转场，直接封神。',
  '谢谢作者，今天心情不好，看完你的作品终于笑了。',
]

function rand<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length]
}

// ========== 主函数 ==========
async function main() {
  console.log('\n🌱 [Seed] 开始初始化数据库...')

  // ===== 不变量：超级管理员只能有一个（固定邮箱） —— Write-once security baseline. =====
  const UNIQUE_SUPERADMIN_EMAIL = 'admin@manktv.com'

  // 0) 幂等清理（先删关联表，再删 seed 账号；其它生产账号保留）
  console.log('  🧹 清理旧 seed 数据（幂等）...')
  const seedEmails = AUTHORS.map(a => a.email).concat(['demo@manktv.com', UNIQUE_SUPERADMIN_EMAIL, 'moderator@manktv.com'])
  await prisma.$transaction([
    prisma.like.deleteMany({}),
    prisma.comment.deleteMany({}),
    prisma.work.deleteMany({}),
    prisma.subscription.deleteMany({}),
    prisma.chapter.deleteMany({}),
    prisma.volume.deleteMany({}),
    prisma.project.deleteMany({}),
    prisma.userQuota.deleteMany({ where: { user: { email: { in: seedEmails } } } }),
    prisma.user.deleteMany({ where: { email: { in: seedEmails } } }),
    // 全局纠偏：任何其它 superadmin（非唯一邮箱）一律在 seed 阶段降回 admin → 零破坏不变量
    prisma.user.updateMany({ where: { role: 'superadmin', NOT: { email: UNIQUE_SUPERADMIN_EMAIL } }, data: { role: 'admin' } }),
  ])

  // 1) 创建 3 个基准登录账号 + 20 位作者
  //    🔴 超级管理员（唯一） admin@manktv.com / password123 / 昵称：Man TV 运营
  //    🟠 管理员           moderator@manktv.com / password123 / 昵称：审核员
  //    🟢 普通用户         demo@manktv.com / password123 / 昵称：演示用户
  console.log('  👤 创建基准账号 + 20 位作者...')

  const demoUser = await prisma.user.create({
    data: { uid: await generateNextUid(), email: 'demo@manktv.com', password: PASSWORD_HASH, nickname: '演示用户', role: 'user', bio: '前端登录演示账号。密码：password123' },
  })
  const modUser = await prisma.user.create({
    data: { uid: await generateNextUid(), email: 'moderator@manktv.com', password: PASSWORD_HASH, nickname: '审核员', role: 'admin', bio: '社区内容审核账号。密码：password123' },
  })
  const adminUser = await prisma.user.create({
    data: { uid: await generateNextUid(), email: UNIQUE_SUPERADMIN_EMAIL, password: PASSWORD_HASH, nickname: 'Man TV 运营', role: 'superadmin', bio: '系统唯一超级管理员（系统锁死，降级/提权到其它邮箱均会被服务端回滚）。密码：password123' },
  })

  // 启动期幂等纠偏：若 DB 已有其它 superadmin（迁移遗留），一律降为 admin → 保证全局只有 1 个。
  const stragglers = await prisma.user.findMany({ where: { role: 'superadmin', NOT: { email: UNIQUE_SUPERADMIN_EMAIL } }, select: { id: true, email: true } })
  if (stragglers.length) {
    console.log(`  ⚠️  启动纠偏：发现 ${stragglers.length} 个非法 superadmin，强制降级为 admin →`, stragglers)
    await prisma.user.updateMany({ where: { id: { in: stragglers.map(s => s.id) } }, data: { role: 'admin' } })
  }
  const superCount = await prisma.user.count({ where: { role: 'superadmin' } })
  if (superCount !== 1) {
    throw new Error(`[Seed] 超级管理员不变量破坏：期望 1 个，实际 ${superCount}（已中止）`)
  }
  const superRow = await prisma.user.findFirst({ where: { role: 'superadmin' }, select: { email: true } })
  if (superRow?.email !== UNIQUE_SUPERADMIN_EMAIL) {
    throw new Error(`[Seed] 超级管理员邮箱不变量破坏：期望 ${UNIQUE_SUPERADMIN_EMAIL}，实际 ${superRow?.email}`)
  }
  console.log(`  ✅ 唯一性校验通过：superadmin 计数 = ${superCount}，邮箱 = ${superRow!.email}`)

  const authorByKey = new Map<string, { id: string }>()
  for (const a of AUTHORS) {
    const u = await prisma.user.create({
      data: { uid: await generateNextUid(), email: a.email, password: PASSWORD_HASH, nickname: a.nickname, role: 'creator', bio: a.bio },
    })
    authorByKey.set(a.key, { id: u.id })
  }

  // 2) 创建 20 件作品
  console.log('  🎨 创建 20 件社区作品...')
  for (const w of WORKS) {
    const authorId = authorByKey.get(w.authorKey)!.id
    await prisma.work.create({
      data: {
        id: w.id,
        title: w.title,
        type: w.type,
        subtype: w.subtype,
        content: w.content,
        cover: w.cover,
        likesCount: w.likesCount,
        userId: authorId,
        createdAt: new Date(w.createdAt),
      },
    })
  }

  // 3) 每件作品生成 demo 评论
  console.log('  💬 批量生成评论...')
  let totalComments = 0
  for (let wi = 0; wi < WORKS.length; wi++) {
    const w = WORKS[wi]
    const count = Math.min(w.commentCount, 80)
    const insertMany: Promise<any>[] = []
    for (let i = 0; i < count; i++) {
      const authorKeys = AUTHORS.map(a => a.key)
      const commenterIdx = (wi + i * 3 + 1) % authorKeys.length
      const commenterKey = authorKeys[commenterIdx]
      const commenterId = authorByKey.get(commenterKey)!.id
      const text = rand(COMMENT_TEMPLATES, wi * 97 + i * 13)
      const createdAt = new Date(Date.parse(w.createdAt) + (i + 1) * 1000 * 60 * (10 + (i % 180)))
      insertMany.push(prisma.comment.create({
        data: { content: text, workId: w.id, userId: commenterId, createdAt },
      }))
      if (insertMany.length >= 200) {
        await prisma.$transaction(insertMany)
        insertMany.length = 0
      }
      totalComments++
    }
    if (insertMany.length) await prisma.$transaction(insertMany)
  }

  // 4) 演示账号 + 运营账号 + 前 10 位作者，每人点赞前 5 件人气作品
  console.log('  ❤️  写入演示点赞...')
  const topIds = [...WORKS].sort((a, b) => b.likesCount - a.likesCount).slice(0, 5).map(w => w.id)
  const fanIds = [demoUser.id, adminUser.id].concat(
    AUTHORS.slice(0, 10).map(a => authorByKey.get(a.key)!.id)
  )
  const likeTx: Promise<any>[] = []
  for (const uid of fanIds) {
    for (const wid of topIds) {
      likeTx.push(prisma.like.create({ data: { userId: uid, workId: wid } }))
    }
  }
  await prisma.$transaction(likeTx)

  // 同步点赞计数：确保 Work.likesCount = Like 表实际记录数（遵守架构不变量 FF-016）
  console.log('  🔄 同步点赞计数...')
  const likeCounts = await prisma.like.groupBy({
    by: ['workId'],
    _count: { workId: true },
  })
  const likeCountMap = new Map(likeCounts.map(lc => [lc.workId, lc._count.workId]))
  const allWorks = await prisma.work.findMany({ select: { id: true } })
  const syncTx = allWorks.map(w =>
    prisma.work.update({
      where: { id: w.id },
      data: { likesCount: likeCountMap.get(w.id) || 0 },
    })
  )
  await Promise.all(syncTx)
  console.log(`  ✅ 已同步 ${allWorks.length} 个作品的点赞计数`)


  // 5) AI 供应商 + 模型种子数据
  console.log('  🤖 写入 AI 供应商 + 模型种子数据...')
  await prisma.aIProvider.deleteMany({})
  await prisma.aIModel.deleteMany({})

  const providers = await Promise.all([
    prisma.aIProvider.create({ data: { name: 'pollinations', displayName: 'Pollinations', type: 'image', baseUrl: 'https://image.pollinations.ai/prompt/', apiKeyEnv: 'POLLINATIONS_API_KEY', status: 'active' } }),
    prisma.aIProvider.create({ data: { name: 'pollinations-video', displayName: 'Pollinations Video', type: 'video', baseUrl: 'https://gen.pollinations.ai/video/', apiKeyEnv: 'POLLINATIONS_API_KEY', status: 'active' } }),
    prisma.aIProvider.create({ data: { name: 'kling-video', displayName: '可灵视频（阿里云百炼）', type: 'video', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', status: 'active' } }),
    prisma.aIProvider.create({ data: { name: 'zhipu', displayName: '智谱 GLM', type: 'llm', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', apiKeyEnv: 'ZHIPU_API_KEY', status: 'active' } }),
    prisma.aIProvider.create({ data: { name: 'dashscope', displayName: '通义千问', type: 'multimodal', baseUrl: 'https://dashscope.aliyuncs.com/api/v1', apiKeyEnv: 'DASHSCOPE_API_KEY', status: 'active' } }),
  ])
  const [pPollinations, pPollinationsVideo, pKlingVideo, pZhipu, pDashscope] = providers

  // Image 模型配置（与 server/src/lib/imageModels.ts 兜底一致）
  // SDXL 基础模型：仅 1:1 比例，Pollinations 免费层实际输出约 768×768
  const SDXL_CONFIG = JSON.stringify({
    ratios: [
      { id: '1:1', label: '1:1', w: 768, h: 768 },
    ],
    resolutions: [
      { id: 'standard', label: '标准', quality: '清晰画质', desc: '推荐', multiplier: 1.0 },
    ],
    defaultRatio: '1:1',
    defaultResolution: 'standard',
    maxBatch: 4,
    features: { negativePrompt: true, seed: true, enhance: false },
  })

  // ===== Video 模型配置（6 个精选，Pollinations 视频 API）=====
  // 每个模型独立配置：时长、分辨率、比例、能力、基础价（5秒/720p 基准）

  // 入门体验：最便宜，480p，5秒固定
  const VIDEO_WANFAST_CONFIG = JSON.stringify({
    durations: [{ id: '5s', label: '5秒', value: 5 }],
    defaultDuration: '5s',
    resolutions: [{ id: '480p', label: '480p', multiplier: 1.0 }],
    defaultResolution: '480p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: false,
    baseCostPerSecond: 15,
  })

  // 性价比：便宜 + 720p
  const VIDEO_PVIDEO_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: false,
    baseCostPerSecond: 30,
  })

  // 标准推荐：稳定通用，720p
  const VIDEO_SEEDANCE_PRO_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '480p', label: '480p', multiplier: 1.0 },
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: false,
    baseCostPerSecond: 36,
  })

  // 带音频：自带立体声
  const VIDEO_MINIMAX_CONFIG = JSON.stringify({
    durations: [{ id: '5s', label: '5秒', value: 5 }],
    defaultDuration: '5s',
    resolutions: [
      { id: '480p', label: '480p', multiplier: 1.0 },
      { id: '768p', label: '768p', multiplier: 1.0 },
      { id: '2k', label: '2K', multiplier: 1.0 },
    ],
    defaultResolution: '480p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: false,
    supportsAudio: true,
    baseCostPerSecond: 72,
  })

  // Veo：Google 出品，电影级画质
  const VIDEO_VEO_CONFIG = JSON.stringify({
    durations: [
      { id: '4s', label: '4秒', value: 4 },
      { id: '6s', label: '6秒', value: 6 },
      { id: '8s', label: '8秒', value: 8 },
    ],
    defaultDuration: '4s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: true,
    baseCostPerSecond: 115,
  })

  // 高质量全能：wan-pro，支持参考图/视频/音频
  const VIDEO_WANPRO_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
      { id: '15s', label: '15秒', value: 15 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: true,
    baseCostPerSecond: 144,
  })

  // ====== 可灵 Kling（阿里云百炼）======
  // 性价比 Turbo：快，固定音画同出
  const VIDEO_KLING_TURBO_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.5 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16', '1:1'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: true,
    baseCostPerSecond: 16,
  })

  // 标准版：支持 4K，首尾帧
  const VIDEO_KLING_V3_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
      { id: '15s', label: '15秒', value: 15 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.5 },
      { id: '4k', label: '4K', multiplier: 3.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16', '1:1'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: true,
    baseCostPerSecond: 24,
  })

  // 全能版：参考图/参考视频/视频编辑
  const VIDEO_KLING_OMNI_CONFIG = JSON.stringify({
    durations: [
      { id: '5s', label: '5秒', value: 5 },
      { id: '10s', label: '10秒', value: 10 },
      { id: '15s', label: '15秒', value: 15 },
    ],
    defaultDuration: '5s',
    resolutions: [
      { id: '720p', label: '720p', multiplier: 1.0 },
      { id: '1080p', label: '1080p', multiplier: 1.5 },
      { id: '4k', label: '4K', multiplier: 3.0 },
    ],
    defaultResolution: '720p',
    ratios: ['16:9', '9:16', '1:1'],
    defaultRatio: '16:9',
    supportsImg2Video: true,
    supportsAudio: true,
    baseCostPerSecond: 40,
  })

  const MODELS_SEED = [
    // image — 仅保留 SDXL 基础
    { name: 'sdxl', displayName: 'SDXL 基础', type: 'image', providerId: pPollinations.id, tag: '通用', desc: '稳定通用大模型', costTokens: 20, sort: 1, config: SDXL_CONFIG },
    // novel
    { name: 'glm-4', displayName: 'GLM-4', type: 'novel', providerId: pZhipu.id, tag: '通用', desc: '智谱通用大模型', costTokens: 20, sort: 1 },
    { name: 'qwen-max', displayName: '通义千问 Max', type: 'novel', providerId: pDashscope.id, tag: '长文本', desc: '阿里通义大模型', costTokens: 30, sort: 2 },
    { name: 'gpt-4o', displayName: 'GPT-4o', type: 'novel', providerId: pZhipu.id, tag: '高质量', desc: 'OpenAI旗舰模型', costTokens: 50, sort: 3 },
    // comic
    { name: 'comic-pro', displayName: '漫画 Pro', type: 'comic', providerId: pDashscope.id, tag: '专业', desc: '漫画分镜专用', costTokens: 150, sort: 1 },
    { name: 'guoman-comic', displayName: '国漫专用', type: 'comic', providerId: pDashscope.id, tag: '风格', desc: '中文漫画优化', costTokens: 240, sort: 2 },
    // audio
    { name: 'tts-pro', displayName: 'TTS Pro', type: 'audio', providerId: pDashscope.id, tag: '语音合成', desc: '高质量文本转语音', costTokens: 25, sort: 1 },
    { name: 'voice-clone', displayName: '声音克隆', type: 'audio', providerId: pDashscope.id, tag: '克隆', desc: '个性化声音复刻', costTokens: 100, sort: 2 },
    // video — Pollinations 视频模型（6 个精选，4 档分层）
    { name: 'wan-fast', displayName: 'Wan 快速版', type: 'video', providerId: pPollinationsVideo.id, tag: '体验', desc: '入门体验，480p 5秒，快速预览', costTokens: 75, sort: 1, config: VIDEO_WANFAST_CONFIG },
    { name: 'p-video', displayName: 'Pruna Video', type: 'video', providerId: pPollinationsVideo.id, tag: '性价比', desc: '便宜好用，720p/1080p', costTokens: 150, sort: 2, config: VIDEO_PVIDEO_CONFIG },
    { name: 'seedance-pro', displayName: 'Seedance Pro', type: 'video', providerId: pPollinationsVideo.id, tag: '推荐', desc: '稳定通用，480p/720p/1080p', costTokens: 180, sort: 3, config: VIDEO_SEEDANCE_PRO_CONFIG },
    { name: 'minimax-h3', displayName: 'MiniMax H3', type: 'video', providerId: pPollinationsVideo.id, tag: '带音频', desc: '自带立体声，480p/768p/2K', costTokens: 360, sort: 4, config: VIDEO_MINIMAX_CONFIG },
    { name: 'veo', displayName: 'Veo 3.1 Fast', type: 'video', providerId: pPollinationsVideo.id, tag: '高质量', desc: 'Google出品，720p/1080p，支持音频', costTokens: 460, sort: 5, config: VIDEO_VEO_CONFIG },
    { name: 'wan-pro', displayName: 'Wan Pro', type: 'video', providerId: pPollinationsVideo.id, tag: '专业', desc: '高质量全能，支持参考图/视频/音频', costTokens: 720, sort: 6, config: VIDEO_WANPRO_CONFIG },
    // video — 可灵 Kling（国产，阿里云百炼）
    { name: 'kling-v3-turbo', displayName: '可灵 Turbo', type: 'video', providerId: pKlingVideo.id, tag: '国产·快', desc: '性价比首选，720p/1080p，自带音频', costTokens: 80, sort: 11, config: VIDEO_KLING_TURBO_CONFIG },
    { name: 'kling-v3', displayName: '可灵 V3', type: 'video', providerId: pKlingVideo.id, tag: '国产·推荐', desc: '标准画质，720p/1080p/4K，首尾帧', costTokens: 120, sort: 12, config: VIDEO_KLING_V3_CONFIG },
    { name: 'kling-v3-omni', displayName: '可灵 Omni', type: 'video', providerId: pKlingVideo.id, tag: '国产·专业', desc: '全能版，参考图/参考视频/视频编辑', costTokens: 200, sort: 13, config: VIDEO_KLING_OMNI_CONFIG },
  ]
  for (const m of MODELS_SEED) {
    await prisma.aIModel.upsert({ where: { name: m.name }, update: m, create: m })
  }


  // 6) 用户额度初始化
  console.log('  💰 写入用户额度种子数据...')
  const allUsers = await prisma.user.findMany()
  for (const u of allUsers) {
    await prisma.userQuota.upsert({
      where: { userId: u.id },
      update: {},
      create: {
        userId: u.id,
        totalTokens: (u.role === 'admin' || u.role === 'superadmin') ? 999999999 : 1000,
        usedTokens: 0,
        remainingTokens: (u.role === 'admin' || u.role === 'superadmin') ? 999999999 : 1000,
        planId: (u.role === 'admin' || u.role === 'superadmin') ? 'enterprise' : 'free',
      }
    })
  }

  // 7) 计费配置初始化（1元 = 100积分）
  console.log('  💰 写入计费配置种子数据...')
  const BILLING_CONFIGS = [
    { key: 'billing.currency', value: JSON.stringify('CNY') },
    { key: 'billing.period', value: JSON.stringify('month') },
    {
      key: 'billing.plans',
      value: JSON.stringify([
        { id: 'free', name: '免费版', price: 0, tokens: 1000, features: ['基础生成', '社区浏览', '每日签到赠积分'] },
        { id: 'pro', name: '专业版', price: 29, tokens: 3000, features: ['优先队列', '高清导出', '无水印', '专属模板'] },
        { id: 'business', name: '商业版', price: 99, tokens: 12000, features: ['专业版全部功能', '商用授权', 'API 接入', '专属客服'] },
        { id: 'enterprise', name: '企业版', price: 299, tokens: 40000, features: ['商业版全部功能', '私有部署', '定制模型', 'SLA 保障'] },
      ]),
    },
    {
      key: 'billing.recharge_packages',
      value: JSON.stringify([
        { id: 'pkg_10', tokens: 900, price: 9, bonus: 100 },
        { id: 'pkg_50', tokens: 3900, price: 39, bonus: 600 },
        { id: 'pkg_100', tokens: 6900, price: 69, bonus: 1600 },
        { id: 'pkg_500', tokens: 29900, price: 299, bonus: 10100 },
      ]),
    },
  ]
  for (const cfg of BILLING_CONFIGS) {
    await prisma.siteConfig.update({
      where: { group_key: { group: 'billing', key: cfg.key } },
      data: { value: cfg.value },
    })
  }

  // 8) 板块功能配置初始化
  console.log('  🧩 写入板块功能配置种子数据...')
  const FEATURES = [
    // ===== 写作 Novel =====
    { module: 'novel', featureKey: 'model_selector', displayName: '模型选择', type: 'select', sort: 1, config: JSON.stringify({ label: 'AI 模型', options: 'dynamic' }) },
    { module: 'novel', featureKey: 'genre_select', displayName: '题材选择', type: 'select', sort: 2, config: JSON.stringify({ label: '题材', options: ['玄幻','都市','科幻','历史','言情','悬疑','武侠','末世'] }) },
    { module: 'novel', featureKey: 'audience_select', displayName: '目标读者', type: 'select', sort: 3, config: JSON.stringify({ label: '目标读者', options: ['男性向','女性向','全年龄','青少年'] }) },
    { module: 'novel', featureKey: 'pov_select', displayName: '作品视角', type: 'select', sort: 4, config: JSON.stringify({ label: '视角', options: ['第一人称','第三人称限制','第三人称全知','多人视角'] }) },
    { module: 'novel', featureKey: 'length_select', displayName: '篇幅选择', type: 'select', sort: 5, config: JSON.stringify({ label: '篇幅', options: ['短篇','中篇','长篇','连载'] }) },
    { module: 'novel', featureKey: 'prompt_input', displayName: '创作提示词', type: 'textarea', sort: 6, config: JSON.stringify({ label: '创作提示词', rows: 4, placeholder: '描述你想写的故事...' }) },
    { module: 'novel', featureKey: 'editor_area', displayName: '编辑区域', type: 'custom', sort: 7, config: null },
    { module: 'novel', featureKey: 'ai_toolbar', displayName: 'AI 工具栏', type: 'custom', sort: 8, config: JSON.stringify({ tools: ['synopsis','outline','continue','optimize'] }) },

    // ===== 图像 Image =====
    { module: 'image', featureKey: 'model_selector', displayName: '模型选择', type: 'select', sort: 1, config: JSON.stringify({ label: 'AI 模型', options: 'dynamic' }) },
    { module: 'image', featureKey: 'prompt_input', displayName: '正向提示词', type: 'textarea', sort: 2, config: JSON.stringify({ label: '正向提示词', rows: 3, placeholder: '描述你想生成的画面...' }) },
    { module: 'image', featureKey: 'negative_prompt', displayName: '负向提示词', type: 'textarea', sort: 3, config: JSON.stringify({ label: '负向提示词', rows: 2, placeholder: '不希望出现的元素...' }) },
    { module: 'image', featureKey: 'ratio_selector', displayName: '比例选择', type: 'select', sort: 4, config: JSON.stringify({ label: '比例', options: ['1:1','3:4','4:3','16:9','9:16','21:9'] }) },
    { module: 'image', featureKey: 'steps_slider', displayName: '采样步数', type: 'slider', sort: 5, config: JSON.stringify({ label: '采样步数', min: 10, max: 50, step: 1, default: 30 }) },
    { module: 'image', featureKey: 'cfg_slider', displayName: 'CFG 强度', type: 'slider', sort: 6, config: JSON.stringify({ label: 'CFG 强度', min: 1, max: 20, step: 0.5, default: 7 }) },
    { module: 'image', featureKey: 'batch_input', displayName: '批量数量', type: 'slider', sort: 7, config: JSON.stringify({ label: '批量数量', min: 1, max: 4, step: 1, default: 1 }) },
    { module: 'image', featureKey: 'seed_input', displayName: '随机种子', type: 'input', sort: 8, config: JSON.stringify({ label: '随机种子', placeholder: '-1 为随机' }) },
    { module: 'image', featureKey: 'controlnet_upload', displayName: 'ControlNet 参考图', type: 'upload', sort: 9, config: JSON.stringify({ label: '参考图', maxFiles: 3 }) },
    { module: 'image', featureKey: 'history_panel', displayName: '生成历史', type: 'custom', sort: 10, config: null },

    // ===== 漫画 Comic =====
    { module: 'comic', featureKey: 'model_selector', displayName: '模型选择', type: 'select', sort: 1, config: JSON.stringify({ label: 'AI 模型', options: 'dynamic' }) },
    { module: 'comic', featureKey: 'script_import', displayName: '脚本送入', type: 'custom', sort: 2, config: null },
    { module: 'comic', featureKey: 'layout_editor', displayName: '排版编辑器', type: 'custom', sort: 3, config: null },
    { module: 'comic', featureKey: 'page_manager', displayName: '多页管理', type: 'custom', sort: 4, config: null },
    { module: 'comic', featureKey: 'png_export', displayName: 'PNG 导出', type: 'toggle', sort: 5, config: JSON.stringify({ label: '启用 PNG 导出' }) },
    { module: 'comic', featureKey: 'character_consistency', displayName: '角色一致性', type: 'toggle', sort: 6, config: JSON.stringify({ label: '启用角色一致性', desc: '待 API 接入' }) },

    // ===== 音频 Audio =====
    { module: 'audio', featureKey: 'model_selector', displayName: '模型选择', type: 'select', sort: 1, config: JSON.stringify({ label: 'AI 模型', options: 'dynamic' }) },
    { module: 'audio', featureKey: 'text_input', displayName: '文本输入', type: 'textarea', sort: 2, config: JSON.stringify({ label: '朗读文本', rows: 5, placeholder: '输入要朗读的文本...' }) },
    { module: 'audio', featureKey: 'voice_select', displayName: '音色选择', type: 'select', sort: 3, config: JSON.stringify({ label: '音色', options: ['温柔女声','沉稳男声','活泼少女','磁性男声','知性女声'] }) },
    { module: 'audio', featureKey: 'music_mood', displayName: 'BGM 情绪', type: 'select', sort: 4, config: JSON.stringify({ label: 'BGM 情绪', options: ['欢快','悲伤','紧张','舒缓','激昂','神秘'] }) },
    { module: 'audio', featureKey: 'music_duration', displayName: 'BGM 时长', type: 'slider', sort: 5, config: JSON.stringify({ label: '时长(秒)', min: 10, max: 180, step: 5, default: 30 }) },
    { module: 'audio', featureKey: 'audio_upload', displayName: '音频上传', type: 'upload', sort: 6, config: JSON.stringify({ label: '上传音频', maxFiles: 1 }) },
    { module: 'audio', featureKey: 'history_panel', displayName: '生成历史', type: 'custom', sort: 7, config: null },

    // ===== 视频 Video =====
    { module: 'video', featureKey: 'model_selector', displayName: '模型选择', type: 'select', sort: 1, config: JSON.stringify({ label: 'AI 模型', options: 'dynamic' }) },
    { module: 'video', featureKey: 'text2video_input', displayName: '文生视频提示词', type: 'textarea', sort: 2, config: JSON.stringify({ label: '视频描述', rows: 3, placeholder: '描述你想生成的视频...' }) },
    { module: 'video', featureKey: 'img2video_upload', displayName: '图生视频参考图', type: 'upload', sort: 3, config: JSON.stringify({ label: '参考图', maxFiles: 1 }) },
    { module: 'video', featureKey: 'duration_select', displayName: '视频时长', type: 'select', sort: 4, config: JSON.stringify({ label: '时长', options: ['5秒','10秒','15秒','30秒'] }) },
    { module: 'video', featureKey: 'quality_select', displayName: '画质选择', type: 'select', sort: 5, config: JSON.stringify({ label: '画质', options: ['480p','720p','1080p','4K'] }) },
    { module: 'video', featureKey: 'task_queue', displayName: '任务队列', type: 'custom', sort: 6, config: null },
    { module: 'video', featureKey: 'polling_status', displayName: '轮询状态', type: 'custom', sort: 7, config: null },
  ]
  for (const f of FEATURES) {
    await prisma.moduleFeature.upsert({ where: { module_featureKey: { module: f.module, featureKey: f.featureKey } }, update: f, create: f })
  }


  console.log(`\n✅ Seed 完成！`)
  console.log(`   🔴 超级管理员（唯一）：${UNIQUE_SUPERADMIN_EMAIL}  / 密码：password123`)
  console.log(`   🟠 管理员（审核）      ：moderator@manktv.com  / 密码：password123`)
  console.log(`   🟢 普通用户            ：demo@manktv.com       / 密码：password123`)
  console.log(`   ├─ 作者用户：${AUTHORS.length} 位`)
  console.log(`   ├─ 社区作品：${WORKS.length} 件`)
  console.log(`   ├─ Demo 评论：${totalComments} 条`)
  console.log(`   ├─ AI 供应商：${providers.length} 个`)
  console.log(`   ├─ AI 模型：${MODELS_SEED.length} 个`)
  console.log(`   ├─ 用户额度：${allUsers.length} 条`)
  console.log(`   └─ 板块功能配置：${FEATURES.length} 条`)

}

main()
  .catch((e) => {
    console.error('❌ Seed 失败：', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
