import { motion } from 'framer-motion';

export default function AboutSection() {
  return (
    <section className="py-20 bg-[#0F0F1A]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              不只是工作室
              <br />
              <span className="bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] bg-clip-text text-transparent">
                更是创意伙伴
              </span>
            </h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              我们相信，好的设计不只是好看，更要好用、好懂、好传播。
            </p>
            <p className="text-gray-400 leading-relaxed mb-8">
              从 3D 建模到应用开发，从原画设计到职业咨询，我们提供的不只是服务，更是陪你成长的创意生态。无论你是想做一个酷炫的 3D 角色，还是开发一款自己的 App，或者只是想找个圈子一起进步，这里都欢迎你。
            </p>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <div className="text-3xl font-bold bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] bg-clip-text text-transparent">
                  100+
                </div>
                <div className="text-gray-400 text-sm mt-1">服务客户</div>
              </div>
              <div>
                <div className="text-3xl font-bold bg-gradient-to-r from-[#4A5BFF] to-[#7B3FF2] bg-clip-text text-transparent">
                  500+
                </div>
                <div className="text-gray-400 text-sm mt-1">完成项目</div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative"
          >
            <div className="aspect-square bg-gradient-to-br from-[#4A5BFF]/20 to-[#7B3FF2]/20 rounded-3xl overflow-hidden">
              <img
                src="https://baas-api.wanwang.xin/toc/image/preview/creative-team-working.jpg?w=600&h=600&q=80"
                alt="团队工作场景"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-gradient-to-br from-[#4A5BFF] to-[#7B3FF2] rounded-2xl flex items-center justify-center">
              <div className="text-center text-white">
                <div className="text-2xl font-bold">创意</div>
                <div className="text-sm opacity-80">技术</div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
