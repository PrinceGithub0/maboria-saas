CREATE TYPE "WorkspaceSenderType" AS ENUM ('GMAIL', 'OUTLOOK', 'WHATSAPP');

ALTER TABLE "Business"
ADD COLUMN "workspace_default_sender_id" TEXT,
ADD COLUMN "workspace_default_sender_type" "WorkspaceSenderType";
