import { useParams, useNavigate } from 'react-router-dom';
import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import { motion } from 'framer-motion';
import { useState, useEffect } from 'react';
import { FaArrowLeft, FaCalendar, FaUser, FaTag } from 'react-icons/fa';
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
}

export default function BlogDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [post, setPost] = useState<BlogPost | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      fetchPost(id);
    }
  }, [id]);

  const fetchPost = async (postId: string) => {
    try {
      const response = await blogApi.getById(postId);
      setPost(response.data.data);
    } catch (error) {
      console.error('获取文章详情失败:', error);
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

  const renderContent = (content: string) => {
    if (!content) return null;
    
    return content.split('\n\n').map((paragraph, index) => {
      if (paragraph.startsWith('## ')) {
        return (
          <h2 key={index} className="text-2xl font-bold text-white mt-8 mb-4">
            {paragraph.replace('## ', '')}
          </h2>
        );
      }
      if (paragraph.startsWith('# ')) {
        return (
          <h1 key={index} className="text-3xl font-bold text-white mt-8 mb-4">
            {paragraph.replace('# ', '')}
          </h1>
        );
      }
      return (
        <p key={index} className="text-gray-300 leading-relaxed mb-4">
          {paragraph}
        </p>
      );
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-white"></div>
          <p className="text-gray-400 mt-4">加载中...</p>
        </div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-[#0A0A0F] flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl text-white mb-4">文章不存在</h2>
          <button
            onClick={() => navigate('/blog')}
            className="px-6 py-3 bg-[#4A5BFF] text-white rounded-full hover:bg-[#3A4BEF] transition-colors"
          >
            返回博客
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <PageMeta
        title={`${post.title} - 盖可设计圈`}
        description={post.excerpt || post.content?.substring(0, 150)}
        keywords={[post.category || '博客', '设计教程', '盖可设计圈']}
      />
      <div className="min-h-screen bg-[#0A0A0F]">
        <Header />
        <main className="pt-20">
          {/* Hero Image */}
          <div className="relative h-[50vh] min-h-[400px] overflow-hidden">
            {post.image_url ? (
              <img
                src={post.image_url}
                alt={post.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center">
                <span className="text-gray-500 text-2xl">暂无封面图</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0F] via-[#0A0A0F]/50 to-transparent" />
          </div>

          {/* Article Content */}
          <article className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-32 relative z-10 pb-20">
            {/* Back Button */}
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4 }}
              onClick={() => navigate('/blog')}
              className="flex items-center gap-2 text-gray-400 hover:text-white mb-8 transition-colors group"
            >
              <FaArrowLeft className="transform group-hover:-translate-x-1 transition-transform" />
              <span>返回博客</span>
            </motion.button>

            {/* Header */}
            <motion.header
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-[#0F0F1A]/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10 mb-8"
            >
              <div className="flex flex-wrap items-center gap-4 mb-4">
                {post.category && (
                  <span className="px-3 py-1 bg-[#4A5BFF]/20 text-[#00F5FF] rounded-full text-sm flex items-center gap-1">
                    <FaTag className="text-xs" />
                    {post.category}
                  </span>
                )}
                <span className="text-gray-500 text-sm flex items-center gap-1">
                  <FaCalendar className="mr-1" />
                  {formatDate(post.created_at)}
                </span>
              </div>
              <h1 className="text-4xl sm:text-5xl font-bold text-white mb-4">
                {post.title}
              </h1>
              <div className="flex items-center text-gray-400 text-sm">
                <FaUser className="mr-2" />
                {post.author || '盖可设计圈'}
              </div>
            </motion.header>

            {/* Content */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="bg-[#0F0F1A]/80 backdrop-blur-xl rounded-2xl p-8 border border-white/10"
            >
              <div className="prose prose-invert prose-lg max-w-none">
                {renderContent(post.content || '')}
              </div>
            </motion.div>

            {/* Bottom Navigation */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="mt-8 text-center"
            >
              <button
                onClick={() => navigate('/blog')}
                className="inline-flex items-center gap-2 px-8 py-4 bg-[#4A5BFF] text-white rounded-full font-medium hover:bg-[#3A4BEF] transition-all hover:scale-105"
              >
                <FaArrowLeft className="text-sm" />
                返回博客列表
              </button>
            </motion.div>
          </article>
        </main>
        <Footer />
      </div>
    </>
  );
}
