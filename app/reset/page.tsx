import { redirect } from "next/navigation";

type LegacyResetPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function LegacyResetPage({ searchParams }: LegacyResetPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const token = params?.token;
  if (token) {
    redirect(`/reset-password?token=${encodeURIComponent(token)}`);
  }
  redirect("/forgot-password");
}
