-- Normalize historical role values before enforcing constraints.
UPDATE "BusinessMember"
SET "role" = LOWER(COALESCE("role", 'member'));

UPDATE "BusinessInvite"
SET "role" = LOWER(COALESCE("role", 'member'));

UPDATE "BusinessMember"
SET "role" = 'member'
WHERE "role" NOT IN ('owner', 'admin', 'billing_admin', 'member');

UPDATE "BusinessInvite"
SET "role" = 'member'
WHERE "role" NOT IN ('owner', 'admin', 'billing_admin', 'member');

ALTER TABLE "BusinessMember"
DROP CONSTRAINT IF EXISTS "business_member_role_allowed";

ALTER TABLE "BusinessInvite"
DROP CONSTRAINT IF EXISTS "business_invite_role_allowed";

ALTER TABLE "BusinessMember"
ADD CONSTRAINT "business_member_role_allowed"
CHECK ("role" IN ('owner', 'admin', 'billing_admin', 'member'));

ALTER TABLE "BusinessInvite"
ADD CONSTRAINT "business_invite_role_allowed"
CHECK ("role" IN ('owner', 'admin', 'billing_admin', 'member'));
