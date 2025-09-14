const { PrismaClient } = require("@prisma/client");
(async () => {
  const p = new PrismaClient();
  try {
    await p.$executeRawUnsafe(`
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
`);
    await p.$executeRawUnsafe(`
CREATE INDEX IF NOT EXISTS "AuditLog_table_recordId_createdAt_idx"
ON "AuditLog" ("table","recordId","created_at");
`);
    console.log("AuditLog ensured");
  } catch (e) {
    console.error(e);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
})();

