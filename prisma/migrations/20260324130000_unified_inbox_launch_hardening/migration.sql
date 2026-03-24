CREATE TYPE "UnifiedConversationStatus_new" AS ENUM ('OPEN', 'WAITING_ON_CUSTOMER', 'SNOOZED', 'RESOLVED');

ALTER TABLE "conversations"
  ADD COLUMN "snoozedUntil" TIMESTAMP(3),
  ADD COLUMN "waitingSince" TIMESTAMP(3),
  ADD COLUMN "lastInboundAt" TIMESTAMP(3),
  ADD COLUMN "lastOutboundAt" TIMESTAMP(3),
  ADD COLUMN "lastCustomerReplyAt" TIMESTAMP(3),
  ADD COLUMN "resolvedAt" TIMESTAMP(3);

ALTER TABLE "conversations" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "conversations"
  ALTER COLUMN "status" TYPE "UnifiedConversationStatus_new"
  USING (
    CASE
      WHEN "status"::text = 'PENDING' THEN 'WAITING_ON_CUSTOMER'
      WHEN "status"::text = 'CLOSED' THEN 'RESOLVED'
      ELSE "status"::text
    END
  )::"UnifiedConversationStatus_new";

DROP TYPE "UnifiedConversationStatus";
ALTER TYPE "UnifiedConversationStatus_new" RENAME TO "UnifiedConversationStatus";
ALTER TABLE "conversations" ALTER COLUMN "status" SET DEFAULT 'OPEN';

UPDATE "conversations"
SET "resolvedAt" = COALESCE("resolvedAt", "updatedAt")
WHERE "status" = 'RESOLVED';

CREATE TABLE "conversation_participants" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "lastSeenAt" TIMESTAMP(3),
  "lastSeenMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "conversation_participants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversation_participants_conversationId_userId_key"
  ON "conversation_participants"("conversationId", "userId");
CREATE INDEX "conversation_participants_tenantId_userId_unreadCount_idx"
  ON "conversation_participants"("tenantId", "userId", "unreadCount");
CREATE INDEX "conversation_participants_conversationId_lastSeenAt_idx"
  ON "conversation_participants"("conversationId", "lastSeenAt");

DROP INDEX "conversations_tenantId_status_lastMessageAt_idx";
CREATE INDEX "conversations_tenantId_status_snoozedUntil_lastMessageAt_idx"
  ON "conversations"("tenantId", "status", "snoozedUntil", "lastMessageAt");

ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "conversation_participants"
  ADD CONSTRAINT "conversation_participants_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "conversation_participants" (
  "id",
  "tenantId",
  "conversationId",
  "userId",
  "unreadCount",
  "createdAt",
  "updatedAt"
)
SELECT
  concat('ucp_', md5(c."id" || ':' || bm."userId")),
  c."tenantId",
  c."id",
  bm."userId",
  COALESCE(msg_counts."inboundCount", 0),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "conversations" c
JOIN "BusinessMember" bm
  ON bm."businessId" = c."tenantId"
 AND bm."status" = 'active'
LEFT JOIN (
  SELECT
    m."conversationId",
    COUNT(*)::integer AS "inboundCount"
  FROM "messages" m
  WHERE m."direction" = 'INBOUND'
  GROUP BY m."conversationId"
) msg_counts
  ON msg_counts."conversationId" = c."id"
ON CONFLICT ("conversationId", "userId") DO NOTHING;
