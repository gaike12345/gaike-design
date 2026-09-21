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

echo "===STEP5: Restart Backend==="
cd ../server
pm2 restart manktv-backend 2>&1 | tail -3
sleep 3

echo "===STEP6: Verify==="
curl -s http://localhost:3000/api/health
echo ""
pm2 list | grep manktv
echo "===DONE==="