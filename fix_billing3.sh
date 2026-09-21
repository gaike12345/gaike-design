#!/bin/bash
cd /var/www/manktv/server

echo "===STEP1: Backup DB==="
cp prisma/data/prod.db prisma/data/prod.db.bak-$(date +%Y%m%d%H%M%S)
echo "Backup done"

echo "===STEP2: Prisma db push==="
npx prisma db push --accept-data-loss 2>&1 | tail -15
echo ""

echo "===STEP3: Verify SiteConfigAuditLog==="
sqlite3 prisma/data/prod.db "PRAGMA table_info(SiteConfigAuditLog);"
echo ""

echo "===STEP4: Check all tables for missing updatedAt==="
for table in $(sqlite3 prisma/data/prod.db "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_%';"); do
  HAS_UPDATED=$(sqlite3 prisma/data/prod.db "PRAGMA table_info($table);" | grep -c updatedAt)
  SCHEMA_HAS_UPDATED=$(grep -A 30 "model $table " prisma/schema.prisma | grep -c '@updatedAt')
  if [ "$SCHEMA_HAS_UPDATED" -gt 0 ] && [ "$HAS_UPDATED" -eq 0 ]; then
    echo "MISSING updatedAt: $table"
  fi
done
echo "Check complete"

echo "===STEP5: Restart==="
pm2 restart manktv-backend 2>&1 | tail -3
sleep 3

echo "===STEP6: Test API==="
export $(grep -v '^#' .env | xargs)
TOKEN=$(node -e 'const {signToken}=require("./dist/mank-common/utils/jwt");const prisma=require("./dist/mank-infra/database/prisma").default;prisma.user.findFirst({where:{role:"superadmin"}}).then(u=>{if(!u){console.error("NO_ADMIN");process.exit(1)}console.log(signToken({userId:u.id,role:u.role}))}).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>prisma.$disconnect())')

echo "===SET_RATIO_1000==="
curl -s -X PATCH http://localhost:3000/api/admin/pollinations/ratio -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ratio\":1000}"
echo ""
echo "===SET_BACK_10==="
curl -s -X PATCH http://localhost:3000/api/admin/pollinations/ratio -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ratio\":10}"
echo ""
echo "===DONE==="