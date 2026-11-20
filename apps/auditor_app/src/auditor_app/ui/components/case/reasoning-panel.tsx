import { AlertTriangle, Bot, CheckCircle2, FileText, ShieldAlert } from "lucide-react";

import { useGetTriageSuspense } from "@/lib/api";
import selector from "@/lib/selector";
import { formatAud, formatPct, formatScore, humanize, recommendationVariant } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { RequestDocumentDialog } from "./request-document-dialog";

/** AI triage verdict (gold.claim_triage, synced to Lakebase): claim data only, before documents. */
export function ReasoningPanel({ claimId }: { claimId: string }) {
  const { data } = useGetTriageSuspense({ params: { claim_id: claimId }, ...selector() });

  if (!data) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-muted-foreground" />
            AI triage
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
          <ShieldAlert className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Not ML-flagged</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            This claim entered review because scanned documents were received, not because the fraud model flagged
            it. See the document review for the AI&apos;s findings.
          </p>
        </CardContent>
      </Card>
    );
  }

  const signals = data.key_signals ?? [];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-5 w-5 text-primary" />
            AI triage
          </CardTitle>
          {data.recommendation && (
            <Badge variant={recommendationVariant(data.recommendation)}>{humanize(data.recommendation)}</Badge>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {data.is_integrity_issue === true && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <ShieldAlert className="h-4 w-4" /> Integrity issue suspected
            </span>
          )}
          {data.is_integrity_issue === false && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Likely clean
            </span>
          )}
          {data.discrepancy_type && data.discrepancy_type !== "none" && (
            <Badge variant="outline">{humanize(data.discrepancy_type)}</Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {data.triage_error && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <p className="font-medium text-destructive">Triage error</p>
              <p className="text-muted-foreground">{data.triage_error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Confidence</p>
            <p className="mt-1 text-lg font-semibold">{formatPct(data.confidence)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Est. impact</p>
            <p className="mt-1 text-lg font-semibold">{formatAud(data.est_impact_aud)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Document to request</p>
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-medium">
              {data.doc_to_request && data.doc_to_request !== "none" ? (
                <>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  {humanize(data.doc_to_request)}
                </>
              ) : (
                "None"
              )}
            </p>
          </div>
        </div>

        {data.doc_to_request && data.doc_to_request !== "none" && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/30 p-3">
            <p className="text-sm text-muted-foreground">Request supporting documentation from the hospital.</p>
            <RequestDocumentDialog
              claimId={claimId}
              docType={data.doc_to_request}
              discrepancyType={data.discrepancy_type}
              reason={data.reasoning}
            />
          </div>
        )}

        {signals.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Key signals</p>
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
              {signals.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        {data.reasoning && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Reasoning</p>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{data.reasoning}</p>
          </div>
        )}

        <Separator />

        <div className="space-y-1 rounded-md bg-muted/50 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Upstream ML flag</p>
          <p className="text-sm">
            <span className="font-mono">{formatScore(data.ml_fraud_score)}</span>
            {data.ml_flag_reason ? ` — ${data.ml_flag_reason}` : ""}
          </p>
          {data.triage_model && (
            <p className="text-xs text-muted-foreground">
              Triage by <span className="font-mono">{data.triage_model}</span> (ai_query)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
