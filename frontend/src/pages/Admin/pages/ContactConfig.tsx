import { useState, useEffect } from 'react';
import { FaPlus, FaEdit, FaTrash, FaPhone, FaEnvelope, FaMapMarkerAlt, FaClock, FaDollarSign } from 'react-icons/fa';
import { api, createRecord, updateRecord, deleteRecord } from '../api';

interface ContactConfig {
  id: number;
  type: string;
  value: string;
  label: string;
  sort_order: number;
}

interface WorkflowStep {
  id: number;
  step_number: number;
  title: string;
  description: string;
  icon: string;
}

interface FAQItem {
  id: number;
  question: string;
  answer: string;
  sort_order: number;
}

interface BookingService {
  id: number;
  name: string;
  price: string;
  duration: string;
  description: string;
  sort_order: number;
}

type TabType = 'contact' | 'workflow' | 'faq' | 'booking';

export default function ContactConfig() {
  const [activeTab, setActiveTab] = useState<TabType>('contact');
  const [loading, setLoading] = useState(true);

  // 联系方式
  const [contacts, setContacts] = useState<ContactConfig[]>([]);
  const [editingContact, setEditingContact] = useState<ContactConfig | null>(null);
  const [showContactForm, setShowContactForm] = useState(false);

  // 工作流程
  const [workflowSteps, setWorkflowSteps] = useState<WorkflowStep[]>([]);
  const [editingStep, setEditingStep] = useState<WorkflowStep | null>(null);
  const [showStepForm, setShowStepForm] = useState(false);

  // FAQ
  const [faqs, setFaqs] = useState<FAQItem[]>([]);
  const [editingFAQ, setEditingFAQ] = useState<FAQItem | null>(null);
  const [showFAQForm, setShowFAQForm] = useState(false);

  // 预约服务
  const [bookingServices, setBookingServices] = useState<BookingService[]>([]);
  const [editingService, setEditingService] = useState<BookingService | null>(null);
  const [showServiceForm, setShowServiceForm] = useState(false);

  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [contactsRes, workflowRes, faqRes, bookingRes] = await Promise.all([
        api.get('/config/contact_config'),
        api.get('/config/workflow_steps'),
        api.get('/config/faq_items'),
        api.get('/config/booking_services'),
      ]);
      setContacts(contactsRes.data.data || []);
      setWorkflowSteps(workflowRes.data.data || []);
      setFaqs(faqRes.data.data || []);
      setBookingServices(bookingRes.data.data || []);
    } catch (error) {
      console.error('获取数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 联系方式操作
  const handleSaveContact = async (data: Partial<ContactConfig>) => {
    try {
      if (editingContact?.id) {
        await updateRecord("contact_config", editingContact.id, data);
      } else {
        await createRecord("contact_config", data);
      }
      setShowContactForm(false);
      setEditingContact(null);
      const res = await api.get('/config/contact_config');
      setContacts(res.data.data || []);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  // FAQ操作
  const handleSaveFAQ = async (data: Partial<FAQItem>) => {
    try {
      if (editingFAQ?.id) {
        await updateRecord("faq_items", editingFAQ.id, data);
      } else {
        await createRecord("faq_items", data);
      }
      setShowFAQForm(false);
      setEditingFAQ(null);
      const res = await api.get('/config/faq_items');
      setFaqs(res.data.data || []);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDeleteFAQ = async (id: number) => {
    if (!window.confirm('确定要删除这个FAQ吗？')) return;
    try {
      await deleteRecord("faq_items", id);
      setFaqs(faqs.filter(f => f.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  // 工作流程操作
  const handleSaveStep = async (data: Partial<WorkflowStep>) => {
    try {
      if (editingStep?.id) {
        await updateRecord("workflow_steps", editingStep.id, data);
      } else {
        await createRecord("workflow_steps", data);
      }
      setShowStepForm(false);
      setEditingStep(null);
      const res = await api.get('/config/workflow_steps');
      setWorkflowSteps(res.data.data || []);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  // 预约服务操作
  const handleSaveService = async (data: Partial<BookingService>) => {
    try {
      if (editingService?.id) {
        await updateRecord("booking_services", editingService.id, data);
      } else {
        await createRecord("booking_services", data);
      }
      setShowServiceForm(false);
      setEditingService(null);
      const res = await api.get('/config/booking_services');
      setBookingServices(res.data.data || []);
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败，请重试');
    }
  };

  const handleDeleteService = async (id: number) => {
    if (!window.confirm('确定要删除这个服务吗�?)) return;
    try {
      await deleteRecord("booking_services", id);
      setBookingServices(bookingServices.filter(s => s.id !== id));
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请重试');
    }
  };

  const getContactIcon = (type: string) => {
    switch (type) {
      case 'wechat': return <FaPhone className="text-green-400" />;
      case 'email': return <FaEnvelope className="text-blue-400" />;
      case 'phone': return <FaPhone className="text-yellow-400" />;
      case 'address': return <FaMapMarkerAlt className="text-red-400" />;
      default: return <FaPhone className="text-gray-400" />;
    }
  };

  const tabs = [
    { key: 'contact', label: '联系方式' },
    { key: 'workflow', label: '工作流程' },
    { key: 'faq', label: '常见问题' },
    { key: 'booking', label: '预约服务' },
  ] as const;

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white">联系页配�?/h1>
          <p className="text-gray-400 mt-1">管理联系页面的所有配置内�?/p>
        </div>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-4">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key as TabType)}
            className={`px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 联系方式 Tab */}
      {activeTab === 'contact' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingContact(null);
                setShowContactForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
            >
              <FaPlus />
              添加联系方式
            </button>
          </div>
          {contacts.map(contact => (
            <div
              key={contact.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                    {getContactIcon(contact.type)}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">{contact.label}</h3>
                    <p className="text-gray-400">{contact.value}</p>
                    <span className="text-xs text-gray-500 uppercase">{contact.type}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setEditingContact(contact);
                    setShowContactForm(true);
                  }}
                  className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <FaEdit className="text-cyan-400" />
                </button>
              </div>
            </div>
          ))}
          {contacts.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">暂无联系方式，点击右上角添加</p>
            </div>
          )}
        </div>
      )}

      {/* 工作流程 Tab */}
      {activeTab === 'workflow' && (
        <div className="space-y-4">
          <div className="flex justify-end mb-4">
            <button
              onClick={() => {
                setEditingStep({ id: 0, step_number: workflowSteps.length + 1, title: '', description: '', icon: '' });
                setShowStepForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
            >
              <FaPlus />
              添加步骤
            </button>
          </div>
          <div className="flex items-center gap-4 mb-4">
            {workflowSteps.sort((a, b) => a.step_number - b.step_number).map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className="bg-white/5 backdrop-blur-sm rounded-2xl p-4 border border-white/10 hover:border-white/20 transition-all duration-300 cursor-pointer"
                  onClick={() => {
                    setEditingStep(step);
                    setShowStepForm(true);
                  }}
                  title="点击编辑"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white font-bold">
                      {step.step_number}
                    </div>
                    <div>
                      <h3 className="text-white font-bold">{step.title}</h3>
                      <p className="text-gray-400 text-sm">{step.description}</p>
                    </div>
                  </div>
                </div>
                {index < workflowSteps.length - 1 && (
                  <div className="w-8 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 mx-2"></div>
                )}
              </div>
            ))}
          </div>
          {workflowSteps.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">暂无工作流程步骤</p>
            </div>
          )}
        </div>
      )}

      {/* FAQ Tab */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingFAQ(null);
                setShowFAQForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
            >
              <FaPlus />
              添加FAQ
            </button>
          </div>
          {faqs.map(faq => (
            <div
              key={faq.id}
              className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-white mb-2">{faq.question}</h3>
                  <p className="text-gray-400">{faq.answer}</p>
                </div>
                <div className="flex items-center gap-2 ml-4">
                  <button
                    onClick={() => {
                      setEditingFAQ(faq);
                      setShowFAQForm(true);
                    }}
                    className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                  >
                    <FaEdit className="text-cyan-400" />
                  </button>
                  <button
                    onClick={() => handleDeleteFAQ(faq.id)}
                    className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                  >
                    <FaTrash className="text-red-400" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {faqs.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">暂无FAQ，点击右上角添加</p>
            </div>
          )}
        </div>
      )}

      {/* 预约服务 Tab */}
      {activeTab === 'booking' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingService(null);
                setShowServiceForm(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
            >
              <FaPlus />
              添加服务
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookingServices.map(service => (
              <div
                key={service.id}
                className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
                    <FaDollarSign className="text-white text-xl" />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingService(service);
                        setShowServiceForm(true);
                      }}
                      className="p-2 bg-white/5 rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <FaEdit className="text-cyan-400" />
                    </button>
                    <button
                      onClick={() => handleDeleteService(service.id)}
                      className="p-2 bg-white/5 rounded-lg hover:bg-red-500/20 transition-colors"
                    >
                      <FaTrash className="text-red-400" />
                    </button>
                  </div>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{service.name}</h3>
                <p className="text-gray-400 text-sm mb-4">{service.description}</p>
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1 text-cyan-400">
                    <FaDollarSign />
                    {service.price}
                  </span>
                  <span className="flex items-center gap-1 text-gray-400">
                    <FaClock />
                    {service.duration}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {bookingServices.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-400">暂无预约服务，点击右上角添加</p>
            </div>
          )}
        </div>
      )}

      {/* 联系方式表单弹窗 */}
      {showContactForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingContact ? '编辑联系方式' : '添加联系方式'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                handleSaveContact({
                  type: formData.get('type') as string,
                  value: formData.get('value') as string,
                  label: formData.get('label') as string,
                  sort_order: parseInt(formData.get('sort_order') as string) || 0,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">类型 *</label>
                <select
                  name="type"
                  defaultValue={editingContact?.type || 'wechat'}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                >
                  <option value="wechat">微信</option>
                  <option value="email">邮箱</option>
                  <option value="phone">电话</option>
                  <option value="address">地址</option>
                </select>
              </div>
              <div>
                <label className="block text-gray-300 mb-2">标签 *</label>
                <input
                  name="label"
                  defaultValue={editingContact?.label}
                  required
                  placeholder="如：商务合作、技术支�?
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">�?*</label>
                <input
                  name="value"
                  defaultValue={editingContact?.value}
                  required
                  placeholder="如：微信号、邮箱地址"
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">排序</label>
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={editingContact?.sort_order || 0}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowContactForm(false);
                    setEditingContact(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 工作流程表单弹窗 */}
      {showStepForm && editingStep && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingStep?.id ? '编辑工作流程步骤' : '添加工作流程步骤'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                handleSaveStep({
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  step_number: parseInt(formData.get('step_number') as string) || 1,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">步骤序号 *</label>
                <input
                  name="step_number"
                  type="number"
                  defaultValue={editingStep.step_number}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">标题 *</label>
                <input
                  name="title"
                  defaultValue={editingStep.title}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">描述</label>
                <textarea
                  name="description"
                  defaultValue={editingStep.description}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowStepForm(false);
                    setEditingStep(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FAQ表单弹窗 */}
      {showFAQForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingFAQ ? '编辑FAQ' : '添加FAQ'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                handleSaveFAQ({
                  question: formData.get('question') as string,
                  answer: formData.get('answer') as string,
                  sort_order: parseInt(formData.get('sort_order') as string) || 0,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">问题 *</label>
                <input
                  name="question"
                  defaultValue={editingFAQ?.question}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">答案 *</label>
                <textarea
                  name="answer"
                  defaultValue={editingFAQ?.answer}
                  required
                  rows={4}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">排序</label>
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={editingFAQ?.sort_order || 0}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowFAQForm(false);
                    setEditingFAQ(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 预约服务表单弹窗 */}
      {showServiceForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0F0F1A] rounded-2xl p-6 max-w-lg w-full">
            <h2 className="text-2xl font-bold text-white mb-4">
              {editingService ? '编辑服务' : '添加服务'}
            </h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.target as HTMLFormElement);
                handleSaveService({
                  name: formData.get('name') as string,
                  price: formData.get('price') as string,
                  duration: formData.get('duration') as string,
                  description: formData.get('description') as string,
                  sort_order: parseInt(formData.get('sort_order') as string) || 0,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-gray-300 mb-2">服务名称 *</label>
                <input
                  name="name"
                  defaultValue={editingService?.name}
                  required
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 mb-2">价格 *</label>
                  <input
                    name="price"
                    defaultValue={editingService?.price}
                    required
                    placeholder="如：¥500/小时"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 mb-2">时长 *</label>
                  <input
                    name="duration"
                    defaultValue={editingService?.duration}
                    required
                    placeholder="如：1小时"
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-gray-300 mb-2">描述</label>
                <textarea
                  name="description"
                  defaultValue={editingService?.description}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-gray-300 mb-2">排序</label>
                <input
                  name="sort_order"
                  type="number"
                  defaultValue={editingService?.sort_order || 0}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-cyan-500"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowServiceForm(false);
                    setEditingService(null);
                  }}
                  className="flex-1 px-4 py-2 bg-white/5 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-lg text-white hover:opacity-90 transition-opacity"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
