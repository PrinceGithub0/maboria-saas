import "../globals.css";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground antialiased">{children}</div>;
}
