import { Link } from 'react-router-dom';
import { FaWeixin, FaEnvelope, FaGithub, FaZhihu } from 'react-icons/fa';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  const quickLinks = [
    { path: '/services', label: '服务项目' },
    { path: '/portfolio', label: '作品集' },
    { path: '/about', label: '关于我们' },
    { path: '/community', label: '学习社区' },
  ];

  const services = [
    '3D 建模',
    '应用开发',
    '原画设计',
    '学习交友',
    '教育咨询',
  ];

  return (
    <footer className="bg-[#0A0A0F] border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-xl">G</span>
              </div>
              <span className="text-white font-bold text-lg">盖可设计圈</span>
            </div>
            <p className="text-gray-400 text-sm leading-relaxed">
              让创意落地，让设计发声
            </p>
            <p className="text-gray-400 text-sm mt-2">
              技能 + 学习 + 社交一体化的设计师成长社区
            </p>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">快速导航</h4>
            <ul className="space-y-2">
              {quickLinks.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-gray-400 hover:text-[#00F5FF] text-sm transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">服务项目</h4>
            <ul className="space-y-2">
              {services.map((service) => (
                <li key={service}>
                  <span className="text-gray-400 text-sm">{service}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">联系我们</h4>
            <ul className="space-y-3">
              <li className="flex items-center space-x-3 text-gray-400 text-sm">
                <FaWeixin className="text-[#00F5FF]" />
                <span>GeekDesignCircle</span>
              </li>
              <li className="flex items-center space-x-3 text-gray-400 text-sm">
                <FaEnvelope className="text-[#00F5FF]" />
                <span>contact@geekdesign.com</span>
              </li>
            </ul>
            <div className="flex space-x-4 mt-4">
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <FaGithub size={20} />
              </a>
              <a href="#" className="text-gray-400 hover:text-white transition-colors">
                <FaZhihu size={20} />
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10 mt-8 pt-8">
          <p className="text-gray-500 text-sm text-center">
            © {currentYear} 盖可设计圈。All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
