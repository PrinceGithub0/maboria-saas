-- AlterEnum
ALTER TYPE "MessageStatus" ADD VALUE 'READ';

-- DropForeignKey
ALTER TABLE "CannedReply" DROP CONSTRAINT "CannedReply_userId_fkey";

-- DropIndex
DROP INDEX "CannedReply_userId_idx";

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "autoCloseAfterHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "autoCloseEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "BusinessInvite" ALTER COLUMN "role" SET DEFAULT 'agent';

-- AlterTable
ALTER TABLE "BusinessMember" ALTER COLUMN "role" SET DEFAULT 'agent';

-- AlterTable
ALTER TABLE "CannedReply" ADD COLUMN     "businessId" TEXT,
ALTER COLUMN "userId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "autoClosedAt" TIMESTAMP(3),
ADD COLUMN     "isTyping" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastCustomerActivityAt" TIMESTAMP(3),
ADD COLUMN     "typingAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "MessageAudit" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "messageId" TEXT,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationNote" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageAudit_conversationId_createdAt_idx" ON "MessageAudit"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationNote_conversationId_createdAt_idx" ON "ConversationNote"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "CannedReply_businessId_idx" ON "CannedReply"("businessId");

-- AddForeignKey
ALTER TABLE "MessageAudit" ADD CONSTRAINT "MessageAudit_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAudit" ADD CONSTRAINT "MessageAudit_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageAudit" ADD CONSTRAINT "MessageAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationNote" ADD CONSTRAINT "ConversationNote_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationNote" ADD CONSTRAINT "ConversationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedReply" ADD CONSTRAINT "CannedReply_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedReply" ADD CONSTRAINT "CannedReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
