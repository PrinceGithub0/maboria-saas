type NormalizePhoneOptions = {
  allowEmpty?: boolean;
};

export function normalizeInternationalPhoneDigits(
  input: string | null | undefined,
  options?: NormalizePhoneOptions
) {
  const raw = String(input || "").trim();
  if (!raw) {
    if (options?.allowEmpty) return null;
    throw new Error("Phone number is required");
  }

  let digits = raw.replace(/\D/g, "");
  if (!digits) {
    if (options?.allowEmpty) return null;
    throw new Error("Phone number is required");
  }

  if (raw.startsWith("+")) {
    // Already in E.164-like form.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    throw new Error("Phone number must include a country code.");
  }

  if (digits.length < 8 || digits.length > 15) {
    throw new Error("Invalid phone number");
  }

  return digits;
}

export function normalizeInternationalPhoneE164(
  input: string | null | undefined,
  options?: NormalizePhoneOptions
) {
  const digits = normalizeInternationalPhoneDigits(input, options);
  return digits ? `+${digits}` : null;
}

export function formatInternationalPhoneDisplay(input: string | null | undefined) {
  const raw = String(input || "").trim();
  if (!raw) return "";
  try {
    return normalizeInternationalPhoneE164(raw, { allowEmpty: true }) || "";
  } catch {
    return raw;
  }
}
