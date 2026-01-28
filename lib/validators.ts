import { z } from "zod";
import { countryCodes } from "./countries";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  planIntent: z.enum(["starter", "pro", "growth", "business"]),
  inviteToken: z.string().min(10).optional(),
  autoRenew: z.boolean().refine((val) => val === true, {
    message: "Auto-renew consent is required",
  }),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const automationStepSchema = z.object({
  type: z.enum([
    "parseText",
    "extractData",
    "callApi",
    "generateInvoice",
    "sendEmail",
    "generateReport",
    "sendWhatsApp",
    "aiTransform",
  ]),
  config: z.record(z.string(), z.any()).optional(),
});

export const automationFlowSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  steps: z.array(automationStepSchema),
  category: z.string().optional(),
  aiParams: z.record(z.string(), z.any()).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
});

export const invoiceItemSchema = z.object({
  name: z.string(),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  description: z.string().optional(),
});

const optionalEmail = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().email().optional()
);

const requiredEmail = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1, "This field is required").email("Invalid email address")
);

const optionalString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().optional()
);

const optionalNonEmptyString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().min(2).optional()
);

const E164_REGEX = /^\+[1-9]\d{7,14}$/;
const optionalE164 = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().regex(E164_REGEX, "Invalid phone number").optional()
);

const requiredE164 = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().regex(E164_REGEX, "Invalid phone number")
);

const countryCodeSchema = z.string().length(2).refine((value) => {
  const normalized = String(value || "").toUpperCase();
  return countryCodes.includes(normalized);
}, "Invalid country code");

export const invoiceSchema = z.object({
  invoiceNumber: z.string().min(3),
  currency: z.string().length(3),
  status: z.enum(["DRAFT", "SENT", "PAID", "FAILED", "OVERDUE", "CANCELED"]).default("DRAFT"),
  items: z.array(invoiceItemSchema),
  discount: z.number().nonnegative().optional(),
  customerName: optionalString,
  customerEmail: optionalEmail,
  customerAddress: optionalString,
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).optional(),
  customerCompany: optionalString,
  customerTaxId: optionalString,
  note: optionalString,
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
});

export const supportTicketSchema = z.object({
  title: z.string().min(5),
  message: z.string().min(10),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  attachments: z.array(z.string()).optional(),
});

export const contactSalesSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  company: z.string().optional(),
  message: z.string().min(10),
});

export const profileUpdateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
});

export const passwordUpdateSchema = z.object({
  password: z.string().min(8),
  confirm: z.string().min(8),
});

export type AutomationStepInput = z.infer<typeof automationStepSchema>;

export const businessSchema = z.object({
  name: z.string().min(2),
  domain: z.string().optional(),
});

export const businessProfileCreateSchema = z.object({
  businessName: z.string().min(2),
  country: countryCodeSchema,
  defaultCurrency: z.string().length(3),
  businessAddress: optionalString,
  businessEmail: requiredEmail,
  businessPhone: requiredE164,
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(30).optional(),
  vatPricingMode: z.enum(["exclusive", "inclusive"]).optional(),
  taxId: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().max(64).optional()
  ),
});

export const businessProfileUpdateSchema = z.object({
  businessName: optionalNonEmptyString,
  country: countryCodeSchema.optional(),
  defaultCurrency: z.string().length(3).optional(),
  businessAddress: optionalString,
  businessEmail: optionalEmail,
  businessPhone: optionalE164,
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(30).optional(),
  vatPricingMode: z.enum(["exclusive", "inclusive"]).optional(),
  taxId: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().max(64).optional()
  ),
});

export const merchantAccountSchema = z.object({
  paystackSubaccountCode: optionalString,
  flutterwaveSubaccountId: optionalString,
});

export const merchantAccountCreateSchema = z.object({
  provider: z.enum(["PAYSTACK", "FLUTTERWAVE"]),
  businessName: z.string().min(2),
  businessEmail: z.string().email(),
  accountName: z.string().min(2),
  accountNumber: z.string().min(6),
  bankCode: z.string().min(2),
  country: z.string().length(2),
  currency: z.string().length(3),
  phone: z.string().min(6),
});

export const triggerSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.any()),
  conditions: z.record(z.string(), z.any()).optional(),
});

export const actionSchema = z.object({
  type: z.string(),
  config: z.record(z.string(), z.any()),
  order: z.number().nonnegative(),
});

export const workflowSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  triggers: z.array(triggerSchema),
  actions: z.array(actionSchema),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "ARCHIVED"]).default("DRAFT"),
});

export const subscriptionSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE", "PREMIUM"]),
  status: z.enum(["ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE"]).default("ACTIVE"),
  renewalDate: z.string(),
  usageLimit: z.number().optional(),
  usagePeriod: z.string().optional(),
  currency: z
    .enum(["NGN", "USD", "GHS", "KES", "ZAR", "XOF", "UGX", "TZS", "RWF", "ZMW", "MZN", "EGP", "GBP", "EUR"])
    .default("USD"),
  graceEndsAt: z.string().optional(),
  cancellationReason: z.string().optional(),
  overageUsed: z.number().optional(),
  interval: z.string().optional(),
});

export const aiUsageLogSchema = z.object({
  model: z.string(),
  tokens: z.number().nonnegative(),
  prompt: z.string().optional(),
});
