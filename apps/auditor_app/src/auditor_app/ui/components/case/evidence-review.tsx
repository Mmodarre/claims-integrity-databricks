import { useMemo, useState } from "react";
import { FileWarning, ScanSearch } from "lucide-react";

import { useGetClaimReviewSuspense, useGetClaimWorkflowSuspense } from "@/lib/api";
import type { DecisionOut, FindingOut } from "@/lib/api";
import selector from "@/lib/selector";
import { formatAud, formatPct, humanize } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DocumentViewer } from "./document-viewer";
import type { EvidenceBox } from "./document-viewer";
import { FindingCard } from "./finding-card";

const TONE_BY_OUTCOME: Record<string, EvidenceBox["tone"]> = {
  discrepancy: "red",
  needs_information: "amber",
  supported: "green",
};

function firstFocus(findings: FindingOut[]): FindingOut | undefined {
  return findings.find((f) => f.outcome !== "supported" && f.evidence_bbox) ?? findings.find((f) => f.evidence_bbox);
}

/**
 * Evidence workbench: the AI's per-finding verdicts next to the scanned document, with the
 * quoted evidence highlighted on the scan, and the auditor's decision per finding (written
 * to Lakebase).
 */
export function EvidenceReview({ claimId }: { claimId: string }) {
  const { data: review } = useGetClaimReviewSuspense({ params: { claim_id: claimId }, ...selector() });
  const { data: wf } = useGetClaimWorkflowSuspense({ params: { claim_id: claimId }, ...selector() });

  const documents = review.documents ?? [];
  const findings = review.findings ?? [];
  const initial = firstFocus(findings);
  const [selected, setSelected] = useState<string | null>(initial?.finding_id ?? null);
  const [docId, setDocId] = useState<string | null>(initial?.document_id ?? documents[0]?.document_id ?? null);

  const decisions = useMemo(() => {
    const m: Record<string, DecisionOut> = {};
    for (const d of wf.finding_decisions ?? []) if (d.finding_id) m[d.finding_id] = d;
    return m;
  }, [wf.finding_decisions]);

  if (review.status !== "received" || documents.length === 0) return null;

  const doc = documents.find((d) => d.document_id === docId) ?? documents[0];
  const boxes: EvidenceBox[] = findings
    .filter((f) => f.document_id === doc.document_id && f.evidence_bbox)
    .map((f) => ({
      key: f.finding_id,
      bbox: f.evidence_bbox!,
      tone: TONE_BY_OUTCOME[f.outcome ?? ""] ?? "amber",
      label: f.evidence_quote ?? f.discrepancy_title ?? undefined,
    }));

  const select = (f: FindingOut) => {
    setSelected(f.finding_id);
    if (f.document_id && documents.some((d) => d.document_id === f.document_id)) setDocId(f.document_id);
  };

  const countFor = (documentId: string) => findings.filter((f) => f.document_id === documentId).length;

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ScanSearch className="h-5 w-5 text-primary" />
            Evidence review
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="outline">
              {wf.actionable_decided}/{wf.actionable_findings} actionable findings decided
            </Badge>
            {wf.confirmed_recovery_aud ? (
              <Badge variant="outline" className="font-semibold">
                {formatAud(wf.confirmed_recovery_aud)} confirmed
              </Badge>
            ) : null}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Select a finding to highlight its quoted evidence on the scan. Each decision is written to Lakebase and
          streamed to Unity Catalog by Lakehouse Sync.
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            {findings.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <FileWarning className="h-6 w-6" />
                No findings were produced for these documents.
              </div>
            ) : (
              findings.map((f) => (
                <FindingCard
                  key={f.finding_id}
                  claimId={claimId}
                  finding={f}
                  decision={decisions[f.finding_id]}
                  selected={selected === f.finding_id}
                  onSelect={() => select(f)}
                />
              ))
            )}
          </div>

          <div className="space-y-3 lg:sticky lg:top-20 lg:self-start">
            <Tabs value={doc.document_id} onValueChange={setDocId}>
              <TabsList className="w-full">
                {documents.map((d) => (
                  <TabsTrigger key={d.document_id} value={d.document_id} className="flex-1">
                    {humanize(d.document_type)}
                    {countFor(d.document_id) > 0 ? (
                      <span className="ml-1.5 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                        {countFor(d.document_id)}
                      </span>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <DocumentViewer
              doc={doc}
              boxes={boxes}
              focusKey={selected}
              onBoxClick={(key) => {
                const f = findings.find((x) => x.finding_id === key);
                if (f) select(f);
              }}
            />
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                Parse confidence {formatPct(doc.avg_element_confidence)} · {doc.element_count ?? 0} elements
              </span>
              <span>
                Type check:{" "}
                {doc.type_check_passed ? "passed" : `classified as ${humanize(doc.classified_document_type)}`}
              </span>
              <span>Extraction confidence {formatPct(doc.avg_field_confidence)}</span>
              {doc.has_signature != null && <span>Signature {doc.has_signature ? "present" : "missing"}</span>}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
