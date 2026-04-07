ALTER TABLE "Customer"
ADD COLUMN "companyName" TEXT,
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "branchCode" TEXT;

ALTER TABLE "BusinessProfile"
ADD COLUMN "addressLine1" TEXT,
ADD COLUMN "addressLine2" TEXT,
ADD COLUMN "city" TEXT,
ADD COLUMN "state" TEXT,
ADD COLUMN "postalCode" TEXT,
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "branchCode" TEXT;
