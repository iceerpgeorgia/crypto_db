CREATE TABLE IF NOT EXISTS "AuditLog" (
  id BIGSERIAL PRIMARY KEY,
  "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
  "table" TEXT NOT NULL,
  "recordId" BIGINT NOT NULL,
  "action" TEXT NOT NULL,
  "userEmail" TEXT,
  "userId" TEXT,
  "changes" JSONB
);

CREATE INDEX IF NOT EXISTS "AuditLog_table_recordId_createdAt_idx"
  ON "AuditLog" ("table","recordId","created_at");

