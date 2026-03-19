import { Sidebar } from "./Sidebar";

export function App() {
  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#ffffff" }}>
      <Sidebar activeItem="automation-operations" />
      <main style={{ flex: 1, padding: "40px", color: "#111827" }}>
        <h1 style={{ margin: 0, fontSize: "28px", fontWeight: 650 }}>Maboria Control</h1>
        <p style={{ marginTop: "8px", color: "#6B7280" }}>
          Sidebar icon system mock with neutral defaults and single-accent active state.
        </p>
      </main>
    </div>
  );
}
