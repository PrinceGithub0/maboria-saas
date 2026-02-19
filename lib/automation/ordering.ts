import { prisma } from "../prisma";

type EventOrderingInput = {
  flowId: string;
  eventType: string;
  source: string;
  orderingKey?: string | null;
  occurredAt: string;
  eventId: string;
};

type EventOrderingDecision = {
  accept: boolean;
  reason?: "stale_event" | "duplicate_event";
  latestOccurredAt?: string | null;
  latestEventId?: string | null;
};

const parseIsoDate = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const readEventPayload = (output: unknown) => {
  if (!output || typeof output !== "object" || Array.isArray(output)) return null;
  const event = (output as Record<string, unknown>)["event"];
  if (!event || typeof event !== "object" || Array.isArray(event)) return null;
  return event as Record<string, unknown>;
};

export async function shouldProcessEventForFlow(input: EventOrderingInput): Promise<EventOrderingDecision> {
  const orderingKey = String(input.orderingKey || "").trim();
  if (!orderingKey) return { accept: true };

  const latestRun = await prisma.automationRun.findFirst({
    where: {
      flowId: input.flowId,
      AND: [
        { output: { path: ["event", "type"], equals: input.eventType } },
        { output: { path: ["event", "source"], equals: input.source } },
        { output: { path: ["event", "metadata", "orderingKey"], equals: orderingKey } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { output: true },
  });

  if (!latestRun?.output) return { accept: true };

  const previousEvent = readEventPayload(latestRun.output);
  if (!previousEvent) return { accept: true };

  const previousOccurredAt = parseIsoDate(previousEvent["occurredAt"]);
  const incomingOccurredAt = parseIsoDate(input.occurredAt);
  if (!incomingOccurredAt) return { accept: true };
  if (!previousOccurredAt) return { accept: true };

  const previousEventId = String(previousEvent["eventId"] || "");
  if (previousOccurredAt.getTime() > incomingOccurredAt.getTime()) {
    return {
      accept: false,
      reason: "stale_event",
      latestOccurredAt: previousOccurredAt.toISOString(),
      latestEventId: previousEventId || null,
    };
  }

  if (
    previousOccurredAt.getTime() === incomingOccurredAt.getTime() &&
    previousEventId &&
    previousEventId === input.eventId
  ) {
    return {
      accept: false,
      reason: "duplicate_event",
      latestOccurredAt: previousOccurredAt.toISOString(),
      latestEventId: previousEventId,
    };
  }

  return { accept: true };
}
