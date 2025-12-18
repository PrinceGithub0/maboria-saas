import { FAQSection } from "@/components/faq/faq-section";

export default function FAQPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">Help</p>
        <h1 className="text-3xl font-semibold text-foreground">Frequently asked questions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Answers based on what Maboria supports today.
        </p>
      </div>
      <FAQSection />
    </div>
  );
}
