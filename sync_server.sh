#!/bin/bash
cd /var/www/manktv/server
export $(grep -v '^#' .env | xargs)

TOKEN=$(node -e '
const { signToken } = require("./dist/mank-common/utils/jwt");
const prisma = require("./dist/mank-infra/database/prisma").default;
prisma.user.findFirst({ where: { role: "superadmin" } })
  .then(u => {
    if (!u) { console.error("NO_ADMIN"); process.exit(1); }
    const token = signToken({ userId: u.id, role: u.role });
    console.log(token);
  })
  .catch(e => { console.error("ERROR:", e.message); process.exit(1); })
  .finally(() => prisma.$disconnect());
')
echo "TOKEN_LENGTH: ${#TOKEN}"
echo "TOKEN_PREFIX: ${TOKEN:0:30}..."

echo "===SYNC_VIDEO==="
curl -s -X POST http://localhost:3000/api/admin/video/sync-pollinations -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN"
echo ""
echo "===SYNC_IMAGE==="
curl -s -X POST http://localhost:3000/api/admin/image/sync-pollinations -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN"
echo ""
echo "===VERIFY==="
echo -n "Video config null: "
sqlite3 prisma/data/prod.db "SELECT count(*) FROM AIModel WHERE type='video' AND (config IS NULL OR config='');"
echo -n "Image config null: "
sqlite3 prisma/data/prod.db "SELECT count(*) FROM AIModel WHERE type='image' AND (config IS NULL OR config='');"
echo "===BALANCE==="
curl -s http://localhost:3000/api/admin/pollinations/balance -H "Authorization: Bearer $TOKEN"
echo ""