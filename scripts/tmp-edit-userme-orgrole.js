const fs = require("fs");
const p = "app/api/user/me/route.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes('import { resolveOrgContext } from "@/lib/org-auth";')) {
  s = s.replace(
    'import { profileUpdateSchema } from "@/lib/validators";',
    'import { profileUpdateSchema } from "@/lib/validators";\nimport { resolveOrgContext } from "@/lib/org-auth";'
  );
}

s = s.replace(
`  const plan = await getUserPlan(session.user.id);
  return NextResponse.json({ ...user, publicId, publicUserId: publicId, plan, subscriptions: adminSubscription });`,
`  const plan = await getUserPlan(session.user.id);
  const orgContext = await resolveOrgContext(session.user.id);
  return NextResponse.json({
    ...user,
    publicId,
    publicUserId: publicId,
    plan,
    subscriptions: adminSubscription,
    orgRole: orgContext?.role ?? null,
    orgId: orgContext?.orgId ?? null,
  });`
);

fs.writeFileSync(p, s);
console.log("user me includes org role");
