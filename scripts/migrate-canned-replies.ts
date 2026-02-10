// eslint-disable-next-line @typescript-eslint/no-var-requires
const { prisma } = require("../lib/prisma");
// eslint-disable-next-line @typescript-eslint/no-var-requires
async function resolveBusinessIdForUser(userId: string) {
  const member = await prisma.businessMember.findFirst({
    where: { userId },
    select: { businessId: true },
  });
  if (member?.businessId) return member.businessId;

  const owned = await prisma.business.findFirst({
    where: { ownerId: userId },
    select: { id: true },
  });
  return owned?.id ?? null;
}

async function main() {
  const replies = await prisma.cannedReply.findMany({ where: { businessId: null } as any });
  let migrated = 0;
  for (const reply of replies as any[]) {
    if (!reply.userId) continue;
    const businessId = await resolveBusinessIdForUser(reply.userId);
    if (!businessId) continue;
    await prisma.cannedReply.update({
      where: { id: reply.id },
      data: { businessId },
    });
    migrated += 1;
  }
  // eslint-disable-next-line no-console
  console.log(`Migrated ${migrated} canned replies`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
