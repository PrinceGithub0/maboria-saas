import { isAutomationTriggerMetadataStep } from "@/lib/automation/step-kind";

export type DashboardAutomationStartId =
  | "invoice_created"
  | "invoice_paid"
  | "invoice_overdue"
  | "payment_received"
  | "payment_failed"
  | "customer_created"
  | "whatsapp_received"
  | "email_received";

type StepLike = {
  type?: unknown;
  config?: Record<string, unknown> | null;
};

type TriggerRecord = {
  type: string;
  config: Record<string, unknown>;
  conditions?: Record<string, unknown>;
};

type ActionRecord = {
  type?: unknown;
  config?: Record<string, unknown> | null;
  order?: unknown;
};

const readString = (value: unknown) => String(value || "").trim();

const normalizeConfigObject = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? ({ ...(value as Record<string, unknown>) } as Record<string, unknown>)
    : {};

export const SUPPORTED_DASHBOARD_START_IDS = new Set<DashboardAutomationStartId>([
  "invoice_created",
  "invoice_paid",
  "invoice_overdue",
  "payment_received",
  "payment_failed",
]);

export const SUPPORTED_DASHBOARD_ACTION_IDS = new Set([
  "send_whatsapp_message",
  "send_email",
  "send_receipt",
  "send_payment_reminder",
  "send_payment_confirmation",
  "send_failed_payment_message",
  "create_invoice",
  "apply_late_fee",
  "send_payment_link",
  "improve_message",
  "rewrite_tone",
  "generate_auto_reply",
  "generate_summary",
  "notify_team_payment",
  "notify_team",
]);

export const isSupportedDashboardStartId = (value: unknown): value is DashboardAutomationStartId =>
  SUPPORTED_DASHBOARD_START_IDS.has(readString(value) as DashboardAutomationStartId);

export const isSupportedDashboardActionId = (value: unknown) =>
  SUPPORTED_DASHBOARD_ACTION_IDS.has(readString(value));

const ACTION_TYPE_BY_DASHBOARD_ACTION_ID: Record<string, string> = {
  send_whatsapp_message: "sendWhatsApp",
  send_payment_reminder: "sendWhatsApp",
  send_payment_confirmation: "sendWhatsApp",
  send_failed_payment_message: "sendWhatsApp",
  send_payment_link: "sendWhatsApp",
  send_email: "sendEmail",
  send_receipt: "sendEmail",
  notify_team_payment: "sendEmail",
  notify_team: "sendEmail",
  create_invoice: "generateInvoice",
  apply_late_fee: "generateInvoice",
  improve_message: "aiTransform",
  rewrite_tone: "aiTransform",
  generate_auto_reply: "aiTransform",
  generate_summary: "aiTransform",
};

const DEFAULT_ACTION_ID_BY_TYPE: Record<string, string> = {
  sendWhatsApp: "send_whatsapp_message",
  sendEmail: "send_email",
  generateInvoice: "create_invoice",
  aiTransform: "improve_message",
};

const mapStartIdToTrigger = (startId: DashboardAutomationStartId): TriggerRecord => {
  switch (startId) {
    case "invoice_created":
      return { type: "invoice_created", config: {} };
    case "invoice_paid":
    case "payment_received":
      return { type: "invoice_status", config: { statuses: ["PAID"] } };
    case "invoice_overdue":
      return { type: "invoice_status", config: { statuses: ["OVERDUE"] } };
    case "payment_failed":
      return { type: "invoice_status", config: { statuses: ["FAILED"] } };
    default:
      throw new Error(`Unsupported automation start: ${startId}`);
  }
};

const inferDashboardStartIdFromTrigger = (trigger?: TriggerRecord | null): DashboardAutomationStartId | null => {
  if (!trigger) return null;
  const type = readString(trigger.type);
  if (type === "invoice_created") return "invoice_created";
  if (type !== "invoice_status") return null;

  const statuses = new Set<string>();
  const single = readString(trigger.config?.status);
  if (single) statuses.add(single.toUpperCase());
  const list = Array.isArray(trigger.config?.statuses) ? trigger.config.statuses : [];
  list.forEach((entry) => {
    const normalized = readString(entry).toUpperCase();
    if (normalized) statuses.add(normalized);
  });

  if (statuses.has("OVERDUE")) return "invoice_overdue";
  if (statuses.has("FAILED")) return "payment_failed";
  if (statuses.has("PAID")) return "invoice_paid";
  return null;
};

const normalizeActionSource = (action: ActionRecord) => {
  const config = action.config && typeof action.config === "object" ? action.config : {};
  const rawType = readString(action.type);
  const configuredActionId = readString((config as Record<string, unknown>).actionId);
  const actionId = isSupportedDashboardActionId(configuredActionId)
    ? configuredActionId
    : isSupportedDashboardActionId(rawType)
      ? rawType
      : DEFAULT_ACTION_ID_BY_TYPE[rawType] || "";
  const type =
    ACTION_TYPE_BY_DASHBOARD_ACTION_ID[actionId] ||
    (isSupportedDashboardActionId(rawType) ? "" : rawType);

  return {
    type,
    actionId,
    config: { ...config },
  };
};

type BuildDashboardStepsOptions = {
  strict?: boolean;
};

export const buildDashboardStepsFromRelations = (
  {
    steps = [],
    triggers = [],
    actions = [],
  }: {
    steps?: StepLike[];
    triggers?: TriggerRecord[];
    actions?: ActionRecord[];
  },
  options: BuildDashboardStepsOptions = {}
) => {
  const { strict = false } = options;
  const existingSteps = Array.isArray(steps) ? steps : [];
  const existingTriggerMetadataStep = existingSteps.find((step) => isAutomationTriggerMetadataStep(step));
  const existingTriggerConfig = normalizeConfigObject(existingTriggerMetadataStep?.config);
  const existingStartId = readString(existingTriggerConfig.startId) as DashboardAutomationStartId;
  const inferredStartId = inferDashboardStartIdFromTrigger(triggers[0]);
  const startId = existingStartId || inferredStartId || "";

  if (strict && !startId) {
    throw new Error("This automation trigger is not supported by the live dashboard automation builder.");
  }

  const actionSource =
    Array.isArray(actions) && actions.length
      ? [...actions].sort((left, right) => Number(left.order || 0) - Number(right.order || 0))
      : existingSteps.filter((step) => !isAutomationTriggerMetadataStep(step));

  const normalizedActions = actionSource
    .map((action) => {
      const normalized = normalizeActionSource(action);
      if (strict && (!normalized.type || !normalized.actionId)) {
        throw new Error("This automation includes an action that is not supported by the live dashboard builder.");
      }
      if (!normalized.type) return null;
      return {
        type: normalized.type,
        config: {
          ...normalized.config,
          ...(normalized.actionId ? { actionId: normalized.actionId } : {}),
        },
      };
    })
    .filter(Boolean) as StepLike[];

  return [
    ...(startId
      ? [
          {
            type: "generateInvoice",
            config: {
              ...existingTriggerConfig,
              startId,
            },
          } satisfies StepLike,
        ]
      : []),
    ...normalizedActions,
  ];
};

export const buildAutomationRelationsFromSteps = (steps: StepLike[] = []) => {
  const triggerStep = steps.find((step) => isAutomationTriggerMetadataStep(step));
  const triggerConfig = normalizeConfigObject(triggerStep?.config);
  const startId = readString(triggerConfig.startId) as DashboardAutomationStartId;

  if (startId && !isSupportedDashboardStartId(startId)) {
    throw new Error(
      "This trigger is not wired into live automation events yet. Use invoice or payment starts for now."
    );
  }

  const triggers = startId
    ? [
        {
          ...mapStartIdToTrigger(startId),
          config: {
            ...normalizeConfigObject(mapStartIdToTrigger(startId).config),
            ...Object.fromEntries(Object.entries(triggerConfig).filter(([key]) => key !== "startId")),
          },
        },
      ]
    : [];
  const actions = steps
    .filter((step) => !isAutomationTriggerMetadataStep(step))
    .map((step, index) => ({
      type: readString(step.type),
      config: (step.config && typeof step.config === "object" ? step.config : {}) as Record<string, unknown>,
      order: index + 1,
    }))
    .filter((action) => action.type);

  return { triggers, actions };
};
