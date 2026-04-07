CREATE TABLE "einvoicing_connections" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "country" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "sandbox" BOOLEAN NOT NULL DEFAULT true,
  "credentials_encrypted" TEXT,
  "metadata" JSONB,
  "last_validated_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "einvoicing_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "einvoicing_connections_userId_provider_key"
ON "einvoicing_connections"("userId", "provider");

CREATE INDEX "einvoicing_connections_userId_country_status_idx"
ON "einvoicing_connections"("userId", "country", "status");

ALTER TABLE "einvoicing_connections"
ADD CONSTRAINT "einvoicing_connections_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
