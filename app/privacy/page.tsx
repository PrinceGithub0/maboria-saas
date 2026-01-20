import { LangText } from "@/components/ui/lang-text";

export default function PrivacyPage() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-6 py-12 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <h1 className="text-3xl font-semibold">{t("Privacy Policy", "Politique de confidentialite")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("Last updated: December 15, 2025", "Derniere mise a jour : 15 decembre 2025")}
      </p>

      <h2 className="text-xl font-semibold">{t("1. Introduction", "1. Introduction")}</h2>
      <p>
        {t(
          "This Privacy Policy explains how Maboria collects and uses information when you use our services. It applies to all users and visitors.",
          "Cette politique explique comment Maboria collecte et utilise les informations. Elle s applique a tous."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("2. Information We Collect", "2. Informations collectees")}</h2>
      <p>
        {t(
          "We collect account details (such as name, email, and business info), billing records, and usage data. We also process the content you submit for automations, invoices, messages, and workflows as needed to provide the service.",
          "Nous collectons les details du compte (nom, email, infos business), la facturation, et l usage. Nous traitons aussi vos contenus pour automatisations, factures, messages."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("3. How We Use Information", "3. Utilisation des informations")}</h2>
      <p>
        {t(
          "We use information to operate the platform, process payments, send notifications, maintain security, and improve features. We do not sell your personal data.",
          "Nous utilisons les infos pour operer la plateforme, traiter paiements, notifier, securiser et ameliorer. Nous ne vendons pas vos donnees."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("4. Sharing", "4. Partage")}</h2>
      <p>
        {t(
          "We share data only with trusted service providers that help us run the platform, such as payment processors, hosting providers, and email or AI services. These providers may access data only to perform services for us.",
          "Nous partageons les donnees seulement avec des partenaires de confiance (paiement, hebergement, email, IA). Ils accedent aux donnees uniquement pour fournir le service."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("5. Security", "5. Securite")}</h2>
      <p>
        {t(
          "We use reasonable safeguards such as encryption in transit, access controls, and monitoring. No system is perfect, but we work to protect your data.",
          "Nous utilisons des protections raisonnables (chiffrement en transit, controle d acces, monitoring). Aucun systeme n est parfait, mais nous protegeons vos donnees."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("6. Data Retention", "6. Conservation des donnees")}</h2>
      <p>
        {t(
          "We keep data only as long as needed for the service or as required by law. You can request deletion where applicable.",
          "Nous conservons les donnees seulement le temps necessaire ou requis par la loi. Vous pouvez demander la suppression."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("7. Your Choices", "7. Vos choix")}</h2>
      <p>
        {t(
          "You can access, update, or delete your account information in the app. If you need help with privacy requests, contact us and we will respond in a reasonable time.",
          "Vous pouvez acceder, mettre a jour ou supprimer vos infos. Pour les demandes de confidentialite, contactez-nous et nous repondrons rapidement."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("8. International Transfers", "8. Transferts internationaux")}</h2>
      <p>
        {t(
          "Your data may be processed in locations where we or our providers operate. We use reasonable safeguards to protect data where required.",
          "Vos donnees peuvent etre traitees la ou nous operons. Nous appliquons des garanties raisonnables."
        )}
      </p>

      <h2 className="text-xl font-semibold">{t("9. Contact", "9. Contact")}</h2>
      <p>
        {t("Email:", "Email :")} info@maboria.com
      </p>
    </div>
  );
}
