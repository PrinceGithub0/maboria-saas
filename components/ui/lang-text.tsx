"use client";

import type { JSX } from "react";
import { useLanguage } from "@/components/providers/language-provider";
import { getLocalizedText, type LocalizedText } from "@/lib/i18n";

type Props = LocalizedText & {
  as?: keyof JSX.IntrinsicElements;
  className?: string;
};

export function LangText({ en, fr, de, es, pt, as = "span", className }: Props) {
  const Tag = as;
  const { language } = useLanguage();
  const text = getLocalizedText({ en, fr, de, es, pt }, language);
  return <Tag className={className}>{text}</Tag>;
}
