import { prisma } from "@/lib/prisma";

function getComplianceRecordDelegate() {
  return (prisma as any).invoiceComplianceRecord || null;
}

export async function getInvoiceComplianceRecord(invoiceId: string) {
  const delegate = getComplianceRecordDelegate();
  if (!delegate) return null;
  return delegate.findUnique({
    where: { invoiceId },
    include: {
      issues: {
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
    },
  });
}
