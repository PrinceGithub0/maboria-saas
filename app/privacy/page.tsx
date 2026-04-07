import { LangText } from "@/components/ui/lang-text";
import { resolveLocalizedText, type LocalizedText } from "@/lib/i18n";

type PrivacySection = {
  title: string | LocalizedText;
  paragraphs?: Array<string | LocalizedText>;
  bullets?: Array<string | LocalizedText>;
};

const sections: PrivacySection[] = [
  {
    title: duplicateEnglish("1. Introduction"),
    paragraphs: [
      "This Privacy Policy explains how Maboria collects, uses, shares, and protects personal data when you use the platform and related services.",
    ],
  },
  {
    title: duplicateEnglish("2. Information We Collect"),
    bullets: [
      "account, business, and contact information",
      "invoice, payment, subscription, and compliance metadata",
      "automation logs, activity records, support records, and usage analytics",
      "message content and delivery metadata needed to send and log communications",
    ],
  },
  {
    title: duplicateEnglish("3. How We Use Information"),
    bullets: [
      "to provide and operate the platform",
      "to run invoicing, payment, messaging, automation, and e-invoicing features",
      "to maintain reliability, security, fraud prevention, and support",
      "to improve the service through analytics and operational insight",
    ],
  },
  {
    title: duplicateEnglish("4. Messaging and Communications"),
    paragraphs: [
      "WhatsApp and other messaging content is processed only to deliver, automate, summarize, and log communication initiated by you or your configured workflows.",
      "Where available, Maboria lets you apply customer-level email opt-outs, WhatsApp opt-outs, processing restrictions, export, and erasure controls from the customer record.",
    ],
  },
  {
    title: duplicateEnglish("5. Payments and Financial Data"),
    paragraphs: [
      "Maboria does not store or control payment card details. Payment processing is handled by providers such as Paystack, Flutterwave, or Stripe under their own policies.",
    ],
  },
  {
    title: duplicateEnglish("6. Sharing of Information"),
    paragraphs: [
      "We may share data with payment providers, messaging providers, e-invoicing providers, infrastructure partners, and service providers only as needed to operate, secure, support, or improve the platform.",
      "Maboria does not sell customer or user data for advertising.",
    ],
  },
  {
    title: duplicateEnglish("7. Retention"),
    paragraphs: [
      "We keep data only for as long as needed to provide the service, maintain records, meet legal obligations, and support security and dispute handling.",
      "If you erase a customer or account in-product, Maboria redacts active profile data and revokes credentials where practical, but invoice, payment, tax, security, and audit records may be retained when legally or operationally required.",
    ],
  },
  {
    title: duplicateEnglish("8. Security"),
    paragraphs: [
      "We use reasonable technical and organizational measures to protect data, but no system can be guaranteed to be completely secure.",
    ],
  },
  {
    title: duplicateEnglish("9. Your Rights"),
    bullets: [
      "export your account data from Settings",
      "correct profile data and erase your account where applicable",
      "apply customer-level contact opt-outs, processing restrictions, export, and erasure controls from the customer record",
      "contact support about privacy-related concerns that cannot be resolved in-product",
    ],
  },
  {
    title: duplicateEnglish("10. International Processing"),
    paragraphs: [
      "Because Maboria operates online, data may be processed in different jurisdictions depending on infrastructure, providers, support operations, and customer configuration.",
    ],
  },
  {
    title: duplicateEnglish("11. Changes and Contact"),
    paragraphs: [
      "We may update this Privacy Policy from time to time. For privacy requests, use Settings for account export or erasure, use customer records for customer-specific controls, or use the official support channels for issues that require manual review.",
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

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          <Text value="Privacy Policy" />
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
