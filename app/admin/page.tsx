import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Table } from "@/components/ui/table";
import { MiniAreaChart } from "@/components/charts/area-chart";
import { formatCurrency } from "@/lib/currency";
import { Badge } from "@/components/ui/badge";
import { cookies } from "next/headers";
import { formatDateDMY, formatDateTimeDMY } from "@/lib/date";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }
  const cookieStore = cookies();
  const resolvedCookies =
    typeof (cookieStore as any)?.then === "function" ? await (cookieStore as any) : cookieStore;
  const languageCookie =
    typeof resolvedCookies?.get === "function"
      ? resolvedCookies.get("maboria_language")?.value
      : undefined;
  const language = languageCookie === "fr" ? "fr" : "en";
  const t = (en: string, fr: string) => (language === "fr" ? fr : en);

  const now = Date.now();
  const last24h = new Date(now - 24 * 60 * 60 * 1000);
  const last7d = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const last30d = new Date(now - 30 * 24 * 60 * 60 * 1000);

  const [
    users,
    payments,
    runs,
    tickets,
    revenueByCurrency,
    activeSubs,
    userCount,
    newUsers7d,
    aiMemories,
    failed30,
    openTickets,
    pendingRuns,
    webhookFailures24h,
    rateLimitHits24h,
    payments30d,
    recentActivity,
    recentWebhooks,
  ] = await Promise.all([
    prisma.user.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.payment.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.automationRun.findMany({ take: 5, orderBy: { createdAt: "desc" }, include: { flow: true } }),
    prisma.supportTicket.findMany({ take: 5, orderBy: { createdAt: "desc" } }),
    prisma.payment.groupBy({ by: ["currency"], _sum: { amount: true } }),
    prisma.subscription.count({ where: { status: "ACTIVE" } }),
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gt: last7d } } }),
    prisma.aiMemory.count(),
    prisma.payment.count({ where: { status: "FAILED", createdAt: { gt: last30d } } }),
    prisma.supportTicket.count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } }),
    prisma.automationRun.count({ where: { runStatus: { in: ["PENDING", "RUNNING"] } } }),
    prisma.webhookEvent.count({ where: { status: "FAILED", receivedAt: { gt: last24h } } }),
    prisma.rateLimitLog.count({ where: { createdAt: { gt: last24h } } }),
    prisma.payment.findMany({
      where: { createdAt: { gt: last30d } },
      select: { amount: true, amountUsd: true, createdAt: true },
    }),
    prisma.activityLog.findMany({
      take: 6,
      orderBy: { timestamp: "desc" },
      include: { user: { select: { email: true } } },
    }),
    prisma.webhookEvent.findMany({ take: 5, orderBy: { receivedAt: "desc" } }),
  ]);
  const totalUsers = userCount;
  const numberFormat = new Intl.NumberFormat("en-US");
  const trendBuckets = Array.from({ length: 4 }, (_, idx) => ({ name: `W${idx + 1}`, value: 0 }));
  const actionLabels: Record<string, { en: string; fr: string }> = {
    INVOICE_CREATED: { en: "Invoice created", fr: "Facture creee" },
    INVOICE_SENT: { en: "Invoice sent", fr: "Facture envoyee" },
    INVOICE_PAID: { en: "Invoice paid", fr: "Facture payee" },
    INVOICE_UPDATED: { en: "Invoice updated", fr: "Facture mise a jour" },
    INVOICE_DELETED: { en: "Invoice deleted", fr: "Facture supprimee" },
    SUBSCRIPTION_CREATED: { en: "Subscription started", fr: "Abonnement demarre" },
    SUBSCRIPTION_UPDATED: { en: "Subscription updated", fr: "Abonnement mis a jour" },
    SUBSCRIPTION_CANCELED: { en: "Subscription cancelled", fr: "Abonnement annule" },
    ADMIN_SUBSCRIPTION_CANCELED: { en: "Subscription cancelled by admin", fr: "Abonnement annule par admin" },
    PLAN_INTENT: { en: "Plan selection", fr: "Choix de plan" },
    USER_SIGNIN: { en: "Signed in", fr: "Connexion" },
    USER_SIGNOUT: { en: "Signed out", fr: "Deconnexion" },
    PROFILE_UPDATED: { en: "Profile updated", fr: "Profil mis a jour" },
    PASSWORD_UPDATED: { en: "Password updated", fr: "Mot de passe mis a jour" },
    BUSINESS_PROFILE_CREATED: { en: "Business profile created", fr: "Profil entreprise cree" },
    BUSINESS_PROFILE_UPDATED: { en: "Business profile updated", fr: "Profil entreprise mis a jour" },
    AUTOMATION_CREATED: { en: "Automation created", fr: "Automatisation creee" },
    AUTOMATION_RUN: { en: "Automation run", fr: "Execution automatisation" },
    AI_ASSISTANT_USED: { en: "AI assistant used", fr: "Assistant IA utilise" },
    AI_CALL: { en: "AI call", fr: "Appel IA" },
    AI_INSIGHT: { en: "AI insight generated", fr: "Analyse IA generee" },
    AI_FEEDBACK: { en: "AI feedback sent", fr: "Retour IA envoye" },
    USAGE_LIMIT_EXCEEDED: { en: "Usage limit reached", fr: "Limite d usage atteinte" },
    SUPPORT_STATUS: { en: "Support ticket updated", fr: "Ticket support mis a jour" },
    ANNOUNCEMENT_PAYSTACK_DISMISSED: { en: "Paystack notice dismissed", fr: "Alerte Paystack fermee" },
    ADMIN_FLAG_UPDATE: { en: "Admin flag update", fr: "Mise a jour drapeau admin" },
    ADMIN_IMPERSONATE: { en: "Admin impersonation", fr: "Impersonation admin" },
    ADMIN_TOGGLE_USER: { en: "User access updated", fr: "Acces utilisateur mis a jour" },
    ADMIN_SUB_OVERRIDE: { en: "Subscription override", fr: "Override abonnement" },
    ROLE_UPDATED: { en: "User role updated", fr: "Role utilisateur mis a jour" },
    ADMIN_AUTOMATION_REPLAY: { en: "Automation replayed", fr: "Rejouer automatisation" },
    ADMIN_RESET_PASSWORD: { en: "Password reset", fr: "Reinitialisation mot de passe" },
    ADMIN_WEBHOOK_RESOLVE: { en: "Webhook resolved", fr: "Webhook resolu" },
    ADMIN_WEBHOOK_REPLAY: { en: "Webhook replayed", fr: "Webhook rejoue" },
    ADMIN_WEBHOOK_ARCHIVE: { en: "Webhook archived", fr: "Webhook archive" },
    WEBHOOK_PROCESSED: { en: "Webhook processed", fr: "Webhook traite" },
    WEBHOOK_FAILED: { en: "Webhook failed", fr: "Webhook echoue" },
    PAYSTACK_INVOICE: { en: "Paystack invoice event", fr: "Evenement facture Paystack" },
    ONBOARDING_COMPLETE: { en: "Onboarding complete", fr: "Onboarding termine" },
    prelaunch_log_check: { en: "Prelaunch check", fr: "Verification prelaunch" },
    prelaunch_email_sent: { en: "Prelaunch email sent", fr: "Email prelaunch envoye" },
    prelaunch_email_failed: { en: "Prelaunch email failed", fr: "Email prelaunch echoue" },
  };
  const statusLabels: Record<string, { en: string; fr: string }> = {
    SUCCESS: { en: "Success", fr: "Succes" },
    FAILED: { en: "Failed", fr: "Echec" },
    PENDING: { en: "Pending", fr: "En attente" },
    RUNNING: { en: "Running", fr: "En cours" },
    OPEN: { en: "Open", fr: "Ouvert" },
    IN_PROGRESS: { en: "In progress", fr: "En cours" },
    RESOLVED: { en: "Resolved", fr: "Resolue" },
    CLOSED: { en: "Closed", fr: "Ferme" },
    ACTIVE: { en: "Active", fr: "Actif" },
    CANCELED: { en: "Canceled", fr: "Annule" },
    CANCELLED: { en: "Cancelled", fr: "Annule" },
  };

  payments30d.forEach((payment) => {
    const amount = Number(payment.amountUsd ?? payment.amount ?? 0);
    const diffDays = Math.max(0, Math.floor((payment.createdAt.getTime() - last30d.getTime()) / 86400000));
    const bucket = Math.min(trendBuckets.length - 1, Math.floor(diffDays / 7));
    trendBuckets[bucket].value += amount;
  });

  const riskSignals = [
    {
      label: t("Webhook failures (24h)", "Echecs webhooks (24h)"),
      value: webhookFailures24h,
      note: t("Payment sync issues to review.", "Problemes de sync paiement a verifier."),
      variant: webhookFailures24h ? "danger" : "success",
    },
    {
      label: t("Open support tickets", "Tickets support ouverts"),
      value: openTickets,
      note: t("Awaiting response or action.", "En attente de reponse/action."),
      variant: openTickets ? "warning" : "success",
    },
    {
      label: t("Pending automations", "Automatisations en attente"),
      value: pendingRuns,
      note: t("Runs waiting to execute.", "Executions en attente."),
      variant: pendingRuns ? "warning" : "success",
    },
    {
      label: t("Rate limit hits (24h)", "Limite de taux (24h)"),
      value: rateLimitHits24h,
      note: t("Potential abuse or spikes.", "Potentiel abus ou pics."),
      variant: rateLimitHits24h ? "warning" : "success",
    },
  ];

  return (
    <div className="space-y-8 px-6 py-6 max-md:px-4 max-md:py-4 max-md:space-y-7">
      <div className="md:contents max-md:rounded-[28px] max-md:border max-md:border-border/60 max-md:bg-card max-md:p-4 max-md:shadow-[0_16px_36px_rgba(15,23,42,0.18)]">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-300">{t("Admin", "Admin")}</p>
            <h1 className="text-3xl font-semibold text-foreground">{t("Executive control center", "Centre de controle executif")}</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("Revenue, risk, and operational signals across the platform.", "Revenus, risque et signaux operationnels sur la plateforme.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/logs">
              <Button size="sm" variant="secondary">{t("System logs", "Journaux systeme")}</Button>
            </Link>
            <Link href="/api/payments/receipt/preview" prefetch={false}>
              <Button size="sm" variant="secondary">{t("Preview receipt", "Apercu recu")}</Button>
            </Link>
            <Link href="/admin/users">
              <Button size="sm" variant="secondary">{t("Manage users", "Gerer utilisateurs")}</Button>
            </Link>
            <Link href="/admin/automation/errors">
              <Button size="sm" variant="secondary">{t("Automation errors", "Erreurs automatisation")}</Button>
            </Link>
            <Link href="/admin/prelaunch">
              <Button size="sm">{t("Pre-launch check", "Controle pre-lancement")}</Button>
            </Link>
          </div>
        </div>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{t("Executive summary", "Resume executif")}</p>
            <h2 className="text-lg font-semibold text-foreground">{t("Platform pulse", "Pulse plateforme")}</h2>
          </div>
          <Badge variant="success">{t("Healthy", "Sain")}</Badge>
        </div>
        <div className="grid gap-4 md:grid-cols-3 max-md:grid-cols-1 max-md:gap-5">
          <Card title={t("Total revenue", "Revenu total")}>
            {revenueByCurrency.length ? (
              <div className="space-y-1">
                {revenueByCurrency.map((row) => (
                  <p key={row.currency} className="text-2xl font-semibold text-foreground">
                    {formatCurrency(Number(row._sum.amount || 0), row.currency)}
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-2xl font-semibold text-foreground">--</p>
            )}
            <p className="text-xs text-muted-foreground">{t("Flutterwave + Paystack", "Flutterwave + Paystack")}</p>
          </Card>
          <Card title={t("Active subscriptions", "Abonnements actifs")}>
            <p className="text-3xl font-semibold text-foreground">{numberFormat.format(activeSubs)}</p>
          </Card>
          <Card title={t("New users (7d)", "Nouveaux utilisateurs (7j)")}>
            <p className="text-3xl font-semibold text-foreground">{numberFormat.format(newUsers7d)}</p>
            <p className="text-xs text-muted-foreground">{t(`${numberFormat.format(totalUsers)} total users`, `${numberFormat.format(totalUsers)} utilisateurs totaux`)}</p>
          </Card>
          <Card title={t("Automation errors", "Erreurs automatisation")}>
            <p className="text-3xl font-semibold text-rose-600 dark:text-rose-200">
              {runs.filter((r) => r.runStatus === "FAILED").length}
            </p>
            <p className="text-xs text-muted-foreground">{t("Last 5 runs", "Derniers 5 runs")}</p>
          </Card>
          <Card title={t("AI assistant messages", "Messages assistant IA")}>
            <p className="text-3xl font-semibold text-foreground">{numberFormat.format(aiMemories)}</p>
            <p className="text-xs text-muted-foreground">{t("Stored interactions", "Interactions stockees")}</p>
          </Card>
          <Card title={t("Failed payments (30d)", "Paiements echoues (30j)")}>
            <p className="text-3xl font-semibold text-rose-600 dark:text-rose-200">{numberFormat.format(failed30)}</p>
            <p className="text-xs text-muted-foreground">{t("Churn risk watch", "Risque churn")}</p>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-[1.3fr_1fr] max-md:grid-cols-1 max-md:gap-5">
        <Card title={t("Revenue trend (USD equiv)", "Tendance revenus (USD eq.)")}>
          <MiniAreaChart data={trendBuckets} />
        </Card>
        <Card title={t("Risk signals", "Signaux de risque")}>
          <div className="space-y-3">
            {riskSignals.map((signal) => (
              <div
                key={signal.label}
                className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/40 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-foreground">{signal.label}</p>
                  <p className="text-xs text-muted-foreground">{signal.note}</p>
                </div>
                <Badge variant={signal.variant as "success" | "warning" | "danger"}>
                  {numberFormat.format(signal.value)}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3 max-md:grid-cols-1 max-md:gap-5">
        <Card title={t("Latest users", "Derniers utilisateurs")}>
          <Table
            data={users}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "name", label: t("Name", "Nom") },
              { key: "email", label: t("Email", "Email") },
              { key: "role", label: t("Role", "Role") },
            ]}
          />
        </Card>
        <Card
          title={t("Recent payments", "Paiements recents")}
          actions={
            <Link href="/api/payments/receipt/preview" prefetch={false}>
              <Button size="sm" variant="secondary">{t("Preview latest receipt", "Apercu dernier recu")}</Button>
            </Link>
          }
        >
          <Table
            data={payments}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "provider", label: t("Provider", "Fournisseur") },
              {
                key: "currency",
                label: t("Currency", "Devise"),
                render: (row) => String(row.currency || "").toUpperCase(),
              },
              {
                key: "amount",
                label: t("Amount", "Montant"),
                render: (row) => formatCurrency(Number(row.amount || 0), row.currency),
              },
            ]}
          />
        </Card>
        <Card title={t("Recent activity", "Activite recente")}>
          <div className="space-y-3">
            {recentActivity.map((log) => (
              <div key={log.id} className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-foreground">
                    {t(actionLabels[log.action]?.en ?? log.action, actionLabels[log.action]?.fr ?? log.action)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTimeDMY(new Date(log.timestamp))}
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{log.user?.email || t("System", "Systeme")}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
        <Card title={t("Recent runs", "Runs recents")}>
          <Table
            data={runs}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "flow", label: t("Flow", "Flux"), render: (row: any) => row.flow?.title },
              {
                key: "runStatus",
                label: t("Status", "Statut"),
                render: (row: any) =>
                  t(
                    statusLabels[String(row.runStatus)]?.en ?? String(row.runStatus),
                    statusLabels[String(row.runStatus)]?.fr ?? String(row.runStatus)
                  ),
              },
              { key: "createdAt", label: t("Created", "Cree"), render: (row) => formatDateTimeDMY(new Date(row.createdAt)) },
            ]}
          />
        </Card>
        <Card title={t("Support tickets", "Tickets support")}>
          <Table
            data={tickets}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "title", label: t("Title", "Titre") },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) =>
                  t(
                    statusLabels[String(row.status)]?.en ?? String(row.status),
                    statusLabels[String(row.status)]?.fr ?? String(row.status)
                  ),
              },
              { key: "createdAt", label: t("Created", "Cree"), render: (row) => formatDateDMY(new Date(row.createdAt)) },
            ]}
          />
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-2 max-md:grid-cols-1 max-md:gap-5">
        <Card title={t("Webhook timeline", "Timeline webhooks")}>
          <Table
            data={recentWebhooks}
            keyExtractor={(row) => row.id}
            columns={[
              { key: "provider", label: t("Provider", "Fournisseur"), render: (row: any) => row.provider },
              {
                key: "status",
                label: t("Status", "Statut"),
                render: (row: any) =>
                  t(
                    statusLabels[String(row.status)]?.en ?? String(row.status),
                    statusLabels[String(row.status)]?.fr ?? String(row.status)
                  ),
              },
              { key: "eventId", label: t("Event", "Evenement") },
              {
                key: "receivedAt",
                label: t("Received", "Recu"),
                render: (row: any) => formatDateTimeDMY(new Date(row.receivedAt)),
              },
            ]}
          />
        </Card>
        <Card title={t("Support overview", "Apercu support")}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Open tickets", "Tickets ouverts")}</p>
              <p className="text-2xl font-semibold text-foreground">{numberFormat.format(openTickets)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Recent signups", "Inscriptions recentes")}</p>
              <p className="text-2xl font-semibold text-foreground">{numberFormat.format(newUsers7d)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Active subs", "Abos actifs")}</p>
              <p className="text-2xl font-semibold text-foreground">{numberFormat.format(activeSubs)}</p>
            </div>
            <div className="rounded-xl border border-border/70 bg-muted/40 p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Total users", "Utilisateurs totaux")}</p>
              <p className="text-2xl font-semibold text-foreground">{numberFormat.format(totalUsers)}</p>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
