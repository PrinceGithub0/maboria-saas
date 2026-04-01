CREATE TABLE "CustomerNote" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "authorUserId" TEXT,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CustomerNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CustomerNote_userId_customerId_createdAt_idx"
ON "CustomerNote"("userId", "customerId", "createdAt");

CREATE INDEX "CustomerNote_customerId_createdAt_idx"
ON "CustomerNote"("customerId", "createdAt");

ALTER TABLE "CustomerNote"
ADD CONSTRAINT "CustomerNote_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNote"
ADD CONSTRAINT "CustomerNote_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CustomerNote"
ADD CONSTRAINT "CustomerNote_authorUserId_fkey"
FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
