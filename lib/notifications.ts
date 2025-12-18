import { prisma } from "./prisma";

export async function createAdminNotification(message: string) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  await prisma.notification.createMany({
    data: admins.map((a) => ({ userId: a.id, type: "admin", message })),
    skipDuplicates: true,
  });
}
