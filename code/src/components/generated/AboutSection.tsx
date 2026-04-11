import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { configApi } from '@/lib/api';

export default function AboutSection() {
  const [about, setAbout] = useState<any>(null);

  useEffect(() => {
    fetchAbout();
  }, []);

  const fetchAbout = async () => {
    try {
      const response = await configApi.getTable('about_config');
      if (response.data?.data?.[0]) {
        setAbout(response.data.data[0]);
      }
    } catch (error) {
      console.error('Failed to fetch about config:', error);
    }
  };

  // 默认值
  const defaultAbout = {
    title: '不只是工作室，更是创意伙伴',
    description: '我们相信，好的设计不只是好看，更要好用、好懂、好传播。',
    subtitle: '从 3D 建模到应用开发，从原画设计到职业咨询，我们提供的不只是服务，更是陪你成长的创意生态。无论你是想做一个酷炫的 3D 角色，还是开发一款自己的 App，或者只是想找个圈子一起进步，这里都欢迎你。',
    stats: [
      { value: '100+', label: '服务客户' },
      { value: '500+', label: '完成项目' }
    ],
    image_url: 'https://baas-api.wanwang.xin/toc/image/preview/creative-team-working.jpg?w=600&h=600&q=80',
    badge_text: '创意技术'
  };

  const data = about || defaultAbout;
  const stats = typeof data.stats === 'string' ? JSON.parse(data.stats) : (data.stats || defaultAbout.stats);

  return (
    <section className="py-20 bg-[#0F0F1A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              {data.title.split('，').map((part: string, index: number) => (
                <span key={index}>
                  {index === 1 ? (
                    <>
                      <br />
                      <span className="bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] bg-clip-text text-transparent">
                        {part}
                      </span>
                    </>
                  ) : (
                    part
                  )}
                </span>
              ))}
            </h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              {data.description}
            </p>
            <p className="text-gray-400 leading-relaxed mb-8">
              {data.subtitle || data.description2}
            </p>
            <div className="grid grid-cols-2 gap-6">
              {stats.map((stat: { value: string; label: string }, index: number) => (
                <div key={index}>
                  <div className="text-3xl font-bold bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] bg-clip-text text-transparent">
                    {stat.value}
                  </div>
                  <div className="text-gray-400 text-sm mt-1">{stat.label}</div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="aspect-square bg-gradient-to-br from-[#4A5BFF]/20 to-[#7B3FF2]/20 rounded-3xl overflow-hidden">
              <img
                src={data.image_url}
                alt="团队工作场景"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] rounded-2xl flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-2xl font-bold">{data.badge_text}</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
