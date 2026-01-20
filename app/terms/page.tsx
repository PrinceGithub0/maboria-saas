import { LangText } from "@/components/ui/lang-text";

export default function TermsPage() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <h1 className="text-3xl font-semibold">{t("Terms of Service", "Conditions de service")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("Last updated: December 15, 2025", "Derniere mise a jour : 15 decembre 2025")}
      </p>

      <h2 className="text-xl font-semibold">{t("1. Introduction", "1. Introduction")}</h2>
      <p>
        {t(
          "Maboria is a subscription software platform for business automation, invoicing, subscriptions, payments, and AI-assisted workflows. These Terms apply to anyone who accesses or uses the Maboria website or services.",
          "Maboria est une plateforme par abonnement pour automatisation, facturation, paiements et workflows IA. Ces conditions s appliquent a tous les utilisateurs."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("2. Account & Access", "2. Compte & acces")}</h2>
      <p>
        {t(
          "You are responsible for your account details, passwords, and any activity under your account. If you invite team members, you are responsible for their access and actions. Please keep your login secure and use two-factor authentication if available.",
          "Vous etes responsable de vos identifiants et activites. Si vous invitez des membres, vous repondez de leurs actions. Gardez vos acces securises et utilisez la 2FA si disponible."
        )}
      </p>
      <p>
        {t(
          "You agree to use the service only for lawful business purposes and not to abuse, disrupt, or attempt to access other accounts or systems.",
          "Vous acceptez d utiliser le service pour des activites legales et de ne pas abuser ou tenter d acceder a d autres comptes."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("3. Subscriptions & Payments", "3. Abonnements & paiements")}</h2>
      <p>
        {t(
          "Maboria offers paid plans with usage limits. Payments are processed by Flutterwave and Paystack in supported currencies. Billing is in advance and subscriptions auto-renew unless you cancel before the next billing date.",
          "Maboria propose des plans payants avec limites d usage. Paiements via Flutterwave et Paystack selon monnaies prises en charge. Facturation d avance et renouvellement automatique sauf annulation."
        )}
      </p>
      <p>
        {t(
          "Trials may be offered for a limited period. If a trial is started, it will convert to a paid subscription unless cancelled. Refunds are handled fairly on a case-by-case basis and where required by law.",
          "Des essais peuvent etre proposes pour une periode limitee. L essai passe en abonnement payant sauf annulation. Les remboursements sont traites au cas par cas et selon la loi."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("4. AI Features", "4. Fonctions IA")}</h2>
      <p>
        {t(
          "AI features generate suggestions and outputs based on your inputs and data. AI outputs may be incomplete or incorrect, and you remain responsible for decisions made using AI results.",
          "Les fonctions IA generent des suggestions selon vos donnees. Les resultats peuvent etre incomplets ou incorrects, et vous restez responsable des decisions."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("5. Data & Privacy", "5. Donnees & confidentialite")}</h2>
      <p>
        {t(
          "You own your business data. We use your data only to provide and improve the service, and we do not sell your data. Please review the Privacy Policy for details.",
          "Vous restez proprietaire de vos donnees. Nous les utilisons pour fournir et ameliorer le service et nous ne vendons pas vos donnees. Voir la Politique de confidentialite."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("6. Availability & Changes", "6. Disponibilite & changements")}</h2>
      <p>
        {t(
          "We aim to keep the service available and reliable, but outages and maintenance can happen. We may change or improve features over time and will provide reasonable notice when changes are significant.",
          "Nous visons la fiabilite mais des pannes peuvent survenir. Nous pouvons faire evoluer les fonctions et informerons raisonnablement en cas de changement important."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("7. Termination", "7. Resiliation")}</h2>
      <p>
        {t(
          "You can cancel your subscription at any time in your dashboard. We may suspend or restrict access only for abuse, fraud, security concerns, or legal requirements, and we will try to notify you when possible.",
          "Vous pouvez annuler a tout moment. Nous pouvons suspendre l acces en cas d abus, fraude, securite ou obligation legale, avec notification si possible."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("8. Liability Disclaimer", "8. Limitation de responsabilite")}</h2>
      <p>
        {t(
          "The service is provided on an \"as-is\" basis. We are not responsible for indirect, incidental, or consequential losses, to the extent permitted by applicable law.",
          "Le service est fourni en l etat. Nous ne sommes pas responsables des pertes indirectes, accessoires ou consecutives, selon la loi applicable."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("9. Governing Law", "9. Droit applicable")}</h2>
      <p>
        {t(
          "These Terms are governed by applicable laws. Any disputes will be handled by courts that have proper jurisdiction under those laws.",
          "Ces conditions sont regies par les lois applicables. Les litiges seront traites par les tribunaux competents."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("10. Contact", "10. Contact")}</h2>
      <p>{t("Email: info@maboria.com", "Email : info@maboria.com")}</p>
    </div>
  );
}
