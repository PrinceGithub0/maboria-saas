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
          de="Hilfe"
          es="Ayuda"
          pt="Ajuda"
        />
        <LangText
          as="h1"
          className="text-3xl font-semibold text-foreground"
          en="Frequently asked questions"
          fr="Questions frequentes"
          de="Haufig gestellte Fragen"
          es="Preguntas frecuentes"
          pt="Perguntas frequentes"
        />
        <p className="mt-1 text-sm text-muted-foreground">
          <LangText
            en="Answers based on what Maboria supports today."
            fr="Réponses basees sur ce que Maboria supporte aujourd hui."
            de="Antworten basierend auf dem, was Maboria heute unterstutzt."
            es="Respuestas basadas en lo que Maboria admite hoy."
            pt="Respostas com base no que a Maboria suporta hoje."
          />
        </p>
      </div>
      <FAQSection />
    </div>
  );
}
