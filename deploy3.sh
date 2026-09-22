#!/bin/bash
set -e
cd /var/www/manktv

echo "===STEP1: Update Code==="
git fetch /tmp/update3.bundle master:refs/heads/bundle-master3
git merge bundle-master3 --ff-only 2>&1 | tail -3
git log --oneline -2

echo "===STEP2: Backend Build==="
cd server
npm run build 2>&1 | tail -3

echo "===STEP3: Frontend Build==="
cd ../web
npm run build 2>&1 | tail -3

echo "===STEP4: Deploy Frontend==="
rm -rf /var/www/gaike.xyz/*
cp -r dist/* /var/www/gaike.xyz/
# 修复文件权限（SCP 部署会导致目录权限 700，nginx 无法读取）
find /var/www/gaike.xyz -type d -exec chmod 755 {} \;
find /var/www/gaike.xyz -type f -exec chmod 644 {} \;
chown -R nginx:nginx /var/www/gaike.xyz/ 2>/dev/null || chown -R www-data:www-data /var/www/gaike.xyz/ 2>/dev/null
echo "Frontend permissions fixed"

echo "===STEP5: Restart Backend==="
cd ../server
pm2 restart manktv-backend 2>&1 | tail -3
sleep 3

echo "===STEP6: Verify==="
curl -s http://localhost:3000/api/health
echo ""
pm2 list | grep manktv
echo "===DONE==="