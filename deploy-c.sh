#!/bin/bash
set -e
cd /var/www/manktv

echo "===STEP1: Fetch + Merge==="
git fetch /tmp/update-c.bundle master:refs/heads/bundle-master-c
git merge bundle-master-c --ff-only 2>&1 | tail -5
git log --oneline -3

echo "===STEP2: Frontend Build==="
cd web
npm run build 2>&1 | tail -5

echo "===STEP3: Parity Check==="
DIST_JS=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' dist/index.html | head -1)
echo "Deploying JS: $DIST_JS"
if [ -z "$DIST_JS" ] || [ ! -f "dist/$DIST_JS" ]; then
  echo "ERROR: dist/index.html or build artifact missing"
  exit 1
fi
# 验证 dist JS 含方案 C 关键字
if ! grep -l 'addExternalImageFile' "dist/$DIST_JS" > /dev/null; then
  echo "ERROR: addExternalImageFile keyword NOT in dist JS"
  exit 1
fi
if ! grep -l 'pendingUpload' "dist/$DIST_JS" > /dev/null; then
  echo "ERROR: pendingUpload keyword NOT in dist JS"
  exit 1
fi
echo "Parity keywords OK: addExternalImageFile + pendingUpload both present"

echo "===STEP4: Deploy==="
rm -rf /var/www/gaike.xyz/*
cp -r dist/* /var/www/gaike.xyz/
find /var/www/gaike.xyz -type d -exec chmod 755 {} \;
find /var/www/gaike.xyz -type f -exec chmod 644 {} \;
chown -R nginx:nginx /var/www/gaike.xyz/ 2>/dev/null || chown -R www-data:www-data /var/www/gaike.xyz/ 2>/dev/null
echo "Permissions fixed"

echo "===STEP5: Nginx Verify==="
NGINX_JS=$(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' /var/www/gaike.xyz/index.html | head -1)
if [ "$DIST_JS" != "$NGINX_JS" ]; then
  echo "ERROR: Parity FAIL dist($DIST_JS) != nginx($NGINX_JS)"
  exit 1
fi
echo "Parity OK: $NGINX_JS"

# 验证 nginx 服务的 JS 含方案 C 关键字
if ! grep -l 'addExternalImageFile' "/var/www/gaike.xyz/$NGINX_JS" > /dev/null; then
  echo "ERROR: nginx JS missing addExternalImageFile"
  exit 1
fi
echo "Nginx JS contains addExternalImageFile keyword"

echo "===STEP6: Reload Nginx==="
nginx -t && nginx -s reload
echo "Nginx reloaded"

echo "===STEP7: Cleanup==="
rm /tmp/update-c.bundle
rm -f /tmp/refs/heads/bundle-master-c 2>/dev/null || true
git update-ref -d refs/heads/bundle-master-c 2>/dev/null || true

echo "===DONE==="
