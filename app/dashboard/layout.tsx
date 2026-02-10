import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/layouts/app-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    redirect("/login");
  }

  const subscription = await prisma.subscription.findFirst({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  if (!subscription || subscription.status !== "ACTIVE") {
    redirect("/billing/locked");
  }

  return (
    <AppShell role={session.user.role} announcement={process.env.NEXT_PUBLIC_ANNOUNCEMENT}>
      {children}
    </AppShell>
  );
}
