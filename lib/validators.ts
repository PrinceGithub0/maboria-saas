import { z } from "zod";
import { countryCodes } from "./countries";
import { CHECKOUT_PROVIDER_VALUES, PAYOUT_PROVIDER_VALUES } from "./payments/payment-providers";
import { MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR } from "./password-policy";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR),
  planIntent: z.enum(["starter", "pro", "growth", "business"]),
  inviteToken: z.string().min(10).optional(),
  locale: z.string().min(2).optional(),
  timeZone: z.string().min(2).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR),
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

const optionalInvoiceString = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  },
  z.string().optional()
);

export const invoiceItemSchema = z.object({
  name: z.string(),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
  description: z.string().optional(),
  unitCode: optionalInvoiceString,
  classificationCode: optionalInvoiceString,
  taxCategory: optionalInvoiceString,
  taxExemptionReason: optionalInvoiceString,
  incomeClassification: optionalInvoiceString,
  taxAmount: z.number().nonnegative().optional(),
  taxRate: z.number().min(0).max(100).optional(),
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
  poNumber: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().max(120).optional()
  ),
  currency: z.string().length(3),
  status: z.enum(["DRAFT", "SENT", "PAID", "FAILED", "OVERDUE", "CANCELED"]).default("DRAFT"),
  items: z.array(invoiceItemSchema),
  discount: z.number().nonnegative().optional(),
  customerId: z.string().min(1),
  customerName: optionalString,
  customerEmail: optionalEmail,
  customerAddress: optionalString,
  customerStreet: optionalString,
  customerCity: optionalString,
  customerPostalCode: optionalString,
  customerCountry: countryCodeSchema.optional(),
  customerType: z.enum(["INDIVIDUAL", "BUSINESS"]).optional(),
  customerCompany: optionalString,
  customerTaxId: optionalString,
  buyerType: z.enum(["B2B", "B2C"]).optional(),
  supplyType: z.enum(["SAAS", "SERVICES", "GOODS"]).optional(),
  note: optionalString,
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  attachments: z
    .array(
      z.object({
        filename: z.string().min(1).max(255),
        contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
        base64: z.string().min(1),
        sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
      })
    )
    .max(5)
    .optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  provider: z.enum(CHECKOUT_PROVIDER_VALUES),
});

const supportAttachmentSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(["image/jpeg", "image/png", "application/pdf"]),
  base64: z.string().min(1),
  sizeBytes: z.number().int().positive().max(5 * 1024 * 1024),
});

export const supportTicketSchema = z.object({
  title: z.string().trim().min(5),
  message: z.string().trim().min(10),
  priority: z.enum(["low", "medium", "normal", "high", "urgent", "critical"]).default("medium"),
  attachments: z.array(supportAttachmentSchema).max(3).optional(),
});

export const supportReplySchema = z.object({
  message: z.string().trim().min(1),
  attachments: z.array(supportAttachmentSchema).max(3).optional(),
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
  currentPassword: z.string().min(1, "Current password is required"),
  password: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR),
  confirm: z.string().min(MIN_PASSWORD_LENGTH, PASSWORD_MIN_LENGTH_ERROR),
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
  addressLine1: optionalString,
  addressLine2: optionalString,
  city: optionalString,
  state: optionalString,
  postalCode: optionalString,
  businessEmail: requiredEmail,
  businessPhone: requiredE164,
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(30).optional(),
  vatRateDisplay: optionalString,
  vatPricingMode: z.enum(["exclusive", "inclusive"]).optional(),
  taxId: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(2).max(64).optional()
  ),
  registrationNumber: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(2).max(80).optional()
  ),
  branchCode: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(1).max(40).optional()
  ),
});

export const businessProfileUpdateSchema = z.object({
  businessName: optionalNonEmptyString,
  country: countryCodeSchema.optional(),
  defaultCurrency: z.string().length(3).optional(),
  businessAddress: optionalString,
  addressLine1: optionalString,
  addressLine2: optionalString,
  city: optionalString,
  state: optionalString,
  postalCode: optionalString,
  businessEmail: optionalEmail,
  businessPhone: optionalE164,
  vatEnabled: z.boolean().optional(),
  vatRate: z.number().min(0).max(30).optional(),
  vatRateDisplay: optionalString,
  vatPricingMode: z.enum(["exclusive", "inclusive"]).optional(),
  taxId: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(2).max(64).optional()
  ),
  registrationNumber: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(2).max(80).optional()
  ),
  branchCode: z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    },
    z.string().min(1).max(40).optional()
  ),
});

export const merchantAccountSchema = z.object({
  paystackSubaccountCode: optionalString,
  flutterwaveSubaccountId: optionalString,
});

export const merchantAccountCreateSchema = z.object({
  provider: z.enum(PAYOUT_PROVIDER_VALUES),
  businessName: z.string().trim().min(2),
  businessEmail: z.string().trim().email(),
  accountName: z.string().trim().min(2),
  accountNumber: optionalString,
  bankCode: optionalString,
  iban: optionalString,
  bicSwift: optionalString,
  branchCode: optionalString,
  routingNumber: optionalString,
  sortCode: optionalString,
  payoutType: z.enum(["local", "sepa"]).optional(),
  country: z.string().trim().length(2),
  currency: z.string().trim().length(3),
  phone: z.string().trim().min(6),
});

export const eInvoicingConnectionSchema = z.object({
  provider: z.enum([
    "MYINVOIS",
    "RO_EFACTURA",
    "MYDATA",
    "ZATCA",
    "IT_SDI",
    "MX_CFDI",
    "BR_NFE",
    "CL_DTE",
    "CO_DIAN",
    "PE_SUNAT",
    "HU_NAV",
    "MD_EFACTURA",
  ]),
  country: countryCodeSchema,
  sandbox: z.boolean().optional(),
  status: z.enum(["ACTIVE", "DISABLED", "ERROR"]).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  credentials: z.record(z.string(), z.unknown()).optional(),
  clearCredentials: z.boolean().optional(),
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

export const customerCreateSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z.string().email("Invalid email address"),
    phone: optionalString,
    taxId: optionalString,
    companyName: optionalString,
    registrationNumber: optionalString,
    branchCode: optionalString,
    addressLine1: z.string().trim().min(1, "Address is required"),
    addressLine2: optionalString,
    city: z.string().trim().min(1, "City is required"),
    state: z.string().trim().min(1, "State is required"),
    postalCode: optionalString,
    country: z.string().trim().length(2, "Country is required"),
    deliveryPreference: z.enum(["EMAIL", "WHATSAPP", "BOTH"]),
  })
  .superRefine((data, ctx) => {
    if (
      (data.deliveryPreference === "WHATSAPP" || data.deliveryPreference === "BOTH") &&
      !String(data.phone || "").trim()
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phone"],
        message: "Phone is required for WhatsApp delivery",
      });
    }
  });

export const customerQuerySchema = z.object({
  q: optionalString,
  take: z
    .string()
    .regex(/^\d+$/)
    .optional(),
  skip: z
    .string()
    .regex(/^\d+$/)
    .optional(),
});

export const lateFeeSettingsSchema = z.object({
  lateFeeEnabled: z.boolean(),
  lateFeeType: z.enum(["FIXED", "PERCENTAGE"]),
  lateFeeValue: z.number().min(0),
  gracePeriodDays: z.number().int().min(0).optional(),
  lateFeeMode: z.enum(["ONE_TIME", "RECURRING"]).optional(),
  lateFeeIntervalDays: z.number().int().min(1).nullable().optional(),
  allowAutomationLateFee: z.boolean().optional(),
  maxLateFeeApplications: z.number().int().min(1).nullable().optional(),
  lateFeeGraceDays: z.number().int().min(0).optional(),
  lateFeeCap: z.number().min(0).nullable().optional(),
  lateFeeRecurring: z.boolean().optional(),
  lateFeeRecurringIntervalDays: z.number().int().min(1).nullable().optional(),
  lateFeePolicyText: z.string().trim().min(10).max(1000).nullable().optional(),
  reminderCooldownMinutes: z.number().int().min(1).max(240).optional(),
});

export const subscriptionSchema = z.object({
  plan: z.enum(["STARTER", "PRO", "GROWTH", "BUSINESS", "ENTERPRISE", "PREMIUM"]),
  status: z
    .enum(["INCOMPLETE", "ACTIVE", "PAST_DUE", "CANCELED", "INACTIVE", "REVOKED"])
    .default("ACTIVE"),
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
