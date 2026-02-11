import { LangText } from "@/components/ui/lang-text";

export default function PrivacyPage() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          {t("Privacy Policy", "Politique de confidentialite")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Last updated: February 2026", "Derniere mise a jour : fevrier 2026")}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Introduction", "Introduction")}</h2>
        <p>
          {t(
            "This Privacy Policy describes how Maboria collects, uses, and protects personal data when users access the platform and services.",
            "Cette Politique de confidentialite decrit comment Maboria collecte, utilise et protege les donnees personnelles lorsque les utilisateurs accedent a la plateforme et aux services."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Information We Collect", "Informations que nous collectons")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("Account and business information", "Informations de compte et d entreprise")}</li>
          <li>{t("Contact details such as phone numbers", "Coordonnees telles que numeros de telephone")}</li>
          <li>{t("Invoice and transaction metadata (amounts, status, timestamps - not card data)", "Metadonnees de factures et transactions (montants, statut, horodatages - pas de donnees de carte)")}</li>
          <li>{t("Automation activity logs and usage analytics", "Journaux d activite d automatisation et analytique d usage")}</li>
          <li>{t("Subscription and billing records", "Dossiers d abonnement et de facturation")}</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("How We Use Information", "Comment nous utilisons les informations")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("Provide and operate the Maboria platform", "Fournir et exploiter la plateforme Maboria")}</li>
          <li>{t("Send WhatsApp messages and notifications", "Envoyer des messages et notifications WhatsApp")}</li>
          <li>{t("Run automations and workflows", "Executer des automatisations et des workflows")}</li>
          <li>{t("Generate reports and logs", "Generer des rapports et des journaux")}</li>
          <li>{t("Improve reliability, security, and performance", "Ameliorer la fiabilite, la securite et la performance")}</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("WhatsApp Messaging and Communication", "Messagerie WhatsApp et communication")}</h2>
        <p>
          {t(
            "WhatsApp is Maboria's native communication channel. Messages are sent only based on user actions or automation rules. Message content is processed only to deliver and log communication.",
            "WhatsApp est le canal de communication natif de Maboria. Les messages sont envoyes uniquement selon les actions de l utilisateur ou des regles d automatisation. Le contenu des messages est traite uniquement pour livrer et journaliser la communication."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Payments and Financial Data", "Paiements et donnees financieres")}</h2>
        <p>
          {t(
            "Maboria does not process, store, or control payment card details. Payments are handled by Paystack or Flutterwave. Financial disputes and settlements are managed by those providers.",
            "Maboria ne traite, ne stocke ni ne controle les details de carte de paiement. Les paiements sont geres par Paystack ou Flutterwave. Les litiges financiers et les reglements sont geres par ces prestataires."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("How We Share Information", "Comment nous partageons les informations")}</h2>
        <p>{t("We may share data only with:", "Nous pouvons partager des donnees uniquement avec :")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("Payment providers (Paystack, Flutterwave)", "Prestataires de paiement (Paystack, Flutterwave)")}</li>
          <li>{t("WhatsApp / Meta for message delivery", "WhatsApp / Meta pour la livraison des messages")}</li>
          <li>{t("Infrastructure and hosting providers", "Prestataires d infrastructure et d hebergement")}</li>
        </ul>
        <p>
          {t(
            "Maboria does not sell user data and does not use customer data for advertising.",
            "Maboria ne vend pas les donnees des utilisateurs et n utilise pas les donnees des clients pour la publicite."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Data Retention", "Conservation des donnees")}</h2>
        <p>
          {t(
            "We retain data only as long as necessary to provide the service, comply with legal obligations, and maintain operational records.",
            "Nous conservons les donnees uniquement le temps necessaire pour fournir le service, respecter les obligations legales et maintenir les dossiers operationnels."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Security Measures", "Mesures de securite")}</h2>
        <p>
          {t(
            "We use reasonable technical and organizational measures to protect data, but no system is completely secure.",
            "Nous utilisons des mesures techniques et organisationnelles raisonnables pour proteger les donnees, mais aucun systeme n est totalement securise."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("User Rights", "Droits des utilisateurs")}</h2>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("Access their data", "Acceder a leurs donnees")}</li>
          <li>{t("Request corrections", "Demander des corrections")}</li>
          <li>{t("Request deletion where applicable", "Demander la suppression lorsque cela est applicable")}</li>
          <li>{t("Contact support for privacy-related questions", "Contacter le support pour les questions de confidentialite")}</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("International Use", "Utilisation internationale")}</h2>
        <p>
          {t(
            "Users may access Maboria globally, and data may be processed in different regions depending on infrastructure.",
            "Les utilisateurs peuvent acceder a Maboria dans le monde entier, et les donnees peuvent etre traitees dans differentes regions selon l infrastructure."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Changes to This Policy", "Modifications de cette politique")}</h2>
        <p>
          {t(
            "We may update this Privacy Policy from time to time. Continued use of Maboria after updates take effect means you accept the revised policy.",
            "Nous pouvons mettre a jour cette Politique de confidentialite de temps a autre. La poursuite de l utilisation de Maboria apres l entree en vigueur des mises a jour signifie que vous acceptez la politique revisee."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("Contact Information", "Coordonnees")}</h2>
        <p>
          {t(
            "For privacy-related concerns, contact Maboria through the official support channels listed on the website.",
            "Pour les questions de confidentialite, contactez Maboria via les canaux de support officiels indiques sur le site."
          )}
        </p>
      </section>

      <p className="text-sm text-muted-foreground">
        {t(
          "This Privacy Policy applies to all use of Maboria.",
          "Cette Politique de confidentialite s applique a toute utilisation de Maboria."
        )}
      </p>
    </div>
  );
}
