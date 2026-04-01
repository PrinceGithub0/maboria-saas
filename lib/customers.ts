import "server-only";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const MAX_CUSTOMER_PAGE_SIZE = 100;

export function normalizeCustomerEmail(email: string) {
  return String(email || "").trim().toLowerCase();
}

export function buildPlaceholderCustomerEmail(seed: string) {
  return `unknown+${seed}@placeholder.local`.toLowerCase();
}

export async function getVisibleCustomerWhere(userId: string): Promise<Prisma.CustomerWhereInput> {
  const owner = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  const ownerEmail = normalizeCustomerEmail(String(owner?.email || ""));
  if (!ownerEmail) {
    return {
      kind: "CUSTOMER",
    };
  }

  return {
    kind: "CUSTOMER",
    NOT: {
      AND: [
        { email: ownerEmail },
        { invoices: { some: { subscriptionId: { not: null } } } },
        { invoices: { none: { subscriptionId: null } } },
      ],
    },
  };
}

type UpsertCustomerInput = {
  userId: string;
  name: string;
  email: string;
  phone?: string | null;
  taxId?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  deliveryPreference?: "EMAIL" | "WHATSAPP" | "BOTH";
};

export async function createOrGetCustomer(input: UpsertCustomerInput) {
  const email = normalizeCustomerEmail(input.email);
  const name = String(input.name || "").trim() || "Unknown Customer";

  const createData = {
    userId: input.userId,
    name,
    email,
    phone: input.phone ?? null,
    taxId: input.taxId ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    state: input.state ?? null,
    postalCode: input.postalCode ?? null,
    country: input.country ?? null,
    deliveryPreference: input.deliveryPreference ?? "EMAIL",
    kind: "CUSTOMER" as const,
  };

  return prisma.customer.upsert({
    where: {
      userId_email: {
        userId: input.userId,
        email,
      },
    },
    update: {
      name,
      deletedAt: null,
      status: "ACTIVE",
      kind: "CUSTOMER",
      phone: input.phone ?? null,
      taxId: input.taxId ?? null,
      addressLine1: input.addressLine1 ?? null,
      addressLine2: input.addressLine2 ?? null,
      city: input.city ?? null,
      state: input.state ?? null,
      postalCode: input.postalCode ?? null,
      country: input.country ?? null,
      deliveryPreference: input.deliveryPreference ?? "EMAIL",
    },
    create: createData,
  });
}

export async function assertOwnedActiveCustomer(input: { userId: string; customerId: string }) {
  const visibilityWhere = await getVisibleCustomerWhere(input.userId);
  const customer = await prisma.customer.findFirst({
    where: {
      ...visibilityWhere,
      id: input.customerId,
      userId: input.userId,
      deletedAt: null,
      status: "ACTIVE",
    },
  });
  return customer;
}

export async function listCustomers(input: {
  userId: string;
  query?: string | null;
  take?: number;
  skip?: number;
}) {
  const query = String(input.query || "").trim();
  const take = Math.min(MAX_CUSTOMER_PAGE_SIZE, Math.max(1, Number(input.take || 20)));
  const skip = Math.max(0, Number(input.skip || 0));

  const visibilityWhere = await getVisibleCustomerWhere(input.userId);
  const where = {
    ...visibilityWhere,
    userId: input.userId,
    deletedAt: null as Date | null,
    status: "ACTIVE" as const,
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" as const } },
            { email: { contains: query, mode: "insensitive" as const } },
            { phone: { contains: query, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.customer.count({ where }),
  ]);

  return {
    items,
    total,
    take,
    skip,
    hasMore: skip + items.length < total,
  };
}
