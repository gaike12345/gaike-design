import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';

const app = express();
const PORT = 3001;

// 中間件
app.use(cors());
app.use(express.json());

// 内存数据存储
const memoryStore = {
  works: [
    { id: 1, title: '游戏角色设计', description: '为某游戏项目设计的3D角色', category: '3D建模', image_url: 'https://picsum.photos/800/600?random=1', tags: ['游戏', '角色'], status: 'published', created_at: new Date().toISOString() },
    { id: 2, title: '企业官网开发', description: '响应式企业官网设计与开发', category: '应用开发', image_url: 'https://picsum.photos/800/600?random=2', tags: ['网站', '企业'], status: 'published', created_at: new Date().toISOString() },
    { id: 3, title: '概念原画集', description: '科幻题材概念原画系列', category: '原画设计', image_url: 'https://picsum.photos/800/600?random=3', tags: ['原画', '科幻'], status: 'draft', created_at: new Date().toISOString() },
  ],
  blogPosts: [
    { id: 1, title: '2024 年 3D 设计趋势解析', content: '探索今年最流行的 3D 设计风格...', excerpt: '探索今年最流行的 3D 设计风格和技术趋势', category: '行业洞察', author: 'Alex Chen', image_url: 'https://picsum.photos/800/500?random=4', status: 'published', created_at: new Date().toISOString() },
    { id: 2, title: 'Blender 入门指南', content: '针对初学者的 Blender 完整教程...', excerpt: '针对初学者的 Blender 完整教程', category: '设计教程', author: 'Sarah Wang', image_url: 'https://picsum.photos/800/500?random=5', status: 'published', created_at: new Date().toISOString() },
  ],
  services: [
    { id: 1, title: '3D建模', description: '角色建模、场景建模、产品可视化', icon: 'cube', features: ['角色建模', '场景建模', '产品可视化'], sort_order: 1, status: 'active' },
    { id: 2, title: '应用开发', description: '移动应用、Web应用、交互原型', icon: 'code', features: ['移动应用', 'Web应用', 'API开发'], sort_order: 2, status: 'active' },
    { id: 3, title: '原画设计', description: '角色原画、场景原画、概念设计', icon: 'palette', features: ['角色原画', '场景原画'], sort_order: 3, status: 'active' },
    { id: 4, title: '学习交友', description: '设计课程、作品指导、社群交流', icon: 'users', features: ['设计课程', '社群交流'], sort_order: 4, status: 'active' },
    { id: 5, title: '教育咨询', description: '职业规划、作品集指导、留学咨询', icon: 'graduation-cap', features: ['职业规划', '作品集指导'], sort_order: 5, status: 'active' },
  ],
  contacts: [
    { id: 1, name: '张三', email: 'zhangsan@example.com', phone: '13800138000', wechat: 'zhangsan_wx', service_type: '3D建模', message: '想咨询游戏角色建模的价格和周期', status: 'pending', created_at: new Date().toISOString() },
    { id: 2, name: '李四', email: 'lisi@example.com', phone: '', wechat: '', service_type: '应用开发', message: '需要一个企业官网，预算大概5万', status: 'read', created_at: new Date(Date.now() - 86400000).toISOString() },
  ],
  teamMembers: [
    { id: 1, name: '盖可', role: '创始人 & 主设计师', bio: '热爱3D建模和原画设计，5年设计经验', avatar_url: 'https://picsum.photos/200/200?random=10', skills: ['3D建模', '原画设计', 'Blender'], sort_order: 1, status: 'active' },
    { id: 2, name: '小美', role: '前端开发工程师', bio: '专注于React和Vue开发', avatar_url: 'https://picsum.photos/200/200?random=11', skills: ['React', 'Vue', 'TypeScript'], sort_order: 2, status: 'active' },
  ],
  portfolio: [],
};

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 作品 API ====================
app.get('/api/works', (req, res) => {
  res.json({ data: memoryStore.works, total: memoryStore.works.length });
});

app.get('/api/works/:id', (req, res) => {
  const work = memoryStore.works.find(w => w.id === parseInt(req.params.id));
  if (!work) return res.status(404).json({ error: 'Not found' });
  res.json(work);
});

app.post('/api/works', (req, res) => {
  const newWork = {
    id: memoryStore.works.length + 1,
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  memoryStore.works.push(newWork);
  res.status(201).json(newWork);
});

app.put('/api/works/:id', (req, res) => {
  const index = memoryStore.works.findIndex(w => w.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.works[index] = { ...memoryStore.works[index], ...req.body, updated_at: new Date().toISOString() };
  res.json(memoryStore.works[index]);
});

app.delete('/api/works/:id', (req, res) => {
  const index = memoryStore.works.findIndex(w => w.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.works.splice(index, 1);
  res.status(204).send();
});

// ==================== 博客 API ====================
app.get('/api/blog', (req, res) => {
  res.json({ data: memoryStore.blogPosts, total: memoryStore.blogPosts.length });
});

app.get('/api/blog/:id', (req, res) => {
  const post = memoryStore.blogPosts.find(p => p.id === parseInt(req.params.id));
  if (!post) return res.status(404).json({ error: 'Not found' });
  res.json(post);
});

app.post('/api/blog', (req, res) => {
  const newPost = {
    id: memoryStore.blogPosts.length + 1,
    ...req.body,
    created_at: new Date().toISOString(),
  };
  memoryStore.blogPosts.push(newPost);
  res.status(201).json(newPost);
});

app.put('/api/blog/:id', (req, res) => {
  const index = memoryStore.blogPosts.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.blogPosts[index] = { ...memoryStore.blogPosts[index], ...req.body };
  res.json(memoryStore.blogPosts[index]);
});

app.delete('/api/blog/:id', (req, res) => {
  const index = memoryStore.blogPosts.findIndex(p => p.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.blogPosts.splice(index, 1);
  res.status(204).send();
});

// ==================== 服务 API ====================
app.get('/api/services', (req, res) => {
  res.json({ data: memoryStore.services, total: memoryStore.services.length });
});

app.get('/api/services/:id', (req, res) => {
  const service = memoryStore.services.find(s => s.id === parseInt(req.params.id));
  if (!service) return res.status(404).json({ error: 'Not found' });
  res.json(service);
});

app.post('/api/services', (req, res) => {
  const newService = {
    id: memoryStore.services.length + 1,
    ...req.body,
  };
  memoryStore.services.push(newService);
  res.status(201).json(newService);
});

app.put('/api/services/:id', (req, res) => {
  const index = memoryStore.services.findIndex(s => s.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.services[index] = { ...memoryStore.services[index], ...req.body };
  res.json(memoryStore.services[index]);
});

app.delete('/api/services/:id', (req, res) => {
  const index = memoryStore.services.findIndex(s => s.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.services.splice(index, 1);
  res.status(204).send();
});

// ==================== 联系咨询 API ====================
app.get('/api/contact', (req, res) => {
  res.json({ data: memoryStore.contacts, total: memoryStore.contacts.length });
});

app.get('/api/contact/:id', (req, res) => {
  const contact = memoryStore.contacts.find(c => c.id === parseInt(req.params.id));
  if (!contact) return res.status(404).json({ error: 'Not found' });
  res.json(contact);
});

app.post('/api/contact', (req, res) => {
  const newContact = {
    id: memoryStore.contacts.length + 1,
    ...req.body,
    status: 'pending',
    created_at: new Date().toISOString(),
  };
  memoryStore.contacts.push(newContact);
  res.status(201).json(newContact);
});

app.put('/api/contact/:id', (req, res) => {
  const index = memoryStore.contacts.findIndex(c => c.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.contacts[index] = { ...memoryStore.contacts[index], ...req.body };
  res.json(memoryStore.contacts[index]);
});

app.delete('/api/contact/:id', (req, res) => {
  const index = memoryStore.contacts.findIndex(c => c.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.contacts.splice(index, 1);
  res.status(204).send();
});

// ==================== 团队 API ====================
app.get('/api/team', (req, res) => {
  res.json({ data: memoryStore.teamMembers, total: memoryStore.teamMembers.length });
});

app.get('/api/team/:id', (req, res) => {
  const member = memoryStore.teamMembers.find(m => m.id === parseInt(req.params.id));
  if (!member) return res.status(404).json({ error: 'Not found' });
  res.json(member);
});

app.post('/api/team', (req, res) => {
  const newMember = {
    id: memoryStore.teamMembers.length + 1,
    ...req.body,
  };
  memoryStore.teamMembers.push(newMember);
  res.status(201).json(newMember);
});

app.put('/api/team/:id', (req, res) => {
  const index = memoryStore.teamMembers.findIndex(m => m.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.teamMembers[index] = { ...memoryStore.teamMembers[index], ...req.body };
  res.json(memoryStore.teamMembers[index]);
});

app.delete('/api/team/:id', (req, res) => {
  const index = memoryStore.teamMembers.findIndex(m => m.id === parseInt(req.params.id));
  if (index === -1) return res.status(404).json({ error: 'Not found' });
  memoryStore.teamMembers.splice(index, 1);
  res.status(204).send();
});

// ==================== 作品集 API ====================
app.get('/api/portfolio', (req, res) => {
  res.json({ data: memoryStore.portfolio, total: memoryStore.portfolio.length });
});

// 啟動服務器
app.listen(PORT, () => {
  console.log(`✅ 盖可设计圈内存存储后端运行在: http://localhost:${PORT}`);
  console.log(`📋 这是开发测试版本，数据存储在内存中`);
});
