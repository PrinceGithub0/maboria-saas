-- Phase 2 (step 2): migrate existing platform admins to OPS_ADMIN.
-- Tenant workspace ADMIN role remains on BusinessMember.role and is not affected.

UPDATE "User"
SET "role" = 'OPS_ADMIN'
WHERE "role" = 'ADMIN';
