-- Phase 2 (step 1): add enum value for platform role rename ADMIN -> OPS_ADMIN.
-- NOTE: Postgres requires using a new enum value in a separate migration/transaction.

ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'OPS_ADMIN';
