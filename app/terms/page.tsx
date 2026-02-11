import { LangText } from "@/components/ui/lang-text";

export default function TermsPage() {
  const t = (en: string, fr: string) => <LangText en={en} fr={fr} />;
  return (
    <div className="mx-auto max-w-[900px] space-y-10 px-6 py-14 text-foreground max-md:mx-0 max-md:w-full max-md:max-w-none">
      <div className="space-y-2">
        <h1 className="text-3xl font-semibold md:text-4xl">
          {t("Terms of Service", "Conditions de service")}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t("Last updated: February 2026", "Derniere mise a jour : fevrier 2026")}
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("1. Introduction", "1. Introduction")}</h2>
        <p>
          {t(
            "These Terms of Service (\"Terms\") govern your access to and use of the Maboria platform and services (\"Maboria\", \"we\", \"our\", or \"us\"). By using Maboria, you agree to these Terms.",
            "Les presentes Conditions de service (\"Conditions\") regissent votre acces et votre utilisation de la plateforme et des services Maboria (\"Maboria\", \"nous\", \"notre\" ou \"nos\"). En utilisant Maboria, vous acceptez ces Conditions."
          )}
        </p>
        <p>
          {t(
            "Maboria is a revenue automation platform that helps businesses manage invoicing, payment collection workflows, WhatsApp communication, automation, reporting, and operational visibility from a single dashboard.",
            "Maboria est une plateforme d automatisation des revenus qui aide les entreprises a gerer la facturation, les flux de collecte des paiements, la communication WhatsApp, l automatisation, les rapports et la visibilite operationnelle depuis un tableau de bord unique."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("2. Who Can Use Maboria", "2. Qui peut utiliser Maboria")}</h2>
        <p>
          {t(
            "You may use Maboria if you have the legal capacity and authority to enter into these Terms, either on your own behalf or on behalf of a business or organization. If you use Maboria for a company, you confirm that you are authorized to act for that business.",
            "Vous pouvez utiliser Maboria si vous avez la capacite juridique et l autorite necessaires pour accepter ces Conditions, en votre nom ou au nom d une entreprise ou organisation. Si vous utilisez Maboria pour une societe, vous confirmez etre autorise a agir pour cette entreprise."
          )}
        </p>
        <p>
          {t(
            "You are responsible for ensuring that your use of Maboria complies with applicable laws in your country or region.",
            "Vous etes responsable de vous assurer que votre utilisation de Maboria respecte les lois applicables dans votre pays ou region."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("3. Accounts and Responsibility", "3. Comptes et responsabilite")}</h2>
        <p>{t("You are responsible for:", "Vous etes responsable de :")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("keeping your login credentials secure", "proteger vos identifiants de connexion")}</li>
          <li>{t("all activity that occurs under your account", "toute activite effectuee via votre compte")}</li>
          <li>{t("ensuring that the information you provide is accurate and up to date", "vous assurer que les informations fournies sont exactes et a jour")}</li>
        </ul>
        <p>
          {t(
            "If you believe your account has been accessed without permission, you should contact support as soon as possible.",
            "Si vous pensez que votre compte a ete utilise sans autorisation, vous devez contacter le support des que possible."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("4. What Maboria Provides", "4. Ce que Maboria fournit")}</h2>
        <p>{t("Maboria provides tools that may include:", "Maboria fournit des outils pouvant inclure :")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("creating and managing invoices", "la creation et la gestion de factures")}</li>
          <li>{t("generating payment links through supported payment providers", "la generation de liens de paiement via des prestataires pris en charge")}</li>
          <li>{t("detecting payment events and updating invoice status", "la detection des paiements et la mise a jour des statuts de facture")}</li>
          <li>{t("generating receipts where enabled", "la generation de recus lorsque cette option est activee")}</li>
          <li>{t("sending and automating WhatsApp messages", "l envoi et l automatisation de messages WhatsApp")}</li>
          <li>{t("automation workflows and reporting", "les workflows d automatisation et les rapports")}</li>
          <li>{t("team access, activity logs, and usage analytics", "l acces d equipe, les journaux d activite et l analytique d usage")}</li>
          <li>{t("AI features that assist with messaging and workflow setup", "des fonctionnalites IA qui assistent la messagerie et la configuration des workflows")}</li>
        </ul>
        <p>{t("You control how these tools are used and how you communicate with your customers.", "Vous controlez la maniere dont ces outils sont utilises et la facon dont vous communiquez avec vos clients.")}</p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("5. Payments, Sub-Accounts, and Money Handling", "5. Paiements, sous-comptes et gestion des fonds")}</h2>
        <p>{t("Maboria does not hold, store, process, or control customer funds.", "Maboria ne detient, ne stocke, ne traite ni ne controle les fonds des clients.")}</p>
        <p>
          {t(
            "All customer payments are processed by third-party payment providers such as Paystack or Flutterwave. When a customer pays an invoice, funds are settled directly into your connected business account or sub-account configured with the payment provider.",
            "Tous les paiements clients sont traites par des prestataires tiers tels que Paystack ou Flutterwave. Lorsqu un client paie une facture, les fonds sont verses directement sur votre compte professionnel ou sous-compte connecte configure auprès du prestataire."
          )}
        </p>
        <p>
          {t(
            "Maborias role is limited to detecting payment status and running the automations you configure, such as updating invoice status, generating receipts, sending WhatsApp notifications, triggering follow-ups, and generating reports.",
            "Le role de Maboria se limite a detecter le statut de paiement et a executer les automatisations que vous configurez, telles que la mise a jour du statut des factures, la generation de recus, l envoi de notifications WhatsApp, le declenchement de relances et la generation de rapports."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("6. Disputes, Refunds, and Settlement Issues", "6. Litiges, remboursements et reglements")}</h2>
        <p>
          {t(
            "Disputes, chargebacks, refunds, failed payments, and settlement delays related to customer payments are handled by the payment provider (such as Paystack or Flutterwave) and the users bank, in accordance with the providers policies.",
            "Les litiges, retrofacturations, remboursements, paiements echoues et retards de reglement lies aux paiements clients sont geres par le prestataire de paiement (Paystack ou Flutterwave) et la banque de l utilisateur, conformement aux politiques du prestataire."
          )}
        </p>
        <p>
          {t(
            "Because Maboria does not handle or control customer funds, Maboria is not responsible for resolving payment disputes or settlement issues.",
            "Parce que Maboria ne gere ni ne controle les fonds des clients, Maboria n est pas responsable de la resolution des litiges ou des problemes de reglement."
          )}
        </p>
        <p>
          {t(
            "Where appropriate, Maboria may provide transaction references, logs, or operational information to help you raise or track a support request directly with the relevant payment provider.",
            "Le cas echeant, Maboria peut fournir des references de transaction, des journaux ou des informations operationnelles pour vous aider a soumettre ou suivre une demande directement auprès du prestataire de paiement concerne."
          )}
        </p>
        <p>
          {t(
            "Refunds or disputes related to Maboria subscription fees apply only to fees paid directly to Maboria and are handled separately.",
            "Les remboursements ou litiges lies aux frais d abonnement Maboria ne concernent que les frais payes directement a Maboria et sont traites separement."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("7. Third-Party Services", "7. Services tiers")}</h2>
        <p>
          {t(
            "Maboria integrates with third-party services, including payment and messaging providers. Your use of these services is subject to their own terms, policies, and fees.",
            "Maboria s integre a des services tiers, notamment des prestataires de paiement et de messagerie. Votre utilisation de ces services est soumise a leurs propres conditions, politiques et frais."
          )}
        </p>
        <p>
          {t(
            "Maboria is not responsible for outages, delays, or failures caused by third-party services.",
            "Maboria n est pas responsable des interruptions, retards ou defaillances causes par des services tiers."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("8. WhatsApp Messaging", "8. Messagerie WhatsApp")}</h2>
        <p>{t("Maboria allows you to send and automate WhatsApp messages to customers.", "Maboria vous permet d envoyer et d automatiser des messages WhatsApp a vos clients.")}</p>
        <p>{t("You are responsible for ensuring that:", "Vous etes responsable de vous assurer que :")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("you have the right to contact your customers", "vous avez le droit de contacter vos clients")}</li>
          <li>{t("your messages comply with applicable laws and consent requirements", "vos messages respectent les lois applicables et les exigences de consentement")}</li>
          <li>{t("your use follows WhatsApp and messaging provider policies", "votre utilisation respecte les politiques de WhatsApp et des prestataires de messagerie")}</li>
        </ul>
        <p>
          {t(
            "Maboria may limit or suspend messaging features in cases of misuse or repeated complaints.",
            "Maboria peut limiter ou suspendre les fonctionnalites de messagerie en cas d abus ou de plaintes repetees."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("9. Automation and AI Assistance", "9. Automatisation et assistance IA")}</h2>
        <p>{t("Automations run based on rules and configurations you define.", "Les automatisations s executent selon les regles et configurations que vous definissez.")}</p>
        <p>
          {t(
            "AI features assist by improving message wording, summarizing activity, and helping configure workflows. AI does not act independently and does not make decisions on your behalf.",
            "Les fonctionnalites IA assistent en ameliorant la formulation des messages, en resumant l activite et en aidant a configurer les workflows. L IA n agit pas de maniere independante et ne prend pas de decisions a votre place."
          )}
        </p>
        <p>
          {t(
            "You are responsible for reviewing automation behavior and AI-assisted content before relying on it.",
            "Vous etes responsable de verifier le comportement des automatisations et le contenu assiste par l IA avant de vous y fier."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("10. Teams, Logs, and Reports", "10. Equipes, journaux et rapports")}</h2>
        <p>
          {t(
            "Maboria supports team access with role-based permissions. Relevant actions such as invoice updates, payment events, and automation execution are logged for operational visibility.",
            "Maboria prend en charge l acces d equipe avec des permissions par role. Les actions pertinentes telles que les mises a jour de factures, les evenements de paiement et l execution des automatisations sont enregistrees pour la visibilite operationnelle."
          )}
        </p>
        <p>
          {t(
            "Where supported, reports and usage data may be exported, including CSV files.",
            "Lorsque cela est pris en charge, les rapports et les donnees d usage peuvent etre exportes, y compris en CSV."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("11. Fair Use and Platform Safety", "11. Usage loyal et securite de la plateforme")}</h2>
        <p>
          {t(
            "You agree not to use Maboria for illegal activity, harmful behavior, or misuse of messaging and automation features.",
            "Vous acceptez de ne pas utiliser Maboria pour des activites illegales, des comportements nuisibles ou un mauvais usage des fonctionnalites de messagerie et d automatisation."
          )}
        </p>
        <p>
          {t(
            "We may suspend or restrict access if necessary to protect the platform, other users, or comply with legal obligations.",
            "Nous pouvons suspendre ou restreindre l acces si necessaire pour proteger la plateforme, les autres utilisateurs ou respecter des obligations legales."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("12. Plans, Billing, and Subscriptions", "12. Plans, facturation et abonnements")}</h2>
        <p>
          {t(
            "Access to features depends on your subscription plan. Plan limits may apply based on usage, including invoice volume, WhatsApp usage, automation usage, AI usage, and number of team members.",
            "L acces aux fonctionnalites depend de votre plan d abonnement. Des limites peuvent s appliquer selon l usage, notamment le volume de factures, l utilisation WhatsApp, l utilisation des automatisations, l utilisation de l IA et le nombre de membres de l equipe."
          )}
        </p>
        <p>
          {t(
            "Billing terms and prices are shown at the time of purchase or within the product.",
            "Les conditions et tarifs de facturation sont indiques au moment de l achat ou dans le produit."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("13. Data and Privacy", "13. Donnees et confidentialite")}</h2>
        <p>
          {t(
            "You retain ownership of your business data. We process data only to provide and improve the service, maintain reliability, and support your use of the platform.",
            "Vous conservez la propriete de vos donnees professionnelles. Nous traitons les donnees uniquement pour fournir et ameliorer le service, maintenir la fiabilite et soutenir votre utilisation de la plateforme."
          )}
        </p>
        <p>
          {t(
            "Details about personal data handling are explained in our Privacy Policy.",
            "Les details concernant le traitement des donnees personnelles sont expliques dans notre Politique de confidentialite."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("14. Intellectual Property", "14. Propriete intellectuelle")}</h2>
        <p>
          {t(
            "Maboria and its software, design, and branding are owned by Maboria. You may use the platform during your subscription but may not copy, resell, or reverse engineer it.",
            "Maboria ainsi que son logiciel, son design et sa marque appartiennent a Maboria. Vous pouvez utiliser la plateforme pendant votre abonnement, mais vous ne pouvez pas la copier, la revendre ou la retro-concevoir."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("15. Service Availability", "15. Disponibilite du service")}</h2>
        <p>
          {t(
            "We aim to keep Maboria reliable, but access may occasionally be affected by maintenance, updates, or factors outside our control.",
            "Nous visons a maintenir Maboria fiable, mais l acces peut parfois etre affecte par la maintenance, des mises a jour ou des facteurs hors de notre controle."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("16. Limits of Liability", "16. Limites de responsabilite")}</h2>
        <p>{t("To the maximum extent permitted by law:", "Dans la mesure maximale permise par la loi :")}</p>
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>{t("Maboria is not responsible for indirect or consequential losses, including loss of revenue.", "Maboria n est pas responsable des pertes indirectes ou consequentes, y compris la perte de revenus.")}</li>
          <li>{t("Maboria is not responsible for losses caused by third-party providers.", "Maboria n est pas responsable des pertes causees par des prestataires tiers.")}</li>
          <li>{t("Our total liability will not exceed the fees you paid to Maboria in the twelve months before the claim arose.", "Notre responsabilite totale ne depassera pas les frais que vous avez payes a Maboria au cours des douze mois precedant la reclamation.")}</li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("17. Ending Your Use of Maboria", "17. Fin de l utilisation de Maboria")}</h2>
        <p>{t("You may stop using Maboria at any time.", "Vous pouvez arreter d utiliser Maboria a tout moment.")}</p>
        <p>
          {t(
            "We may suspend or terminate access if the service is misused, required by law, or if subscription payments fail repeatedly.",
            "Nous pouvons suspendre ou resilier l acces si le service est utilise de maniere abusive, si la loi l exige ou si les paiements d abonnement echouent de maniere repetee."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("18. Changes to These Terms", "18. Modifications des Conditions")}</h2>
        <p>
          {t(
            "We may update these Terms from time to time. Continued use of Maboria after updates take effect means you accept the revised Terms.",
            "Nous pouvons mettre a jour ces Conditions de temps a autre. La poursuite de l utilisation de Maboria apres l entree en vigueur des mises a jour signifie que vous acceptez les Conditions revisees."
          )}
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">{t("19. Contact", "19. Contact")}</h2>
        <p>
          {t(
            "Questions about these Terms can be sent through the official support channels listed on the Maboria website.",
            "Les questions concernant ces Conditions peuvent etre envoyees via les canaux de support officiels listes sur le site Maboria."
          )}
        </p>
      </section>
    </div>
  );
}
