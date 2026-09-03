import FeatureLanding, { ACCENTS, type AccentColors, type LandingWork } from '../components/layout/FeatureLanding'
import { useSiteConfig, makeAccent } from '../hooks/useSiteConfig'
import CoverCarousel3D from '../components/preview/CoverCarousel3D'
import {
  Sparkles,
  FileText,
  Users,
  Palette,
} from 'lucide-react'
import type { ReactNode } from 'react'
import React from 'react'

/** 小说写作 Hero 背景装饰：稿纸横线 + 墨点 + 墨晕（移除浮动文字） */
function NovelHeroDecor({ accent }: { accent: string }): ReactNode {
  return (
    <>
      <div className="absolute left-0 right-0 top-[24%] space-y-5 opacity-[0.10]">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-px"
            style={{
              backgroundColor: i % 5 === 4 ? accent : '#8a7a5a',
              marginLeft: `${6 + (i % 3) * 5}%`,
              marginRight: `${10 + (i % 2) * 8}%`,
            }} />
        ))}
      </div>
      <div className="absolute left-[12%] top-[60%] h-3 w-3 rounded-full opacity-50 shadow-[0_0_8px_2px_rgba(99,102,241,0.3)]" style={{ backgroundColor: accent }} />
      <div className="absolute left-[80%] top-[42%] h-2.5 w-2.5 rounded-full opacity-40" style={{ backgroundColor: accent }} />
      <div className="absolute left-[35%] top-[88%] h-1.5 w-1.5 rounded-full opacity-50" style={{ backgroundColor: accent }} />
      <div className="absolute left-[65%] top-[65%] h-3.5 w-3.5 rounded-full opacity-30" style={{ backgroundColor: accent }} />
      <div className="absolute left-[45%] top-[50%] h-1 w-1 rounded-full opacity-40" style={{ backgroundColor: accent }} />
      <div className="absolute left-[72%] top-[75%] h-2 w-2 rounded-full opacity-35" style={{ backgroundColor: accent }} />
      <div className="absolute left-[3%]  top-[15%] h-44 w-44 rounded-full opacity-[0.22] blur-2xl" style={{ backgroundColor: accent }} />
      <div className="absolute right-[8%]  bottom-[10%] h-56 w-56 rounded-full opacity-[0.18] blur-3xl" style={{ backgroundColor: accent }} />
      <div className="absolute left-[35%] top-[55%] h-28 w-28 rounded-full opacity-[0.14] blur-xl" style={{ backgroundColor: accent }} />
    </>
  )
}

/** 小说写作精选 4 作 */
const NOVEL_WORKS: LandingWork[] = [
  // 用户上传的真实小说封面（3 张）
  {
    cover: '/covers/novel-1-shuangxing-jian-sheng.png',
    typeLabel: '异界奇幻',
    title: '双星剑圣 · 命运之章',
    author: '霜月苍',
    likes: 8962,
    filter: 'novel',
  },
  {
    cover: '/covers/novel-2-shenyuan-zhi-yan.png',
    typeLabel: '黑暗异能',
    title: '深渊之眼 · 觉醒者的宿命之战',
    author: '鸦月',
    likes: 7613,
    filter: 'novel',
  },
  {
    cover: '/covers/novel-3-wendao-changsheng.png',
    typeLabel: '古风修仙',
    title: '问道长生 · 修仙',
    author: '墨玄',
    likes: 10248,
    filter: 'novel',
  },
  // 凑足 6 件（让 3D 环 n=6 与其他两页完全同步，半径与视觉比例一致），题材互补
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Eastern%20fantasy%20novel%20cover%2C%20sea%20of%20clouds%2C%20mysterious%20scholar%20with%20white%20nine-tailed%20fox%2C%20ink%20painting%2C%20ethereal%20mist%2C%20golden%20lighting%2C%20hardcover%20book&image_size=landscape_4_3',
    typeLabel: '东方玄幻',
    title: '云海仙踪',
    author: '墨流云',
    likes: 2486,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Romantic%20republic%20era%20Chinese%20novel%20cover%2C%20young%20woman%20in%20qipao%20holding%20paper%20umbrella%20in%20rain%20alley%2C%20vintage%20lantern%20glow%2C%20teal%20red%20cinematic&image_size=landscape_4_3',
    typeLabel: '民国言情',
    title: '烟雨长巷',
    author: '苏黛',
    likes: 4271,
    filter: 'novel',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Youth%20campus%20light%20novel%20cover%2C%20two%20high%20school%20students%20back%20view%20by%20cherry%20blossom%20tree%2C%20spring%20sunset%2C%20pastel%20pink%20soft%20watercolor&image_size=landscape_4_3',
    typeLabel: '青春校园',
    title: '樱花下的约定',
    author: '立夏',
    likes: 3085,
    filter: 'novel',
  },
]

/** 功能预览页：/novel — 小说写作（预览 → 进入写作工作区 /writing） */
export default function NovelLanding() {
  const { get } = useSiteConfig()
  const accentHex = get('ln.accent', ACCENTS.novel.main) as string
  const title = get('ln.title', 'AI 小说创作引擎') as string
  const desc = get('ln.desc', '从灵感闪现到完整作品，AI 全程辅助你的创作旅程。智能续写保持风格一致，大纲生成快速搭建框架，角色塑造让故事更生动。') as string
  const accent = makeAccent(accentHex, ACCENTS.novel)
  return (
    <>
      <FeatureLanding
      tag="小说写作"
      heroTitle={{ highlight: title }}
      heroDesc={desc}
      primaryCta={{ label: '进入写作工作区', to: '/workspace/writing' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '社区小说封面预览 · 3D 轮转展示', maxWidthPx: 360, custom: <CoverCarousel3D works={NOVEL_WORKS} accent={accent.main} faceWidth={200} ringRadiusScale={1.3} /> }}
      heroDecor={<NovelHeroDecor accent={accent.main} />}
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
      finalCta={{
        title: '准备好开始写作了吗？',
        desc: '让 AI 成为你的创作伙伴，释放无限想象力。',
        button: { label: '立即进入写作工作区', to: '/workspace/writing' },
      }}
      accent={accent}
    />
    </>
  )
}
