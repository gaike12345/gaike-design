import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  Sparkles,
  FileText,
  Users,
  Palette,
  Lightbulb,
  Cpu,
  Rocket,
} from 'lucide-react'

/** 小说写作精选 4 作 */
const NOVEL_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Chinese%20ancient%20fantasy%20novel%20cover%2C%20sea%20of%20clouds%2C%20mysterious%20scholar%20with%20white%20nine-tailed%20fox%2C%20ink%20painting%2C%20ethereal%20mist%2C%20golden%20lighting%2C%20hardcover%20book&image_size=landscape_4_3',
    typeLabel: '古风玄幻',
    title: '云海仙踪',
    author: '墨流云',
    likes: 2486,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Cyberpunk%20sci-fi%20detective%20novel%20cover%2C%20neon%20tokyo%20alley%20rain%2C%20wet%20street%20reflections%2C%20silhouette%20with%20holographic%20screen%2C%20purple%20blue%20neon%20glow%2C%20noir&image_size=landscape_4_3',
    typeLabel: '科幻都市',
    title: '赛博迷城',
    author: '陈思源',
    likes: 1932,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Romantic%20space%20opera%20novel%20cover%2C%20two%20figures%20embracing%20against%20starry%20nebula%20background%2C%20astronaut%20and%20woman%20in%20dress%2C%20soft%20purple%20and%20gold%20light%2C%20dreamy%20bokeh%20stars&image_size=landscape_4_3',
    typeLabel: '星际言情',
    title: '星辰彼岸',
    author: '苏清',
    likes: 3158,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Mystery%20horror%20japanese%20novel%20cover%2C%20misty%20village%20at%20dusk%2C%20old%20torii%20gate%20on%20lake%2C%20eerie%20dark%20atmosphere%20with%20single%20dim%20lantern%2C%20teal%20and%20crimson%20cinematic&image_size=landscape_4_3',
    typeLabel: '悬疑惊悚',
    title: '雾隐村怪谈',
    author: '夜行者',
    likes: 1674,
    filter: 'novel',
  },
]

/** 功能预览页：/novel — 小说写作（预览 → 进入写作工作区 /writing） */
export default function NovelLanding() {
  return (
    <FeatureLanding
      tag="小说写作"
      heroTitle={{ prefix: 'AI 助你', highlight: '笔下生花' }}
      heroDesc="从灵感闪现到完整作品，AI 全程辅助你的创作旅程。智能续写保持风格一致，大纲生成快速搭建框架，角色塑造让故事更生动。"
      primaryCta={{ label: '进入写作工作区', to: '/workspace/writing' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '小说写作工具界面', custom: <CustomPreview /> }}
      works={NOVEL_WORKS}
      abilities={[
        {
          icon: <Sparkles className="h-6 w-6" />,
          title: '智能续写',
          desc: '基于上下文自动生成后续内容，保持风格一致，突破创作瓶颈。',
        },
        {
          icon: <FileText className="h-6 w-6" />,
          title: '大纲生成',
          desc: '输入主题自动生成故事大纲，分卷分章快速搭建剧情骨架。',
        },
        {
          icon: <Users className="h-6 w-6" />,
          title: '角色塑造',
          desc: 'AI 辅助构建角色背景、性格和对话风格，让人物更立体。',
        },
        {
          icon: <Palette className="h-6 w-6" />,
          title: '多风格切换',
          desc: '支持玄幻、言情、科幻、悬疑等多种文风，一键切换叙事节奏。',
        },
      ]}
      steps={[
        {
          title: '创建项目',
          desc: '设定题材、风格、世界观与基本设定，AI 帮你生成故事总纲。',
        },
        {
          title: 'AI 辅助写作',
          desc: '使用续写、大纲、角色等 12+ 工具，AI 陪伴你完成每一卷每一章。',
        },
        {
          title: '导出与发布',
          desc: '导出 TXT/EPUB/Docx 多种格式，或直接发布到 MankTV 社区广场。',
        },
      ]}
      finalCta={{
        title: '准备好开始写作了吗？',
        desc: '让 AI 成为你的创作伙伴，释放无限想象力。',
        button: { label: '立即进入写作工作区', to: '/workspace/writing' },
      }}
      accent={ACCENTS.novel}
    />
  )
}

function CustomPreview() {
  return (
    <div className="h-full w-full p-4 text-left text-xs text-slate-300">
      <div className="flex h-full gap-2">
        {/* 左侧章节树模拟 */}
        <div className="w-[30%] rounded-lg bg-white/5 p-2">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">章节</div>
          <div className="space-y-1">
            <div className="rounded bg-blue-500/20 px-2 py-1 text-[11px] text-blue-300">卷一 · 启程</div>
            <div className="ml-2 px-2 py-1 text-[11px] text-slate-400">第1章 初见</div>
            <div className="ml-2 rounded bg-white/5 px-2 py-1 text-[11px] text-slate-200">第2章 迷雾</div>
            <div className="ml-2 px-2 py-1 text-[11px] text-slate-400">第3章 抉择</div>
          </div>
        </div>
        {/* 中间正文 */}
        <div className="flex-1 rounded-lg bg-white/5 p-3">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">正文 · 第2章</div>
          <div className="space-y-2 leading-relaxed">
            <div className="h-2 w-4/5 rounded bg-white/10" />
            <div className="h-2 w-full rounded bg-white/10" />
            <div className="h-2 w-3/4 rounded bg-white/10" />
            <div className="h-2 w-5/6 rounded bg-white/10" />
            <div className="mt-2 h-8 w-1/2 rounded-md bg-gradient-to-r from-blue-500/30 to-indigo-500/30" />
            <div className="h-2 w-full rounded bg-white/10" />
          </div>
        </div>
        {/* 右侧AI工具 */}
        <div className="w-[28%] rounded-lg bg-white/5 p-2">
          <div className="mb-2 text-[10px] uppercase tracking-wider text-slate-500">AI 工具</div>
          {[Sparkles, FileText, Users, Lightbulb, Cpu, Rocket].map((Ic, i) => (
            <div key={i} className="mb-1.5 flex items-center gap-1.5 rounded px-1.5 py-1 text-[10px] hover:bg-white/5">
              <Ic className="h-3 w-3 text-blue-400" />
              <span className="text-slate-300">工具 {i + 1}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
