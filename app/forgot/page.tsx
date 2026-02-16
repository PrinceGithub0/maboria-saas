import { redirect } from "next/navigation";

export default function LegacyForgotPage() {
  redirect("/forgot-password");
}
