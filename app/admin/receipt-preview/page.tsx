import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function ReceiptPreviewPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Admin</p>
          <h1 className="text-2xl font-semibold text-foreground">Receipt Preview</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/api/admin/invoice-receipt/preview" target="_blank" rel="noreferrer">
            <Button variant="secondary" size="sm">
              Open preview
            </Button>
          </Link>
          <Link href="/api/admin/invoice-receipt/preview?download=1">
            <Button size="sm">Download PDF</Button>
          </Link>
        </div>
      </div>
      <Card className="overflow-hidden">
        <iframe
          title="Invoice receipt preview"
          src="/api/admin/invoice-receipt/preview"
          className="h-[900px] w-full"
        />
      </Card>
    </div>
  );
}
