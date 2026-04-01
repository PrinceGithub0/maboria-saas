DO $$
BEGIN
  CREATE TYPE "CustomerKind" AS ENUM ('CUSTOMER', 'CONTACT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "kind" "CustomerKind" NOT NULL DEFAULT 'CUSTOMER';

CREATE INDEX IF NOT EXISTS "Customer_userId_kind_createdAt_idx"
ON "Customer"("userId", "kind", "createdAt");
