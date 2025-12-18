export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Navigation and layout chrome are owned by app/layout.tsx; keep this segment lean to avoid duplicates.
  return <>{children}</>;
}
