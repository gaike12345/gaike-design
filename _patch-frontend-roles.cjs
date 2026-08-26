const fs=require('fs');

// ===== 1. useAuthStore.ts — 更新 role 类型 =====
const storePath='web/src/store/useAuthStore.ts';
let store=fs.readFileSync(storePath,'utf8');
store=store.replace(
  "role: 'user' | 'creator' | 'moderator' | 'admin'",
  "role: 'user' | 'creator' | 'moderator' | 'admin' | 'superadmin'"
);
fs.writeFileSync(storePath, store, 'utf8');
console.log('[1] useAuthStore.ts role type updated');

// ===== 2. AdminPage.tsx — 按角色显示 Tab =====
const adminPath='web/src/pages/AdminPage.tsx';
let admin=fs.readFileSync(adminPath,'utf8');

// 2a. 更新 Role 类型
admin=admin.replace(
  "type Role = 'user' | 'creator' | 'moderator' | 'admin'",
  "type Role = 'user' | 'creator' | 'moderator' | 'admin' | 'superadmin'"
);
admin=admin.replace(
  "const VALID_ROLES: Role[] = ['user', 'creator', 'moderator', 'admin']",
  "const VALID_ROLES: Role[] = ['user', 'creator', 'moderator', 'admin', 'superadmin']"
);

// 2b. 添加 superadmin 标签
admin=admin.replace(
  "  admin: '管理员',",
  "  admin: '管理员',\n  superadmin: '超级管理员',"
);
admin=admin.replace(
  "  { key: 'admin', label: '管理员' },",
  "  { key: 'admin', label: '管理员' },\n  { key: 'superadmin', label: '超级管理员' },"
);

// 2c. 更新权限校验 — admin 和 superadmin 均可访问
admin=admin.replace(
  "  if (!user || user.role !== 'admin') {",
  "  if (!user || (user.role !== 'admin' && user.role !== 'superadmin')) {"
);

// 2d. 按角色过滤 Tab — superadmin 显示全部，admin 只显示用户管理+前端预览
admin=admin.replace(
  "  { key: 'features' as const, label: '板块功能', icon: Settings2 },\n  { key: 'preview' as const, label: '前端预览', icon: Eye },",
  "  { key: 'features' as const, label: '板块功能', icon: Settings2 },\n  { key: 'preview' as const, label: '前端预览', icon: Eye },\n] as const\n\n// 管理员可见 Tab 过滤\nconst ALL_TABS = [...TABS]\nfunction getTabsForRole(role: string | undefined) {\n  if (role === 'superadmin') return ALL_TABS\n  if (role === 'admin') return ALL_TABS.filter(t => t.key === 'users' || t.key === 'preview')\n  return []\n}\n\nconst _TABS_UNUSED = ["
);

// 修复：替换 TABS 引用为 getTabsForRole
admin=admin.replace(
  "const _TABS_UNUSED = [",
  "// @ts-ignore unused\nconst _TABS_UNUSED = ["
);

// 在组件函数体内，替换 TABS 为动态 tabs
admin=admin.replace(
  "  const user = useAuthStore((s) => s.user)",
  "  const user = useAuthStore((s) => s.user)\n  const tabs = getTabsForRole(user?.role)"
);
admin=admin.replace(
  "        {TABS.map((tab) => (\n          <button",
  "        {tabs.map((tab) => (\n          <button"
);
admin=admin.replace(
  "          className={activeTab === tab.key",
  "          className={activeTab === tab.key"
);

// 重置默认 activeTab 如果 admin 首次加载不在可用 tab 中
admin=admin.replace(
  "const [activeTab, setActiveTab] = useState<'users' | 'models' | 'generations' | 'features' | 'preview'>('users')",
  "const [activeTab, setActiveTab] = useState<'users' | 'models' | 'generations' | 'features' | 'preview'>('users')\n  // 如果当前 tab 不在角色可用列表中，自动切换到第一个可用 tab\n  useEffect(() => {\n    if (tabs.length > 0 && !tabs.some(t => t.key === activeTab)) {\n      setActiveTab(tabs[0].key)\n    }\n  }, [tabs, activeTab])"
);

// 需要添加 useEffect import
admin=admin.replace(
  "import { useState } from 'react'",
  "import { useState, useEffect } from 'react'"
);

fs.writeFileSync(adminPath, admin, 'utf8');
console.log('[2] AdminPage.tsx role-based tabs updated');

// ===== 3. Navbar.tsx — 管理后台入口对 admin + superadmin 显示 =====
const navbarPath='web/src/components/layout/Navbar.tsx';
let navbar=fs.readFileSync(navbarPath,'utf8');
navbar=navbar.replace(
  /user\.role\s*===\s*'admin'/g,
  "user.role === 'admin' || user.role === 'superadmin'"
);
fs.writeFileSync(navbarPath, navbar, 'utf8');
console.log('[3] Navbar.tsx admin link updated');

// ===== 4. LoginPage.tsx — 登录后如果是 admin/superadmin 提示 =====
// 不需要修改登录页，所有用户都跳首页

console.log('\nAll frontend patches done.');
