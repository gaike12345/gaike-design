import { PageMeta } from '@/components/common/PageMeta';
import Header from '@/components/generated/Header';
import Footer from '@/components/generated/Footer';
import BookingSection from '@/components/generated/BookingSection';
import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaWeixin, FaEnvelope, FaPhone } from 'react-icons/fa';
import { toast } from 'sonner';
import { configApi, contactApi } from '@/lib/api';

const iconMap: Record<string, any> = {
  wechat: FaWeixin,
  weixin: FaWeixin,
  email: FaEnvelope,
  mail: FaEnvelope,
  phone: FaPhone,
  tel: FaPhone,
  FaWeixin,
  FaEnvelope,
  FaPhone,
};

const defaultServiceOptions = [
  '3D 建模',
  '应用开发',
  '原画设计',
  '学习交友',
  '教育咨询',
  '其他',
];

const defaultWorkflowSteps = [
  { title: '咨询', description: '提交需求或添加微信' },
  { title: '沟通', description: '详细沟通项目需求' },
  { title: '方案', description: '提供方案和报价' },
  { title: '执行', description: '签订合同开始执行' },
  { title: '交付', description: '完成项目交付验收' },
];

const defaultFaqs = [
  {
    question: '服务周期一般是多久？',
    answer: '根据项目复杂程度而定。小型项目（如单个 3D 模型、简单页面设计）通常 1-2 周；中型项目（如完整 App 开发、系列原画）2-4 周；大型项目会提供更详细的时间规划。',
  },
  {
    question: '收费方式是怎样的？',
    answer: '我们采用项目制收费，根据项目复杂度、工作量、交付周期等因素综合报价。教育咨询按小时计费，学习社群采用会员制。具体费用会在沟通需求后提供详细报价单。',
  },
  {
    question: '可以提供修改吗？',
    answer: '当然可以。每个项目都包含合理的修改次数（通常 2-3 轮），确保最终成果符合你的预期。超出约定次数的修改会收取适当费用。',
  },
  {
    question: '如何保证项目质量？',
    answer: '我们有完善的项目管理流程和质量把控机制。每个项目都会配备专人负责，定期同步进度，确保按时按质交付。同时提供售后支持，解决后续问题。',
  },
];

const defaultContactInfo = [
  { type: 'wechat', label: '微信', value: 'GeekDesignCircle', icon: FaWeixin },
  { type: 'email', label: '邮箱', value: 'contact@geekdesign.com', icon: FaEnvelope },
  { type: 'phone', label: '电话', value: '400-XXX-XXXX', icon: FaPhone },
];

export default function Contact() {
  const [contactInfo, setContactInfo] = useState(defaultContactInfo);
  const [serviceOptions, setServiceOptions] = useState(defaultServiceOptions);
  const [workflowSteps, setWorkflowSteps] = useState(defaultWorkflowSteps);
  const [faqs, setFaqs] = useState(defaultFaqs);
  const [formData, setFormData] = useState({
    name: '',
    contact: '',
    serviceType: '',
    description: '',
    budget: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const fetchContactData = async () => {
      try {
        const [contactRes, faqRes, workflowRes] = await Promise.all([
          configApi.getTable('contact_config'),
          configApi.getTable('faq_items'),
          configApi.getTable('workflow_steps'),
        ]);

        const contacts = contactRes.data?.data || [];
        if (contacts.length > 0) {
          const mapped = contacts
            .map((c: any) => ({
              type: c.type || c.key || 'wechat',
              label: c.label || c.type || c.key || '联系方式',
              value: c.value || '',
              icon: iconMap[c.type] || iconMap[c.key] || FaWeixin,
            }))
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          setContactInfo(mapped);
        }

        const faqData = faqRes.data?.data || [];
        if (faqData.length > 0) {
          const mapped = faqData
            .map((f: any) => ({
              question: f.question || f.title || '',
              answer: f.answer || f.content || f.description || '',
            }))
            .filter((f: any) => f.question && f.answer)
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          if (mapped.length > 0) setFaqs(mapped);
        }

        const workflowData = workflowRes.data?.data || [];
        if (workflowData.length > 0) {
          const mapped = workflowData
            .map((w: any) => ({
              title: w.title || w.name || '',
              description: w.description || w.content || '',
            }))
            .filter((w: any) => w.title)
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          if (mapped.length > 0) setWorkflowSteps(mapped);
        }
      } catch (error) {
        console.error('获取联系页数据失败:', error);
      }
    };
    fetchContactData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await contactApi.submit({
        name: formData.name,
        email: formData.contact,
        phone: formData.contact,
        message: `服务类型: ${formData.serviceType}\n项目描述: ${formData.description}\n预算: ${formData.budget}`,
      });
      toast.success('提交成功！我们将在 24 小时内与您联系');
      setFormData({ name: '', contact: '', serviceType: '', description: '', budget: '' });
    } catch (error) {
      toast.error('提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  return (
    <>
      <PageMeta
        title="联系我们 - 盖可设计圈"
        description="联系盖可设计圈，获取专业服务咨询，预约一对一指导，加入学习社群"
        keywords={['联系我们', '咨询', '预约', '合作']}
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
                  联系我们
                </h1>
                <p className="text-xl text-gray-400 max-w-3xl mx-auto">
                  无论你是需要专业服务，还是想加入学习社群，或者只是想聊聊你的创意想法，我们都在这里等你
                </p>
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-20">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <h2 className="text-3xl font-bold text-white mb-8">联系方式</h2>
                  <div className="space-y-6 mb-8">
                    {contactInfo.map((item) => (
                      <div key={item.type} className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] rounded-xl flex items-center justify-center">
                          <item.icon className="text-white text-xl" />
                        </div>
                        <div>
                          <div className="text-white font-medium">{item.label}</div>
                          <div className="text-gray-400">{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10">
                    <h3 className="text-xl font-semibold text-white mb-4">工作流程</h3>
                    <div className="space-y-4">
                      {workflowSteps.map((step, index) => (
                        <div key={step.title} className="flex items-start">
                          <div className="w-8 h-8 bg-[#4A5BFF] text-white rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {index + 1}
                          </div>
                          <div className="ml-4">
                            <div className="text-white font-medium">{step.title}</div>
                            <div className="text-gray-400 text-sm">{step.description}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.6 }}
                >
                  <h2 className="text-3xl font-bold text-white mb-8">在线咨询</h2>
                  <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10">
                    <div className="space-y-6">
                      <div>
                        <label className="block text-white font-medium mb-2">姓名 *</label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#4A5BFF] transition-colors"
                          placeholder="请输入您的姓名"
                        />
                      </div>
                      <div>
                        <label className="block text-white font-medium mb-2">联系方式 *</label>
                        <input
                          type="text"
                          name="contact"
                          value={formData.contact}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#4A5BFF] transition-colors"
                          placeholder="微信/手机/邮箱"
                        />
                      </div>
                      <div>
                        <label className="block text-white font-medium mb-2">服务类型 *</label>
                        <select
                          name="serviceType"
                          value={formData.serviceType}
                          onChange={handleChange}
                          required
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:border-[#4A5BFF] transition-colors"
                        >
                          <option value="">请选择服务类型</option>
                          {serviceOptions.map((option) => (
                            <option key={option} value={option} className="bg-[#0A0A0F]">
                              {option}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-white font-medium mb-2">项目描述</label>
                        <textarea
                          name="description"
                          value={formData.description}
                          onChange={handleChange}
                          rows={4}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#4A5BFF] transition-colors resize-none"
                          placeholder="请简单描述您的项目需求"
                        />
                      </div>
                      <div>
                        <label className="block text-white font-medium mb-2">预算范围（选填）</label>
                        <input
                          type="text"
                          name="budget"
                          value={formData.budget}
                          onChange={handleChange}
                          className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#4A5BFF] transition-colors"
                          placeholder="如：5000-10000 元"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full px-6 py-4 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? '提交中...' : '提交咨询'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6 }}
              >
                <h2 className="text-3xl font-bold text-white text-center mb-12">常见问题</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {faqs.map((faq, index) => (
                    <motion.div
                      key={faq.question}
                      initial={{ opacity: 0, y: 30 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.5, delay: index * 0.1 }}
                      className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10"
                    >
                      <h3 className="text-lg font-semibold text-white mb-3">{faq.question}</h3>
                      <p className="text-gray-400 leading-relaxed">{faq.answer}</p>
                    </motion.div>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>

          <BookingSection />
        </main>
        <Footer />
      </div>
    </>
  );
}
