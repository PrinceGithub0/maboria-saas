"use client";

import { LanguageSwitcher } from "@/components/ui/language-switcher";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { useLanguage } from "@/components/providers/language-provider";

export function MarketingHeaderActions() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center gap-3 pointer-events-auto">
      <LanguageSwitcher value={language} onChange={setLanguage} />
      <ThemeSwitcher />
    </div>
  );
}
