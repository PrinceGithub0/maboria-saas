CREATE TABLE "InvoiceSupportingFile" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceSupportingFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceSupportingFile_storageKey_key" ON "InvoiceSupportingFile"("storageKey");
CREATE INDEX "InvoiceSupportingFile_invoiceId_createdAt_idx" ON "InvoiceSupportingFile"("invoiceId", "createdAt");

ALTER TABLE "InvoiceSupportingFile"
ADD CONSTRAINT "InvoiceSupportingFile_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
