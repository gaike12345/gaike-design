import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { worksApi } from '@/lib/api';

export default function PortfolioSection() {
  const [portfolioItems, setPortfolioItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const fetchPortfolio = async () => {
    try {
      const response = await worksApi.getAll();
      const data = response.data?.data || [];
      
      // 只显示前4个
      const items = data.slice(0, 4).map((item: any) => ({
        ...item,
        category: item.category || '其他',
        image: item.image_url || '',
      }));
      
      setPortfolioItems(items);
    } catch (error) {
      console.error('Failed to fetch portfolio:', error);
    } finally {
      setLoading(false);
    }
  };

  // 默认数据
  const defaultItems = [
    {
      id: '1',
      title: '赛博朋克角色设计',
      category: '3D 建模',
      image: 'https://baas-api.wanwang.xin/toc/image/preview/cyberpunk-character-design.jpg?w=600&h=400&q=80',
    },
    {
      id: '2',
      title: '智能健康管理 App',
      category: '应用开发',
      image: 'https://baas-api.wanwang.xin/toc/image/preview/health-app-interface.jpg?w=600&h=400&q=80',
    },
    {
      id: '3',
      title: '奇幻场景概念图',
      category: '原画设计',
      image: 'https://baas-api.wanwang.xin/toc/image/preview/fantasy-scene-concept.jpg?w=600&h=400&q=80',
    },
    {
      id: '4',
      title: '品牌视觉系统',
      category: '原画设计',
      image: 'https://baas-api.wanwang.xin/toc/image/preview/brand-visual-system.jpg?w=600&h=400&q=80',
    },
  ];

  const displayItems = portfolioItems.length > 0 ? portfolioItems : defaultItems;

  return (
    <section className="py-20 bg-gradient-to-b from-[#0A0A0F] to-[#0F0F1A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            看看我们玩过的创意
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            每一个作品都是创意与技术的完美融合
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {displayItems.map((item, index) => (
            <motion.div
              key={item.id || index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="group relative overflow-hidden rounded-2xl cursor-pointer"
            >
              <div className="aspect-video">
                <img
                  src={item.image || item.image_url}
                  alt={item.title}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#4A5BFF]/90 via-[#7B3FF2]/60 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500">
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <span className="inline-block px-3 py-1 bg-[#4A5BFF]/80 text-white text-xs rounded-full mb-2">
                    {item.category}
                  </span>
                  <h3 className="text-xl font-bold text-white mb-2">{item.title}</h3>
                  <Link
                    to="/portfolio"
                    className="inline-flex items-center text-[#00F5FF] font-medium hover:text-white transition-colors"
                  >
                    查看案例
                    <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-12"
        >
          <Link
            to="/portfolio"
            className="inline-flex items-center px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-full border border-white/20 hover:bg-white/20 transition-all duration-300"
          >
            查看更多作品
            <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
