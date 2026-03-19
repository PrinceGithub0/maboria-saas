import { redirect } from "next/navigation";

export default async function BillingInvoicesRedirect({
  searchParams,
}: {
  searchParams?: { [key: string]: string | string[] | undefined } | Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await Promise.resolve(searchParams);
  const query = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (typeof value === "string" && value) {
      query.set(key, value);
    }
  });
  const suffix = query.toString();
  redirect(suffix ? `/dashboard/invoices?${suffix}` : "/dashboard/invoices");
}

