const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function buildNotificationSampleWhere() {
  return {
    OR: [
      { title: { contains: "sample", mode: "insensitive" } },
      { message: { contains: "qa verification", mode: "insensitive" } },
      { metadata: { path: ["source"], equals: "seed" } },
      { metadata: { path: ["isSample"], equals: true } },
      { sourceEventType: "SYSTEM_OUTAGE" },
    ],
  };
}

async function main() {
  const notificationWhere = buildNotificationSampleWhere();

  const [matchedNotifications, deletedNotifications] = await prisma.$transaction([
    prisma.adminNotification.count({ where: notificationWhere }),
    prisma.adminNotification.deleteMany({ where: notificationWhere }),
  ]);

  const linkedIncidentRows = await prisma.adminNotification.findMany({
    where: {
      sourceEventType: "SYSTEM_OUTAGE",
      sourceEventId: { not: null },
    },
    select: { sourceEventId: true },
  });

  const incidentIdsFromNotifications = linkedIncidentRows
    .map((row) => String(row.sourceEventId || "").trim())
    .filter(Boolean);

  const incidentOr = [
    { title: { contains: "sample", mode: "insensitive" } },
    { summary: { contains: "qa verification", mode: "insensitive" } },
  ];
  if (incidentIdsFromNotifications.length) {
    incidentOr.push({ id: { in: incidentIdsFromNotifications } });
  }

  const incidentWhere = { OR: incidentOr };

  const [matchedIncidents, deletedIncidents] = await prisma.$transaction([
    prisma.adminIncident.count({ where: incidentWhere }),
    prisma.adminIncident.deleteMany({ where: incidentWhere }),
  ]);

  console.log("admin sample cleanup completed");
  console.log(
    JSON.stringify(
      {
        matchedNotifications,
        deletedNotifications: deletedNotifications.count,
        matchedIncidents,
        deletedIncidents: deletedIncidents.count,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("admin sample cleanup failed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

