import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FaVideo, FaComments, FaCalendar, FaAward, FaMapMarker } from 'react-icons/fa';
import { eventsApi, testimonialsApi } from '@/lib/api';

const benefits = [
  {
    icon: FaVideo,
    title: '设计课程',
    description: '软件教程、设计理论、实战项目，系统化学习资源',
  },
  {
    icon: FaComments,
    title: '作品指导',
    description: '专业导师一对一作品点评，针对性改进建议',
  },
  {
    icon: FaCalendar,
    title: '社群活动',
    description: '线上分享会、线下聚会、联合创作，拓展人脉圈',
  },
  {
    icon: FaAward,
    title: '项目机会',
    description: '内部项目合作、外部资源对接，实战积累经验',
  },
];

interface Event {
  id: string;
  title: string;
  description?: string;
  event_type?: string;
  event_date: string;
  location?: string;
  image_url?: string;
  status?: string;
}

interface Testimonial {
  id: string;
  name: string;
  role?: string;
  content?: string;
  avatar_url?: string;
}

export default function Community() {
  const [events, setEvents] = useState<Event[]>([]);
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [eventsRes, testimonialsRes] = await Promise.all([
        eventsApi.getAll(),
        testimonialsApi.getAll(),
      ]);
      
      // 只显示即将开始和进行中的活动
      const activeEvents = (eventsRes.data.data || []).filter(
        (e: Event) => e.status === 'upcoming' || e.status === 'ongoing'
      );
      setEvents(activeEvents.slice(0, 6)); // 最多显示6个
      
      setTestimonials(testimonialsRes.data.data || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <>
      <PageMeta
        title="学习社区 - 盖可设计圈"
        description="加入盖可设计圈学习社区，与志同道合者共同成长，获取设计课程、作品指导、社群活动等丰富资源"
        keywords={['学习社区', '设计课程', '作品指导', '社群活动', '设计师成长']}
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
                  学习社区
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto mb-4">
                  一个人走得快，一群人走得远
                </p>
                <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                  加入盖可设计圈，与数百名创意人一起学习、交流、成长
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-20"
              >
                {benefits.map((benefit, index) => (
                  <motion.div
                    key={benefit.title}
                    initial={{ opacity: 0, y: 30 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, delay: index * 0.1 }}
                    className="text-center p-6 bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 hover:border-[#4A5BFF]/30 transition-colors"
                  >
                    <div className="w-16 h-16 bg-gradient-to-br from-[#FF9A56] to-[#FF6B6B] rounded-xl flex items-center justify-center mx-auto mb-4">
                      <benefit.icon className="text-white text-3xl" />
                    </div>
                    <h3 className="text-xl font-bold text-white mb-2">{benefit.title}</h3>
                    <p className="text-gray-400 text-sm">{benefit.description}</p>
                  </motion.div>
                ))}
              </motion.div>

              {/* 社群活动 */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mb-20"
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
                  社群活动
                </h2>
                
                {loading ? (
                  <div className="text-center py-12">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : events.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {events.map((event, index) => (
                      <motion.div
                        key={event.id}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="group"
                      >
                        <div className="aspect-video rounded-xl overflow-hidden mb-4 bg-gradient-to-br from-gray-700 to-gray-800">
                          {event.image_url ? (
                            <img
                              src={event.image_url}
                              alt={event.title}
                              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <FaCalendar className="text-4xl text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="flex items-center text-[#00F5FF] text-sm mb-2">
                          <FaCalendar className="mr-2" />
                          {formatDate(event.event_date)}
                        </div>
                        {event.location && (
                          <div className="flex items-center text-gray-400 text-sm mb-2">
                            <FaMapMarker className="mr-2" />
                            {event.location}
                          </div>
                        )}
                        <h3 className="text-xl font-bold text-white mb-2">{event.title}</h3>
                        <p className="text-gray-400 text-sm line-clamp-2">{event.description}</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-400">暂无活动，敬请期待</p>
                  </div>
                )}
              </motion.div>

              {/* 学员见证 */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="mb-20"
              >
                <h2 className="text-3xl sm:text-4xl font-bold text-white text-center mb-12">
                  学员见证
                </h2>
                
                {testimonials.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {testimonials.slice(0, 6).map((testimonial, index) => (
                      <motion.div
                        key={testimonial.id}
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ duration: 0.5, delay: index * 0.1 }}
                        className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
                      >
                        <div className="flex items-center mb-4">
                          {testimonial.avatar_url ? (
                            <img
                              src={testimonial.avatar_url}
                              alt={testimonial.name}
                              className="w-12 h-12 rounded-full object-cover mr-4"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] flex items-center justify-center mr-4">
                              <span className="text-white font-bold text-lg">
                                {testimonial.name.charAt(0)}
                              </span>
                            </div>
                          )}
                          <div>
                            <h4 className="text-white font-semibold">{testimonial.name}</h4>
                            {testimonial.role && (
                              <p className="text-gray-400 text-sm">{testimonial.role}</p>
                            )}
                          </div>
                        </div>
                        <p className="text-gray-300 leading-relaxed">"{testimonial.content}"</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-gray-400">暂无学员见证</p>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
                className="text-center"
              >
                <div className="bg-gradient-to-r from-[#4A5BFF]/10 to-[#7B3FF2]/10 rounded-3xl p-12 border border-white/10">
                  <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
                    准备好加入了吗？
                  </h2>
                  <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
                    立即加入盖可设计圈学习社区，开启你的创意成长之旅
                  </p>
                  <Link
                    to="/contact"
                    className="inline-flex items-center px-8 py-4 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-full hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 transform hover:scale-105"
                  >
                    加入社群
                  </Link>
                </div>
              </motion.div>
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
