import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  Users,
  Heart,
  Share2,
  Sparkles as SparklesIcon,
} from 'lucide-react'

/** 社区广场精选作品：跨类型的综合代表 4 作 */
const COMMUNITY_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Chinese%20ancient%20fantasy%20novel%20cover%2C%20sea%20of%20clouds%2C%20mysterious%20scholar%20with%20white%20nine-tailed%20fox%2C%20ink%20painting%2C%20ethereal%20mist%2C%20golden%20lighting%2C%20hardcover%20book&image_size=landscape_4_3',
    typeLabel: '小说·古风玄幻',
    title: '云海仙踪',
    author: '墨流云',
    likes: 2486,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Cyberpunk%20girl%20concept%20portrait%2C%20neon%20glowing%20circuit%20tattoos%2C%20futuristic%20city%20background%2C%20ultra%20detailed%20digital%20painting%2C%20pink%20cyan%20neon&image_size=landscape_4_3',
    typeLabel: '图像·概念原画',
    title: '赛博少女肖像',
    author: 'CYBER',
    likes: 8234,
    filter: 'image',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Manga%20cyberpunk%20mecha%20girl%20cover%2C%20neon%20tokyo%20background%2C%20pink%20robot%20armor%20anime%20heroine%2C%20comic%20panel%20borders%2C%20speed%20lines&image_size=landscape_4_3',
    typeLabel: '漫画·赛博朋克',
    title: '机甲少女娜娜',
    author: 'NEKO',
    likes: 4821,
    filter: 'comic',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Bedtime%20story%20audiobook%20cover%2C%20dreamy%20starry%20night%20sky%20soft%20crescent%20moon%2C%20tiny%20open%20book%20flying%20among%20glowing%20stars%2C%20cozy%20pastel%20purple&image_size=landscape_4_3',
    typeLabel: '音频·有声书',
    title: '枕边故事·星空旅人',
    author: '暖声',
    likes: 3210,
    filter: 'audio',
  },
]

/** 功能预览页：/community — 社区 */
export default function CommunityLanding() {
  return (
    <FeatureLanding
      tag="社区广场"
      heroTitle={{ prefix: '与百万创作者', highlight: '彼此点亮' }}
      heroDesc="作品广场、做同款一键复刻、模型市场、创作者主页。点赞、收藏、评论、关注，在 MankTV 找到你的创作同好。"
      primaryCta={{ label: '进入社区广场', to: '/workspace/community' }}
      secondaryCta={{ label: '了解定价方案', to: '/pricing' }}
      preview={{ title: '社区广场界面', custom: <PreviewMock /> }}
      works={COMMUNITY_WORKS}
      abilities={[
        {
          icon: <SparklesIcon className="h-6 w-6" />,
          title: '作品广场',
          desc: '集中展示文字小说、图文漫画、插画作品、播客音频、短视频，一站浏览所有类型。',
        },
        {
          icon: <Share2 className="h-6 w-6" />,
          title: '做同款 / 一键复刻',
          desc: '看到喜欢的作品直接「做同款」，原作者的 Prompt、参数、工作流一键带入你的工作区。',
        },
        {
          icon: <Heart className="h-6 w-6" />,
          title: '互动与收藏',
          desc: '点赞、收藏、评论、关注作者，建立自己的灵感收藏夹和长期追更列表。',
        },
        {
          icon: <Users className="h-6 w-6" />,
          title: '创作者主页',
          desc: '每位创作者都有独立主页，展示作品集、粉丝数、签名和可复用的模型 / 工作流。',
        },
      ]}
      steps={[
        { title: '浏览广场', desc: '按题材 / 形式 / 标签筛选作品，发现喜欢的作者与灵感。' },
        { title: '一键做同款', desc: '点「做同款」把原作者的 Prompt + 参数带入你的对应工作区，立刻开始创作。' },
        { title: '发布与成长', desc: '发布自己的作品，累积粉丝与点赞，进入平台推荐与作者激励计划。' },
      ]}
      finalCta={{
        title: '来社区和同好见面吧！',
        desc: 'MankTV 的社区是创作者驱动的：灵感 × 作品 × 创作者，彼此点燃。',
        button: { label: '立即进入社区广场', to: '/workspace/community' },
      }}
      accent={ACCENTS.community}
    />
  )
}

function PreviewMock() {
  return (
    <div className="h-full w-full p-2.5 text-xs text-slate-300">
      <div className="grid h-full grid-cols-3 gap-2">
        {[0,1,2,3,4,5].map((i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded bg-white/5">
            <div className="aspect-square bg-gradient-to-br from-blue-500/20 via-indigo-500/20 to-slate-500/20" />
            <div className="p-1.5 space-y-1">
              <div className="h-2 w-3/4 rounded bg-white/10" />
              <div className="flex items-center justify-between text-[9px] text-slate-400">
                <span className="flex items-center gap-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                  作者{i+1}
                </span>
                <span>❤ {120 + i*37}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
