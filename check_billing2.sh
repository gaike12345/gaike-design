#!/bin/bash
cd /var/www/manktv/server
export $(grep -v '^#' .env | xargs)

echo "===SITE_CONFIG==="
sqlite3 prisma/data/prod.db "SELECT key, value FROM SiteConfig;"
echo ""
echo "===SITE_CONFIG_AUDIT==="
sqlite3 prisma/data/prod.db "SELECT id, key, oldValue, newValue, operatorId, createdAt FROM SiteConfigAuditLog ORDER BY createdAt DESC LIMIT 5;"
echo ""
echo "===PM2_ERROR_LOG==="
pm2 logs manktv-backend --lines 50 --nostream 2>&1 | grep -A 2 -i "汇率\|ratio\|billing\|SiteConfig\|149" | tail -30
echo ""
echo "===TRY_API==="
TOKEN=$(node -e 'const {signToken}=require("./dist/mank-common/utils/jwt");const prisma=require("./dist/mank-infra/database/prisma").default;prisma.user.findFirst({where:{role:"superadmin"}}).then(u=>{if(!u){console.error("NO_ADMIN");process.exit(1)}console.log(signToken({userId:u.id,role:u.role}))}).catch(e=>{console.error(e.message);process.exit(1)}).finally(()=>prisma.$disconnect())')
echo "TOKEN: ${#TOKEN}"
echo "===GET_RATIO==="
curl -s http://localhost:3000/api/admin/pollinations/ratio -H "Authorization: Bearer $TOKEN"
echo ""
echo "===SET_RATIO_1000==="
curl -s -X PATCH http://localhost:3000/api/admin/pollinations/ratio -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d "{\"ratio\":1000}"
echo ""