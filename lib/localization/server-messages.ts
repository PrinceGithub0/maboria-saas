import { localizeAdminServerMessage } from "@/lib/admin/localization";
import type { Language } from "@/lib/i18n";

export function localizeServerMessage(message: unknown, language: Language, fallback?: string | null) {
  return localizeAdminServerMessage(message, language, fallback);
}
