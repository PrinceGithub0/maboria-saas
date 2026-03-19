-- Finalize platform role rename by removing legacy ADMIN from the global Role enum.
-- Tenant workspace ADMIN remains on BusinessMember.role and is not affected.

ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('USER', 'OPS_ADMIN', 'STAFF', 'DISABLED');

ALTER TABLE "User"
  ALTER COLUMN "role" DROP DEFAULT,
  ALTER COLUMN "role" TYPE "Role"
  USING (
    CASE
      WHEN "role"::text = 'ADMIN' THEN 'OPS_ADMIN'::"Role"
      ELSE "role"::text::"Role"
    END
  ),
  ALTER COLUMN "role" SET DEFAULT 'USER';

DROP TYPE "Role_old";
