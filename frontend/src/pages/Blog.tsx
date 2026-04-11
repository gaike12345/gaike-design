import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { FaCalendar, FaUser, FaArrowRight } from 'react-icons/fa';
import { blogApi } from '@/lib/api';

interface BlogPost {
  id: string;
  title: string;
  excerpt?: string;
  content?: string;
  category?: string;
  created_at: string;
  author?: string;
  image_url?: string;
  status?: string;
}

const categories = ['全部', '设计教程', '行业洞察', '工作室动态'];

export default function Blog() {
  const navigate = useNavigate();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState('全部');

  useEffect(() => {
    fetchPosts();
  }, []);

  const fetchPosts = async () => {
    try {
      const response = await blogApi.getAll();
      // 只显示已发布的文章
      const publishedPosts = (response.data.data || []).filter(
        (post: BlogPost) => post.status === 'published'
      );
      setPosts(publishedPosts);
    } catch (error) {
      console.error('获取博客列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).replace(/\//g, '-');
  };

  const filteredPosts = selectedCategory === '全部'
    ? posts
    : posts.filter(post => post.category === selectedCategory);

  return (
    <>
      <PageMeta
        title="博客 - 盖可设计圈"
        description="阅读盖可设计圈的最新动态、设计教程和行业洞察，获取专业设计知识和创意灵感"
        keywords={['博客', '设计教程', '行业洞察', '工作室动态', '设计知识']}
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
                  博客动态
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                  获取最新设计教程、行业洞察和工作室动态
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredPosts.map((post, index) => (
                    <motion.article
                      key={post.id}
                      initial={{ opacity: 0, y: 30 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="group bg-white/5 backdrop-blur-sm rounded-2xl overflow-hidden border border-white/10 hover:border-[#4A5BFF]/30 transition-all duration-300 cursor-pointer"
                      onClick={() => navigate(`/blog/${post.id}`)}
                    >
                      <div className="aspect-video overflow-hidden">
                        {post.image_url ? (
                          <img
                            src={post.image_url}
                            alt={post.title}
                            className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                            <span className="text-gray-500">暂无图片</span>
                          </div>
                        )}
                      </div>
                      <div className="p-6">
                        <div className="flex items-center gap-4 mb-4 text-sm text-gray-400">
                          {post.category && (
                            <span className="px-3 py-1 bg-[#4A5BFF]/20 text-[#00F5FF] rounded-full">
                              {post.category}
                            </span>
                          )}
                          <div className="flex items-center">
                            <FaCalendar className="mr-1" />
                            {formatDate(post.created_at)}
                          </div>
                        </div>
                        <h3 className="text-xl font-bold text-white mb-3 group-hover:text-[#00F5FF] transition-colors">
                          {post.title}
                        </h3>
                        <p className="text-gray-400 mb-4 line-clamp-2">
                          {post.excerpt || post.content?.substring(0, 100) || '暂无摘要'}
                        </p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center text-sm text-gray-400">
                            <FaUser className="mr-2" />
                            {post.author || '盖可设计圈'}
                          </div>
                          <div className="flex items-center text-[#00F5FF] font-medium">
                            阅读更多
                            <FaArrowRight className="ml-2 transform group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </motion.article>
                  ))}
                </div>
              )}

              {!loading && filteredPosts.length === 0 && (
                <div className="text-center py-20">
                  <p className="text-gray-400">暂无文章，请在后台添加</p>
                </div>
              )}
            </div>
          </section>
        </main>
        <Footer />
      </div>
    </>
  );
}
