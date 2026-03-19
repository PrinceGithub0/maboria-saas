import { Prisma, SupportThreadStatus } from "@prisma/client";

function normalizeSubscriberSupportStatus(input?: string | null): SupportThreadStatus {
  const value = String(input || "").trim().toUpperCase();
  if (value === "PENDING" || value === "IN_PROGRESS") return "PENDING";
  if (value === "CLOSED" || value === "RESOLVED") return "CLOSED";
  return "OPEN";
}

export function getSubscriberSupportOpenMode(previousStatus: SupportThreadStatus) {
  if (previousStatus === "CLOSED") return "RESTART";
  if (previousStatus === "PENDING") return "RESUME";
  return "OPEN";
}

export function buildSubscriberSupportTicketWhereInput(input: {
  subscriberId: string;
  cursor?: { lastActivityAt: Date; id: string } | null;
  newestFirst: boolean;
  status?: string | null;
  search?: string | null;
}): Prisma.SupportThreadTicketWhereInput {
  const andConditions: Prisma.SupportThreadTicketWhereInput[] = [];

  if (input.cursor) {
    andConditions.push(
      input.newestFirst
        ? {
            OR: [
              { lastActivityAt: { lt: input.cursor.lastActivityAt } },
              {
                lastActivityAt: input.cursor.lastActivityAt,
                id: { lt: input.cursor.id },
              },
            ],
          }
        : {
            OR: [
              { lastActivityAt: { gt: input.cursor.lastActivityAt } },
              {
                lastActivityAt: input.cursor.lastActivityAt,
                id: { gt: input.cursor.id },
              },
            ],
          }
    );
  }

  if (input.status && input.status.toUpperCase() !== "ALL") {
    andConditions.push({ status: normalizeSubscriberSupportStatus(input.status) });
  }

  const search = String(input.search || "").trim();
  if (search) {
    andConditions.push({
      OR: [
        { subject: { contains: search, mode: "insensitive" } },
        {
          messages: {
            some: {
              content: { contains: search, mode: "insensitive" },
            },
          },
        },
      ],
    });
  }

  return {
    subscriberId: input.subscriberId,
    ...(andConditions.length ? { AND: andConditions } : {}),
  };
}
