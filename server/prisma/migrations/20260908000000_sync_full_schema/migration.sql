-- AlterTable
ALTER TABLE "ModuleFeature" ADD COLUMN "value" TEXT;

-- CreateTable
CREATE TABLE "ModerationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "reason" TEXT,
    "categories" TEXT,
    "provider" TEXT NOT NULL,
    "placeholder" BOOLEAN NOT NULL DEFAULT false,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ModerationLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TokenTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "relatedType" TEXT,
    "relatedId" TEXT,
    "modelId" TEXT,
    "provider" TEXT,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TokenTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "UserQuota" ("userId") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "controlType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "icon" TEXT,
    "config" TEXT,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SiteConfigAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "group" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "oldValue" TEXT,
    "newValue" TEXT NOT NULL,
    "operator" TEXT,
    "action" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_AIModel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "tag" TEXT,
    "desc" TEXT,
    "costTokens" INTEGER NOT NULL DEFAULT 1000,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sort" INTEGER NOT NULL DEFAULT 0,
    "config" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AIModel_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "AIProvider" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_AIModel" ("config", "createdAt", "desc", "displayName", "id", "name", "providerId", "sort", "status", "tag", "type", "updatedAt") SELECT "config", "createdAt", "desc", "displayName", "id", "name", "providerId", "sort", "status", "tag", "type", "updatedAt" FROM "AIModel";
DROP TABLE "AIModel";
ALTER TABLE "new_AIModel" RENAME TO "AIModel";
CREATE UNIQUE INDEX "AIModel_name_key" ON "AIModel"("name");
CREATE INDEX "AIModel_providerId_idx" ON "AIModel"("providerId");
CREATE INDEX "AIModel_type_idx" ON "AIModel"("type");
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "uid" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "avatar" TEXT,
    "banner" TEXT,
    "bio" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "riskLevel" INTEGER NOT NULL DEFAULT 0,
    "violationCount" INTEGER NOT NULL DEFAULT 0,
    "riskUpdatedAt" DATETIME,
    "riskNote" TEXT,
    "wechatOpenId" TEXT,
    "phone" TEXT,
    "loginMethod" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("avatar", "bio", "createdAt", "email", "id", "nickname", "password", "role", "updatedAt") SELECT "avatar", "bio", "createdAt", "email", "id", "nickname", "password", "role", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_uid_key" ON "User"("uid");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_wechatOpenId_key" ON "User"("wechatOpenId");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE TABLE "new_Work" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subtype" TEXT,
    "content" TEXT NOT NULL,
    "cover" TEXT,
    "tags" TEXT,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "likesCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Work_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Work" ("content", "cover", "createdAt", "id", "likesCount", "subtype", "tags", "title", "type", "updatedAt", "userId") SELECT "content", "cover", "createdAt", "id", "likesCount", "subtype", "tags", "title", "type", "updatedAt", "userId" FROM "Work";
DROP TABLE "Work";
ALTER TABLE "new_Work" RENAME TO "Work";
CREATE INDEX "Work_userId_idx" ON "Work"("userId");
CREATE INDEX "Work_type_idx" ON "Work"("type");
CREATE INDEX "Work_hidden_createdAt_idx" ON "Work"("hidden", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ModerationLog_userId_idx" ON "ModerationLog"("userId");

-- CreateIndex
CREATE INDEX "ModerationLog_result_idx" ON "ModerationLog"("result");

-- CreateIndex
CREATE INDEX "ModerationLog_riskLevel_idx" ON "ModerationLog"("riskLevel");

-- CreateIndex
CREATE INDEX "ModerationLog_createdAt_idx" ON "ModerationLog"("createdAt");

-- CreateIndex
CREATE INDEX "TokenTransaction_userId_idx" ON "TokenTransaction"("userId");

-- CreateIndex
CREATE INDEX "TokenTransaction_type_idx" ON "TokenTransaction"("type");

-- CreateIndex
CREATE INDEX "TokenTransaction_status_idx" ON "TokenTransaction"("status");

-- CreateIndex
CREATE INDEX "TokenTransaction_relatedType_relatedId_idx" ON "TokenTransaction"("relatedType", "relatedId");

-- CreateIndex
CREATE INDEX "TokenTransaction_createdAt_idx" ON "TokenTransaction"("createdAt");

-- CreateIndex
CREATE INDEX "SiteConfig_group_idx" ON "SiteConfig"("group");

-- CreateIndex
CREATE UNIQUE INDEX "SiteConfig_group_key_key" ON "SiteConfig"("group", "key");

-- CreateIndex
CREATE INDEX "SiteConfigAuditLog_group_idx" ON "SiteConfigAuditLog"("group");

-- CreateIndex
CREATE INDEX "SiteConfigAuditLog_key_idx" ON "SiteConfigAuditLog"("key");

-- CreateIndex
CREATE INDEX "SiteConfigAuditLog_createdAt_idx" ON "SiteConfigAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "GenerationLog_type_createdAt_idx" ON "GenerationLog"("type", "createdAt");

-- CreateIndex
CREATE INDEX "UserTask_userId_status_idx" ON "UserTask"("userId", "status");
