import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { createOrGetCustomer, listCustomers, normalizeCustomerEmail } from "@/lib/customers";
import { requireBillingAccess } from "@/lib/permissions";
import { customerCreateSchema, customerQuerySchema } from "@/lib/validators";

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;

  const { searchParams } = new URL(request.url);
  const parsed = customerQuerySchema.safeParse({
    q: searchParams.get("q") || undefined,
    take: searchParams.get("take") || undefined,
    skip: searchParams.get("skip") || undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const result = await listCustomers({
    userId: targetUserId,
    query: parsed.data.q,
    take: parsed.data.take ? Number(parsed.data.take) : 20,
    skip: parsed.data.skip ? Number(parsed.data.skip) : 0,
  });

  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const billingAccess = await requireBillingAccess(session.user.id);
  if (!billingAccess.ok) {
    return NextResponse.json({ error: billingAccess.message }, { status: 403 });
  }
  const targetUserId = billingAccess.ownerUserId;

  const body = await request.json();
  const parsed = customerCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid customer payload" },
      { status: 400 }
    );
  }

  const customer = await createOrGetCustomer({
    userId: targetUserId,
    name: parsed.data.name,
    email: normalizeCustomerEmail(parsed.data.email),
    phone: parsed.data.phone || null,
    taxId: parsed.data.taxId || null,
    companyName: parsed.data.companyName || null,
    registrationNumber: parsed.data.registrationNumber || null,
    branchCode: parsed.data.branchCode || null,
    addressLine1: parsed.data.addressLine1 || null,
    addressLine2: parsed.data.addressLine2 || null,
    city: parsed.data.city || null,
    state: parsed.data.state || null,
    postalCode: parsed.data.postalCode || null,
    country: parsed.data.country || null,
    deliveryPreference: parsed.data.deliveryPreference,
  });

  return NextResponse.json(customer, { status: 201 });
}
