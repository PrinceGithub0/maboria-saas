import Link from "next/link";
import { LangText } from "@/components/ui/lang-text";
import { resolveLocalizedText, type LocalizedText } from "@/lib/i18n";

type Section = {
  title: string | LocalizedText;
  paragraphs?: Array<string | LocalizedText>;
  bullets?: Array<string | LocalizedText>;
};

const sections: Section[] = [
  {
    title: duplicateEnglish("1. DPA Requests"),
    paragraphs: [
      "If your organization requires a Data Processing Agreement, use the official Maboria support or sales channel to request current processing terms.",
    ],
  },
  {
    title: duplicateEnglish("2. What to Include"),
    bullets: [
      "Your company name and billing workspace",
      "Primary privacy or legal contact",
      "Any jurisdiction-specific addendum requirements",
      "Whether you also need current subprocessor information",
    ],
  },
  {
    title: duplicateEnglish("3. Product Controls Already Available"),
    bullets: [
      "Self-service account export and account erasure where applicable",
      "Customer-level export, opt-out, processing restriction, and erasure controls",
      "Audit and activity records for operational accountability",
      "Credential revocation for supported mailbox and e-invoicing integrations",
    ],
  },
  {
    title: duplicateEnglish("4. Notes"),
    paragraphs: [
      "Availability of specific terms can depend on plan, region, feature set, and the integrations enabled for your workspace.",
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

export default function DpaPage() {
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          <Text value="DPA Requests" />
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

      <p className="text-sm text-muted-foreground">
        <Text value="You can also review the current provider categories on the Subprocessors page." />{" "}
        <Link href="/subprocessors" className="font-medium text-foreground underline underline-offset-4">
          <Text value="View Subprocessors" />
        </Link>
      </p>
    </div>
  );
}
