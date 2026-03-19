const fs = require("fs");
const p = "app/api/business-profile/route.ts";
let s = fs.readFileSync(p, "utf8");

if (!s.includes('import { requireOrgPermission } from "@/lib/org-auth";')) {
  s = s.replace(
    'import { normalizeVatSettings } from "@/lib/vat";',
    'import { normalizeVatSettings } from "@/lib/vat";\nimport { requireOrgPermission } from "@/lib/org-auth";'
  );
}

s = s.replace(
`  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const profile = await profileClient.findUnique({
    where: { userId: session.user.id },
  });`,
`  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:read",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const targetUserId = access.context.ownerUserId;

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const profile = await profileClient.findUnique({
    where: { userId: targetUserId },
  });`
);

s = s.replace('  const logoUrl = await getLogoUrl(session.user.id);', '  const logoUrl = await getLogoUrl(targetUserId);');

s = s.replace(
`  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
    where: { userId: session.user.id },
    select: { id: true },
  });`,
`  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const targetUserId = access.context.ownerUserId;

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
    where: { userId: targetUserId },
    select: { id: true },
  });`
);

s = s.replace('      userId: session.user.id,', '      userId: targetUserId,');

s = s.replace(
`  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
    where: { userId: session.user.id },
  });`,
`  const access = await requireOrgPermission(session.user.id, {
    permission: "settings:business:write",
    requireActiveSubscription: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.message, code: access.code }, { status: access.status });
  }

  const targetUserId = access.context.ownerUserId;

  const profileClient = (prisma as any).businessProfile;
  if (!profileClient) {
    return NextResponse.json(
      { error: "BusinessProfile model not available. Run \`npx prisma generate\` and restart." },
      { status: 500 }
    );
  }

  const existing = await profileClient.findUnique({
    where: { userId: targetUserId },
  });`
);

s = s.replace('    where: { userId: session.user.id },\n    data: updateData,', '    where: { userId: targetUserId },\n    data: updateData,');

fs.writeFileSync(p, s);
console.log("business profile permissions updated");
