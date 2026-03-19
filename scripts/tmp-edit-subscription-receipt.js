const fs = require("fs");
const p = "app/api/subscription/receipt/route.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes('import { requireOrgPermission } from "@/lib/org-auth";')) {
  s = s.replace(
    'import { withErrorHandling } from "@/lib/api-handler";',
    'import { withErrorHandling } from "@/lib/api-handler";\nimport { requireOrgPermission } from "@/lib/org-auth";'
  );
}

s = s.replace(
`  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id, receiptUrl: { not: null } },
    orderBy: { receiptIssuedAt: "desc" },
    select: { receiptUrl: true, receiptNumber: true },
  });`,
`  const access = await requireOrgPermission(session.user.id, {
    permission: "subscription:manage",
    requireActiveSubscription: false,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: access.context.ownerUserId, receiptUrl: { not: null } },
    orderBy: { receiptIssuedAt: "desc" },
    select: { receiptUrl: true, receiptNumber: true },
  });`
);

fs.writeFileSync(p, s);
console.log("subscription receipt access updated");
