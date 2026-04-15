import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { motion } from 'framer-motion';
import { FaRocket, FaHeart, FaLightbulb, FaUsers } from 'react-icons/fa';
import { teamApi } from '@/lib/api';
import { useState, useEffect } from 'react';

const defaultTeamMembers = [
  {
    name: 'Alex Chen',
    role: '创始人 & 创意总监',
    bio: '10 年创意设计经验，曾任职于多家知名设计公司',
    image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alex',
  },
  {
    name: 'Sarah Wang',
    role: '3D 艺术总监',
    bio: '资深 3D 艺术家，参与多个 AAA 游戏项目',
    image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah',
  },
  {
    name: 'Mike Liu',
    role: '技术负责人',
    bio: '全栈开发者，热衷于用技术实现创意想法',
    image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike',
  },
  {
    name: 'Emily Zhang',
    role: '教育顾问',
    bio: '资深设计教育专家，帮助数百名学生实现设计梦想',
    image: 'https://api.dicebear.com/7.x/avataaars/svg?seed=emily',
  },
];

const values = [
  {
    icon: FaLightbulb,
    title: '创意',
    description: '打破常规，用想象力创造无限可能',
    color: 'from-[#4A5BFF] to-[#00F5FF]',
  },
  {
    icon: FaRocket,
    title: '技术',
    description: '前沿技术驱动，让创意完美落地',
    color: 'from-[#7B3FF2] to-[#4A5BFF]',
  },
  {
    icon: FaHeart,
    title: '成长',
    description: '持续学习，与学员共同进步',
    color: 'from-[#FF9A56] to-[#FF6B6B]',
  },
  {
    icon: FaUsers,
    title: '连接',
    description: '搭建社群，让创意人不再孤单',
    color: 'from-[#00F5FF] to-[#4A5BFF]',
  },
];

export default function About() {
  const [teamMembers, setTeamMembers] = useState(defaultTeamMembers);

  useEffect(() => {
    const fetchTeam = async () => {
      try {
        const response = await teamApi.getAll();
        const data = response.data?.data || [];
        if (data.length > 0) {
          const active = data
            .filter((m: any) => m.status === 'active')
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          const mapped = active.map((m: any) => ({
            name: m.name || '成员',
            role: m.role || '团队成员',
            bio: m.bio || '',
            image: m.image || defaultTeamMembers[0]?.image,
          }));
          setTeamMembers(mapped);
        }
      } catch (error) {
        console.error('获取团队成员失败:', error);
      }
    };
    fetchTeam();
  }, []);

  return (
    <>
      <PageMeta
        title="关于我们 - 盖可设计圈"
        description="了解盖可设计圈的故事、团队和价值观，我们不只是工作室，更是你的创意成长伙伴"
        keywords={['关于我们', '团队介绍', '品牌故事', '设计理念']}
      />
      <div className="min-h-screen bg-[#0A0A0F]">
        <Header />
        <main className="pt-20">
          <section className="py-20 bg-gradient-to-b from-[#0A0A0F] to-[#0F0F1A]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="text-center mb-16"
              >
                <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
                  关于我们
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                  一个充满创意与激情的团队，致力于帮助每一个创意梦想成真
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mb-20"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  <div>
                    <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                      我们的故事
                    </h2>
                    <p className="text-gray-300 leading-relaxed mb-4">
                      盖可设计圈创立于 2020 年，源于一个简单的想法：**让创意不再孤单**。
                    </p>
                    <p className="text-gray-400 leading-relaxed mb-4">
                      创始团队来自不同的创意领域——3D 艺术、软件开发、原画设计、教育咨询。我们发现，很多有才华的创意人缺乏的不仅是技术，更是一个可以交流、学习、成长的社区。
                    </p>
                    <p className="text-gray-400 leading-relaxed">
                      于是，我们决定创建一个不一样的工作室：不仅提供专业的设计服务，更要搭建一个创意成长的生态系统。在这里，你可以找到合作伙伴，可以学习新技能，可以获得职业指导，更重要的是，可以找到一群志同道合的朋友。
                    </p>
                  </div>
                  <div className="relative">
                    <div className="aspect-square bg-gradient-to-br from-[#4A5BFF]/20 to-[#7B3FF2]/20 rounded-3xl overflow-hidden">
                      <img
                        src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600&h=600&q=80"
                        alt="团队协作"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mb-20"
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
                  我们的价值观
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {values.map((value, index) => (
                    <motion.div
                      key={value.title}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="text-center p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10"
                    >
                      <div className={`w-16 h-16 bg-gradient-to-br ${value.color} rounded-xl flex items-center justify-center mx-auto mb-4`}>
                        <value.icon className="text-white text-3xl" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">{value.title}</h3>
                      <p className="text-gray-400 text-sm">{value.description}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
                  核心团队
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {teamMembers.map((member, index) => (
                    <motion.div
                      key={member.name}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="group text-center"
                    >
                      <div className="aspect-square bg-gradient-to-br from-[#4A5BFF]/20 to-[#7B3FF2]/20 rounded-2xl overflow-hidden mb-4 group-hover:transform group-hover:scale-105 transition-transform duration-300">
                        <img
                          src={member.image}
                          alt={member.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <h3 className="text-lg font-bold text-white">{member.name}</h3>
                      <p className="text-[#00F5FF] text-sm mb-2">{member.role}</p>
                      <p className="text-gray-400 text-sm">{member.bio}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="text-center mt-20"
              >
                <h2 className="text-2xl font-bold text-white mb-6">
                  想加入我们吗？
                </h2>
                <a
                  href="/contact"
                  className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-full hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 transform hover:scale-105"
                >
                  合作咨询
                </a>
              </motion.div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
