import { Link } from 'react-router-dom';
import { FaCube, FaCode, FaPalette, FaUsers, FaGraduationCap } from 'react-icons/fa';
import { motion } from 'framer-motion';

const services = [
  {
    icon: FaCube,
    title: '3D 建模',
    description: '角色建模、场景建模、产品可视化，用三维艺术呈现无限可能',
    color: 'from-[#4A5BFF] to-[#00F5FF]',
    large: true,
  },
  {
    icon: FaCode,
    title: '应用开发',
    description: '移动应用、Web 应用、交互原型，技术驱动创意实现',
    color: 'from-[#7B3FF2] to-[#4A5BFF]',
    large: true,
  },
  {
    icon: FaPalette,
    title: '原画设计',
    description: '角色原画、场景原画、概念设计，用画笔勾勒想象世界',
    color: 'from-[#00F5FF] to-[#4A5BFF]',
    large: false,
  },
  {
    icon: FaUsers,
    title: '学习交友',
    description: '设计课程、作品指导、社群交流，与志同道合者共同成长',
    color: 'from-[#FF9A56] to-[#FF6B6B]',
    large: false,
  },
  {
    icon: FaGraduationCap,
    title: '教育咨询',
    description: '职业规划、作品集指导、留学咨询，为你的设计之路指明方向',
    color: 'from-[#7B3FF2] to-[#FF9A56]',
    large: false,
  },
];

export default function ServicesSection() {
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
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-4">
            我们能帮你做什么？
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            五大核心业务板块，全方位支持你的创意梦想
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`group relative bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10 hover:border-[#4A5BFF]/30 transition-all duration-300 hover:transform hover:-translate-y-2 ${
                service.large ? 'md:col-span-2 lg:col-span-1' : ''
              }`}
            >
              <div className={`w-16 h-16 bg-gradient-to-br ${service.color} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                <service.icon className="text-white text-3xl" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-3">{service.title}</h3>
              <p className="text-gray-400 leading-relaxed mb-6">{service.description}</p>
              <Link
                to="/services"
                className="inline-flex items-center text-[#00F5FF] font-medium hover:text-[#4A5BFF] transition-colors"
              >
                了解更多
                <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
