const fs = require("fs");
const p = "app/api/subscriber-settings/late-fee/route.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes('import { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";')) {
  s = s.replace(
    'import { getOrCreateSubscriberSetting } from "@/lib/subscriber-settings";',
    'import { getOrCreateSubscriberSetting } from "@/lib/subscriber-settings";\nimport { requireOrgPermission, writeOrgAuditLog } from "@/lib/org-auth";'
  );
}

s = s.replace(
`  const settings = await getOrCreateSubscriberSetting(session.user.id);
  return NextResponse.json(settings);`,
`  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const settings = await getOrCreateSubscriberSetting(access.context.ownerUserId);
  return NextResponse.json(settings);`
);

s = s.replace(
`  let hasExistingRow: boolean | null = null;
  try {`,
`  const permission = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!permission.ok) {
    return NextResponse.json({ error: permission.message, code: permission.code }, { status: permission.status });
  }

  let hasExistingRow: boolean | null = null;
  try {`
);

s = s.replaceAll('where: { userId: session.user.id }', 'where: { userId: permission.context.ownerUserId }');
s = s.replaceAll('userId: session.user.id', 'userId: permission.context.ownerUserId');

s = s.replace(
`    await prisma.activityLog.create({
      data: {
        userId: permission.context.ownerUserId,
        action: "LATE_FEE_SETTINGS_UPDATED",
        metadata: {
          lateFeeEnabled: updated.lateFeeEnabled,
          lateFeeType: updated.lateFeeType,
          lateFeeMode: updated.lateFeeMode,
        },
      },
    });

    return NextResponse.json(updated);`,
`    await prisma.activityLog.create({
      data: {
        userId: permission.context.ownerUserId,
        action: "LATE_FEE_SETTINGS_UPDATED",
        metadata: {
          lateFeeEnabled: updated.lateFeeEnabled,
          lateFeeType: updated.lateFeeType,
          lateFeeMode: updated.lateFeeMode,
        },
      },
    });

    await writeOrgAuditLog({
      orgId: permission.context.orgId,
      actorUserId: session.user.id,
      actionType: "BUSINESS_SETTINGS_UPDATED",
      metadata: {
        section: "late_fee",
        lateFeeEnabled: updated.lateFeeEnabled,
        lateFeeType: updated.lateFeeType,
        lateFeeMode: updated.lateFeeMode,
      },
    });

    return NextResponse.json(updated);`
);

fs.writeFileSync(p, s);
console.log("late fee route updated");
