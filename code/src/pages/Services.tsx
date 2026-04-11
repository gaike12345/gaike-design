import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { Link } from 'react-router-dom';
import { FaCube, FaCode, FaPalette, FaUsers, FaGraduationCap } from 'react-icons/fa';
import { motion } from 'framer-motion';

const services = [
  {
    icon: FaCube,
    title: '3D 建模',
    description: '用三维艺术呈现无限可能',
    details: [
      '角色建模：游戏角色、影视角色、虚拟偶像',
      '场景建模：游戏场景、建筑可视化、虚拟世界',
      '产品可视化：工业设计、产品展示、动画渲染',
    ],
    tools: ['Blender', 'Maya', 'ZBrush', 'Substance Painter'],
    color: 'from-[#4A5BFF] to-[#00F5FF]',
  },
  {
    icon: FaCode,
    title: '应用开发',
    description: '技术驱动创意实现',
    details: [
      '移动应用：iOS/Android 原生应用、跨平台应用',
      'Web 应用：响应式网站、Web 应用、管理后台',
      '交互原型：产品原型、交互演示、MVP 验证',
    ],
    tools: ['React', 'Vue', 'React Native', 'Flutter', 'Node.js'],
    color: 'from-[#7B3FF2] to-[#4A5BFF]',
  },
  {
    icon: FaPalette,
    title: '原画设计',
    description: '用画笔勾勒想象世界',
    details: [
      '角色原画：游戏角色、插画角色、概念设计',
      '场景原画：游戏场景、影视概念、环境设计',
      '概念设计：世界观设定、视觉风格探索',
    ],
    tools: ['Photoshop', 'Procreate', 'Clip Studio Paint'],
    color: 'from-[#00F5FF] to-[#4A5BFF]',
  },
  {
    icon: FaUsers,
    title: '学习交友',
    description: '与志同道合者共同成长',
    details: [
      '设计课程：软件教程、设计理论、实战项目',
      '作品指导：作品集优化、作品点评、改进建议',
      '社群交流：线上分享、线下聚会、联合创作',
    ],
    benefits: ['技能提升', '人脉资源', '项目机会', '成长陪伴'],
    color: 'from-[#FF9A56] to-[#FF6B6B]',
  },
  {
    icon: FaGraduationCap,
    title: '教育咨询',
    description: '为你的设计之路指明方向',
    details: [
      '职业规划：职业定位、发展路径、行业分析',
      '作品集指导：作品集结构、项目选择、呈现技巧',
      '留学咨询：院校选择、申请指导、文书建议',
      '技能提升：学习计划、资源推荐、能力评估',
    ],
    process: ['需求沟通', '能力评估', '方案制定', '一对一咨询', '后续跟进'],
    color: 'from-[#7B3FF2] to-[#FF9A56]',
  },
];

export default function Services() {
  return (
    <>
      <PageMeta
        title="服务项目 - 盖可设计圈"
        description="从 3D 建模到应用开发，从原画设计到教育咨询，全方位支持你的创意项目"
        keywords={['服务项目', '3D 建模', '应用开发', '原画设计', '设计咨询']}
      />
      <div className="min-h-screen bg-[#0A0A0F]">
        <Header />
        <main className="pt-20">
          <section className="py-20 bg-gradient-to-b from-[#0A0A0F] to-[#0F0F1A]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-16"
              >
                <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
                  我们的服务
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                  从概念到落地，全方位支持你的创意项目
                </p>
              </motion.div>

              <div className="space-y-20">
                {services.map((service, index) => (
                  <motion.div
                    key={service.title}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.6, delay: index * 0.1 }}
                    className="grid grid-cols-1 lg:grid-cols-3 gap-8"
                  >
                    <div className="lg:col-span-1">
                      <div className={`w-20 h-20 bg-gradient-to-br ${service.color} rounded-2xl flex items-center justify-center mb-6`}>
                        <service.icon className="text-white text-4xl" />
                      </div>
                      <h2 className="text-3xl font-bold text-white mb-3">{service.title}</h2>
                      <p className="text-lg text-gray-400 mb-6">{service.description}</p>
                      <Link
                        to="/contact"
                        className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-medium rounded-full hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300"
                      >
                        预约咨询
                      </Link>
                    </div>

                    <div className="lg:col-span-2 bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                      <h3 className="text-xl font-semibold text-white mb-6">服务内容</h3>
                      <ul className="space-y-4 mb-8">
                        {service.details.map((detail) => (
                          <li key={detail} className="flex items-start space-x-3">
                            <svg className="w-6 h-6 text-[#00F5FF] flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            <span className="text-gray-300">{detail}</span>
                          </li>
                        ))}
                      </ul>

                      {service.tools && (
                        <>
                          <h3 className="text-xl font-semibold text-white mb-4">技术工具</h3>
                          <div className="flex flex-wrap gap-2 mb-6">
                            {service.tools.map((tool) => (
                              <span
                                key={tool}
                                className="px-4 py-2 bg-white/10 text-gray-300 rounded-full text-sm"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </>
                      )}

                      {service.benefits && (
                        <>
                          <h3 className="text-xl font-semibold text-white mb-4">社群福利</h3>
                          <div className="grid grid-cols-2 gap-4">
                            {service.benefits.map((benefit) => (
                              <div key={benefit} className="flex items-center space-x-3">
                                <div className="w-2 h-2 bg-[#FF9A56] rounded-full" />
                                <span className="text-gray-300">{benefit}</span>
                              </div>
                            ))}
                          </div>
                        </>
                      )}

                      {service.process && (
                        <>
                          <h3 className="text-xl font-semibold text-white mb-4">咨询流程</h3>
                          <div className="flex flex-wrap gap-3">
                            {service.process.map((step, i) => (
                              <div key={step} className="flex items-center">
                                <span className="w-8 h-8 bg-[#4A5BFF] text-white rounded-full flex items-center justify-center text-sm font-medium">
                                  {i + 1}
                                </span>
                                <span className="ml-3 text-gray-300">{step}</span>
                                {i < service.process.length - 1 && (
                                  <div className="w-8 h-px bg-white/20 ml-3" />
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="text-center mt-20"
              >
                <h3 className="text-2xl font-bold text-white mb-6">
                  需要定制方案？
                </h3>
                <Link
                  to="/contact"
                  className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-full hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 transform hover:scale-105"
                >
                  获取定制方案
                </Link>
              </motion.div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
