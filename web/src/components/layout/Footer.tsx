import { Link } from 'react-router-dom'
import logo from '../../assets/logo.svg'

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

export default function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-brand-50">
      <div className="container-page py-12">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
              <img src={logo} alt="MankTV logo" className="h-8 w-8" />
              <span>MankTV</span>
            </Link>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              AI 驱动的全能创作平台，文字、图像、声音、影像、漫画，一个平台全搞定。
            </p>
          </div>
          {LINKS.map((col) => (
            <div key={col.title}>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {col.title}
              </h4>
              <ul className="mt-3 space-y-2">
                {col.items.map((it) => (
                  <li key={it.label}>
                    <Link
                      to={it.href}
                      className="text-sm text-slate-600 hover:text-brand-600"
                    >
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-slate-200 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center">
          <p>© 2026 MankTV · 生成式人工智能服务已备案</p>
          <div className="flex gap-4">
            <a href="#" className="hover:text-brand-600">用户协议</a>
            <a href="#" className="hover:text-brand-600">隐私政策</a>
            <a href="#" className="hover:text-brand-600">备案信息</a>
          </div>
        </div>
      </div>
    </footer>
  )
}
