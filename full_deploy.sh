#!/bin/bash
set -e
cd /var/www/manktv

echo "===STEP1: Update Code==="
git fetch /tmp/update2.bundle master:refs/heads/bundle-master2
git merge bundle-master2 --ff-only 2>&1 | tail -5
git log --oneline -3

echo "===STEP2: Update API Key==="
cd server
OLD_KEY=$(grep POLLINATIONS_API_KEY .env | cut -d= -f2)
sed -i "s|POLLINATIONS_API_KEY=.*|POLLINATIONS_API_KEY=sk_Cx9ZcXvxWcQfPJWoSrCWn578XgpGcLYz|" .env
NEW_KEY=$(grep POLLINATIONS_API_KEY .env | cut -d= -f2)
echo "Old: $OLD_KEY"
echo "New: $NEW_KEY"

echo "===STEP3: Backend Build==="
npm run build 2>&1 | tail -5

echo "===STEP4: Prisma Generate==="
npx prisma generate 2>&1 | tail -3

echo "===STEP5: Frontend Build==="
cd ../web
npm run build 2>&1 | tail -5

echo "===STEP6: Deploy Frontend==="
# Parity 检查：确保 dist 是最新构建（防止 dist 滞后导致功能缺失）
DIST_JS=$(grep -oE 'assets/index-[A-Za-z0-9_]+\.js' dist/index.html | head -1)
if [ -z "$DIST_JS" ] || [ ! -f "dist/$DIST_JS" ]; then
  echo "ERROR: dist/index.html 或构建产物缺失，重新构建..."
  npm run build 2>&1 | tail -5
fi
DIST_JS=$(grep -oE 'assets/index-[A-Za-z0-9_]+\.js' dist/index.html | head -1)
echo "Deploying JS: $DIST_JS"

rm -rf /var/www/gaike.xyz/*
cp -r dist/* /var/www/gaike.xyz/
# 修复文件权限（SCP 部署会导致目录权限 700，nginx 无法读取）
find /var/www/gaike.xyz -type d -exec chmod 755 {} \;
find /var/www/gaike.xyz -type f -exec chmod 644 {} \;
chown -R nginx:nginx /var/www/gaike.xyz/ 2>/dev/null || chown -R www-data:www-data /var/www/gaike.xyz/ 2>/dev/null
echo "Frontend permissions fixed"

# Parity 验证：nginx 服务的版本与 dist 一致
NGINX_JS=$(grep -oE 'assets/index-[A-Za-z0-9_]+\.js' /var/www/gaike.xyz/index.html | head -1)
if [ "$DIST_JS" != "$NGINX_JS" ]; then
  echo "ERROR: Parity 故障！dist($DIST_JS) != nginx($NGINX_JS)，部署中止"
  exit 1
fi
echo "Parity 验证通过：dist 与 nginx 部署版本一致"

echo "===STEP7: Restart Backend==="
cd ../server
pm2 restart manktv-backend 2>&1 | tail -3
sleep 5
pm2 list

echo "===STEP8: Verify==="
curl -s http://localhost:3000/api/health
echo ""

export $(grep -v '^#' .env | xargs)
TOKEN=$(node -e 'const {signToken}=require("./dist/mank-common/utils/jwt");const prisma=require("./dist/mank-infra/database/prisma").default;prisma.user.findFirst({where:{role:"superadmin"}}).then(u=>{if(!u){console.error("NO_ADMIN");process.exit(1)}console.log(signToken({userId:u.id,role:u.role}))}).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>prisma.$disconnect())')

echo "===BALANCE==="
curl -s http://localhost:3000/api/admin/pollinations/balance -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json;d=json.load(sys.stdin);print(f'balance={d.get(\"balance\")} error={d.get(\"error\")} key={d.get(\"apiKeyConfigured\")}')" 2>/dev/null || curl -s http://localhost:3000/api/admin/pollinations/balance -H "Authorization: Bearer $TOKEN" | head -3
echo ""
echo "===ALL_DONE==="