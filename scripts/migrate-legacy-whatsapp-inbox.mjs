import nextEnv from "@next/env";
import { PrismaClient } from "@prisma/client";

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const prisma = new PrismaClient();

const execute = process.argv.includes("--execute");
const batchSizeArg = process.argv.find((arg) => arg.startsWith("--batch="));
const batchSize = batchSizeArg ? Math.max(1, Number(batchSizeArg.split("=")[1]) || 100) : 100;
const REQUIRED_UNIFIED_TABLES = [
  "inboxes",
  "conversations",
  "messages",
  "notes",
  "tags",
  "conversation_tags",
  "audit_events",
];

function mapConversationStatus(status) {
  const next = String(status || "").toUpperCase();
  if (next === "OPEN") return "OPEN";
  if (next === "PENDING") return "PENDING";
  return "CLOSED";
}

function mapDeliveryStatus(status) {
  const next = String(status || "").toUpperCase();
  if (next === "READ") return "READ";
  if (next === "DELIVERED") return "DELIVERED";
  if (next === "FAILED") return "FAILED";
  return "SENT";
}

function normalizePhone(phone) {
  const value = String(phone || "").trim();
  if (!value) return "";
  if (value.startsWith("+")) return `+${value.slice(1).replace(/\D/g, "")}`;
  return value.replace(/\D/g, "");
}

function buildFallbackEmail(phone, legacyConversationId, index = 0) {
  const phonePart = normalizePhone(phone).replace(/\+/g, "") || "unknown";
  const suffix = index > 0 ? `-${index}` : "";
  return `legacy-${phonePart}-${legacyConversationId.slice(-6)}${suffix}@inbox.maboria.local`;
}

async function ensureWhatsappInbox(tenantId, cache) {
  const cached = cache.get(tenantId);
  if (cached) return cached;

  const inbox = execute
    ? await prisma.unifiedInbox.upsert({
        where: {
          tenantId_type: {
            tenantId,
            type: "WHATSAPP",
          },
        },
        update: {
          status: "ACTIVE",
        },
        create: {
          tenantId,
          type: "WHATSAPP",
          name: "WhatsApp Inbox",
          status: "ACTIVE",
        },
      })
    : await prisma.unifiedInbox.findFirst({
        where: {
          tenantId,
          type: "WHATSAPP",
        },
      });

  const resolved = inbox ?? {
    id: `dryrun-whatsapp-${tenantId}`,
    tenantId,
  };
  cache.set(tenantId, resolved);
  return resolved;
}

async function resolveBusinessOwnerId(tenantId, cache) {
  if (cache.has(tenantId)) return cache.get(tenantId);
  const business = await prisma.business.findUnique({
    where: { id: tenantId },
    select: { ownerId: true },
  });
  const ownerId = business?.ownerId ?? null;
  cache.set(tenantId, ownerId);
  return ownerId;
}

async function resolveContactId({
  legacyConversation,
  ownerId,
  contactCache,
}) {
  const tenantId = legacyConversation.businessId;
  const phoneKey = normalizePhone(legacyConversation.customerPhone);
  const cacheKey = `${tenantId}:${phoneKey}`;
  if (phoneKey && contactCache.has(cacheKey)) return contactCache.get(cacheKey);

  if (legacyConversation.customerId) {
    const existingById = await prisma.customer.findFirst({
      where: {
        id: legacyConversation.customerId,
        user: {
          businesses: {
            some: { businessId: tenantId, status: "active" },
          },
        },
      },
      select: { id: true },
    });
    if (existingById) {
      if (phoneKey) contactCache.set(cacheKey, existingById.id);
      return existingById.id;
    }
  }

  if (!ownerId) return null;

  if (phoneKey) {
    const existingByPhone = await prisma.customer.findFirst({
      where: {
        userId: ownerId,
        phone: legacyConversation.customerPhone,
      },
      select: { id: true },
    });
    if (existingByPhone) {
      contactCache.set(cacheKey, existingByPhone.id);
      return existingByPhone.id;
    }
  }

  for (let i = 0; i < 10; i += 1) {
    try {
      const created = execute
        ? await prisma.customer.create({
            data: {
              userId: ownerId,
              name: legacyConversation.customerName || `WhatsApp ${legacyConversation.customerPhone || "Customer"}`,
              email: buildFallbackEmail(legacyConversation.customerPhone, legacyConversation.id, i),
              phone: legacyConversation.customerPhone || null,
            },
            select: { id: true },
          })
        : { id: `dryrun-contact-${legacyConversation.id}` };
      if (phoneKey) contactCache.set(cacheKey, created.id);
      return created.id;
    } catch (error) {
      if (!execute) throw error;
      if (error?.code !== "P2002") throw error;
    }
  }

  return null;
}

async function migrateConversation({
  legacyConversation,
  inboxId,
  contactId,
  ownerId,
  summary,
}) {
  const unifiedConversationId = `legacy-${legacyConversation.id}`;
  const lastMessageAt =
    legacyConversation.messages.length > 0
      ? legacyConversation.messages[legacyConversation.messages.length - 1].createdAt
      : legacyConversation.lastMessageAt;

  if (execute) {
    await prisma.unifiedConversation.upsert({
      where: { id: unifiedConversationId },
      update: {
        inboxId,
        contactId,
        status: mapConversationStatus(legacyConversation.status),
        assignedUserId: legacyConversation.assignedToId ?? null,
        lastMessageAt: lastMessageAt ?? null,
      },
      create: {
        id: unifiedConversationId,
        tenantId: legacyConversation.businessId,
        inboxId,
        contactId,
        status: mapConversationStatus(legacyConversation.status),
        assignedUserId: legacyConversation.assignedToId ?? null,
        lastMessageAt: lastMessageAt ?? null,
        createdAt: legacyConversation.createdAt,
        updatedAt: legacyConversation.updatedAt,
      },
    });
  }

  summary.conversations += 1;

  for (const label of legacyConversation.tags || []) {
    if (!label || !String(label).trim()) continue;
    const normalizedLabel = String(label).trim();
    if (execute) {
      const tag = await prisma.unifiedTag.upsert({
        where: {
          tenantId_label: {
            tenantId: legacyConversation.businessId,
            label: normalizedLabel,
          },
        },
        update: {},
        create: {
          tenantId: legacyConversation.businessId,
          label: normalizedLabel,
        },
        select: { id: true },
      });

      await prisma.unifiedConversationTag.upsert({
        where: {
          conversationId_tagId: {
            conversationId: unifiedConversationId,
            tagId: tag.id,
          },
        },
        update: {},
        create: {
          tenantId: legacyConversation.businessId,
          conversationId: unifiedConversationId,
          tagId: tag.id,
        },
      });
    }
    summary.tags += 1;
  }

  if (legacyConversation.internalNotes && String(legacyConversation.internalNotes).trim()) {
    if (execute) {
      await prisma.unifiedNote.upsert({
        where: { id: `legacy-internal-${legacyConversation.id}` },
        update: {
          content: legacyConversation.internalNotes,
        },
        create: {
          id: `legacy-internal-${legacyConversation.id}`,
          tenantId: legacyConversation.businessId,
          conversationId: unifiedConversationId,
          authorUserId: legacyConversation.assignedToId ?? ownerId ?? legacyConversation.business.ownerId,
          content: legacyConversation.internalNotes,
          createdAt: legacyConversation.updatedAt,
        },
      });
    }
    summary.notes += 1;
  }

  for (const legacyNote of legacyConversation.notes) {
    if (execute) {
      await prisma.unifiedNote.upsert({
        where: { id: `legacy-note-${legacyNote.id}` },
        update: {
          content: legacyNote.content,
        },
        create: {
          id: `legacy-note-${legacyNote.id}`,
          tenantId: legacyConversation.businessId,
          conversationId: unifiedConversationId,
          authorUserId: legacyNote.authorId,
          content: legacyNote.content,
          createdAt: legacyNote.createdAt,
        },
      });
    }
    summary.notes += 1;
  }

  for (const legacyMessage of legacyConversation.messages) {
    const messageId = `legacy-message-${legacyMessage.id}`;
    const common = {
      tenantId: legacyConversation.businessId,
      conversationId: unifiedConversationId,
      inboxId,
      direction: legacyMessage.direction === "INBOUND" ? "INBOUND" : "OUTBOUND",
      channel: "WHATSAPP",
      senderIdentifier: legacyMessage.direction === "INBOUND" ? legacyConversation.customerPhone : null,
      content: legacyMessage.content,
      attachments: legacyMessage.attachments ?? undefined,
      deliveryStatus: mapDeliveryStatus(legacyMessage.status),
      errorCode: legacyMessage.status === "FAILED" ? "LEGACY_FAILED" : null,
      errorMessage: legacyMessage.status === "FAILED" ? "Migrated from legacy WhatsApp inbox failure status." : null,
      createdAt: legacyMessage.createdAt,
    };

    if (execute) {
      try {
        await prisma.unifiedMessage.upsert({
          where: { id: messageId },
          update: {
            ...common,
            externalId: legacyMessage.metaMessageId ?? null,
          },
          create: {
            id: messageId,
            ...common,
            externalId: legacyMessage.metaMessageId ?? null,
          },
        });
      } catch (error) {
        if (error?.code !== "P2002") throw error;
        await prisma.unifiedMessage.upsert({
          where: { id: messageId },
          update: {
            ...common,
            externalId: null,
          },
          create: {
            id: messageId,
            ...common,
            externalId: null,
          },
        });
      }
    }
    summary.messages += 1;
  }

  if (execute) {
    await prisma.unifiedAuditEvent.upsert({
      where: { id: `legacy-audit-${legacyConversation.id}` },
      update: {
        actionType: "legacy.whatsapp.migrated",
      },
      create: {
        id: `legacy-audit-${legacyConversation.id}`,
        tenantId: legacyConversation.businessId,
        actorUserId: ownerId ?? legacyConversation.business.ownerId,
        actionType: "legacy.whatsapp.migrated",
        conversationId: unifiedConversationId,
        metadata: {
          legacyConversationId: legacyConversation.id,
          migratedMessages: legacyConversation.messages.length,
          migratedNotes: legacyConversation.notes.length,
        },
      },
    });
  }
}

async function main() {
  console.log(execute ? "Running legacy WhatsApp migration (execute mode)." : "Running legacy WhatsApp migration dry-run.");
  console.log(`Batch size: ${batchSize}`);

  const availableRows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${REQUIRED_UNIFIED_TABLES
      .map((name) => `'${name}'`)
      .join(",")})`
  );
  const available = new Set((availableRows || []).map((row) => row.table_name));
  const missing = REQUIRED_UNIFIED_TABLES.filter((name) => !available.has(name));
  if (missing.length) {
    throw new Error(
      `Unified inbox tables are missing (${missing.join(", ")}). Run \`npx prisma migrate deploy\` before migration.`
    );
  }

  const ownerCache = new Map();
  const inboxCache = new Map();
  const contactCache = new Map();
  const summary = {
    processed: 0,
    skipped: 0,
    conversations: 0,
    messages: 0,
    notes: 0,
    tags: 0,
  };

  let cursor = null;

  while (true) {
    const legacyConversations = await prisma.conversation.findMany({
      where: {
        channel: "whatsapp",
      },
      include: {
        business: {
          select: {
            ownerId: true,
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
        },
        notes: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { id: "asc" },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });

    if (!legacyConversations.length) break;

    for (const legacyConversation of legacyConversations) {
      summary.processed += 1;
      cursor = legacyConversation.id;

      try {
        const ownerId = await resolveBusinessOwnerId(legacyConversation.businessId, ownerCache);
        if (!ownerId) {
          summary.skipped += 1;
          console.warn(`Skipped ${legacyConversation.id}: owner not found for business ${legacyConversation.businessId}.`);
          continue;
        }

        const inbox = await ensureWhatsappInbox(legacyConversation.businessId, inboxCache);
        const contactId = await resolveContactId({
          legacyConversation,
          ownerId,
          contactCache,
        });
        if (!contactId) {
          summary.skipped += 1;
          console.warn(`Skipped ${legacyConversation.id}: unable to resolve contact.`);
          continue;
        }

        await migrateConversation({
          legacyConversation,
          inboxId: inbox.id,
          contactId,
          ownerId,
          summary,
        });
      } catch (error) {
        summary.skipped += 1;
        console.error(`Failed migrating legacy conversation ${legacyConversation.id}:`, error);
      }
    }
  }

  console.log("Migration summary:");
  console.table(summary);

  if (!execute) {
    console.log("Dry-run completed. Re-run with --execute to persist changes.");
  }
}

main()
  .catch((error) => {
    console.error("Migration failed.", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
