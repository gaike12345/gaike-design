import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FaStar, FaArrowRight } from 'react-icons/fa';
import { useState, useEffect } from 'react';
import { configApi } from '@/lib/api';

export default function CaseStudiesSection() {
  const [caseStudies, setCaseStudies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCaseStudies();
  }, []);

  const fetchCaseStudies = async () => {
    try {
      const response = await configApi.getTable('case_studies');
      const data = response.data?.data || [];
      
      // 只显示前3个案例
      setCaseStudies(data.slice(0, 3));
    } catch (error) {
      console.error('Failed to fetch case studies:', error);
    } finally {
      setLoading(false);
    }
  };

  // 默认案例数据
  const defaultCaseStudies = [
    {
      id: 1,
      title: '《赛博纪元》角色设计',
      client: '某独立游戏工作室',
      category: '3D建模',
      challenge: '需要在 2 周内完成 5 个主要角色的完整设计，包括原画、3D 建模和绑定',
      solution: '采用模块化设计流程，先统一风格设定，再分工并行制作，每日同步进度',
      result: '提前 2 天交付，客户满意度 98%，角色上线后获得玩家一致好评',
      testimonial: '盖可团队的专业能力和执行力超出预期，角色设计完美还原了我们想要的赛博朋克风格！',
      rating: 5,
      image_url: 'https://baas-api.wanwang.xin/toc/image/preview/cyber-game-character.jpg?w=800&h=500&q=80',
    },
    {
      id: 2,
      title: '健康管家 App 全案开发',
      client: '某健康科技创业公司',
      category: '应用开发',
      challenge: '从 0 到 1 打造完整产品，需要兼顾用户体验和技术可行性，预算有限',
      solution: '采用 MVP 敏捷开发模式，优先核心功能，使用跨平台方案降低成本',
      result: '3 个月上线 MVP 版本，获得种子用户 5000+，成功拿到天使轮融资',
      testimonial: '不仅帮我们做出了产品，还提供了很多产品层面的建议，是真正的合作伙伴！',
      rating: 5,
      image_url: 'https://baas-api.wanwang.xin/toc/image/preview/health-app-development.jpg?w=800&h=500&q=80',
    },
    {
      id: 3,
      title: '奇幻电影概念设计',
      client: '某影视制作公司',
      category: '原画设计',
      challenge: '需要构建完整的奇幻世界观，包括场景、角色、道具等全方位概念设计',
      solution: '组建 5 人专项团队，深入研究奇幻文化，创作超过 200 张概念图',
      result: '设计方案获得导演高度认可，多个场景被完整采用到电影中',
      testimonial: '团队对奇幻文化的理解和创造力令人印象深刻，为电影增色不少！',
      rating: 5,
      image_url: 'https://baas-api.wanwang.xin/toc/image/preview/fantasy-movie-concept.jpg?w=800&h=500&q=80',
    },
  ];

  const displayCases = caseStudies.length > 0 ? caseStudies : defaultCaseStudies;

  return (
    <section className="py-20 bg-[#0A0A0F]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            客户案例见证
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            真实项目案例，见证我们的专业实力
          </p>
        </motion.div>

        <div className="space-y-12">
          {displayCases.map((study, index) => (
            <motion.div
              key={study.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center"
            >
              <div className={`order-2 lg:order-${index % 2 === 0 ? 1 : 2}`}>
                <div className="aspect-video rounded-2xl overflow-hidden">
                  <img
                    src={study.image_url}
                    alt={study.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className={`order-1 lg:order-${index % 2 === 0 ? 2 : 1}`}>
                <div className="mb-4">
                  <span className="px-3 py-1 bg-[#4A5BFF]/20 text-[#00F5FF] text-sm rounded-full">
                    {study.category}
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {study.title}
                </h3>
                <p className="text-gray-400 mb-6">{study.client}</p>

                <div className="space-y-4 mb-6">
                  <div>
                    <div className="text-white font-semibold mb-1">挑战</div>
                    <p className="text-gray-400 text-sm">{study.challenge}</p>
                  </div>
                  <div>
                    <div className="text-white font-semibold mb-1">解决方案</div>
                    <p className="text-gray-400 text-sm">{study.solution}</p>
                  </div>
                  <div>
                    <div className="text-white font-semibold mb-1">成果</div>
                    <p className="text-gray-400 text-sm">{study.result}</p>
                  </div>
                </div>

                <div className="bg-white/5 rounded-xl p-4 border border-white/10 mb-6">
                  <div className="flex items-center mb-3">
                    {[...Array(study.rating || 5)].map((_, i) => (
                      <FaStar key={i} className="text-[#FF9A56] mr-1" />
                    ))}
                  </div>
                  <p className="text-gray-300 italic">"{study.testimonial}"</p>
                </div>

                <Link
                  to="/contact"
                  className="inline-flex items-center text-[#00F5FF] font-medium hover:text-white transition-colors"
                >
                  类似项目咨询
                  <FaArrowRight className="ml-2" />
                </Link>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
