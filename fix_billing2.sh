#!/bin/bash
cd /var/www/manktv/server

echo "===FIX: Add updatedAt without default==="
sqlite3 prisma/data/prod.db "ALTER TABLE SiteConfigAuditLog ADD COLUMN updatedAt TEXT NOT NULL DEFAULT '1970-01-01 00:00:00';"
echo "Result: $?"
echo ""
echo "===VERIFY==="
sqlite3 prisma/data/prod.db "PRAGMA table_info(SiteConfigAuditLog);"
echo ""
echo "===RESTART==="
pm2 restart manktv-backend 2>&1 | tail -3
sleep 3

echo "===TEST_API==="
export $(grep -v '^#' .env | xargs)
TOKEN=$(node -e 'const {signToken}=require("./dist/mank-common/utils/jwt");const prisma=require("./dist/mank-infra/database/prisma").default;prisma.user.findFirst({where:{role:"superadmin"}}).then(u=>{if(!u){console.error("NO_ADMIN");process.exit(1)}console.log(signToken({userId:u.id,role:u.role}))}).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>prisma.$disconnect())')

echo "===SET_RATIO_1000==="
curl -s -X PATCH http://localhost:3000/api/admin/pollinations/ratio -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ratio\":1000}"
echo ""
echo "===VERIFY_RATIO==="
curl -s http://localhost:3000/api/admin/pollinations/ratio -H "Authorization: Bearer $TOKEN"
echo ""
echo "===SET_BACK_10==="
curl -s -X PATCH http://localhost:3000/api/admin/pollinations/ratio -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ratio\":10}"
echo ""
echo "===DONE==="