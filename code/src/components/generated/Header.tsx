import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FaBars, FaTimes } from 'react-icons/fa';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', label: '首页' },
    { path: '/services', label: '服务项目' },
    { path: '/portfolio', label: '作品集' },
    { path: '/about', label: '关于我们' },
    { path: '/community', label: '学习社区' },
    { path: '/blog', label: '博客动态' },
    { path: '/contact', label: '联系我们' },
  ];

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#0A0A0F]/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          <Link to="/" className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-xl">G</span>
            </div>
            <span className="text-white font-bold text-xl hidden sm:block">盖可设计圈</span>
          </Link>

          <nav className="hidden lg:flex items-center space-x-8">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`text-sm font-medium transition-colors duration-300 ${
                  isActive(item.path)
                    ? 'text-[#00F5FF]'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:block">
            <Link
              to="/contact"
              className="px-6 py-2.5 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-medium rounded-full hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 transform hover:scale-105"
            >
              立即咨询
            </Link>
          </div>

          <button
            className="lg:hidden text-white p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <FaTimes size={24} /> : <FaBars size={24} />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="lg:hidden bg-[#0A0A0F] border-t border-white/10">
          <div className="px-4 py-4 space-y-3">
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`block px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive(item.path)
                    ? 'bg-[#4A5BFF]/20 text-[#00F5FF]'
                    : 'text-gray-300 hover:bg-white/5'
                }`}
                onClick={() => setIsMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              to="/contact"
              className="block w-full text-center px-6 py-3 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-medium rounded-lg mt-4"
              onClick={() => setIsMenuOpen(false)}
            >
              立即咨询
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
