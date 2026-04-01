UPDATE "Customer" c
SET "kind" = 'CONTACT'
WHERE c."kind" = 'CUSTOMER'
  AND c."deletedAt" IS NULL
  AND lower(c."email") ~ '(^|[^a-z])(noreply|no-reply|donotreply|do-not-reply|mailer-daemon|postmaster|account-security|notifications)([^a-z]|$)'
  AND NOT EXISTS (
    SELECT 1
    FROM "Invoice" i
    WHERE i."customerId" = c."id"
  )
  AND NOT EXISTS (
    SELECT 1
    FROM "ReminderDispatch" r
    WHERE r."customerId" = c."id"
  );
