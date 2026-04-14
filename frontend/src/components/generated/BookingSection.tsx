import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaCalendar, FaClock, FaCheck } from 'react-icons/fa';
import { toast } from 'sonner';
import { configApi, contactApi } from '@/lib/api';

const timeSlots = [
  '09:00-10:00',
  '10:30-11:30',
  '14:00-15:00',
  '15:30-16:30',
  '17:00-18:00',
  '19:00-20:00',
];

const defaultServiceTypes = [
  { id: '3d', name: '3D 建模咨询', price: '¥500/小时', duration: '1 小时' },
  { id: 'dev', name: '应用开发咨询', price: '¥600/小时', duration: '1 小时' },
  { id: 'art', name: '原画设计咨询', price: '¥500/小时', duration: '1 小时' },
  { id: 'career', name: '职业规划咨询', price: '¥400/小时', duration: '1 小时' },
  { id: 'portfolio', name: '作品集指导', price: '¥450/小时', duration: '1 小时' },
];

export default function BookingSection() {
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedTime, setSelectedTime] = useState('');
  const [selectedService, setSelectedService] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serviceTypes, setServiceTypes] = useState(defaultServiceTypes);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await configApi.getTable('booking_services');
        const data = res.data?.data || [];
        if (data.length > 0) {
          const mapped = data
            .map((s: any) => ({
              id: s.id || s.key || s.name,
              name: s.name || s.title || '未命名服务',
              price: s.price || s.price_text || '¥500/小时',
              duration: s.duration || '1 小时',
            }))
            .sort((a: any, b: any) => (a.sort_order || 0) - (b.sort_order || 0));
          if (mapped.length > 0) setServiceTypes(mapped);
        }
      } catch (error) {
        console.error('获取预约服务失败:', error);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      const service = serviceTypes.find((s) => s.id === selectedService);
      await contactApi.submit({
        name: '',
        email: '',
        phone: '',
        message: `预约咨询\n日期: ${selectedDate}\n时间: ${selectedTime}\n服务: ${service?.name || selectedService}\n备注: ${notes}`,
      });
      toast.success('预约成功！我们将通过微信与您确认');
      setSelectedDate('');
      setSelectedTime('');
      setSelectedService('');
      setNotes('');
    } catch (error) {
      toast.error('预约失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const today = new Date();
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    return {
      full: date.toISOString().split('T')[0],
      display: date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }),
      weekday: date.toLocaleDateString('zh-CN', { weekday: 'short' }),
    };
  });

  return (
    <section className="py-20 bg-gradient-to-b from-[#0A0A0F] to-[#0F0F1A]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
            在线预约
          </h2>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            选择适合你的时间，预约一对一专业咨询服务
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white/5 backdrop-blur-sm rounded-2xl p-8 border border-white/10"
        >
          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label className="block text-white font-semibold mb-4">
                <FaCalendar className="inline mr-2 text-[#00F5FF]" />
                选择日期
              </label>
              <div className="grid grid-cols-7 gap-2">
                {next7Days.map((day) => (
                  <button
                    key={day.full}
                    type="button"
                    onClick={() => setSelectedDate(day.full)}
                    className={`p-3 rounded-lg text-center transition-all duration-300 ${
                      selectedDate === day.full
                        ? 'bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    <div className="text-xs mb-1">{day.weekday}</div>
                    <div className="font-semibold">{day.display}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-white font-semibold mb-4">
                <FaClock className="inline mr-2 text-[#00F5FF]" />
                选择时间段
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {timeSlots.map((slot) => (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedTime(slot)}
                    className={`p-3 rounded-lg text-center transition-all duration-300 ${
                      selectedTime === slot
                        ? 'bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20'
                    }`}
                  >
                    {slot}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-white font-semibold mb-4">
                选择服务类型
              </label>
              <div className="space-y-3">
                {serviceTypes.map((service) => (
                  <button
                    key={service.id}
                    type="button"
                    onClick={() => setSelectedService(service.id)}
                    className={`w-full p-4 rounded-lg text-left transition-all duration-300 border ${
                      selectedService === service.id
                        ? 'border-[#4A5BFF] bg-[#4A5BFF]/10'
                        : 'border-white/10 bg-white/5 hover:bg-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{service.name}</div>
                        <div className="text-gray-400 text-sm">{service.duration}</div>
                      </div>
                      <div className="text-[#00F5FF] font-semibold">
                        {service.price}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-white font-semibold mb-2">
                备注说明（选填）
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-[#4A5BFF] transition-colors resize-none"
                placeholder="请简要说明你想咨询的内容或特殊需求"
              />
            </div>

            <button
              type="submit"
              disabled={!selectedDate || !selectedTime || !selectedService || isSubmitting}
              className="w-full px-6 py-4 bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] text-white font-semibold rounded-lg hover:shadow-lg hover:shadow-[#4A5BFF]/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isSubmitting ? (
                '提交中...'
              ) : (
                <>
                  <FaCheck className="mr-2" />
                  确认预约
                </>
              )}
            </button>
          </form>
        </motion.div>
      </div>
    </section>
  );
}
