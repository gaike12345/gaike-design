import FeatureLanding, { ACCENTS, type LandingWork } from '../components/layout/FeatureLanding'
import {
  Music4,
  Mic2,
  Sliders,
  Languages,
} from 'lucide-react'

const AUDIO_WORKS: LandingWork[] = [
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Bedtime%20story%20audiobook%20cover%2C%20dreamy%20starry%20night%20sky%20soft%20crescent%20moon%2C%20tiny%20open%20book%20flying%20among%20glowing%20stars%2C%20cozy%20pastel%20purple&image_size=landscape_4_3',
    typeLabel: '有声书',
    title: '枕边故事·星空旅人',
    author: '暖声',
    likes: 3210,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Piano%20spring%20album%20cover%2C%20grand%20piano%20with%20cherry%20blossoms%2C%20warm%20morning%20sunlight%20through%20window%2C%20soft%20bokeh%2C%20cozy%20music%20room&image_size=landscape_4_3',
    typeLabel: 'BGM 专辑',
    title: '晨间钢琴·春日',
    author: '音律',
    likes: 2876,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=Urban%20legend%20horror%20podcast%20cover%2C%20dark%20city%20alley%20mysterious%20shadows%2C%20single%20flickering%20old%20lamp%2C%20moody%20teal%20noir%20vintage%20microphone&image_size=landscape_4_3',
    typeLabel: '悬疑播客',
    title: '都市怪谈·第3季',
    author: '夜行',
    likes: 4563,
    filter: 'audio',
  },
  {
    cover: 'https://trae-api-cn.mchost.guru/api/ide/v1/text_to_image?prompt=English%20learning%20podcast%20cover%2C%20open%20vintage%20classic%20book%20with%20cup%20of%20tea%2C%20antique%20library%20bookshelves%2C%20warm%20reading%20lamp%2C%20cozy%20study&image_size=landscape_4_3',
    typeLabel: '语言学习',
    title: '英语美文跟读',
    author: 'Luna',
    likes: 1982,
    filter: 'audio',
  },
]

/** 功能预览页：/audio — 音频创作 */
export default function AudioLanding() {
  return (
    <FeatureLanding
      tag="音频创作"
      heroTitle={{ prefix: '让每个角色', highlight: '发声' }}
      heroDesc="多角色 TTS 固定音色、情绪驱动 BGM、音轨混音、唇形同步。把小说脚本一键变成有声剧，把漫画分镜配上音效与配乐。"
      primaryCta={{ label: '进入音频工作区', to: '/workspace/audio' }}
      secondaryCta={{ label: '浏览社区作品', to: '/community' }}
      preview={{ title: '音频创作工具界面', custom: <PreviewMock /> }}
      works={AUDIO_WORKS}
      abilities={[
        {
          icon: <Mic2 className="h-6 w-6" />,
          title: '多角色 TTS',
          desc: '为每个角色绑定独有的音色，支持情绪（平静/激动/悲伤）变化，避免千篇一律。',
        },
        {
          icon: <Music4 className="h-6 w-6" />,
          title: 'BGM 情绪驱动',
          desc: '输入当前剧情情绪标签，AI 自动生成合适长度的背景音乐并自然循环。',
        },
        {
          icon: <Sliders className="h-6 w-6" />,
          title: '音轨混音台',
          desc: '配音 / BGM / 环境音 / 特效音 4 轨独立调节，支持淡入淡出与音量包络。',
        },
        {
          icon: <Languages className="h-6 w-6" />,
          title: '多语言多方言',
          desc: '中文（含方言）、英、日、韩一键切换语言版本，触达更广泛的听众。',
        },
      ]}
      steps={[
        { title: '拆分对白', desc: '自动从小说 / 漫画脚本中提取对白，自动分配到对应角色。' },
        { title: '音频合成', desc: '为每个角色挑选音色与情绪，生成对白、BGM 与环境音。' },
        { title: '混音导出', desc: '在混音台微调音轨，导出 MP3 / WAV，并可与视频板块联动合成。' },
      ]}
      finalCta={{
        title: '让你的作品有声音？',
        desc: '从独白到大型有声剧，AI 音频板块全程陪伴。',
        button: { label: '立即进入音频工作区', to: '/workspace/audio' },
      }}
      accent={ACCENTS.audio}
    />
  )
}

function PreviewMock() {
  const bar = (w: number, h: number, m: number) => (
    <div
      className="rounded bg-gradient-to-t from-blue-500/60 to-indigo-400/60"
      style={{ width: `${w}px`, height: `${h}px`, marginTop: `${m}px` }}
    />
  )
  return (
    <div className="h-full w-full p-3 text-xs text-slate-300">
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-[10px]">
          <span className="flex items-center gap-1"><Mic2 className="h-3 w-3 text-blue-300" />角色 A·旁白</span>
          <span className="text-slate-500">00:00 — 00:12</span>
        </div>
        <div className="flex h-14 items-end gap-[2px] rounded bg-white/5 px-2 py-2">
          {[8,14,22,10,18,28,12,34,20,8,16,30,22,10,26,34,18,12,20,28,10,16,22,18,8,30,24,14,20,12,28,34].map((h,i)=>(
            <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-blue-500/70 to-indigo-400/60" style={{ height: `${h}%` }} />
          ))}
        </div>
        <div className="flex items-center justify-between rounded bg-white/5 px-2 py-1 text-[10px]">
          <span className="flex items-center gap-1"><Music4 className="h-3 w-3 text-indigo-300" />BGM·钢琴+弦乐</span>
          <span className="text-slate-500">00:00 — 02:30</span>
        </div>
        <div className="flex h-14 items-center gap-[2px] rounded bg-white/5 px-2">
          {Array.from({length:34}).map((_,i)=>bar(4, 8+Math.sin(i*0.5)*14+16, 10+Math.cos(i)*6))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <div className="flex gap-1.5">
            <span className="rounded bg-blue-500/20 px-2 py-0.5 text-blue-200">播放</span>
            <span className="rounded bg-white/5 px-2 py-0.5">导出</span>
          </div>
          <span>总时长 02:30</span>
        </div>
      </div>
    </div>
  )
}
