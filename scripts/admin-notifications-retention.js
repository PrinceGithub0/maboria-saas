const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
  const deleted = await prisma.adminNotification.deleteMany({
    where: {
      status: "RESOLVED",
      resolvedAt: { lt: cutoff },
    },
  });

  console.log(
    JSON.stringify(
      {
        deletedResolvedNotifications: deleted.count,
        cutoff: cutoff.toISOString(),
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("Admin notification retention job failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
