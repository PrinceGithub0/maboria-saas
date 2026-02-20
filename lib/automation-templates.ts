export type AutomationTemplateId =
  | "overdue_reminder_3_days"
  | "whatsapp_thank_you"
  | "notify_invoice_paid";

export type AutomationTemplateTrigger = "INVOICE_OVERDUE" | "INVOICE_PAID";
export type AutomationTemplateStepType = "SEND_EMAIL" | "SEND_WHATSAPP";
export type AutomationTemplateDelayUnit = "minutes" | "hours" | "days";

export type AutomationTemplateStep = {
  type: AutomationTemplateStepType;
  note?: string;
  delay?: {
    value: number;
    unit: AutomationTemplateDelayUnit;
  };
  config?: Record<string, unknown>;
};

export type AutomationTemplate = {
  id: AutomationTemplateId;
  name: string;
  description: string;
  trigger: AutomationTemplateTrigger;
  steps: AutomationTemplateStep[];
};

const AUTOMATION_TEMPLATES: Record<AutomationTemplateId, AutomationTemplate> = {
  overdue_reminder_3_days: {
    id: "overdue_reminder_3_days",
    name: "Overdue Invoice Reminder",
    description: "Send an invoice overdue reminder three days after due date.",
    trigger: "INVOICE_OVERDUE",
    steps: [
      {
        type: "SEND_EMAIL",
        note: "Invoice overdue reminder",
        delay: { value: 3, unit: "days" },
      },
    ],
  },
  whatsapp_thank_you: {
    id: "whatsapp_thank_you",
    name: "WhatsApp Thank You",
    description: "Thank customers on WhatsApp after payment is received.",
    trigger: "INVOICE_PAID",
    steps: [
      {
        type: "SEND_WHATSAPP",
        note: "Payment thank you",
      },
    ],
  },
  notify_invoice_paid: {
    id: "notify_invoice_paid",
    name: "Invoice Paid Notification",
    description: "Email the business owner when an invoice is paid.",
    trigger: "INVOICE_PAID",
    steps: [
      {
        type: "SEND_EMAIL",
        note: "Invoice paid notification",
        config: { recipient: "BUSINESS_OWNER" },
      },
    ],
  },
};

export function getAutomationTemplate(id: string): AutomationTemplate | null {
  if (!id) return null;
  return AUTOMATION_TEMPLATES[id as AutomationTemplateId] || null;
}

export function cloneAutomationTemplate(template: AutomationTemplate): AutomationTemplate {
  return JSON.parse(JSON.stringify(template)) as AutomationTemplate;
}

