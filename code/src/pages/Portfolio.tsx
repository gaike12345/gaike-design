import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';
import { worksApi } from '@/lib/api';

interface Work {
  id: string;
  title: string;
  category: string;
  image_url: string;
  description: string;
  tools?: string;
  client?: string;
  project_url?: string;
  status?: string;
}

const categoryMap: Record<string, string> = {
  '3d': '3D 建模',
  'app': '应用开发',
  'design': '原画设计',
  'other': '其他',
};

export default function Portfolio() {
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('全部');
  const [selectedItem, setSelectedItem] = useState<Work | null>(null);

  const categories = ['全部', '3D 建模', '应用开发', '原画设计', '其他'];

  useEffect(() => {
    fetchWorks();
  }, []);

  const fetchWorks = async () => {
    try {
      const response = await worksApi.getAll();
      const data = response.data.data || [];
      setWorks(data.map((item: any) => ({
        ...item,
        category: categoryMap[item.category] || item.category || '其他',
      })));
    } catch (error) {
      console.error('获取作品列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredItems = selectedCategory === '全部'
    ? works
    : works.filter((item) => item.category === selectedCategory);

  const parseTools = (tools?: string): string[] => {
    if (!tools) return [];
    try {
      return JSON.parse(tools);
    } catch {
      return tools.split(',').map(t => t.trim()).filter(Boolean);
    }
  };

  return (
    <>
      <PageMeta
        title="作品集 - 盖可设计圈"
        description="查看我们的创意作品案例，涵盖 3D 建模、应用开发、原画设计等领域"
        keywords={['作品集', '案例展示', '3D 建模', '应用开发', '原画设计']}
      />
      <div className="min-h-screen bg-[#0A0A0F]">
        <Header />
        <main className="pt-20">
          <section className="py-20">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className="text-center mb-12"
              >
                <h1 className="text-5xl sm:text-6xl font-bold text-white mb-6">
                  作品集
                </h1>
                <p className="text-xl text-gray-400 max-w-2xl mx-auto">
                  每一个作品都是创意与技术的完美融合
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                className="flex flex-wrap justify-center gap-4 mb-12"
              >
                {categories.map((category) => (
                  <button
                    key={category}
                    onClick={() => setSelectedCategory(category)}
                    className={`px-6 py-3 rounded-full font-medium transition-all duration-300 ${
                      selectedCategory === category
                        ? 'bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    {category}
                  </button>
                ))}
              </motion.div>

              {loading ? (
                <div className="text-center py-20">
                  <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
                  <p className="text-gray-400 mt-4">加载中...</p>
                </div>
              ) : (
                <motion.div
                  layout
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                >
                  <AnimatePresence>
                    {filteredItems.map((item) => (
                      <motion.div
                        key={item.id}
                        layout
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        transition={{ duration: 0.3 }}
                        onClick={() => setSelectedItem(item)}
                        className="group relative overflow-hidden rounded-2xl cursor-pointer"
                      >
                        <div className="aspect-video">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt={item.title}
                              className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                              <span className="text-gray-500">暂无图片</span>
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                          <div className="absolute bottom-0 left-0 right-0 p-6">
                            <span className="inline-block px-3 py-1 bg-[#4A5BFF]/80 text-white text-xs rounded-full mb-2">
                              {item.category}
                            </span>
                            <h3 className="text-xl font-bold text-white">{item.title}</h3>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </motion.div>
              )}

              {!loading && filteredItems.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-400">暂无作品，请在后台添加</p>
                </div>
              )}
            </div>
          </section>
        </main>
        <Footer />

        <AnimatePresence>
          {selectedItem && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
              onClick={() => setSelectedItem(null)}
            >
              <motion.div
                initial={{ scale: 0.9, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 20 }}
                className="bg-[#0F0F1A] rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="relative">
                  {selectedItem.image_url ? (
                    <img
                      src={selectedItem.image_url}
                      alt={selectedItem.title}
                      className="w-full h-auto rounded-t-2xl"
                    />
                  ) : (
                    <div className="w-full h-64 bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center rounded-t-2xl">
                      <span className="text-gray-500">暂无图片</span>
                    </div>
                  )}
                  <button
                    onClick={() => setSelectedItem(null)}
                    className="absolute top-4 right-4 w-10 h-10 bg-black/50 backdrop-blur-sm rounded-full flex items-center justify-center text-white hover:bg-black/70 transition-colors"
                  >
                    <FaTimes />
                  </button>
                </div>
                <div className="p-8">
                  <span className="inline-block px-3 py-1 bg-[#4A5BFF]/80 text-white text-sm rounded-full mb-4">
                    {selectedItem.category}
                  </span>
                  <h2 className="text-3xl font-bold text-white mb-4">{selectedItem.title}</h2>
                  <p className="text-gray-300 leading-relaxed mb-6">{selectedItem.description || '暂无描述'}</p>
                  
                  {parseTools(selectedItem.tools).length > 0 && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-white mb-3">使用工具</h3>
                      <div className="flex flex-wrap gap-2">
                        {parseTools(selectedItem.tools).map((tool) => (
                          <span
                            key={tool}
                            className="px-4 py-2 bg-white/10 text-gray-300 rounded-full text-sm"
                          >
                            {tool}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.client && (
                    <div className="mb-6">
                      <h3 className="text-lg font-semibold text-white mb-3">客户</h3>
                      <p className="text-gray-300">{selectedItem.client}</p>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <a
                      href="/contact"
                      className="flex-1 px-6 py-3 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-medium rounded-full text-center hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300"
                    >
                      类似项目咨询
                    </a>
                    {selectedItem.project_url && (
                      <a
                        href={selectedItem.project_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-6 py-3 bg-white/10 text-white font-medium rounded-full text-center hover:bg-white/20 transition-all duration-300"
                      >
                        查看项目
                      </a>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
