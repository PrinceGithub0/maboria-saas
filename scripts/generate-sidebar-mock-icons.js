const fs = require("fs");
const path = require("path");

const iconsDir = path.join(process.cwd(), "icons");
fs.mkdirSync(iconsDir, { recursive: true });

const icons = [
  {
    file: "dashboard-grid",
    component: "DashboardGridIcon",
    shapes: [
      '<rect x="3" y="3" width="8" height="8" rx="1.5" />',
      '<rect x="13" y="3" width="8" height="8" rx="1.5" />',
      '<rect x="3" y="13" width="8" height="8" rx="1.5" />',
      '<rect x="13" y="13" width="8" height="8" rx="1.5" />',
    ],
  },
  {
    file: "website-globe",
    component: "WebsiteGlobeIcon",
    shapes: [
      '<rect x="3" y="4" width="18" height="16" rx="2" />',
      '<path d="M3 8h18" />',
      '<circle cx="12" cy="14" r="4" />',
      '<path d="M8 14h8" />',
      '<path d="M12 10c-1.5 1.2-2.5 2.6-2.5 4s1 2.8 2.5 4" />',
      '<path d="M12 10c1.5 1.2 2.5 2.6 2.5 4s-1 2.8-2.5 4" />',
    ],
  },
  {
    file: "automations-flow",
    component: "AutomationsFlowIcon",
    shapes: [
      '<circle cx="5" cy="6" r="2" />',
      '<circle cx="15" cy="12" r="1.5" />',
      '<circle cx="19" cy="12" r="2" />',
      '<circle cx="5" cy="18" r="2" />',
      '<path d="M7 6h5a3 3 0 0 1 3 3" />',
      '<path d="M7 18h5a3 3 0 0 0 3-3" />',
      '<path d="M16.5 12H17" />',
    ],
  },
  {
    file: "automation-operations-pulse",
    component: "AutomationOperationsPulseIcon",
    shapes: [
      '<path d="M3 12h4l2-3 3 6 2-4h3" />',
      '<circle cx="18" cy="11" r="2" />',
      '<path d="M20 11h1" />',
    ],
  },
  {
    file: "ai-assistant-chat-sparkle",
    component: "AiAssistantChatSparkleIcon",
    shapes: [
      '<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-4 3v-3H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />',
      '<path d="M14 8l.8 1.7L16.5 10l-1.7.8L14 12.5l-.8-1.7L11.5 10l1.7-.3L14 8z" />',
      '<path d="M9.5 9.5l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9z" />',
    ],
  },
  {
    file: "inbox-tray",
    component: "InboxTrayIcon",
    shapes: [
      '<path d="M3 6h18l-1.5 12H4.5L3 6z" />',
      '<path d="M3.5 14h5l1.5 2h4l1.5-2h5" />',
      '<path d="M9 10h6" />',
    ],
  },
  {
    file: "invoices-document-dollar",
    component: "InvoicesDocumentDollarIcon",
    shapes: [
      '<path d="M7 3h8l4 4v14H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />',
      '<path d="M15 3v4h4" />',
      '<path d="M10 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2 .9-2 2 1 2 2 2 2-.9 2-2" />',
      '<path d="M12 9v10" />',
    ],
  },
  {
    file: "customers-person",
    component: "CustomersPersonIcon",
    shapes: ['<circle cx="12" cy="8" r="3" />', '<path d="M5 20a7 7 0 0 1 14 0" />'],
  },
  {
    file: "subscription-refresh",
    component: "SubscriptionRefreshIcon",
    shapes: [
      '<circle cx="12" cy="12" r="8" />',
      '<path d="M15.5 9.5V6.5h-3" />',
      '<path d="M8.5 14.5v3h3" />',
      '<path d="M8.8 9.7A4 4 0 0 1 15.5 9.5" />',
      '<path d="M15.2 14.3A4 4 0 0 1 8.5 14.5" />',
    ],
  },
  {
    file: "payments-credit-card",
    component: "PaymentsCreditCardIcon",
    shapes: [
      '<rect x="3" y="6" width="18" height="12" rx="2" />',
      '<path d="M3 10h18" />',
      '<path d="M7 14h4" />',
    ],
  },
  {
    file: "support-lifebuoy",
    component: "SupportLifebuoyIcon",
    shapes: [
      '<circle cx="12" cy="12" r="8" />',
      '<circle cx="12" cy="12" r="3" />',
      '<path d="M12 4v5" />',
      '<path d="M12 15v5" />',
      '<path d="M4 12h5" />',
      '<path d="M15 12h5" />',
    ],
  },
  {
    file: "settings-gear",
    component: "SettingsGearIcon",
    shapes: [
      '<circle cx="12" cy="12" r="3" />',
      '<path d="M12 2v3" />',
      '<path d="M12 19v3" />',
      '<path d="M2 12h3" />',
      '<path d="M19 12h3" />',
      '<path d="m4.9 4.9 2.1 2.1" />',
      '<path d="m17 17 2.1 2.1" />',
      '<path d="m19.1 4.9-2.1 2.1" />',
      '<path d="m7 17-2.1 2.1" />',
    ],
  },
  {
    file: "admin-shield",
    component: "AdminShieldIcon",
    shapes: ['<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6l7-3z" />', '<path d="m9.5 12 1.8 1.8 3.2-3.2" />'],
  },
  {
    file: "admin-metrics-line-chart",
    component: "AdminMetricsLineChartIcon",
    shapes: [
      '<path d="M3 19h18" />',
      '<path d="M5 15l4-4 3 3 6-7" />',
      '<circle cx="5" cy="15" r="1" />',
      '<circle cx="9" cy="11" r="1" />',
      '<circle cx="12" cy="14" r="1" />',
      '<circle cx="18" cy="7" r="1" />',
    ],
  },
  {
    file: "system-logs-list",
    component: "SystemLogsListIcon",
    shapes: [
      '<circle cx="6" cy="7" r="1" />',
      '<circle cx="6" cy="12" r="1" />',
      '<circle cx="6" cy="17" r="1" />',
      '<path d="M10 7h8" />',
      '<path d="M10 12h8" />',
      '<path d="M10 17h8" />',
    ],
  },
  {
    file: "users-two",
    component: "UsersTwoIcon",
    shapes: [
      '<circle cx="9" cy="9" r="3" />',
      '<path d="M3.5 19a5.5 5.5 0 0 1 11 0" />',
      '<circle cx="17" cy="8" r="2.5" />',
      '<path d="M14 19a4 4 0 0 1 6 0" />',
    ],
  },
  {
    file: "notifications-bell",
    component: "NotificationsBellIcon",
    shapes: ['<path d="M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16z" />', '<path d="M10 20a2 2 0 0 0 4 0" />'],
  },
  {
    file: "automation-errors-flow-warning",
    component: "AutomationErrorsFlowWarningIcon",
    shapes: [
      '<circle cx="5" cy="6" r="2" />',
      '<circle cx="13" cy="12" r="2" />',
      '<path d="M7 6h3a3 3 0 0 1 3 3v1" />',
      '<path d="M17 18h5l-2.5-4.5L17 18z" />',
      '<path d="M19.5 16v.01" />',
      '<path d="M19.5 14.2v1" />',
    ],
  },
  {
    file: "prelaunch-rocket",
    component: "PrelaunchRocketIcon",
    shapes: [
      '<path d="M14 4c2.5 0 5 2.5 5 5-2.2 0-4.3.8-5.8 2.2L11 13.5C9.8 12.3 9 10.2 9 8c0-2.2 2.8-4 5-4z" />',
      '<path d="M11 13l-4 4" />',
      '<path d="M7 17l-1 4 4-1" />',
      '<circle cx="14.5" cy="8.5" r="1.2" />',
    ],
  },
  {
    file: "system-flags",
    component: "SystemFlagsIcon",
    shapes: ['<path d="M5 3v18" />', '<path d="M5 4h11l-2 3 2 3H5" />'],
  },
  {
    file: "receipt-preview-document",
    component: "ReceiptPreviewDocumentIcon",
    shapes: [
      '<path d="M7 3h10a2 2 0 0 1 2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1V5a2 2 0 0 1 2-2z" />',
      '<path d="M9 8h8" />',
      '<path d="M9 12h8" />',
      '<path d="M9 16h5" />',
    ],
  },
  {
    file: "reports-bar-chart",
    component: "ReportsBarChartIcon",
    shapes: [
      '<path d="M4 20h16" />',
      '<rect x="6" y="11" width="3" height="7" rx="1" />',
      '<rect x="11" y="8" width="3" height="10" rx="1" />',
      '<rect x="16" y="5" width="3" height="13" rx="1" />',
    ],
  },
];

const tsxTemplate = (icon) => `import type { SVGProps } from "react";

export function ${icon.component}(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
${icon.shapes.map((shape) => `      ${shape}`).join("\n")}
    </svg>
  );
}
`;

const svgTemplate = (icon) => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
${icon.shapes.map((shape) => `  ${shape}`).join("\n")}
</svg>
`;

for (const icon of icons) {
  fs.writeFileSync(path.join(iconsDir, `${icon.file}.tsx`), tsxTemplate(icon));
  fs.writeFileSync(path.join(iconsDir, `${icon.file}.svg`), svgTemplate(icon));
}

const exports = `${icons.map((icon) => `export { ${icon.component} } from "./${icon.file}";`).join("\n")}\n`;
fs.writeFileSync(path.join(iconsDir, "index.ts"), exports);

console.log(`Generated ${icons.length} icon pairs in ${iconsDir}`);
