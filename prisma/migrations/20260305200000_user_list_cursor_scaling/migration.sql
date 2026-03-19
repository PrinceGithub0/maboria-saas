-- User list keyset pagination index
CREATE INDEX IF NOT EXISTS "User_createdAt_id_idx" ON "User"("createdAt" DESC, "id" DESC);
