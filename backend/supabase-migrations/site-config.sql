-- 盖可设计圈 - 网站配置表
-- 在 Supabase SQL Editor 中执行

-- 1. 首页 Hero 区域配置
CREATE TABLE IF NOT EXISTS hero_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '让创意落地，让设计发声',
  subtitle TEXT,
  description TEXT,
  button1_text TEXT DEFAULT '探索服务',
  button1_link TEXT DEFAULT '/services',
  button2_text TEXT DEFAULT '加入社群',
  button2_link TEXT DEFAULT '/community',
  background_style TEXT DEFAULT 'gradient',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 关于我们区域配置
CREATE TABLE IF NOT EXISTS about_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '不只是工作室，更是创意伙伴',
  description TEXT,
  stats JSONB DEFAULT '[{"value": "100+", "label": "服务客户"}, {"value": "500+", "label": "完成项目"}]',
  image_url TEXT,
  badge_text TEXT DEFAULT '创意技术',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. CTA 区域配置
CREATE TABLE IF NOT EXISTS cta_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '准备好开启你的创意之旅了吗？',
  description TEXT,
  button1_text TEXT DEFAULT '聊聊你的项目',
  button1_link TEXT DEFAULT '/contact',
  button2_text TEXT DEFAULT '加入创意圈子',
  button2_link TEXT DEFAULT '/community',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 网站基础配置
CREATE TABLE IF NOT EXISTS site_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  type TEXT DEFAULT 'text',
  group_key TEXT DEFAULT 'general',
  label TEXT,
  description TEXT,
  options JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 案例研究/客户见证配置
CREATE TABLE IF NOT EXISTS case_studies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  client TEXT,
  category TEXT,
  challenge TEXT,
  solution TEXT,
  result TEXT,
  testimonial TEXT,
  rating INTEGER DEFAULT 5,
  image_url TEXT,
  images JSONB DEFAULT '[]',
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为新表添加更新时间触发器
CREATE TRIGGER update_hero_config_updated_at BEFORE UPDATE ON hero_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_about_config_updated_at BEFORE UPDATE ON about_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cta_config_updated_at BEFORE UPDATE ON cta_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_site_settings_updated_at BEFORE UPDATE ON site_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_case_studies_updated_at BEFORE UPDATE ON case_studies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 设置行级安全策略 (RLS)
ALTER TABLE hero_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE about_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE cta_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;

-- 读取策略（所有人可读）
CREATE POLICY "Allow anonymous read hero_config" ON hero_config FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read about_config" ON about_config FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read cta_config" ON cta_config FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read site_settings" ON site_settings FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read case_studies" ON case_studies FOR SELECT USING (true);

-- 写入策略（需要认证）
CREATE POLICY "Allow authenticated write hero_config" ON hero_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write about_config" ON about_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write cta_config" ON cta_config FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write site_settings" ON site_settings FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated write case_studies" ON case_studies FOR ALL USING (auth.role() = 'authenticated');

-- 插入默认配置数据
INSERT INTO hero_config (title) VALUES (DEFAULT) ON CONFLICT DO NOTHING;
INSERT INTO about_config (title) VALUES (DEFAULT) ON CONFLICT DO NOTHING;
INSERT INTO cta_config (title) VALUES (DEFAULT) ON CONFLICT DO NOTHING;

-- 插入默认网站配置
INSERT INTO site_settings (key, value, type, group_key, label, sort_order) VALUES
('site_name', '盖可设计圈', 'text', 'general', '网站名称', 1),
('site_description', '让创意落地，让设计发声', 'text', 'general', '网站描述', 2),
('contact_email', 'contact@geekdesign.com', 'text', 'contact', '联系邮箱', 1),
('contact_wechat', 'GeekDesignCircle', 'text', 'contact', '微信号', 2),
('social_github', '', 'text', 'social', 'GitHub', 1),
('social_zhihu', '', 'text', 'social', '知乎', 2),
('footer_copyright', '© 2026 盖可设计圈', 'text', 'footer', '版权信息', 1),
('primary_color', '#4A5BFF', 'color', 'style', '主题色', 1),
('secondary_color', '#7B3FF2', 'color', 'style', '辅助色', 2),
('accent_color', '#00F5FF', 'color', 'style', '强调色', 3)
ON CONFLICT (key) DO NOTHING;

-- 插入默认案例数据
INSERT INTO case_studies (title, client, category, challenge, solution, result, testimonial, rating, featured, sort_order) VALUES
('《赛博纪元》角色设计', '某独立游戏工作室', '3D建模', '需要在2周内完成5个主要角色的完整设计，包括原画、3D建模和绑定', '采用模块化设计流程，先统一风格设定，再分工并行制作，每日同步进度', '提前2天交付，客户满意度98%，角色上线后获得玩家一致好评', '盖可团队的专业能力和执行力超出预期，角色设计完美还原了我们想要的赛博朋克风格！', 5, true, 1),
('健康管家App全案开发', '某健康科技创业公司', '应用开发', '从0到1打造完整产品，需要兼顾用户体验和技术可行性，预算有限', '采用MVP敏捷开发模式，优先核心功能，使用跨平台方案降低成本', '3个月上线MVP版本，获得种子用户5000+，成功拿到天使轮融资', '不仅帮我们做出了产品，还提供了很多产品层面的建议，是真正的合作伙伴！', 5, true, 2),
('奇幻电影概念设计', '某影视制作公司', '原画设计', '需要构建完整的奇幻世界观，包括场景、角色、道具等全方位概念设计', '组建5人专项团队，深入研究奇幻文化，创作超过200张概念图', '设计方案获得导演高度认可，多个场景被完整采用到电影中', '团队对奇幻文化的理解和创造力令人印象深刻，为电影增色不少！', 5, true, 3)
ON CONFLICT DO NOTHING;
