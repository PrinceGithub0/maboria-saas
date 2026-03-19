DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryPreference') THEN
    CREATE TYPE "DeliveryPreference" AS ENUM ('EMAIL', 'WHATSAPP', 'BOTH');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "Customer" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "addressLine1" TEXT,
  "addressLine2" TEXT,
  "city" TEXT,
  "state" TEXT,
  "postalCode" TEXT,
  "country" TEXT,
  "deliveryPreference" "DeliveryPreference" NOT NULL DEFAULT 'EMAIL',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deletedAt" TIMESTAMP(3),
  CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Invoice"
  ADD COLUMN IF NOT EXISTS "invoiceCustomerSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "Customer_userId_idx" ON "Customer"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_userId_email_key" ON "Customer"("userId", "email");
CREATE INDEX IF NOT EXISTS "Invoice_userId_idx" ON "Invoice"("userId");
CREATE INDEX IF NOT EXISTS "Invoice_customerId_idx" ON "Invoice"("customerId");

INSERT INTO "Customer" (
  "id",
  "userId",
  "name",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
  "country",
  "deliveryPreference",
  "createdAt",
  "updatedAt"
)
SELECT
  'cust_' || md5(i."id" || ':' || i."userId" || ':' || COALESCE(email_norm.email, '')) AS "id",
  i."userId",
  COALESCE(
    NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'name'), i."metadata"->>'customerName')), ''),
    'Unknown Customer'
  ) AS "name",
  COALESCE(
    NULLIF(email_norm.email, ''),
    LOWER('unknown+' || i."id" || '@placeholder.local')
  ) AS "email",
  NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'phone'), i."metadata"->>'customerPhone')), '') AS "phone",
  NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'streetAddress'), i."metadata"->>'customerStreet')), '') AS "addressLine1",
  NULLIF(BTRIM((i."metadata"->'customer'->>'addressLine2')), '') AS "addressLine2",
  NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'city'), i."metadata"->>'customerCity')), '') AS "city",
  NULLIF(BTRIM((i."metadata"->'customer'->>'state')), '') AS "state",
  NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'postalCode'), i."metadata"->>'customerPostalCode')), '') AS "postalCode",
  NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'country'), i."metadata"->>'customerCountry')), '') AS "country",
  CASE UPPER(COALESCE((i."metadata"->'customer'->>'deliveryPreference'), 'EMAIL'))
    WHEN 'WHATSAPP' THEN 'WHATSAPP'::"DeliveryPreference"
    WHEN 'BOTH' THEN 'BOTH'::"DeliveryPreference"
    ELSE 'EMAIL'::"DeliveryPreference"
  END AS "deliveryPreference",
  COALESCE(i."generatedAt", NOW()),
  NOW()
FROM "Invoice" i
CROSS JOIN LATERAL (
  SELECT LOWER(NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'email'), i."metadata"->>'customerEmail')), '')) AS email
) AS email_norm
ON CONFLICT ("userId", "email") DO UPDATE
SET
  "name" = COALESCE(NULLIF(EXCLUDED."name", ''), "Customer"."name"),
  "phone" = COALESCE(EXCLUDED."phone", "Customer"."phone"),
  "addressLine1" = COALESCE(EXCLUDED."addressLine1", "Customer"."addressLine1"),
  "addressLine2" = COALESCE(EXCLUDED."addressLine2", "Customer"."addressLine2"),
  "city" = COALESCE(EXCLUDED."city", "Customer"."city"),
  "state" = COALESCE(EXCLUDED."state", "Customer"."state"),
  "postalCode" = COALESCE(EXCLUDED."postalCode", "Customer"."postalCode"),
  "country" = COALESCE(EXCLUDED."country", "Customer"."country"),
  "deliveryPreference" = COALESCE(EXCLUDED."deliveryPreference", "Customer"."deliveryPreference"),
  "updatedAt" = NOW();

UPDATE "Invoice" i
SET "customerId" = c."id"
FROM "Customer" c
WHERE i."customerId" IS NULL
  AND c."userId" = i."userId"
  AND c."email" = COALESCE(
    LOWER(NULLIF(BTRIM(COALESCE((i."metadata"->'customer'->>'email'), i."metadata"->>'customerEmail')), '')),
    LOWER('unknown+' || i."id" || '@placeholder.local')
  );

UPDATE "Invoice" i
SET "invoiceCustomerSnapshot" = jsonb_build_object(
  'name', c."name",
  'email', c."email",
  'phone', c."phone",
  'address', jsonb_build_object(
    'addressLine1', c."addressLine1",
    'addressLine2', c."addressLine2",
    'city', c."city",
    'state', c."state",
    'postalCode', c."postalCode",
    'country', c."country"
  ),
  'deliveryPreference', c."deliveryPreference"
)
FROM "Customer" c
WHERE i."customerId" = c."id"
  AND i."invoiceCustomerSnapshot" IS NULL
  AND i."status" IN ('SENT', 'PAID');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Invoice' AND column_name = 'customerId' AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE "Invoice" ALTER COLUMN "customerId" SET NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Invoice_customerId_fkey'
      AND table_name = 'Invoice'
  ) THEN
    ALTER TABLE "Invoice"
      ADD CONSTRAINT "Invoice_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'Customer_userId_fkey'
      AND table_name = 'Customer'
  ) THEN
    ALTER TABLE "Customer"
      ADD CONSTRAINT "Customer_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
