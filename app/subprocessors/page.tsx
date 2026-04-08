import { LangText } from "@/components/ui/lang-text";
import { resolveLocalizedText, type LocalizedText } from "@/lib/i18n";

type Section = {
  title: string | LocalizedText;
  paragraphs?: Array<string | LocalizedText>;
  bullets?: Array<string | LocalizedText>;
};

const sections: Section[] = [
  {
    title: duplicateEnglish("1. Scope"),
    paragraphs: [
      "This page summarizes the categories of subprocessors and service providers used to operate Maboria.",
      "Provider availability can vary by region, feature enablement, and customer configuration.",
    ],
  },
  {
    title: duplicateEnglish("2. Payment Providers"),
    bullets: ["Stripe", "Paystack", "Flutterwave"],
  },
  {
    title: duplicateEnglish("3. Messaging and Communications"),
    bullets: [
      "WhatsApp / Meta for configured messaging workflows",
      "Connected email providers configured by the customer",
    ],
  },
  {
    title: duplicateEnglish("4. E-Invoicing"),
    paragraphs: [
      "Maboria may connect to country-specific e-invoicing providers and government gateways depending on the seller country and enabled rollout.",
    ],
  },
  {
    title: duplicateEnglish("5. Infrastructure and Support"),
    paragraphs: [
      "Maboria may use hosting, database, email delivery, and operational tooling providers needed to run, secure, support, and improve the platform.",
    ],
  },
  {
    title: duplicateEnglish("6. DPA and Vendor Review"),
    paragraphs: [
      "Where required, Maboria reviews provider processing terms and operational fit before enabling new integrations in production.",
      "If you need current processing terms or a customer-facing DPA workflow, see the DPA page or contact support through the official Maboria channels.",
    ],
  },
];

function duplicateEnglish(value: string): LocalizedText {
  return { en: value, fr: value, de: value, es: value, pt: value };
}

function Text({
  value,
  className,
}: {
  value: string | LocalizedText;
  className?: string;
}) {
  const resolved = typeof value === "string" ? duplicateEnglish(value) : resolveLocalizedText(value);
  return <LangText className={className} {...resolved} />;
}

export default function SubprocessorsPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          <Text value="Subprocessors" />
        </h1>
        <p className="text-sm text-muted-foreground">
          <Text value="Last updated: April 2026" />
        </p>
      </div>

      {sections.map((section) => (
        <section key={typeof section.title === "string" ? section.title : section.title.en} className="space-y-4">
          <h2 className="text-xl font-semibold">
            <Text value={section.title} />
          </h2>
          {section.paragraphs?.map((paragraph) => (
            <p key={typeof paragraph === "string" ? paragraph : paragraph.en}>
              <Text value={paragraph} />
            </p>
          ))}
          {section.bullets?.length ? (
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {section.bullets.map((bullet) => (
                <li key={typeof bullet === "string" ? bullet : bullet.en}>
                  <Text value={bullet} />
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}
