-- 盖可设计圈 - 新增配置表
-- 在 Supabase SQL Editor 中执行
-- 需要在 site-config.sql 之后执行

-- 6. 联系方式配置
CREATE TABLE IF NOT EXISTS contact_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL,           -- wechat / email / phone / address
  label TEXT NOT NULL,          -- 显示名称：微信 / 邮箱 / 电话
  value TEXT NOT NULL,          -- 具体值：GeekDesignCircle / contact@geekdesign.com
  icon TEXT,                    -- 图标标识
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 常见问题 FAQ
CREATE TABLE IF NOT EXISTS faq_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT DEFAULT 'general',  -- general / pricing / process / other
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. 工作流程步骤
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  step_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 9. 预约服务类型
CREATE TABLE IF NOT EXISTS booking_services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE,               -- 唯一标识：3d / dev / art / career / portfolio
  name TEXT NOT NULL,
  price TEXT,
  price_text TEXT,
  duration TEXT DEFAULT '1 小时',
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 10. 通用页面内容（key-value 灵活存储）
CREATE TABLE IF NOT EXISTS page_contents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  page TEXT NOT NULL,            -- 页面标识：services / about / community / footer 等
  section TEXT DEFAULT '',       -- 区域标识（可选）
  key TEXT NOT NULL,             -- 内容键名
  value TEXT,                    -- 内容值
  type TEXT DEFAULT 'text',      -- text / json / html / image
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 触发器
CREATE TRIGGER update_contact_config_updated_at BEFORE UPDATE ON contact_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_faq_items_updated_at BEFORE UPDATE ON faq_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workflow_steps_updated_at BEFORE UPDATE ON workflow_steps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_booking_services_updated_at BEFORE UPDATE ON booking_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_page_contents_updated_at BEFORE UPDATE ON page_contents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE contact_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE faq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE page_contents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous read contact_config" ON contact_config FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read faq_items" ON faq_items FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read workflow_steps" ON workflow_steps FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read booking_services" ON booking_services FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read page_contents" ON page_contents FOR SELECT USING (true);

CREATE POLICY "Allow authenticated write contact_config" ON contact_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write faq_items" ON faq_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write workflow_steps" ON workflow_steps FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write booking_services" ON booking_services FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write page_contents" ON page_contents FOR ALL USING (auth.role() = 'authenticated');

-- ========== 初始数据 ==========

-- 联系方式
INSERT INTO contact_config (type, label, value, icon, sort_order) VALUES
  ('wechat', '微信', 'GeekDesignCircle', 'FaWeixin', 1),
  ('email', '邮箱', 'contact@geekdesign.com', 'FaEnvelope', 2),
  ('phone', '电话', '400-XXX-XXXX', 'FaPhone', 3)
ON CONFLICT DO NOTHING;

-- 常见问题
INSERT INTO faq_items (question, answer, category, sort_order) VALUES
  ('服务周期一般是多久？',
   '根据项目复杂程度而定。小型项目（如单个 3D 模型、简单页面设计）通常 1-2 周；中型项目（如完整 App 开发、系列原画）2-4 周；大型项目会提供更详细的时间规划。',
   'general', 1),
  ('收费方式是怎样的？',
   '我们采用项目制收费，根据项目复杂度、工作量、交付周期等因素综合报价。教育咨询按小时计费，学习社群采用会员制。具体费用会在沟通需求后提供详细报价单。',
   'pricing', 2),
  ('可以提供修改吗？',
   '当然可以。每个项目都包含合理的修改次数（通常 2-3 轮），确保最终成果符合你的预期。超出约定次数的修改会收取适当费用。',
   'process', 3),
  ('如何保证项目质量？',
   '我们有完善的项目管理流程和质量把控机制。每个项目都会配备专人负责，定期同步进度，确保按时按质交付。同时提供售后支持，解决后续问题。',
   'general', 4)
ON CONFLICT DO NOTHING;

-- 工作流程
INSERT INTO workflow_steps (step_number, title, description, icon, sort_order) VALUES
  (1, '咨询', '提交需求或添加微信', 'FaComments', 1),
  (2, '沟通', '详细沟通项目需求', 'FaHandshake', 2),
  (3, '方案', '提供方案和报价', 'FaFileAlt', 3),
  (4, '执行', '签订合同开始执行', 'FaRocket', 4),
  (5, '交付', '完成项目交付验收', 'FaCheckCircle', 5)
ON CONFLICT DO NOTHING;

-- 预约服务
INSERT INTO booking_services (key, name, price, price_text, duration, description, sort_order) VALUES
  ('3d', '3D 建模咨询', '¥500', '¥500/小时', '1 小时', '专业 3D 建模与渲染咨询服务', 1),
  ('dev', '应用开发咨询', '¥600', '¥600/小时', '1 小时', '移动端/Web 应用开发技术咨询', 2),
  ('art', '原画设计咨询', '¥500', '¥500/小时', '1 小时', '角色设计、场景原画等咨询服务', 3),
  ('career', '职业规划咨询', '¥400', '¥400/小时', '1 小时', '设计/开发方向职业规划指导', 4),
  ('portfolio', '作品集指导', '¥450', '¥450/小时', '1 小时', '个人作品集优化与展示建议', 5)
ON CONFLICT DO NOTHING;
