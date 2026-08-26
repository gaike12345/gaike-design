import { useEffect, useMemo, useState } from 'react'
import type { ElementType } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowLeft,
  BookOpen,
  Check,
  Clock,
  Flame,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Music,
  Palette,
  Plus,
  Send,
  Share2,
  Sparkles,
  User,
  Video,
  Wand2,
  X,
} from 'lucide-react'
import Navbar from '../components/layout/Navbar'
import Footer from '../components/layout/Footer'
import { api } from '../services/api'
import { useAuthStore } from '../store/useAuthStore'

// ===== 内联类型定义 =====
type WorkType = 'novel' | 'image' | 'comic' | 'audio' | 'video'
type SortMode = 'latest' | 'hot'

interface Author {
  id: string
  nickname: string
  avatar: string | null
}

interface Work {
  id: string
  title: string
  type: WorkType
  content: string
  author?: Author
  likes?: number
  commentCount?: number
  createdAt?: string
  cover?: string
  subtype?: string
}

interface Comment {
  id: string
  content: string
  author?: Author
  createdAt?: string
}

// ===== 静态配置 =====
const TABS: { key: string; label: string; icon: ElementType }[] = [
  { key: 'all', label: '全部', icon: Sparkles },
  { key: 'novel', label: '小说', icon: BookOpen },
  { key: 'image', label: '图像', icon: ImageIcon },
  { key: 'comic', label: '漫画', icon: Palette },
  { key: 'audio', label: '音频', icon: Music },
  { key: 'video', label: '视频', icon: Video },
]
const VALID_TAB_KEYS = TABS.map((t) => t.key)

const SORTS: { key: SortMode; label: string; icon: ElementType }[] = [
  { key: 'latest', label: '最新', icon: Clock },
  { key: 'hot', label: '热门', icon: Flame },
]

const TYPE_LABEL: Record<WorkType, string> = {
  novel: '小说',
  image: '图像',
  comic: '漫画',
  audio: '音频',
  video: '视频',
}

// 与 Landing 作品栏 ACCENTS 完全对齐：{主色, 浅色}
const TYPE_ACCENT: Record<WorkType, { main: string; light: string }> = {
  novel: { main: '#4F46E5', light: '#818CF8' },
  image: { main: '#06B6D4', light: '#67E8F9' },
  comic: { main: '#8B5CF6', light: '#C4B5FD' },
  audio: { main: '#EC4899', light: '#F9A8D4' },
  video: { main: '#F59E0B', light: '#FCD34D' },
}
function accentFor(type: WorkType) {
  return TYPE_ACCENT[type] ?? { main: '#64748B', light: '#CBD5E1' }
}

// 「做同款」：按作品类型映射到对应工作区路由
const WORKSPACE_ROUTE: Record<WorkType, string> = {
  novel: '/workspace/writing',
  image: '/workspace/image',
  comic: '/workspace/comic',
  audio: '/workspace/audio',
  video: '/workspace/video',
}

// 按作品类型返回封面渐变 class（当没有真实 cover 时的降级）
function coverGradient(type: WorkType): string {
  switch (type) {
    case 'novel':
      return 'from-novel-400 to-novel-600'
    case 'image':
      return 'from-cyan-400 to-cyan-600'
    case 'comic':
      return 'from-violet-400 to-violet-600'
    case 'audio':
      return 'from-pink-400 to-pink-600'
    case 'video':
      return 'from-amber-400 to-orange-500'
    default:
      return 'from-slate-400 to-slate-600'
  }
}

function formatTime(s?: string): string {
  if (!s) return ''
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

// 作者头像（无 avatar 用首字母占位）
function Avatar({ author, size = 'h-8 w-8' }: { author?: Author; size?: string }) {
  if (!author) {
    return (
      <div className={`${size} flex items-center justify-center rounded-full bg-slate-200`}>
        <User className="h-4 w-4 text-slate-500" />
      </div>
    )
  }
  if (author.avatar) {
    return (
      <img
        src={author.avatar}
        alt={author.nickname}
        className={`${size} rounded-full object-cover`}
      />
    )
  }
  const initial = author.nickname?.[0]?.toUpperCase() || '?'
  return (
    <div
      className={`${size} flex items-center justify-center rounded-full bg-gradient-to-br from-community-400 to-community-600 text-xs font-medium text-white`}
    >
      {initial}
    </div>
  )
}

// ===== 作品正文渲染（按类型分发） =====
function WorkContent({ work }: { work: Work }) {
  if (work.type === 'novel') {
    const paragraphs = work.content.split('\n').filter((l) => l.trim().length > 0)
    return (
      <div className="space-y-3 leading-8 text-slate-800">
        {paragraphs.length ? (
          paragraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p>{work.content}</p>
        )}
      </div>
    )
  }

  if (work.type === 'image') {
    // 真实大图优先 + 降级渐变占位 + 作者配文
    const a = accentFor('image')
    return (
      <div className="space-y-5">
        {work.cover ? (
          <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
            <img
              src={work.cover}
              alt={work.title}
              loading="lazy"
              onError={(e) => {
                const target = e.currentTarget
                target.style.display = 'none'
              }}
              className="w-full object-cover"
              style={{ aspectRatio: '16 / 9' }}
            />
          </div>
        ) : (
          <div
            className={`w-full rounded-2xl bg-gradient-to-br ${coverGradient('image')}`}
            style={{ aspectRatio: '16 / 9' }}
          />
        )}
        <div
          className="rounded-xl border-l-4 bg-slate-50/80 px-4 py-3 text-sm leading-7 text-slate-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  // comic / audio / video：有 cover 就先展示大封面 + 配文
  if (work.type === 'comic' && work.cover) {
    const a = accentFor('comic')
    return (
      <div className="space-y-5">
        <div className="overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="w-full object-cover"
            style={{ aspectRatio: '4 / 3' }}
          />
        </div>
        <div
          className="rounded-xl border-l-4 bg-slate-50/80 px-4 py-3 leading-7 text-slate-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }
  if (work.type === 'video' && work.cover) {
    const a = accentFor('video')
    return (
      <div className="space-y-5">
        <div className="relative overflow-hidden rounded-2xl border border-slate-100 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="w-full object-cover"
            style={{ aspectRatio: '16 / 9' }}
          />
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden
          >
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl backdrop-blur"
              style={{ backgroundColor: `${a.main}CC` }}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7 translate-x-0.5">
                <path d="M8 5.14v13.72c0 .77.85 1.24 1.5.84l11-6.86a1 1 0 0 0 0-1.68l-11-6.86A1 1 0 0 0 8 5.14z" />
              </svg>
            </div>
          </div>
        </div>
        <div
          className="rounded-xl border-l-4 bg-slate-50/80 px-4 py-3 leading-7 text-slate-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }
  if (work.type === 'audio' && work.cover) {
    const a = accentFor('audio')
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm">
          <img
            src={work.cover}
            alt={work.title}
            loading="lazy"
            onError={(e) => (e.currentTarget.style.display = 'none')}
            className="h-28 w-28 flex-none rounded-xl object-cover shadow"
          />
          <div className="min-w-0 flex-1">
            <div className="mb-2 flex items-center gap-2">
              <div
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: a.main }}
              >
                <Music className="h-4 w-4" />
              </div>
              <div className="text-xs text-slate-400">点击即可收听</div>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full w-2/5 rounded-full"
                style={{
                  backgroundImage: `linear-gradient(90deg, ${a.main}, ${a.light})`,
                }}
              />
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-slate-400">
              <span>03:24</span>
              <span>08:15</span>
            </div>
          </div>
        </div>
        <div
          className="rounded-xl border-l-4 bg-slate-50/80 px-4 py-3 leading-7 text-slate-700"
          style={{ borderLeftColor: a.main }}
        >
          {work.content}
        </div>
      </div>
    )
  }

  // 兜底：纯内容块
  return (
    <div className="rounded-lg bg-slate-50 p-4 leading-7 text-slate-700">{work.content}</div>
  )
}

// ===== 静态作品池（20 件 · 跨 5 类型 · 后端空/报错时的统一兜底数据源） =====
const STATIC_AUTHORS: Record<string, Author> = {
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

const STATIC_WORKS_POOL: Work[] = [
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
      '全片 2 分 45 秒，AI 辅助生成的赛博都市夜景漫游短片。\nMankTV 全流程工作流演示：剧本生成 → 分镜 → 图像一致性 → 视频生成 → 音效配乐一键完成，发布 3 天 120w+ 播放。',
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
const STATIC_WORKS_BY_ID: Map<string, Work> = new Map(STATIC_WORKS_POOL.map((w) => [w.id, w]))

// 作品功能暂时关闭 — 后端保留管理接口，前端不显示发布入口
const PUBLISH_ENABLED = false

// ===== 主组件 =====
export default function CommunityPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const isAuthed = !!user

  // ===== URL ↔ State 双向同步：type（Tab）与 id（详情） =====
  // 1) 从 URL query 初始化（Landing 跳转 / 分享链接打开 都能直接定位）
  const { initialTab, initialWorkId } = useMemo(() => {
    let tab = 'all'
    let wid: string | null = null
    try {
      const params = new URLSearchParams(window.location.search)
      const t = params.get('type')
      if (t && VALID_TAB_KEYS.includes(t)) tab = t
      wid = params.get('id') // id 为任意字符串（可能是后端 UUID，也可能是 static-xxx）
    } catch {
      /* ignore */
    }
    return { initialTab: tab, initialWorkId: wid }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [activeTab, setActiveTab] = useState<string>(initialTab)
  const [sort, setSort] = useState<SortMode>('latest')
  const [works, setWorks] = useState<Work[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 详情视图状态
  const [selectedWorkId, setSelectedWorkId] = useState<string | null>(initialWorkId)
  const [detail, setDetail] = useState<{ work: Work; liked: boolean } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [commentEmptyHint, setCommentEmptyHint] = useState(false) // 评论空值提示
  const [likeLoading, setLikeLoading] = useState(false)

  // 发布弹窗状态
  const [publishOpen, setPublishOpen] = useState(false)
  const [publishTitle, setPublishTitle] = useState('')
  const [publishType, setPublishType] = useState<WorkType>('novel')
  const [publishContent, setPublishContent] = useState('')
  const [publishing, setPublishing] = useState(false)

  // 交互辅助 state
  const [listScrollY, setListScrollY] = useState<number>(0) // 进入详情前列表滚动位置，返回时恢复
  const [copied, setCopied] = useState<boolean>(false) // 分享链接复制成功反馈

  // ===== URL 双向同步：selectedWorkId 变 → 改 URL（replace 不污染历史）；activeTab 变 → 同步 type query =====
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search)
      // 1) type
      if (activeTab === 'all') params.delete('type')
      else params.set('type', activeTab)
      // 2) id（详情）
      if (!selectedWorkId) params.delete('id')
      else params.set('id', selectedWorkId)

      const qs = params.toString()
      const next = `${window.location.pathname}${qs ? '?' + qs : ''}`
      if (next !== window.location.pathname + window.location.search) {
        navigate(next, { replace: true })
      }
    } catch {
      /* ignore navigate / URL parse 异常 */
    }
  }, [activeTab, selectedWorkId, navigate])

  // ===== 滚动位置 + ESC 监听 =====
  useEffect(() => {
    // A. 进入详情：先存滚动位置，再滚到 0
    if (selectedWorkId) {
      setListScrollY(window.scrollY)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      // B. 离开详情：恢复到进入前的位置（instant 不用动画，避免跳闪）
      if (listScrollY > 0) {
        window.scrollTo({ top: listScrollY, behavior: 'auto' as ScrollBehavior })
      }
    }

    // C. ESC 键只在详情态生效：退出详情
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedWorkId) {
        setSelectedWorkId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedWorkId, listScrollY])

  // ===== 数据归一化：单一入口处理（API 空/错 → fallback 静态池 + 前端二次过滤 + 排序） =====
  const normalizeAndSetWorks = (list: Work[]) => {
    // 1) 前端二次过滤（即使后端不支持 type 参数也保证结果正确）
    const filtered =
      activeTab === 'all' ? list : list.filter((w) => w.type === activeTab)
    // 2) 前端二次排序（保证最新/热门真实生效）
    const sorted = [...filtered]
    if (sort === 'hot') {
      sorted.sort((a, b) => (b.likes || 0) - (a.likes || 0))
    } else {
      // 最新：按 createdAt 降序（时间戳越大越靠前）；无时间则保持原序
      sorted.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0
        if (!Number.isNaN(tb) && !Number.isNaN(ta)) return tb - ta
        return 0
      })
    }
    setWorks(sorted)
  }

  // 加载作品列表
  const loadWorks = async () => {
    setListLoading(true)
    setError(null)
    try {
      const typeParam = activeTab !== 'all' ? `&type=${activeTab}` : ''
      const res = await api.get<{ list: Work[]; total: number }>(
        `/api/community/works?sort=${sort}${typeParam}&page=1`,
      )
      const apiList = Array.isArray(res?.list) ? res.list : []
      normalizeAndSetWorks(apiList.length > 0 ? apiList : STATIC_WORKS_POOL)
    } catch (e) {
      // 后端挂了或没数据：统一 fallback 到静态池（不抛 error，避免用户看到报错）
      normalizeAndSetWorks(STATIC_WORKS_POOL)
    } finally {
      setListLoading(false)
    }
  }

  useEffect(() => {
    loadWorks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, sort])

  // 进入/离开详情视图（API 空/错 → fallback 静态池作品）
  useEffect(() => {
    if (!selectedWorkId) {
      setDetail(null)
      setComments([])
      return
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })

    const staticWork = STATIC_WORKS_BY_ID.get(selectedWorkId)

    setDetailLoading(true)
    api
      .get<{ work: Work; liked: boolean }>(`/api/community/works/${selectedWorkId}`)
      .then((res) => {
        if (res?.work) {
          setDetail(res)
        } else if (staticWork) {
          setDetail({ work: staticWork, liked: false })
        } else {
          setDetail(null)
        }
      })
      .catch(() => {
        // API 失败：若在静态池里有，则直接用静态池
        if (staticWork) setDetail({ work: staticWork, liked: false })
        else setDetail(null)
      })
      .finally(() => setDetailLoading(false))

    // 评论：API 失败则造几条 demo 评论，避免详情空荡
    setCommentsLoading(true)
    api
      .get<{ list: Comment[] }>(`/api/community/works/${selectedWorkId}/comments`)
      .then((res) => {
        const list = Array.isArray(res?.list) ? res.list : []
        if (list.length > 0) {
          setComments(list)
          return
        }
        // Demo 评论（跟作品作者相关的伪随机几条）
        setComments([
          {
            id: `${selectedWorkId}-c1`,
            content:
              '这个题材太戳我了！作者大大什么时候更新下一集？已经把前两话看了三遍了。',
            author: STATIC_AUTHORS.qingtian,
            createdAt: '2026-08-24T18:22:00Z',
          },
          {
            id: `${selectedWorkId}-c2`,
            content:
              '看完立刻「做同款」了，MankTV 的工作流太香——15 分钟就出了第一版草稿，完全不敢相信自己的手速。',
            author: STATIC_AUTHORS.vision,
            createdAt: '2026-08-23T10:07:00Z',
          },
          {
            id: `${selectedWorkId}-c3`,
            content:
              staticWork
                ? `这段${staticWork.subtype || TYPE_LABEL[staticWork.type]}的细节写得真到位，尤其是 ${staticWork.title} 里最后那句台词，我直接泪目 QAQ。`
                : '细节真的到位，已经转发给同好了。',
            author: STATIC_AUTHORS.luxiao,
            createdAt: '2026-08-22T02:45:00Z',
          },
        ])
      })
      .catch(() => {
        setComments([
          {
            id: `${selectedWorkId}-c-fallback`,
            content: '先马一个，周末慢慢看 🔥',
            author: STATIC_AUTHORS.maoqiu,
            createdAt: '2026-08-20T16:30:00Z',
          },
        ])
      })
      .finally(() => setCommentsLoading(false))
  }, [selectedWorkId])

  const requireAuth = (): boolean => {
    if (!isAuthed) {
      navigate('/login')
      return false
    }
    return true
  }

  const handleLike = async () => {
    if (!selectedWorkId || !detail) return
    if (!requireAuth()) return
    setLikeLoading(true)
    try {
      await api.post(`/api/community/works/${selectedWorkId}/like`)
      const wasLiked = detail.liked
      const delta = wasLiked ? -1 : 1
      const newLikes = Math.max(0, (detail.work.likes || 0) + delta)
      // 1) 更新详情态
      setDetail({
        ...detail,
        liked: !wasLiked,
        work: { ...detail.work, likes: newLikes },
      })
      // 2) 同步 works 列表：返回广场时卡片点赞数立刻一致（乐观更新，不回滚）
      setWorks((prev) =>
        prev.map((w) => (w.id === detail.work.id ? { ...w, likes: newLikes } : w)),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLikeLoading(false)
    }
  }

  const handleSubmitComment = async () => {
    if (!selectedWorkId) return
    const content = newComment.trim()
    // 空值拦截 + 显式提示
    if (!content) {
      setCommentEmptyHint(true)
      return
    }
    setCommentEmptyHint(false)
    if (!requireAuth()) return
    setSubmittingComment(true)
    try {
      await api.post(`/api/community/works/${selectedWorkId}/comments`, { content })
      setNewComment('')
      const res = await api.get<{ list: Comment[] }>(
        `/api/community/works/${selectedWorkId}/comments`,
      )
      const newList = Array.isArray(res?.list) ? res.list : []
      setComments(newList)
      const increasedCount = (detail?.work.commentCount ?? comments.length) + 1
      // 1) 更新详情态计数（后续若详情页标题栏显示评论数也生效）
      if (detail) {
        setDetail({
          ...detail,
          work: { ...detail.work, commentCount: increasedCount },
        })
      }
      // 2) 同步 works 列表：返回广场时卡片评论数一致
      setWorks((prev) =>
        prev.map((w) =>
          w.id === selectedWorkId
            ? { ...w, commentCount: increasedCount }
            : w,
        ),
      )
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSubmittingComment(false)
    }
  }

  const handlePublish = async () => {
    const title = publishTitle.trim()
    const content = publishContent.trim()
    if (!title || !content) return
    if (!requireAuth()) return
    setPublishing(true)
    try {
      await api.post('/api/community/works', { title, type: publishType, content })
      setPublishOpen(false)
      setPublishTitle('')
      setPublishContent('')
      setPublishType('novel')
      await loadWorks()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setPublishing(false)
    }
  }

  const isListView = !selectedWorkId

  return (
    <div className="min-h-screen bg-white">
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-6">
        {/* 错误提示 */}
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-3 text-red-500 hover:text-red-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {isListView ? (
          <>
            {/* 页头 + 发布按钮 — 社区强调色 green */}
            <div className="-mx-4 -mt-6 mb-5 bg-community-50 px-4 py-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-slate-900">作品广场</h1>
                  <p className="mt-1 text-sm text-slate-500">发现创作者的优秀作品</p>
                </div>
                {PUBLISH_ENABLED && (
                  <button
                    onClick={() => setPublishOpen(true)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-br from-community-500 to-community-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:from-community-600 hover:to-community-700"
                  >
                    <Plus className="h-4 w-4" />
                    发布作品
                  </button>
                )}
              </div>
            </div>

            {/* Tab 栏 */}
            <div className="mb-4 flex flex-wrap items-center gap-2">
              {TABS.map((t) => {
                const Icon = t.icon
                const active = activeTab === t.key
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                      active
                        ? 'bg-community-600 text-white shadow-sm'
                        : 'bg-white text-slate-600 hover:bg-community-50 hover:text-community-600'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {t.label}
                  </button>
                )
              })}
            </div>

            {/* 排序切换 */}
            <div className="mb-5 flex items-center gap-2 text-sm">
              <span className="text-slate-400">排序：</span>
              {SORTS.map((s) => {
                const Icon = s.icon
                const active = sort === s.key
                return (
                  <button
                    key={s.key}
                    onClick={() => setSort(s.key)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 transition ${
                      active
                        ? 'bg-community-50 font-medium text-community-600'
                        : 'text-slate-500 hover:text-community-600'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {s.label}
                  </button>
                )
              })}
            </div>

            {/* 卡片网格 —— 升级：真实封面 + 类型强调色 + 玻璃态数据 + 做同款入口 */}
            {listLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : works.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/60 py-20 text-slate-400">
                <Sparkles className="h-8 w-8" />
                <p className="mt-3 text-sm">还没有作品，快来发布第一篇吧</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                {works.map((w) => {
                  const a = accentFor(w.type)
                  return (
                    <div
                      key={w.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedWorkId(w.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') setSelectedWorkId(w.id)
                      }}
                      className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-slate-300 hover:shadow-[0_20px_50px_-12px_rgba(15,23,42,0.15)]"
                    >
                      {/* 封面区 4:3 —— 真实封面优先，渐变降级 */}
                      <div className="relative overflow-hidden" style={{ aspectRatio: '4 / 3' }}>
                        {w.cover ? (
                          <img
                            src={w.cover}
                            alt={w.title}
                            loading="lazy"
                            onError={(e) => {
                              // 图加载失败：降级为渐变
                              const target = e.currentTarget
                              target.style.display = 'none'
                              const parent = target.parentElement
                              if (parent && !parent.querySelector('[data-fallback-grad]')) {
                                const div = document.createElement('div')
                                div.setAttribute('data-fallback-grad', '1')
                                div.className = `absolute inset-0 bg-gradient-to-br ${coverGradient(w.type)}`
                                parent.appendChild(div)
                              }
                            }}
                            className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
                          />
                        ) : (
                          <div
                            className={`absolute inset-0 bg-gradient-to-br ${coverGradient(w.type)}`}
                          />
                        )}
                        {/* 左：子类型强调色胶囊（跟随类型主色） */}
                        <span
                          className="absolute left-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.25)]"
                          style={{ backgroundColor: a.main }}
                        >
                          {w.subtype || TYPE_LABEL[w.type]}
                        </span>
                        {/* 右：玻璃态点赞 + 评论数 */}
                        <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-medium text-white backdrop-blur">
                          <span className="inline-flex items-center gap-1">
                            <Heart className="h-3 w-3 fill-white" />
                            {w.likes || 0}
                          </span>
                          <span className="h-2.5 w-px bg-white/35" />
                          <span className="inline-flex items-center gap-1">
                            <MessageSquare className="h-3 w-3 fill-transparent" />
                            {w.commentCount ?? 0}
                          </span>
                        </span>
                      </div>

                      {/* 信息区 */}
                      <div className="flex flex-1 flex-col p-3.5">
                        <h3 className="text-sm font-semibold leading-snug text-slate-900 line-clamp-2">
                          {w.title}
                        </h3>
                        <div className="mt-3 flex items-center justify-between pt-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-white"
                              style={{
                                backgroundImage: `linear-gradient(135deg, ${a.main} 0%, ${a.light} 100%)`,
                              }}
                            >
                              {w.author?.nickname?.[0]?.toUpperCase() ?? '?'}
                            </div>
                            <span className="truncate text-xs text-slate-500">
                              {w.author?.nickname || '匿名'}
                            </span>
                          </div>
                          {/* 做同款入口（stopPropagation 不触发详情跳转，带灵感 state 进入工作区） */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(WORKSPACE_ROUTE[w.type], {
                                state: {
                                  fromWork: {
                                    id: w.id,
                                    title: w.title,
                                    type: w.type,
                                    subtype: w.subtype,
                                    cover: w.cover,
                                    content: w.content,
                                  },
                                },
                              })
                            }}
                            className="group/same inline-flex flex-none items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-medium transition hover:shadow-sm"
                            style={{
                              borderColor: a.main,
                              color: a.main,
                            }}
                            title={`用这篇${TYPE_LABEL[w.type]}的灵感去创作`}
                          >
                            <Wand2 className="h-3 w-3" />
                            同款
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          // ===== 详情视图 =====
          <>
            <button
              onClick={() => setSelectedWorkId(null)}
              className="mb-5 inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-community-50 hover:text-community-600"
            >
              <ArrowLeft className="h-4 w-4" />
              返回广场
            </button>

            {detailLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : detail ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                {/* 标题 + 作者 */}
                <header className="border-b border-slate-100 pb-4">
                  <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          <span
                            className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]"
                            style={{ backgroundColor: accentFor(detail.work.type).main }}
                          >
                            {TYPE_LABEL[detail.work.type]}
                          </span>
                          {detail.work.subtype && (
                            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-500">
                              {detail.work.subtype}
                            </span>
                          )}
                        </div>
                        <h1 className="text-2xl font-bold text-slate-900">{detail.work.title}</h1>
                      </div>
                    {/* 做同款：把当前作品作为灵感 state 带入对应工作区（工作区可直接消费预置 Prompt/剧情/封面）；+ 分享按钮 */}
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        onClick={() =>
                          navigate(WORKSPACE_ROUTE[detail.work.type], {
                            state: {
                              fromWork: {
                                id: detail.work.id,
                                title: detail.work.title,
                                type: detail.work.type,
                                subtype: detail.work.subtype,
                                cover: detail.work.cover,
                                content: detail.work.content,
                              },
                            },
                          })
                        }
                        className="inline-flex items-center gap-1.5 rounded-lg bg-community-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-community-700"
                        title={`用这篇${TYPE_LABEL[detail.work.type]}的灵感去${TYPE_LABEL[detail.work.type]}工作区创作`}
                      >
                        <Wand2 className="h-4 w-4" />
                        做同款
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(window.location.href)
                            setCopied(true)
                            setTimeout(() => setCopied(false), 1500)
                          } catch {
                            /* 部分浏览器无 Clipboard API，静默失败 */
                          }
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                          copied
                            ? 'border-emerald-300 bg-emerald-50 text-emerald-600'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-900'
                        }`}
                        title={copied ? '链接已复制到剪贴板' : '复制分享链接'}
                      >
                        {copied ? (
                          <Check className="h-4 w-4" />
                        ) : (
                          <Share2 className="h-4 w-4" />
                        )}
                        {copied ? '已复制' : '分享'}
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <Avatar author={detail.work.author} size="h-9 w-9" />
                    <div className="leading-tight">
                      <div className="text-sm font-medium text-slate-800">
                        {detail.work.author?.nickname || '匿名创作者'}
                      </div>
                      {detail.work.createdAt && (
                        <div className="text-xs text-slate-400">
                          {formatTime(detail.work.createdAt)}
                        </div>
                      )}
                    </div>
                  </div>
                </header>

                {/* 正文 */}
                <div className="py-6">
                  <WorkContent work={detail.work} />
                </div>

                {/* 点赞 */}
                <div className="flex items-center gap-3 border-t border-slate-100 py-4">
                  <button
                    onClick={handleLike}
                    disabled={likeLoading}
                    className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition disabled:opacity-50 ${
                      detail.liked
                        ? 'bg-rose-50 text-rose-600'
                        : 'bg-slate-50 text-slate-600 hover:bg-rose-50 hover:text-rose-600'
                    }`}
                  >
                    {likeLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Heart className={`h-4 w-4 ${detail.liked ? 'fill-current' : ''}`} />
                    )}
                    {detail.liked ? '已点赞' : '点赞'}
                    <span className="ml-1 text-xs text-slate-400">
                      {detail.work.likes || 0}
                    </span>
                  </button>
                  <div className="inline-flex items-center gap-1.5 text-sm text-slate-500">
                    <MessageSquare className="h-4 w-4" />
                    {comments.length}
                  </div>
                </div>
              </article>
            ) : (
              <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-200 py-20 text-sm text-slate-400">
                作品不存在或已被删除
              </div>
            )}

            {/* 评论区 */}
            {detail && (
              <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 text-base font-semibold text-slate-900">
                  <MessageSquare className="h-4 w-4 text-community-500" />
                  评论 {comments.length}
                </h2>

                {/* 发表评论 */}
                <div className="mb-5 flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <textarea
                      value={newComment}
                      onChange={(e) => {
                        setNewComment(e.target.value)
                        if (commentEmptyHint && e.target.value.trim()) {
                          setCommentEmptyHint(false)
                        }
                      }}
                      placeholder={isAuthed ? '写下你的评论…' : '登录后即可评论'}
                      rows={2}
                      className={`flex-1 w-full resize-none rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 outline-none transition ${
                        commentEmptyHint
                          ? 'border-rose-300 ring-2 ring-rose-100 focus:border-rose-400 focus:ring-rose-100'
                          : 'border-slate-200 focus:border-community-400 focus:ring-2 focus:ring-community-100'
                      }`}
                    />
                    {commentEmptyHint && (
                      <p className="mt-1.5 pl-1 text-[11px] font-medium text-rose-500">
                        评论内容不能为空哦～
                      </p>
                    )}
                  </div>
                  <button
                    onClick={handleSubmitComment}
                    disabled={
                      submittingComment || !newComment.trim().length
                    }
                    className="inline-flex items-center gap-1 self-stretch rounded-lg bg-community-600 px-3 text-sm font-medium text-white transition hover:bg-community-700 disabled:opacity-50"
                  >
                    {submittingComment ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </button>
                </div>

                {/* 评论列表 */}
                {commentsLoading ? (
                  <div className="flex items-center justify-center py-8 text-slate-400">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : comments.length === 0 ? (
                  <div className="py-6 text-center text-sm text-slate-400">
                    还没有评论，来抢沙发吧
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {comments.map((c) => (
                      <li key={c.id} className="flex gap-3">
                        <Avatar author={c.author} size="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-slate-800">
                              {c.author?.nickname || '匿名'}
                            </span>
                            {c.createdAt && (
                              <span className="text-xs text-slate-400">
                                {formatTime(c.createdAt)}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-sm leading-6 text-slate-700">{c.content}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* 发布作品弹窗 — PUBLISH_ENABLED 控制显隐 */}
      {PUBLISH_ENABLED && publishOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setPublishOpen(false)}
          />
          <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">发布作品</h2>
              <button
                onClick={() => setPublishOpen(false)}
                className="text-slate-400 transition hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">标题</label>
                <input
                  value={publishTitle}
                  onChange={(e) => setPublishTitle(e.target.value)}
                  placeholder="给你的作品起个名字"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">类型</label>
                <select
                  value={publishType}
                  onChange={(e) => setPublishType(e.target.value as WorkType)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
                >
                  <option value="novel">小说</option>
                  <option value="image">图像</option>
                  <option value="comic">漫画</option>
                  <option value="audio">音频</option>
                  <option value="video">视频</option>
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">内容</label>
                <textarea
                  value={publishContent}
                  onChange={(e) => setPublishContent(e.target.value)}
                  rows={6}
                  placeholder={
                    publishType === 'image'
                      ? '每行一个图片描述，将作为图片占位展示'
                      : '输入作品内容'
                  }
                  className="w-full resize-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm leading-6 text-slate-800 outline-none transition focus:border-community-400 focus:ring-2 focus:ring-community-100"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={() => setPublishOpen(false)}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                >
                  取消
                </button>
                <button
                  onClick={handlePublish}
                  disabled={
                    publishing ||
                    !publishTitle.trim().length ||
                    !publishContent.trim().length
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg bg-community-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-community-700 disabled:opacity-50"
                >
                  {publishing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                  发布
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <Footer />
    </div>
  )
}
