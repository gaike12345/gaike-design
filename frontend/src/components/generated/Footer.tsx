import { Link } from 'react-router-dom';
import { FaWeixin, FaEnvelope, FaGithub, FaZhihu } from 'react-icons/fa';
import { configApi } from '@/lib/api';
import { useState, useEffect } from 'react';

const defaultContactInfo = [
  { type: 'wechat', label: '微信', value: 'GeekDesignCircle', icon: 'FaWeixin' },
  { type: 'email', label: '邮箱', value: 'contact@geekdesign.com', icon: 'FaEnvelope' },
];

const defaultSocialLinks = [
  { platform: 'github', url: '#', icon: FaGithub },
  { platform: 'zhihu', url: '#', icon: FaZhihu },
];

const iconMap: Record<string, any> = {
  FaWeixin,
  FaEnvelope,
  FaGithub,
  FaZhihu,
};

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

const [footerServices, setFooterServices] = useState<string[]>(services);

useEffect(() => {
  const fetchFooterServices = async () => {
    try {
      const res = await configApi.getTable('booking_services');
      const data = res.data?.data || [];
      if (data.length > 0) {
        const names = data
          .map((s: any) => s.name || s.title)
          .filter(Boolean)
          .slice(0, 6);
        if (names.length > 0) setFooterServices(names);
      }
    } catch {
      // ignore errors, fallback to hardcoded
    }
  };
  fetchFooterServices();
}, []);

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const [contactInfo, setContactInfo] = useState(defaultContactInfo);
  const [socialLinks, setSocialLinks] = useState(defaultSocialLinks);

  useEffect(() => {
    const fetchFooterData = async () => {
      try {
        const contactRes = await configApi.getTable('contact_config');
        const contacts = contactRes.data?.data || [];
        if (contacts.length > 0) {
          const mapped = contacts
            .map((c: any) => ({
              type: c.type || c.key || 'wechat',
              label: c.label || c.type || c.key || '联系方式',
              value: c.value || '',
              icon: c.icon || c.type || 'FaWeixin',
            }))
            .filter((c: any) => c.value)
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          if (mapped.length > 0) setContactInfo(mapped);
        }

        const settingsRes = await configApi.getTable('site_settings');
        const settings = settingsRes.data?.data || [];
        if (settings.length > 0) {
          const socialSetting = settings.find((s: any) => s.key === 'social_links');
          if (socialSetting) {
            try {
              const links = typeof socialSetting.value === 'string'
                ? JSON.parse(socialSetting.value)
                : socialSetting.value;
              if (Array.isArray(links) && links.length > 0) {
                const mapped = links
                  .map((l: any) => ({
                    platform: l.platform || l.name || 'link',
                    url: l.url || l.href || '#',
                    icon: iconMap[l.icon] || iconMap[`Fa${l.platform}`] || FaZhihu,
                  }))
                  .filter((l: any) => l.url && l.url !== '#');
                if (mapped.length > 0) setSocialLinks(mapped);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (error) {
        console.error('获取页脚数据失败:', error);
      }
    };
    fetchFooterData();
  }, []);

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
              {footerServices.map((service) => (
                <li key={service}>
                  <span className="text-gray-400 text-sm">{service}</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="text-white font-semibold mb-4">联系我们</h4>
            <ul className="space-y-3">
              {contactInfo.map((item) => {
                const IconComponent = iconMap[item.icon] || FaWeixin;
                return (
                  <li key={item.type} className="flex items-center space-x-3 text-gray-400 text-sm">
                    <IconComponent className="text-[#00F5FF]" />
                    <span>{item.value}</span>
                  </li>
                );
              })}
            </ul>
            <div className="flex space-x-4 mt-4">
              {socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <link.icon size={20} />
                </a>
              ))}
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
