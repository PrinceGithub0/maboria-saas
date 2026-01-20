import { FAQSection } from "@/components/faq/faq-section";
import { LangText } from "@/components/ui/lang-text";

export default function FAQPage() {
  return (
    <div className="space-y-6">
      <div>
        <LangText
          as="p"
          className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300"
          en="Help"
          fr="Aide"
        />
        <LangText
          as="h1"
          className="text-3xl font-semibold text-foreground"
          en="Frequently asked questions"
          fr="Questions frequentes"
        />
        <p className="mt-1 text-sm text-muted-foreground">
          <LangText
            en="Answers based on what Maboria supports today."
            fr="Reponses basees sur ce que Maboria supporte aujourd hui."
          />
        </p>
      </div>
      <FAQSection />
    </div>
  );
}
