import Link from "next/link";
import { cookies } from "next/headers";
import { getLocalizedText, normalizeLanguage } from "@/lib/i18n";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function InvoicePaymentErrorPage({ searchParams }: PageProps) {
  const cookieStore = await cookies();
  const language = normalizeLanguage(cookieStore.get("maboria_language")?.value);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const rawReason = resolvedSearchParams?.reason;
  const reason = typeof rawReason === "string" ? rawReason : Array.isArray(rawReason) ? rawReason[0] : "";
  const copy =
    reason === "invalid_token"
      ? {
          title: getLocalizedText(
            {
              en: "Invalid payment link",
              fr: "Lien de paiement invalide",
              de: "Ungültiger Zahlungslink",
              es: "Enlace de pago no valido",
              pt: "Link de pagamento invalido",
            },
            language
          ),
          body: getLocalizedText(
            {
              en: "This payment link is invalid. Please use the latest invoice link from the sender.",
              fr: "Ce lien de paiement est invalide. Veuillez utiliser le dernier lien de facture envoy? par l'exp?diteur.",
              de: "Dieser Zahlungslink ist ungültig. Bitte verwende den neuesten Rechnungslink des Absenders.",
              es: "Este enlace de pago no es valido. Usa el Último enlace de factura del emisor.",
              pt: "Este link de pagamento e invalido. Utilize o link de fatura mais recente enviado pelo remetente.",
            },
            language
          ),
        }
      : reason === "invoice_not_found"
        ? {
            title: getLocalizedText(
              {
                en: "Invoice not found",
                fr: "Facture introuvable",
                de: "Rechnung nicht gefunden",
                es: "Factura no encontrada",
                pt: "Fatura não encontrada",
              },
              language
            ),
            body: getLocalizedText(
              {
                en: "This invoice could not be found. Please contact the sender for a new payment link.",
                fr: "Cette facture est introuvable. Veuillez contacter l'exp?diteur pour obtenir un nouveau lien de paiement.",
                de: "Diese Rechnung wurde nicht gefunden. Bitte kontaktiere den Absender für einen neuen Zahlungslink.",
                es: "No se encontró esta factura. Contacta con el emisor para obtener un nuevo enlace de pago.",
                pt: "Não foi possível encontrar esta fatura. Contacte o remetente para obter um novo link de pagamento.",
            },
            language
          ),
        }
        : reason === "invoice_link_expired"
          ? {
              title: getLocalizedText(
                {
                  en: "Payment link expired",
                  fr: "Lien de paiement expiré",
                  de: "Zahlungslink abgelaufen",
                  es: "Enlace de pago vencido",
                  pt: "Link de pagamento expirado",
                },
                language
              ),
              body: getLocalizedText(
                {
                  en: "This invoice link has expired. Please request a fresh invoice link from the sender.",
                  fr: "Ce lien de facture a expiré. Veuillez demander un nouveau lien à l'expéditeur.",
                  de: "Dieser Rechnungslink ist abgelaufen. Bitte fordere einen neuen Link vom Absender an.",
                  es: "Este enlace de factura ha vencido. Solicita un enlace nuevo al emisor.",
                  pt: "Este link de fatura expirou. Solicite um novo link ao remetente.",
                },
                language
              ),
            }
        : {
            title: getLocalizedText(
              {
                en: "Payment unavailable",
                fr: "Paiement indisponible",
                de: "Zahlung nicht verfügbar",
                es: "Pago no disponible",
                pt: "Pagamento indisponível",
              },
              language
            ),
            body: getLocalizedText(
              {
                en: "This payment link is not available right now. Please request a fresh invoice link from the sender.",
                fr: "Ce lien de paiement n'est pas disponible pour le moment. Veuillez demander un nouveau lien de facture \u00e0 l'exp\u00e9diteur.",
                de: "Dieser Zahlungslink ist derzeit nicht verfügbar. Bitte fordere einen neuen Rechnungslink vom Absender an.",
                es: "Este enlace de pago no est? disponible en este momento. Solicita un nuevo enlace de factura al emisor.",
                pt: "Este link de pagamento não esta disponível neste momento. Solicite um novo link de fatura ao remetente.",
              },
              language
            ),
          };

  return (
    <div className="mx-auto max-w-2xl px-6 py-16">
      <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-indigo-600">
          {getLocalizedText(
            {
              en: "Invoice Payment",
              fr: "Paiement de facture",
              de: "Rechnungszahlung",
              es: "Pago de factura",
              pt: "Pagamento de fatura",
            },
            language
          )}
        </p>
        <h1 className="mt-4 text-3xl font-semibold text-foreground">{copy.title}</h1>
        <p className="mt-3 text-sm leading-7 text-muted-foreground">{copy.body}</p>
        <div className="mt-8">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500"
          >
            {getLocalizedText(
              {
                en: "Return Home",
                fr: "Retour \u00e0 l'accueil",
                de: "Zur Startseite",
                es: "Volver al inicio",
                pt: "Voltar ao inicio",
              },
              language
            )}
          </Link>
        </div>
      </div>
    </div>
  );
}
