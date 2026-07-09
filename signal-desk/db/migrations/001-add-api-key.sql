-- 为存量数据库添加 api_key 字段（新建数据库请直接运行 schema.sql，无需执行此文件）
-- 运行方式：psql "$DATABASE_URL" -f db/migrations/001-add-api-key.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS api_key TEXT UNIQUE;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key) WHERE api_key IS NOT NULL;
