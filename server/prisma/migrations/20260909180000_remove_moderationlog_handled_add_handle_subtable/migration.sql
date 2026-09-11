-- 去除 ModerationLog.handled 字段，新增 ModerationLogHandle 子表
-- 主表 ModerationLog 保持 append-only（仅 create + read），处置标记迁移到子表
-- 符合规范第 6.1 章：审核日志 append-only 合规留痕

-- 删除 ModerationLog.handled 列（SQLite 12+ 支持 DROP COLUMN）
ALTER TABLE "ModerationLog" DROP COLUMN "handled";

-- 新建 ModerationLogHandle 表（append-only 处置记录）
CREATE TABLE "ModerationLogHandle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "logId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "handlerId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationLogHandle_logId_fkey" FOREIGN KEY ("logId") REFERENCES "ModerationLog" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ModerationLogHandle_logId_idx" ON "ModerationLogHandle"("logId");
CREATE INDEX "ModerationLogHandle_handlerId_idx" ON "ModerationLogHandle"("handlerId");
CREATE INDEX "ModerationLogHandle_createdAt_idx" ON "ModerationLogHandle"("createdAt");
