-- 盖可设计圈 - Supabase 数据库表结构
-- 在 Supabase SQL Editor 中执行

-- 1. 作品表 (Works)
CREATE TABLE IF NOT EXISTS works (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  tags TEXT[],
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 博客文章表 (Blog Posts)
CREATE TABLE IF NOT EXISTS blog_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  excerpt TEXT,
  content TEXT,
  category TEXT,
  author TEXT,
  image_url TEXT,
  read_time TEXT,
  published BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 服务项目表 (Services)
CREATE TABLE IF NOT EXISTS services (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  features TEXT[],
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. 联系咨询表 (Contact Submissions)
CREATE TABLE IF NOT EXISTS contact_submissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  service_type TEXT,
  project_description TEXT,
  budget TEXT,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. 团队成员表 (Team Members)
CREATE TABLE IF NOT EXISTS team_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  bio TEXT,
  avatar_url TEXT,
  social_links JSONB,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. 作品集表 (Portfolio)
CREATE TABLE IF NOT EXISTS portfolio (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  image_url TEXT,
  thumbnail_url TEXT,
  tags TEXT[],
  client TEXT,
  year INTEGER,
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. 社群活动表 (Community Events)
CREATE TABLE IF NOT EXISTS community_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  event_type TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  location TEXT,
  image_url TEXT,
  max_participants INTEGER,
  status TEXT DEFAULT 'upcoming',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 8. 学员见证表 (Testimonials)
CREATE TABLE IF NOT EXISTS testimonials (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT,
  content TEXT NOT NULL,
  avatar_url TEXT,
  featured BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- 为所有表添加更新时间触发器
CREATE TRIGGER update_works_updated_at BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_blog_posts_updated_at BEFORE UPDATE ON blog_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contact_submissions_updated_at BEFORE UPDATE ON contact_submissions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_portfolio_updated_at BEFORE UPDATE ON portfolio
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_community_events_updated_at BEFORE UPDATE ON community_events
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 设置行级安全策略 (RLS)
-- 允许匿名用户读取所有数据
-- 只有认证用户可以写入

ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE testimonials ENABLE ROW LEVEL SECURITY;

-- 读取策略（所有人）
CREATE POLICY "Allow anonymous read" ON works FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON blog_posts FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON services FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON contact_submissions FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON team_members FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON portfolio FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON community_events FOR SELECT USING (true);
CREATE POLICY "Allow anonymous read" ON testimonials FOR SELECT USING (true);

-- 写入策略（需要认证）
CREATE POLICY "Allow authenticated insert" ON works FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON works FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON works FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON blog_posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON blog_posts FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON blog_posts FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON services FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON services FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON services FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON contact_submissions FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON contact_submissions FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON contact_submissions FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON team_members FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON team_members FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON team_members FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON portfolio FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON portfolio FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON portfolio FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON community_events FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON community_events FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON community_events FOR DELETE USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated insert" ON testimonials FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated update" ON testimonials FOR UPDATE USING (auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated delete" ON testimonials FOR DELETE USING (auth.role() = 'authenticated');

-- 插入初始数据
INSERT INTO services (name, description, icon, features, sort_order) VALUES
('3D建模', '角色建模、场景建模、产品可视化等全方位3D服务', 'cube', ARRAY['角色建模', '场景建模', '产品可视化', '动画渲染'], 1),
('应用开发', '移动应用、Web应用、交互原型等开发服务', 'code', ARRAY['移动应用', 'Web应用', '交互原型', '技术咨询'], 2),
('原画设计', '角色原画、场景原画、概念设计等美术服务', 'palette', ARRAY['角色原画', '场景原画', '概念设计', '风格探索'], 3),
('学习交友', '设计课程、作品指导、社群交流、线下活动', 'users', ARRAY['设计课程', '作品指导', '社群交流', '线下活动'], 4),
('教育咨询', '职业规划、作品集指导、留学咨询、技能提升', 'graduation-cap', ARRAY['职业规划', '作品集指导', '留学咨询', '技能提升'], 5);
