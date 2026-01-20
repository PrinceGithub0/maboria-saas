"use client";

import { useLanguage } from "@/components/providers/language-provider";
import { LanguageSwitcher } from "@/components/ui/language-switcher";

export function MarketingLanguageToggle() {
  const { language, setLanguage } = useLanguage();
  return (
    <div className="fixed right-4 top-4 z-50 md:right-6 md:top-6">
      <LanguageSwitcher value={language} onChange={setLanguage} />
    </div>
  );
}
