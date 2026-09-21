#!/bin/bash
cd /var/www/manktv/server
export $(grep -v '^#' .env | xargs)

echo "===DB_TABLES==="
sqlite3 prisma/data/prod.db ".tables" | tr ' ' '\n' | sort

echo "===BILLING_CONFIG==="
sqlite3 prisma/data/prod.db "SELECT * FROM BillingConfig LIMIT 5;" 2>/dev/null || echo "NO BillingConfig TABLE"

echo "===SYSTEM_CONFIG==="
sqlite3 prisma/data/prod.db "SELECT * FROM SystemConfig LIMIT 10;" 2>/dev/null || echo "NO SystemConfig TABLE"

echo "===KEY_VALUE==="
sqlite3 prisma/data/prod.db "SELECT * FROM KeyValue LIMIT 10;" 2>/dev/null || echo "NO KeyValue TABLE"

echo "===SETTINGS==="
sqlite3 prisma/data/prod.db "SELECT * FROM Settings LIMIT 10;" 2>/dev/null || echo "NO Settings TABLE"

echo "===ANY_CONFIG_TABLE==="
sqlite3 prisma/data/prod.db "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE '%config%' OR name LIKE '%billing%' OR name LIKE '%rate%' OR name LIKE '%setting%';"

echo "===ENV_BILLING==="
grep -i 'bill\|rate\|pollen\|token\|margin' .env | head -10

echo "===TOKEN_ADMIN_ERROR==="
pm2 logs manktv-backend --lines 30 --nostream 2>&1 | grep -i 'rate\|汇率\|bill\|换算' | tail -10