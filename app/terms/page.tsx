import { LangText } from "@/components/ui/lang-text";
import { resolveLocalizedText, type LocalizedText } from "@/lib/i18n";

type TermsSection = {
  title: string | LocalizedText;
  paragraphs?: Array<string | LocalizedText>;
  bullets?: Array<string | LocalizedText>;
};

const sections: TermsSection[] = [
  {
    title: duplicateEnglish("1. Introduction"),
    paragraphs: [
      'These Terms of Service ("Terms") govern your access to and use of the Maboria platform and related services. By using Maboria, you agree to these Terms.',
      "Maboria is a revenue automation platform for invoicing, payment collection workflows, WhatsApp communication, automation, and reporting.",
    ],
  },
  {
    title: duplicateEnglish("2. Eligibility"),
    paragraphs: [
      "You may use Maboria only if you have the legal capacity and authority to accept these Terms for yourself or for the business you represent.",
    ],
  },
  {
    title: duplicateEnglish("3. Accounts and Responsibility"),
    paragraphs: [
      "You are responsible for keeping your credentials secure and for all activity performed through your account.",
    ],
    bullets: [
      "keep login details accurate and up to date",
      "notify support if you suspect unauthorized access",
      "use the privacy and customer compliance controls made available in-product where relevant",
    ],
  },
  {
    title: duplicateEnglish("4. What Maboria Provides"),
    paragraphs: [
      "Maboria provides tools that may include invoicing, payment-link generation, payment status updates, receipts, WhatsApp messaging, automation workflows, team access, reporting, and e-invoicing integrations.",
    ],
  },
  {
    title: duplicateEnglish("5. Payments and Money Handling"),
    paragraphs: [
      "Maboria does not hold, store, process, or control customer funds. Payments are processed by third-party providers such as Paystack, Flutterwave, or Stripe and settle directly to the account you configure with that provider.",
    ],
  },
  {
    title: duplicateEnglish("6. Disputes, Refunds, and Settlement"),
    paragraphs: [
      "Disputes, chargebacks, failed payments, refunds, and settlement delays relating to customer payments are handled by the payment provider and the relevant bank. Maboria is not responsible for resolving those matters.",
    ],
  },
  {
    title: duplicateEnglish("7. Third-Party Services"),
    paragraphs: [
      "Your use of payment, messaging, hosting, e-invoicing, mail, or other integrated third-party services is subject to those providers' own terms, policies, and fees.",
    ],
  },
  {
    title: duplicateEnglish("8. Messaging and Customer Compliance"),
    paragraphs: [
      "You are responsible for ensuring that your customer communications comply with applicable law, consent requirements, and the rules of WhatsApp and other messaging providers.",
      "Maboria may enforce customer-level opt-outs, processing restrictions, and delivery blocks based on the customer record, but you remain responsible for lawful basis, consent capture, and the content you send.",
    ],
  },
  {
    title: duplicateEnglish("9. Automation and AI Features"),
    paragraphs: [
      "Automation and AI features assist with configuration, message drafting, summarization, and workflow execution. You remain responsible for reviewing output and deciding how the tools are used.",
    ],
  },
  {
    title: duplicateEnglish("10. Teams, Logs, and Reports"),
    paragraphs: [
      "Maboria may provide team roles, activity logs, audit records, exports, and reports to support operational visibility and account administration.",
    ],
  },
  {
    title: duplicateEnglish("11. Acceptable Use and Safety"),
    paragraphs: [
      "You may not use Maboria for illegal activity, abuse, harmful conduct, platform misuse, or actions that put other users, customers, or providers at risk.",
    ],
  },
  {
    title: duplicateEnglish("12. Plans and Billing"),
    paragraphs: [
      "Access to features depends on your subscription plan. Limits may apply based on invoices, team members, automation usage, messaging volume, or other consumption metrics.",
    ],
  },
  {
    title: duplicateEnglish("13. Data and Privacy"),
    paragraphs: [
      "You retain ownership of your business data. We process data only as needed to provide, maintain, secure, and improve the service. More detail is available in the Privacy Policy.",
      "Self-service account export and account erasure may be available in Settings. Customer-specific export, opt-out, processing restriction, and erasure controls may be available from the customer record. Some invoice, payment, tax, security, and audit records may be retained when required by law or for platform integrity.",
    ],
  },
  {
    title: duplicateEnglish("14. Intellectual Property"),
    paragraphs: [
      "Maboria, its software, design, branding, and related materials are owned by Maboria or its licensors. Except as allowed by law, you may not copy, resell, or reverse engineer the service.",
    ],
  },
  {
    title: duplicateEnglish("15. Service Availability"),
    paragraphs: [
      "We aim to keep the platform reliable, but access may be affected by maintenance, updates, outages, or events outside our control.",
    ],
  },
  {
    title: duplicateEnglish("16. Liability"),
    paragraphs: [
      "To the maximum extent permitted by law, Maboria is not liable for indirect, incidental, or consequential losses, or for losses caused by third-party providers. Our total liability will not exceed the fees paid to Maboria for the period directly preceding the claim, unless mandatory law requires otherwise.",
    ],
  },
  {
    title: duplicateEnglish("17. Suspension and Termination"),
    paragraphs: [
      "You may stop using Maboria at any time. We may suspend or terminate access if required by law, for misuse, security reasons, repeated payment failure, or verified abuse of messaging and automation features.",
    ],
  },
  {
    title: duplicateEnglish("18. Changes to These Terms"),
    paragraphs: [
      "We may update these Terms from time to time. Continued use of Maboria after the updated Terms take effect means you accept the revised version.",
    ],
  },
  {
    title: duplicateEnglish("19. Contact"),
    paragraphs: [
      "Questions about these Terms may be sent through the official support channels listed on the Maboria website or inside the product.",
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

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          <Text value="Terms of Service" />
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
