import { Link } from 'react-router-dom';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0A0A0F]">
      <Header />
      <main className="pt-20 min-h-[70vh] flex items-center justify-center">
        <div className="text-center px-4">
          <div className="text-8xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] mb-4">404</div>
          <h1 className="text-3xl font-bold text-white mb-4">页面不存在</h1>
          <p className="text-gray-400 mb-8 max-w-md mx-auto">
            你访问的页面可能已被移除、名称已更改，或者 URL 地址有误。
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/"
              className="px-6 py-3 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-lg hover:opacity-90 transition-opacity"
            >
              返回首页
            </Link>
            <Link
              to="/contact"
              className="px-6 py-3 bg-white/10 text-white font-semibold rounded-lg hover:bg-white/20 transition-colors"
            >
              联系我们
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
