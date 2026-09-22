#!/bin/bash
set -e
cd /var/www/manktv

echo "===STEP1: Update Code==="
git fetch /tmp/update4.bundle master:refs/heads/bundle-master4
git merge bundle-master4 --ff-only 2>&1 | tail -3
git log --oneline -2

echo "===STEP2: Frontend Build==="
cd web
npm run build 2>&1 | tail -3

echo "===STEP3: Deploy Frontend==="
rm -rf /var/www/gaike.xyz/*
cp -r dist/* /var/www/gaike.xyz/
# 修复文件权限（SCP 部署会导致目录权限 700，nginx 无法读取）
find /var/www/gaike.xyz -type d -exec chmod 755 {} \;
find /var/www/gaike.xyz -type f -exec chmod 644 {} \;
chown -R nginx:nginx /var/www/gaike.xyz/ 2>/dev/null || chown -R www-data:www-data /var/www/gaike.xyz/ 2>/dev/null
echo "Frontend permissions fixed"

echo "===STEP4: Verify==="
ls /var/www/gaike.xyz/index.html && echo "Frontend deployed"
echo "===DONE==="