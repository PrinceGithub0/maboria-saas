import { prisma } from "./prisma";

export async function rememberAssistantMessage(userId: string, role: string, content: string) {
  return prisma.aiMemory.create({
    data: { userId, role, content },
  });
}

export async function fetchRecentMemory(userId: string, limit = 10) {
  return prisma.aiMemory.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
