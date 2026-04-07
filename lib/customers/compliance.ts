type CustomerDeliveryPreference = "EMAIL" | "WHATSAPP" | "BOTH";

export type CustomerComplianceContact = {
  email?: string | null;
  phone?: string | null;
  deliveryPreference?: CustomerDeliveryPreference | null;
  emailOptOut?: boolean | null;
  whatsappOptOut?: boolean | null;
  processingRestrictedAt?: string | Date | null;
  erasedAt?: string | Date | null;
};

type DeliveryChannel = "EMAIL" | "WHATSAPP";

export type CustomerContactPolicy = {
  canProcess: boolean;
  isErased: boolean;
  shouldEmail: boolean;
  shouldWhatsapp: boolean;
  blockedChannels: DeliveryChannel[];
  blockedReason: string | null;
};

function hasTimestamp(value: string | Date | null | undefined) {
  if (!value) return false;
  const date = value instanceof Date ? value : new Date(value);
  return !Number.isNaN(date.getTime());
}

function normalizeDeliveryPreference(value?: string | null): CustomerDeliveryPreference {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "WHATSAPP" || normalized === "BOTH") return normalized;
  return "EMAIL";
}

export function resolveCustomerContactPolicy(customer?: CustomerComplianceContact | null): CustomerContactPolicy {
  const isErased = hasTimestamp(customer?.erasedAt);
  const processingRestricted = hasTimestamp(customer?.processingRestrictedAt);
  const canProcess = !isErased && !processingRestricted;

  const preference = normalizeDeliveryPreference(customer?.deliveryPreference);
  const emailAvailable = Boolean(String(customer?.email || "").trim()) && !Boolean(customer?.emailOptOut);
  const whatsappAvailable =
    Boolean(String(customer?.phone || "").trim()) && !Boolean(customer?.whatsappOptOut);

  const shouldEmail = canProcess && emailAvailable && (preference === "EMAIL" || preference === "BOTH");
  const shouldWhatsapp =
    canProcess && whatsappAvailable && (preference === "WHATSAPP" || preference === "BOTH");

  const blockedChannels: DeliveryChannel[] = [];
  if (!canProcess) {
    if (customer?.email) blockedChannels.push("EMAIL");
    if (customer?.phone) blockedChannels.push("WHATSAPP");
  } else {
    if (customer?.email && !emailAvailable) blockedChannels.push("EMAIL");
    if (customer?.phone && !whatsappAvailable) blockedChannels.push("WHATSAPP");
  }

  let blockedReason: string | null = null;
  if (isErased) {
    blockedReason = "Customer personal data has been erased.";
  } else if (processingRestricted) {
    blockedReason = "Customer processing is restricted.";
  } else if (!shouldEmail && !shouldWhatsapp) {
    if (preference === "EMAIL" || preference === "BOTH") {
      if (customer?.emailOptOut) {
        blockedReason = "Customer has opted out of email contact.";
      } else if (!customer?.email) {
        blockedReason = "Customer email contact is missing.";
      }
    }
    if (!blockedReason && (preference === "WHATSAPP" || preference === "BOTH")) {
      if (customer?.whatsappOptOut) {
        blockedReason = "Customer has opted out of WhatsApp contact.";
      } else if (!customer?.phone) {
        blockedReason = "Customer WhatsApp contact is missing.";
      }
    }
    if (!blockedReason) {
      blockedReason = "Customer contact policy blocks delivery.";
    }
  }

  return {
    canProcess,
    isErased,
    shouldEmail,
    shouldWhatsapp,
    blockedChannels,
    blockedReason,
  };
}
