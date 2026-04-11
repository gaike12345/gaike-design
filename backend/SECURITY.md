# 安全指南

本文档提供盖可设计圈后端服务的安全配置指南。

## 生产环境安全检查清单

### 1. 环境变量配置

```bash
# 复制配置示例
cp .env.example .env

# 编辑 .env 文件，填入实际值
```

必须配置的环境变量：
- `SUPABASE_URL` - Supabase 项目 URL
- `SUPABASE_ANON_KEY` - Supabase 匿名密钥
- `SUPABASE_SERVICE_ROLE_KEY` - 服务角色密钥（管理员权限）
- `NODE_ENV=production` - 设置为生产模式

### 2. 认证与授权

当前版本实现了基本的输入验证，但建议在生产环境中添加以下认证机制：

- [ ] 实现 JWT 认证
- [ ] 添加管理员角色权限控制
- [ ] 限制 API 访问频率

### 3. HTTPS 配置

生产环境必须使用 HTTPS。可以使用：
- Nginx + Let's Encrypt
- 云服务商提供的 SSL 证书
- Cloudflare 等 CDN

### 4. 定期安全更新

```bash
# 更新依赖包
npm audit fix
npm update
```

### 5. 日志与监控

- 启用应用日志记录
- 配置异常告警
- 定期检查日志中的可疑活动

## 报告安全漏洞

如果您发现任何安全漏洞，请联系项目维护者。
