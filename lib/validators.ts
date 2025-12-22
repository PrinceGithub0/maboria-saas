import { z } from "zod";

export const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
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

export const invoiceSchema = z.object({
  invoiceNumber: z.string().min(3),
  currency: z.string().length(3),
  status: z.enum(["DRAFT", "SENT", "PAID", "OVERDUE", "CANCELED"]).default("DRAFT"),
  items: z.array(invoiceItemSchema),
  tax: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
});

export const paymentSchema = z.object({
  amount: z.number().positive(),
  currency: z.string().length(3),
  provider: z.enum(["STRIPE", "PAYSTACK"]),
});

export const supportTicketSchema = z.object({
  title: z.string().min(5),
  message: z.string().min(10),
  priority: z.enum(["low", "normal", "high"]).default("normal"),
  attachments: z.array(z.string()).optional(),
});

export type AutomationStepInput = z.infer<typeof automationStepSchema>;

export const businessSchema = z.object({
  name: z.string().min(2),
  domain: z.string().optional(),
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
  plan: z.enum(["STARTER", "GROWTH", "ENTERPRISE", "PREMIUM"]),
  status: z.enum(["ACTIVE", "TRIALING", "PAST_DUE", "CANCELED", "INACTIVE"]).default("TRIALING"),
  renewalDate: z.string(),
  trialEndsAt: z.string().optional(),
  usageLimit: z.number().optional(),
  usagePeriod: z.string().optional(),
  currency: z.enum(["USD", "NGN"]).default("USD"),
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
