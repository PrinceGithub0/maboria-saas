import type { ComponentType, SVGProps } from "react";
import "./Sidebar.css";
import {
  AdminMetricsLineChartIcon,
  AdminShieldIcon,
  AiAssistantChatSparkleIcon,
  AutomationErrorsFlowWarningIcon,
  AutomationOperationsPulseIcon,
  AutomationsFlowIcon,
  CustomersPersonIcon,
  DashboardGridIcon,
  InboxTrayIcon,
  InvoicesDocumentDollarIcon,
  NotificationsBellIcon,
  PaymentsCreditCardIcon,
  PrelaunchRocketIcon,
  ReceiptPreviewDocumentIcon,
  ReportsBarChartIcon,
  SettingsGearIcon,
  SubscriptionRefreshIcon,
  SupportLifebuoyIcon,
  SystemFlagsIcon,
  SystemLogsListIcon,
  UsersTwoIcon,
  WebsiteGlobeIcon,
} from "@/icons";

type IconType = ComponentType<SVGProps<SVGSVGElement>>;

type Item = {
  id: string;
  label: string;
  Icon: IconType;
};

type Section = {
  title: string;
  items: Item[];
};

type SidebarProps = {
  activeItem?: string;
};

const sections: Section[] = [
  {
    title: "CORE",
    items: [
      { id: "dashboard", label: "Dashboard", Icon: DashboardGridIcon },
      { id: "website", label: "Website", Icon: WebsiteGlobeIcon },
      { id: "automations", label: "Automations", Icon: AutomationsFlowIcon },
      { id: "automation-operations", label: "Automation Operations", Icon: AutomationOperationsPulseIcon },
      { id: "ai-assistant", label: "AI Assistant", Icon: AiAssistantChatSparkleIcon },
      { id: "inbox", label: "Inbox", Icon: InboxTrayIcon },
    ],
  },
  {
    title: "BILLING",
    items: [
      { id: "invoices", label: "Invoices", Icon: InvoicesDocumentDollarIcon },
      { id: "customers", label: "Customers", Icon: CustomersPersonIcon },
      { id: "subscription", label: "Subscription", Icon: SubscriptionRefreshIcon },
      { id: "payments", label: "Payments", Icon: PaymentsCreditCardIcon },
    ],
  },
  {
    title: "SUPPORT & SETTINGS",
    items: [
      { id: "support", label: "Support", Icon: SupportLifebuoyIcon },
      { id: "settings", label: "Settings", Icon: SettingsGearIcon },
    ],
  },
  {
    title: "ADMIN",
    items: [
      { id: "admin", label: "Admin", Icon: AdminShieldIcon },
      { id: "admin-metrics", label: "Admin Metrics", Icon: AdminMetricsLineChartIcon },
      { id: "system-logs", label: "System Logs", Icon: SystemLogsListIcon },
      { id: "users", label: "Users", Icon: UsersTwoIcon },
      { id: "notifications", label: "Notifications", Icon: NotificationsBellIcon },
      { id: "automation-errors", label: "Automation Errors", Icon: AutomationErrorsFlowWarningIcon },
      { id: "prelaunch", label: "Prelaunch", Icon: PrelaunchRocketIcon },
      { id: "system-flags", label: "System Flags", Icon: SystemFlagsIcon },
      { id: "receipt-preview", label: "Receipt Preview", Icon: ReceiptPreviewDocumentIcon },
      { id: "reports", label: "Reports", Icon: ReportsBarChartIcon },
    ],
  },
];

export function Sidebar({ activeItem = "automation-operations" }: SidebarProps) {
  return (
    <aside className="maboria-sidebar" aria-label="Maboria Control Navigation">
      <div className="maboria-brand">
        <p className="maboria-brand-kicker">Maboria</p>
        <h2>Maboria Control</h2>
      </div>

      <nav className="maboria-nav">
        {sections.map((section) => (
          <section key={section.title} className="maboria-section">
            <h3>{section.title}</h3>
            <ul>
              {section.items.map(({ id, label, Icon }) => {
                const active = id === activeItem;
                return (
                  <li key={id}>
                    <button type="button" className={`maboria-row${active ? " is-active" : ""}`} aria-current={active ? "page" : undefined}>
                      <span className="maboria-icon-wrap">
                        <Icon className="maboria-icon" />
                      </span>
                      <span className="maboria-label">{label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </aside>
  );
}

