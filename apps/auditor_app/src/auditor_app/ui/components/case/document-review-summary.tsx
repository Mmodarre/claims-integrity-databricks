import { FileCheck2, FileScan, Sparkles } from "lucide-react";

import { useGetClaimReview, useGetClaimReviewSuspense } from "@/lib/api";
import selector from "@/lib/selector";
import { formatAud, formatDateTime, humanize, reviewOutcomeMeta, TONE } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

/** Compact "Documents reviewed" pill for the case header (non-suspense, shares the review query cache). */
export function DocumentsReceivedBadge({ claimId }: { claimId: string }) {
  const { data } = useGetClaimReview({
    params: { claim_id: claimId },
    query: { select: (d) => d.data, retry: false },
  });
  if (data?.status !== "received") return null;
  const meta = reviewOutcomeMeta(data.summary?.review_outcome);
  return (
    <Badge variant="outline" className={meta.tone}>
      <FileCheck2 className="mr-1 h-3 w-3" />
      {data.documents?.length ?? 0} scans reviewed · {meta.label}
    </Badge>
  );
}

function narrativeItems(text: string): { kind: string; body: string }[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean)
    .map((l) => {
      const [kind, ...rest] = l.split("|");
      return rest.length ? { kind: kind.trim(), body: rest.join("|").trim() } : { kind: "", body: l };
    });
}

const KIND_TONE: Record<string, string> = {
  DISCREPANCY: TONE.red,
  "NEEDS INFORMATION": TONE.amber,
  NEEDS_INFORMATION: TONE.amber,
  SUPPORTED: TONE.green,
};

/** gold.claim_document_review: the AI's per-claim roll-up of the scanned-document checks. */
export function DocumentReviewSummary({ claimId }: { claimId: string }) {
  const { data } = useGetClaimReviewSuspense({ params: { claim_id: claimId }, ...selector() });
  const s = data.summary;
  if (!s) return null;
  const meta = reviewOutcomeMeta(s.review_outcome);
  const items = s.findings_narrative ? narrativeItems(s.findings_narrative) : [];
  const gaps = s.information_gaps ?? [];

  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileScan className="h-5 w-5 text-primary" />
            AI document review
          </CardTitle>
          <Badge variant="outline" className={meta.tone}>
            {meta.label}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {s.documents_received ?? 0} scan(s) parsed with ai_parse_document, checked by SQL rules and ai_query
          {s.reviewed_at ? ` · ${formatDateTime(s.reviewed_at)}` : ""}
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Identified recovery</p>
            <p className="mt-1 text-lg font-semibold">{formatAud(s.identified_recovery_aud)}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Discrepancies</p>
            <p className="mt-1 text-lg font-semibold text-destructive">{s.discrepancy_count ?? 0}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Needs info</p>
            <p className="mt-1 text-lg font-semibold text-amber-600 dark:text-amber-400">
              {s.needs_information_count ?? 0}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Supported</p>
            <p className="mt-1 text-lg font-semibold text-emerald-600 dark:text-emerald-400">
              {s.supported_count ?? 0}
            </p>
          </div>
        </div>

        {items.length > 0 && (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">Findings narrative</p>
            <ul className="space-y-2">
              {items.map((it, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed">
                  {it.kind ? (
                    <Badge variant="outline" className={`mt-0.5 shrink-0 ${KIND_TONE[it.kind.toUpperCase()] ?? TONE.muted}`}>
                      {humanize(it.kind)}
                    </Badge>
                  ) : null}
                  <span>{it.body}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {gaps.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-muted-foreground">Information gaps</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {gaps.map((g, i) => (
                <li key={i}>{g}</li>
              ))}
            </ul>
          </div>
        )}

        <Accordion type="multiple" className="rounded-md border px-3">
          {s.operative_note_assessment || s.operative_note_ai_summary ? (
            <AccordionItem value="op">
              <AccordionTrigger className="text-sm">Operative note</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm leading-relaxed">
                {s.operative_note_assessment && <p>{s.operative_note_assessment}</p>}
                {s.operative_note_ai_summary && (
                  <p className="text-muted-foreground">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    ai_summarize: {s.operative_note_ai_summary}
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ) : null}
          {s.discharge_summary_assessment || s.discharge_summary_ai_summary ? (
            <AccordionItem value="dc" className="border-b-0">
              <AccordionTrigger className="text-sm">Discharge summary</AccordionTrigger>
              <AccordionContent className="space-y-3 text-sm leading-relaxed">
                {s.discharge_summary_assessment && <p>{s.discharge_summary_assessment}</p>}
                {s.discharge_summary_ai_summary && (
                  <p className="text-muted-foreground">
                    <Sparkles className="mr-1 inline h-3 w-3" />
                    ai_summarize: {s.discharge_summary_ai_summary}
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          ) : null}
        </Accordion>
      </CardContent>
    </Card>
  );
}
