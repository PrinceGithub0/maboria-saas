const fs = require("fs");
const p = "lib/usage/report.ts";
let s = fs.readFileSync(p, "utf8");

s = s.replace("    where: { userId },", "    where: { userId, status: \"active\" },");

s = s.replace(
`  const created = await prisma.business.create({
    data: {
      ownerId: userId,
      name: user.name?.trim() || user.email?.split("@")[0] || "My Business",
      plan: "STARTER",
    },
    select: { id: true, ownerId: true },
  });`,
`  const created = await prisma.business.create({
    data: {
      ownerId: userId,
      name: user.name?.trim() || user.email?.split("@")[0] || "My Business",
      plan: "STARTER",
      members: {
        create: {
          userId,
          role: "owner",
          status: "active",
          joinedAt: new Date(),
        },
      },
    },
    select: { id: true, ownerId: true },
  });`
);

s = s.replace(
`async function countActiveSeats(orgId: string) {
  const memberCount = await prisma.businessMember.count({ where: { businessId: orgId } });
  return memberCount + 1;
}`,
`async function countActiveSeats(orgId: string) {
  return prisma.businessMember.count({
    where: {
      businessId: orgId,
      status: "active",
    },
  });
}`
);

fs.writeFileSync(p, s);
console.log("usage report org seat logic updated");
