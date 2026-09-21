-- AddColumn: AIModel.margin
-- 为每个模型新增毛利率字段，支持管理后台动态调整
-- 默认 2.0（毛利 50%），管理后台可按模型单独调整
-- costTokens = 官方成本(pollen) × fxRate × margin
ALTER TABLE "AIModel" ADD COLUMN "margin" REAL NOT NULL DEFAULT 2.0;
