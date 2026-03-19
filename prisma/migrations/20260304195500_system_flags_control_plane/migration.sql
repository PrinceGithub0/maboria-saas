-- CreateTable
CREATE TABLE "SystemFlagAuditLog" (
    "id" TEXT NOT NULL,
    "flagKey" TEXT NOT NULL,
    "oldValue" BOOLEAN NOT NULL,
    "newValue" BOOLEAN NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorIp" TEXT,
    "actorUserAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemFlagAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SystemFlagAuditLog_flagKey_createdAt_idx" ON "SystemFlagAuditLog"("flagKey", "createdAt");

-- CreateIndex
CREATE INDEX "SystemFlagAuditLog_actorUserId_createdAt_idx" ON "SystemFlagAuditLog"("actorUserId", "createdAt");
