import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requireBillingAccess } from "@/lib/permissions";
import { getVisibleCustomerWhere } from "@/lib/customers";
import { customerCreateSchema } from "@/lib/validators";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      taxId: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      state: true,
      postalCode: true,
      country: true,
      deliveryPreference: true,
      status: true,
      createdAt: true,
    },
  });

  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(customer);
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId },
    select: { id: true, status: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (customer.status !== "DISABLED") {
    const invoiceCount = await prisma.invoice.count({
      where: { userId: targetUserId, customerId: customer.id, subscriptionId: null },
    });
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { status: "DISABLED", deletedAt: null },
      }),
      prisma.activityLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_DISABLED",
          resourceType: "customer",
          resourceId: customer.id,
          metadata: { actorUserId: session.user.id },
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_DISABLED",
          metadata: { customerId: customer.id, actorUserId: session.user.id },
        },
      }),
    ]);
    return NextResponse.json({
      success: true,
      warning:
        invoiceCount > 0 ? "Customer has existing invoices. Historical data is preserved." : null,
    });
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const body = await request.json().catch(() => ({}));
  if (body?.action !== "restore" && body?.action !== "disable") {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId },
    select: { id: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body?.action === "restore") {
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { deletedAt: null, status: "ACTIVE" },
      }),
      prisma.activityLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_ENABLED",
          resourceType: "customer",
          resourceId: customer.id,
          metadata: { actorUserId: session.user.id },
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_ENABLED",
          metadata: { customerId: customer.id, actorUserId: session.user.id },
        },
      }),
    ]);
  } else {
    const invoiceCount = await prisma.invoice.count({
      where: { userId: targetUserId, customerId: customer.id, subscriptionId: null },
    });
    await prisma.$transaction([
      prisma.customer.update({
        where: { id: customer.id },
        data: { deletedAt: null, status: "DISABLED" },
      }),
      prisma.activityLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_DISABLED",
          resourceType: "customer",
          resourceId: customer.id,
          metadata: { actorUserId: session.user.id },
        },
      }),
      prisma.auditLog.create({
        data: {
          userId: targetUserId,
          action: "CUSTOMER_DISABLED",
          metadata: { customerId: customer.id, actorUserId: session.user.id },
        },
      }),
    ]);
    return NextResponse.json({
      success: true,
      warning:
        invoiceCount > 0 ? "Customer has existing invoices. Historical data is preserved." : null,
    });
  }

  return NextResponse.json({ success: true });
}

export async function PUT(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;
  const visibilityWhere = await getVisibleCustomerWhere(targetUserId);

  const body = await request.json();
  const parsed = customerCreateSchema.partial().safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const customer = await prisma.customer.findFirst({
    where: { ...visibilityWhere, id, userId: targetUserId },
    select: { id: true, phone: true, deliveryPreference: true },
  });
  if (!customer) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextPhone =
    parsed.data.phone !== undefined ? (parsed.data.phone || null) : customer.phone;
  const nextDeliveryPreference =
    parsed.data.deliveryPreference !== undefined
      ? parsed.data.deliveryPreference
      : customer.deliveryPreference;
  if (
    (nextDeliveryPreference === "WHATSAPP" || nextDeliveryPreference === "BOTH") &&
    !String(nextPhone || "").trim()
  ) {
    return NextResponse.json(
      { error: "Phone is required for WhatsApp delivery" },
      { status: 400 }
    );
  }

  try {
    const updated = await prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name.trim() || "Unknown Customer" } : {}),
        ...(parsed.data.email !== undefined ? { email: parsed.data.email.trim().toLowerCase() } : {}),
        ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone || null } : {}),
        ...(parsed.data.taxId !== undefined ? { taxId: parsed.data.taxId || null } : {}),
        ...(parsed.data.addressLine1 !== undefined ? { addressLine1: parsed.data.addressLine1 || null } : {}),
        ...(parsed.data.addressLine2 !== undefined ? { addressLine2: parsed.data.addressLine2 || null } : {}),
        ...(parsed.data.city !== undefined ? { city: parsed.data.city || null } : {}),
        ...(parsed.data.state !== undefined ? { state: parsed.data.state || null } : {}),
        ...(parsed.data.postalCode !== undefined ? { postalCode: parsed.data.postalCode || null } : {}),
        ...(parsed.data.country !== undefined ? { country: parsed.data.country || null } : {}),
        ...(parsed.data.deliveryPreference !== undefined ? { deliveryPreference: parsed.data.deliveryPreference } : {}),
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "A customer with this email already exists." },
        { status: 409 }
      );
    }
    throw error;
  }
}
