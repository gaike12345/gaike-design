# Man TV · 阿里云服务器部署指南

域名：`gaike.xyz` | 服务器：阿里云轻量应用服务器（2核2G）

---

## 部署步骤总览

```
1. 重置系统为 Ubuntu 22.04
2. 修改 DNS 解析（gaike.xyz → 服务器公网IP）
3. 上传项目代码到服务器
4. 填写环境配置
5. 运行一键部署脚本
6. 验证网站
```

---

## 第 1 步：重置系统

在阿里云控制台操作：

1. 进入「轻量应用服务器」→ 选择你的服务器
2. 点击「重置系统」
3. 选择「重置为其它镜像」
4. 镜像类型选「系统镜像」→「Ubuntu 22.04 LTS」
5. 设置 root 密码（记下来，后面要用）
6. 点击「确认重置」
7. 等待 3-5 分钟，状态变成「运行中」

---

## 第 2 步：修改 DNS 解析

在阿里云 DNS 控制台（就是你截图的那个页面）：

1. 找到 `@` 记录，点击「修改」
2. 记录值改成你的服务器公网 IP：`8.163.72.234`
3. 找到 `www` 记录，如果是 CNAME 就删掉，新增一条 A 记录：
   - 主机记录：`www`
   - 记录类型：`A`
   - 记录值：`8.163.72.234`
4. 保存，等待几分钟生效

验证方法（本地命令行）：
```bash
ping gaike.xyz
# 看到 8.163.72.234 就说明生效了
```

---

## 第 3 步：上传项目代码

### 方式 A：打包上传（最简单）

**在你本地电脑上操作：**

1. 把整个 `AI漫剧圈` 文件夹打包成 zip
2. 上传到服务器

**方式：用 scp 命令上传**
```powershell
# 在本地 PowerShell 中执行（注意路径）
scp -r "C:\Users\Administrator\Desktop\AI漫剧圈" root@8.163.72.234:/var/www/manktv
```

**或者用 FTP 工具**（如 FileZilla、WinSCP）：
- 主机：`8.163.72.234`
- 用户名：`root`
- 密码：你设置的服务器密码
- 端口：`22`
- 上传到：`/var/www/manktv`

### 方式 B：Git 克隆（推荐，方便后续更新）

如果你的代码在 Git 仓库里：

```bash
# 登录服务器后执行
apt-get install -y git
mkdir -p /var/www
cd /var/www
git clone <你的仓库地址> manktv
```

---

## 第 4 步：连接服务器

### Windows 方式

1. 在阿里云控制台点「远程连接」（网页版终端）
2. 或者用 PowerShell：
```powershell
ssh root@8.163.72.234
# 输入密码
```

### 登录后先确认

```bash
# 检查系统
cat /etc/os-release | head -3

# 检查内存
free -h

# 检查磁盘
df -h /
```

---

## 第 5 步：填写环境配置

```bash
cd /var/www/manktv

# 复制配置模板
cp deploy/.env.server deploy/.env

# 编辑配置（至少填写 API Key）
vim deploy/.env
```

**必须填写的配置：**

| 配置项 | 说明 | 哪里获取 |
|--------|------|---------|
| `JWT_SECRET` | 登录密钥 | 自动生成，也可手动改 |
| `POLLINATIONS_API_KEY` | 图像生成 API | https://enter.pollinations.ai/keys |
| `ZHIPU_API_KEY` | 文本生成 API | https://open.bigmodel.cn |
| `MODERATION_API_KEY` | 内容审核 | 阿里云内容安全 |

> 💡 暂时不填也没关系，网站能打开，只是 AI 功能用不了。

---

## 第 6 步：运行一键部署脚本

```bash
cd /var/www/manktv

# 给脚本执行权限
chmod +x deploy/server-deploy.sh deploy/backup.sh

# 运行部署（大约 5-10 分钟）
bash deploy/server-deploy.sh
```

脚本会自动完成：
- ✅ 安装 Node.js 22、PM2、Nginx
- ✅ 配置防火墙（只开放 22/80/443 端口）
- ✅ 编译并启动后端服务
- ✅ 构建并部署前端页面
- ✅ 配置 Nginx 反向代理
- ✅ 申请 SSL 证书（Let's Encrypt 免费）
- ✅ 初始化数据库和种子数据
- ✅ 设置每日自动备份

---

## 第 7 步：验证网站

部署完成后，打开浏览器访问：

- 🌐 https://gaike.xyz
- 🌐 https://www.gaike.xyz

### 测试账号

| 角色 | 邮箱 | 密码 |
|------|------|------|
| 普通用户 | `demo@manktv.com` | `password123` |
| 超级管理员 | `admin@manktv.com` | `password123` |

### 测试功能清单

- [ ] 首页正常显示
- [ ] 注册/登录正常
- [ ] 图像生成正常
- [ ] 文本生成正常
- [ ] 社区作品显示正常
- [ ] 管理后台可访问（/admin）

---

## 日常运维

### 常用命令

```bash
# 查看后端状态
pm2 status

# 查看后端日志
pm2 logs manktv-backend

# 重启后端
pm2 restart manktv-backend

# 查看 Nginx 状态
systemctl status nginx

# 查看 Nginx 错误日志
tail -f /var/log/nginx/error.log

# 查看磁盘使用
df -h

# 查看内存使用
free -h
```

### 更新代码

```bash
cd /var/www/manktv

# 拉取最新代码（Git 方式）
git pull

# 或重新上传后，执行更新脚本
bash deploy/update.sh
```

### 数据备份

```bash
# 手动备份
/usr/local/bin/manktv-backup.sh

# 查看备份
ls -lh /var/backups/manktv/
```

自动备份已设置为每天凌晨 3 点执行，保留 30 天。

---

## 常见问题

### Q1: 部署脚本报错了怎么办？

看报错信息，常见问题：
- 网络问题 → 多试几次
- 端口被占用 → `lsof -i :3000` 查看
- 权限问题 → 确认用 root 或 sudo 运行

### Q2: SSL 证书申请失败？

检查 DNS 解析是否生效：
```bash
nslookup gaike.xyz
# 应该返回 8.163.72.234
```

如果刚改 DNS，等 10 分钟再试：
```bash
certbot --nginx -d gaike.xyz -d www.gaike.xyz
```

### Q3: 网站访问很慢？

- 检查服务器负载：`htop`
- 检查后端日志有没有报错
- 2核2G 初期够用，用户多了再升级配置

### Q4: 忘记管理员密码？

在服务器上执行：
```bash
cd /var/www/manktv/server
node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
prisma.user.update({
  where: { email: 'admin@manktv.com' },
  data: { password: bcrypt.hashSync('新密码', 10) }
}).then(() => console.log('密码已重置')).catch(console.error);
"
```

---

## 安全加固（部署完成后做）

- [ ] 修改默认管理员密码
- [ ] 禁用 root 密码登录，改用 SSH 密钥
- [ ] 创建普通用户，不用 root 日常操作
- [ ] 配置 fail2ban 防暴力破解
- [ ] 开启 HSTS（HTTPS 稳定后）
- [ ] 设置服务器监控告警

---

## 配置文件位置速查

| 文件 | 路径 |
|------|------|
| 后端配置 | `/var/www/manktv/server/.env` |
| 数据库文件 | `/var/www/manktv/server/data/prod.db` |
| 上传文件 | `/var/www/manktv/server/uploads/` |
| 前端静态文件 | `/var/www/gaike.xyz/` |
| Nginx 配置 | `/etc/nginx/sites-available/gaike.xyz` |
| Nginx 日志 | `/var/log/nginx/` |
| 备份目录 | `/var/backups/manktv/` |
