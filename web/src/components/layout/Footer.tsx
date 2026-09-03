import { useState } from 'react'
import { Link } from 'react-router-dom'
import { X, ShieldCheck } from 'lucide-react'
import logo from '../../assets/logo.png'
import { useSiteThemeVars } from '../../hooks/useSiteConfig'
import LegalModal, { type LegalType } from '../LegalModal'

const LINKS = [
  { title: '产品', items: [
    { label: '小说写作', href: '/novel' },
    { label: '图像创作', href: '/image' },
    { label: '音频创作', href: '/audio' },
    { label: '视频创作', href: '/video' },
  ] },
  { title: '社区', items: [
    { label: '作品广场', href: '/community' },
    { label: '创作教程', href: '/community' },
    { label: '用户评价', href: '/about' },
  ] },
  { title: '支持', items: [
    { label: '定价方案', href: '/pricing' },
    { label: '关于我们', href: '/about' },
    { label: '联系我们', href: '/about' },
  ] },
]

// 备案信息弹窗（独立于 LegalModal，展示备案号占位 + 合规说明）
function FilingModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative flex max-h-[80vh] w-[92vw] max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-bold text-neutral-900">
            <ShieldCheck className="h-5 w-5 text-green-600" />
            备案信息
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-700" aria-label="关闭">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-relaxed text-neutral-700">
          <p className="mb-3">本平台严格遵守中华人民共和国相关法律法规，已完成以下备案：</p>
          <ul className="mb-3 space-y-2 pl-5">
            <li className="list-disc">生成式人工智能服务备案（备案号以平台公示为准）</li>
            <li className="list-disc">生成式人工智能算法备案（备案号以平台公示为准）</li>
            <li className="list-disc">ICP 备案（以平台公示为准）</li>
            <li className="list-disc">公安联网备案（以平台公示为准）</li>
          </ul>
          <p className="mb-2">本平台对生成内容实施输入与输出双重审核（至少接入两个内容安全服务），履行生成式人工智能服务合规义务。</p>
          <p className="text-xs text-neutral-500">如需查询具体备案号，请联系客服或发送邮件至 13372729368@163.com。</p>
        </div>
        <div className="shrink-0 border-t border-neutral-200 px-6 py-3">
          <button onClick={onClose} className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-800">
            我知道了
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Footer() {
  const { siteName, siteSlogan, footerCopy, primaryColor } = useSiteThemeVars()
  const hoverStyle = { color: primaryColor }

  // 弹窗状态：terms / privacy / filing
  const [legalType, setLegalType] = useState<LegalType | null>(null)
  const [showFiling, setShowFiling] = useState(false)

  return (
    <footer className="border-t border-neutral-200 bg-white">
      <div className="container-page py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 font-semibold text-neutral-900">
              <img src={logo} alt={`${siteName} logo`} className="h-8 w-8" />
              <span>{siteName}</span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-neutral-500">{siteSlogan}</p>
          </div>
          {LINKS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{col.title}</h4>
              <ul className="mt-3 space-y-2">
                {col.items.map((it) => (
                  <li key={it.label}>
                    <Link to={it.href} className="text-sm text-neutral-600 hover:opacity-80 transition-colors" style={hoverStyle}>
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-neutral-200 pt-6 text-xs text-neutral-500 sm:flex-row sm:items-center">
          <p>{footerCopy}</p>
          <div className="flex gap-4">
            {/* 协议链接改为按钮，点击触发弹窗 */}
            <button
              type="button"
              onClick={() => setLegalType('terms')}
              className="transition-colors hover:opacity-80"
              style={hoverStyle}
            >
              用户协议
            </button>
            <button
              type="button"
              onClick={() => setLegalType('privacy')}
              className="transition-colors hover:opacity-80"
              style={hoverStyle}
            >
              隐私政策
            </button>
            <button
              type="button"
              onClick={() => setShowFiling(true)}
              className="transition-colors hover:opacity-80"
              style={hoverStyle}
            >
              备案信息
            </button>
          </div>
        </div>
      </div>

      {/* 弹窗渲染 */}
      <LegalModal type="terms" open={legalType === 'terms'} onClose={() => setLegalType(null)} />
      <LegalModal type="privacy" open={legalType === 'privacy'} onClose={() => setLegalType(null)} />
      <FilingModal open={showFiling} onClose={() => setShowFiling(false)} />
    </footer>
  )
}
