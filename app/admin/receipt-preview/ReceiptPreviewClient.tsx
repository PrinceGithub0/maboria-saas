"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLanguage } from "@/components/providers/language-provider";
import { localizeAdminServerMessage } from "@/lib/admin/localization";
import type { CompleteLocalizedText } from "@/lib/i18n";

const text = (en: string, fr: string, de: string, es: string, pt: string): CompleteLocalizedText => ({ en, fr, de, es, pt });

const DOCUMENT_OPTIONS = [
  { value: "subscription_receipt", label: text("Subscription Receipt", "Recu d'abonnement", "Abonnementbeleg", "Recibo de suscripción", "Recibo de subscrição") },
  { value: "customer_invoice", label: text("Customer Invoice", "Facture client", "Kundenrechnung", "Factura del cliente", "Fatura do cliente") },
  { value: "payment_receipt", label: text("Payment Receipt", "Recu de paiement", "Zahlungsbeleg", "Recibo de pago", "Recibo de pagamento") },
] as const;

const PREVIEW_MODES = [
  { value: "template", label: text("Template Layout", "Mise en page du modele", "Vorlagenlayout", "Diseno de plantilla", "Esquema do modelo") },
  { value: "real", label: text("Real Transaction Example", "Exemple de transaction reelle", "Beispiel einer echten Transaktion", "Ejemplo de transaccion real", "Exemplo de transacao real") },
] as const;

type DocumentType = (typeof DOCUMENT_OPTIONS)[number]["value"];
type PreviewMode = (typeof PREVIEW_MODES)[number]["value"];
type ExampleItem = { id: string; label: string };
type ExamplesResponse = { items: ExampleItem[] };

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { cache: "no-store" });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(String((json as { error?: string }).error || `Request failed (${response.status})`));
  }
  return json as T;
};

const buildPreviewUrl = (input: {
  type: DocumentType;
  mode: PreviewMode;
  exampleId?: string;
  download?: boolean;
}) => {
  const params = new URLSearchParams({
    type: input.type,
    mode: input.mode,
  });
  if (input.mode === "real" && input.exampleId) {
    params.set("id", input.exampleId);
  }
  if (input.download) {
    params.set("download", "1");
  }
  return `/api/admin/receipt-preview/document?${params.toString()}`;
};

export default function ReceiptPreviewClient() {
  const { language, t } = useLanguage();
  const [documentType, setDocumentType] = useState<DocumentType>("subscription_receipt");
  const [mode, setMode] = useState<PreviewMode>("template");
  const [selectedExampleId, setSelectedExampleId] = useState("");
  const [iframeFailed, setIframeFailed] = useState(false);
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  const shouldLoadExamples = mode === "real";
  const {
    data: examplesResponse,
    error: examplesError,
    isLoading: examplesLoading,
  } = useSWR<ExamplesResponse>(
    shouldLoadExamples ? `/api/admin/receipt-preview/examples?type=${documentType}` : null,
    fetcher
  );

  const examples = useMemo(() => examplesResponse?.items ?? [], [examplesResponse?.items]);

  useEffect(() => {
    if (mode !== "real") {
      setSelectedExampleId("");
      return;
    }
    if (!examples.length) {
      setSelectedExampleId("");
      return;
    }
    if (!selectedExampleId || !examples.some((item) => item.id === selectedExampleId)) {
      setSelectedExampleId(examples[0].id);
    }
  }, [examples, mode, selectedExampleId]);

  useEffect(() => {
    setIframeFailed(false);
  }, [documentType, mode, selectedExampleId]);

  const canRenderPreview = mode === "template" || Boolean(selectedExampleId);
  const previewUrl = useMemo(
    () =>
      buildPreviewUrl({
        type: documentType,
        mode,
        exampleId: selectedExampleId,
      }),
    [documentType, mode, selectedExampleId]
  );
  const downloadUrl = useMemo(
    () =>
      buildPreviewUrl({
        type: documentType,
        mode,
        exampleId: selectedExampleId,
        download: true,
      }),
    [documentType, mode, selectedExampleId]
  );

  const openPreview = () => {
    if (!canRenderPreview) return;
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  };

  const downloadPreview = () => {
    if (!canRenderPreview) return;
    window.open(downloadUrl, "_blank", "noopener,noreferrer");
  };

  const handleFrameLoad = () => {
    const frame = previewFrameRef.current;
    if (!frame) return;
    try {
      const href = frame.contentWindow?.location?.href || "";
      if (
        href.startsWith("about:neterror") ||
        href.startsWith("about:blank") ||
        href.startsWith("moz-extension://") ||
        href.includes("blocked")
      ) {
        setIframeFailed(true);
      }
    } catch {
      // Browsers can switch to an internal error document that is not accessible.
      setIframeFailed(true);
    }
  };

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold text-foreground">
          {t(text("Document Templates", "Modeles de documents", "Dokumentvorlagen", "Plantillas de documentos", "Modelos de documentos"))}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            text(
              "Preview financial documents generated by the platform.",
              "Previsualisez les documents financiers generes par la plateforme.",
              "Vorschau auf Finanzdokumente, die von der Plattform erstellt werden.",
              "Previsualiza los documentos financieros generados por la plataforma.",
              "Previsualize os documentos financeiros gerados pela plataforma."
            )
          )}
        </p>
      </header>

      <Card className="space-y-4 p-4">
        <div
          className={`grid gap-3 ${
            mode === "real" ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >
          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(text("Document Type", "Type de document", "Dokumenttyp", "Tipo de documento", "Tipo de documento"))}
            </span>
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as DocumentType)}
              className="h-10 w-full min-w-0 rounded-md border border-border/70 bg-background px-3 pr-8 text-sm"
            >
              {DOCUMENT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.label)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid min-w-0 gap-1">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(text("Preview Mode", "Mode d apercu", "Vorschaumodus", "Modo de vista previa", "Modo de pre-visualizacao"))}
            </span>
            <div className="flex h-10 w-full min-w-0 items-center rounded-md border border-border/70 bg-background p-1">
              {PREVIEW_MODES.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMode(option.value)}
                  className={`rounded px-3 py-1 text-sm transition ${
                    mode === option.value
                      ? "bg-indigo-600 text-white"
                      : "text-muted-foreground hover:bg-muted/60"
                  }`}
                >
                  {t(option.label)}
                </button>
              ))}
            </div>
          </label>

          {mode === "real" ? (
            <label className="grid min-w-0 gap-1">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {t(text("Example Document", "Document d'exemple", "Beispieldokument", "Documento de ejemplo", "Documento de exemplo"))}
              </span>
              <select
                value={selectedExampleId}
                onChange={(event) => setSelectedExampleId(event.target.value)}
                disabled={examplesLoading || examples.length === 0}
                className="h-10 w-full min-w-0 rounded-md border border-border/70 bg-background px-3 pr-8 text-sm disabled:cursor-not-allowed disabled:opacity-60"
              >
                {examplesLoading ? <option value="">{t("Loading examples...", "Chargement des exemples...", "Beispiele werden geladen...", "Cargando ejemplos...", "A carregar exemplos...")}</option> : null}
                {!examplesLoading && !examples.length ? <option value="">{t("No documents available", "Aucun document disponible", "Keine Dokumente verfügbar", "No hay documentos disponibles", "Nenhum documento disponível")}</option> : null}
                {examples.length
                  ? examples.map((example) => (
                      <option key={example.id} value={example.id}>
                        {example.label}
                      </option>
                    ))
                  : null}
              </select>
            </label>
          ) : null}

        </div>

        {examplesError ? (
          <Alert variant="error">
            {localizeAdminServerMessage(
              examplesError.message,
              language,
              t(
                text(
                  "Unable to load receipt examples right now.",
                  "Impossible de charger les exemples de recus pour le moment.",
                  "Belegbeispiele koennen derzeit nicht geladen werden.",
                  "No se pueden cargar los ejemplos de recibos en este momento.",
                  "Nao foi possivel carregar os exemplos de recibos neste momento."
                )
              )
            )}
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-end">
          <Button
            size="sm"
            onClick={openPreview}
            disabled={!canRenderPreview}
            className="w-full sm:w-auto"
          >
            {t(text("Open Preview", "Ouvrir l apercu", "Vorschau oeffnen", "Abrir vista previa", "Abrir pre-visualizacao"))}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={downloadPreview}
            disabled={!canRenderPreview}
            className="w-full sm:w-auto"
          >
            {t(text("Download PDF", "Télécharger le PDF", "PDF herunterladen", "Descargar PDF", "Descarregar PDF"))}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {t(text("Template Preview", "Apercu du modele", "Vorlagenvorschau", "Vista previa de plantilla", "Pre-visualizacao do modelo"))}
        </p>

        {!canRenderPreview ? (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
            {t(
              text(
                "Select an example document to render a real preview.",
                "Selectionnez un document d exemple pour afficher un apercu reel.",
                "Waehle ein Beispieldokument aus, um eine echte Vorschau anzuzeigen.",
                "Selecciona un documento de ejemplo para mostrar una vista previa real.",
                "Selecione um documento de exemplo para mostrar uma pre-visualizacao real."
              )
            )}
          </div>
        ) : iframeFailed ? (
          <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4">
            <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-border/70 bg-background text-sm text-muted-foreground">
              {t(text("PDF Document Placeholder", "Espace reserve au document PDF", "PDF-Dokumentplatzhalter", "Marcador del documento PDF", "Espaco reservado para o documento PDF"))}
            </div>
            <p className="text-sm text-muted-foreground">
              {t(
                text(
                  "PDF preview is not embedded due to browser security restrictions.",
                  "L apercu PDF n est pas integre en raison des restrictions de securite du navigateur.",
                  "Die PDF-Vorschau ist wegen Sicherheitsbeschrankungen des Browsers nicht eingebettet.",
                  "La vista previa del PDF no esta incrustada por restricciones de seguridad del navegador.",
                  "A pre-visualizacao do PDF nao esta incorporada devido a restricoes de seguranca do navegador."
                )
              )}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={openPreview}>
                {t(text("Open PDF in new tab", "Ouvrir le PDF dans un nouvel onglet", "PDF in neuem Tab öffnen", "Abrir PDF en una nueva pestana", "Abrir PDF num novo separador"))}
              </Button>
              <Button size="sm" variant="secondary" onClick={downloadPreview}>
                {t(text("Download PDF", "Télécharger le PDF", "PDF herunterladen", "Descargar PDF", "Descarregar PDF"))}
              </Button>
            </div>
          </div>
        ) : (
          <iframe
            ref={previewFrameRef}
            title={t(text("Receipt preview", "Apercu du recu", "Belegvorschau", "Vista previa del recibo", "Pre-visualizacao do recibo"))}
            src={previewUrl}
            className="h-[760px] w-full rounded-lg border border-border/70 bg-background"
            onLoad={handleFrameLoad}
            onError={() => setIframeFailed(true)}
          />
        )}
      </Card>
    </div>
  );
}
