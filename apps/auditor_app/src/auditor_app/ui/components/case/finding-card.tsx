import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bot, Database, Gavel, Loader2, Quote, ScanSearch, Undo2 } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  getClaimWorkflowKey,
  useClearFindingDecision,
  useRecordFindingDecision,
} from "@/lib/api";
import type { DecisionOut, FindingOut } from "@/lib/api";
import {
  DECISIONS,
  decisionMeta,
  findingOutcomeMeta,
  formatAud,
  formatDateTime,
  formatPct,
  humanize,
  TONE,
} from "@/lib/format";
import type { DecisionValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function errMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.body === "object" && error.body !== null) {
    return String((error.body as { detail?: unknown }).detail ?? error.message);
  }
  return error instanceof Error ? error.message : "Unexpected error";
}

function DecisionForm({
  claimId,
  finding,
  decision,
  onDone,
}: {
  claimId: string;
  finding: FindingOut;
  decision?: DecisionOut;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [choice, setChoice] = useState<DecisionValue | undefined>(decision?.decision);
  const [recovery, setRecovery] = useState<string>(
    decision?.confirmed_recovery_aud != null
      ? String(decision.confirmed_recovery_aud)
      : finding.recovery_aud != null
        ? String(finding.recovery_aud)
        : "",
  );
  const [note, setNote] = useState(decision?.note ?? "");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getClaimWorkflowKey({ claim_id: claimId }) });
    queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
  };

  const record = useRecordFindingDecision({
    mutation: {
      onSuccess: (res) => {
        const d = res.data;
        toast.success(`Decision saved: ${decisionMeta(d.decision)?.past ?? d.decision}`, {
          description: `Written to Lakebase auditor_decision (${d.decision_id.slice(0, 8)}…)`,
        });
        refresh();
        onDone();
      },
      onError: (e) => toast.error("Could not save the decision", { description: errMessage(e) }),
    },
  });
  const clear = useClearFindingDecision({
    mutation: {
      onSuccess: () => {
        toast.success("Decision cleared");
        refresh();
        onDone();
      },
      onError: (e) => toast.error("Could not clear the decision", { description: errMessage(e) }),
    },
  });

  const recoveryNum = recovery.trim() === "" ? null : Number(recovery);
  const recoveryInvalid = choice === "confirmed" && recoveryNum !== null && (Number.isNaN(recoveryNum) || recoveryNum < 0);
  const busy = record.isPending || clear.isPending;

  const save = () => {
    if (!choice) return;
    record.mutate({
      params: { claim_id: claimId, finding_id: finding.finding_id },
      data: {
        decision: choice,
        confirmed_recovery_aud: choice === "confirmed" ? recoveryNum : null,
        note: note.trim() || null,
      },
    });
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3" onClick={(e) => e.stopPropagation()}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {DECISIONS.map((d) => (
          <Button
            key={d.value}
            type="button"
            variant="outline"
            size="sm"
            className={cn(choice === d.value && cn("border-2", d.tone))}
            onClick={() => setChoice(d.value)}
          >
            {d.label}
          </Button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`rec-${finding.finding_id}`} className="text-xs text-muted-foreground">
            Confirmed recovery (AUD)
          </Label>
          <Input
            id={`rec-${finding.finding_id}`}
            inputMode="decimal"
            value={recovery}
            onChange={(e) => setRecovery(e.target.value)}
            disabled={choice !== "confirmed"}
            className={cn(recoveryInvalid && "border-destructive")}
          />
          <span className="text-[11px] text-muted-foreground">Only kept when confirming.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`note-${finding.finding_id}`} className="text-xs text-muted-foreground">
            Note
          </Label>
          <Textarea
            id={`note-${finding.finding_id}`}
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why you agree or disagree with the AI…"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {decision && (
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => clear.mutate({ params: { claim_id: claimId, finding_id: finding.finding_id } })}
          >
            <Undo2 className="h-4 w-4" /> Clear decision
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={!choice || recoveryInvalid || busy}>
          {record.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
          Save decision
        </Button>
      </div>
    </div>
  );
}

export function FindingCard({
  claimId,
  finding,
  decision,
  selected,
  onSelect,
}: {
  claimId: string;
  finding: FindingOut;
  decision?: DecisionOut;
  selected: boolean;
  onSelect: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const outcome = findingOutcomeMeta(finding.outcome);
  const dm = decisionMeta(decision?.decision);
  const hasEvidence = !!finding.evidence_bbox && !!finding.document_id;

  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" ? onSelect() : undefined)}
      className={cn(
        "space-y-3 rounded-lg border bg-card p-4 text-left transition-colors",
        selected ? "border-primary ring-2 ring-primary/20" : "hover:border-foreground/30",
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium leading-snug">{finding.discrepancy_title ?? humanize(finding.discrepancy_type)}</p>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="outline" className={outcome.tone}>
              {outcome.label}
            </Badge>
            <Badge variant="outline" className="gap-1">
              {finding.detection_method === "rule" ? <Database className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              {finding.detection_method === "rule" ? "SQL rule" : "LLM (ai_query)"}
            </Badge>
            <span className="text-xs text-muted-foreground">confidence {formatPct(finding.confidence)}</span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Recovery</p>
          <p className={cn("text-base font-semibold", (finding.recovery_aud ?? 0) > 0 && "text-destructive")}>
            {formatAud(finding.recovery_aud)}
          </p>
        </div>
      </div>

      {finding.billed_item_code && (
        <div className="rounded-md bg-muted/50 px-3 py-2 text-xs">
          <span className="font-medium">Line {finding.line_number ?? "—"}</span> ·{" "}
          <span className="font-mono">{finding.billed_item_code}</span> {finding.billed_item_description ?? ""}
          {finding.billed_quantity != null ? ` · qty ${finding.billed_quantity}` : ""} · benefit{" "}
          {formatAud(finding.billed_benefit_aud)}
          {finding.supported_fraction != null && finding.supported_fraction < 1 ? (
            <span className="text-muted-foreground"> · supported {formatPct(finding.supported_fraction)}</span>
          ) : null}
        </div>
      )}

      {finding.reasoning && <p className="text-sm leading-relaxed">{finding.reasoning}</p>}

      {finding.evidence_quote && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelect();
          }}
          className="flex w-full items-start gap-2 rounded-md border-l-4 border-primary/40 bg-muted/40 px-3 py-2 text-left text-sm italic hover:bg-muted"
          title={hasEvidence ? "Show in document" : undefined}
        >
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <span className="flex-1">“{finding.evidence_quote}”</span>
          {hasEvidence && (
            <span className="inline-flex shrink-0 items-center gap-1 text-xs not-italic text-muted-foreground">
              <ScanSearch className="h-3.5 w-3.5" /> {humanize(finding.source_document_type)}
            </span>
          )}
        </button>
      )}

      {finding.documented_detail && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Documented: </span>
          {finding.documented_detail}
        </p>
      )}

      <div className="border-t pt-3">
        {editing ? (
          <DecisionForm claimId={claimId} finding={finding} decision={decision} onDone={() => setEditing(false)} />
        ) : decision && dm ? (
          <div className="flex flex-wrap items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="space-y-0.5 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={dm.tone}>
                  <Gavel className="mr-1 h-3 w-3" />
                  {dm.past}
                </Badge>
                {decision.confirmed_recovery_aud != null && (
                  <span className="font-medium">{formatAud(decision.confirmed_recovery_aud)} confirmed</span>
                )}
              </div>
              <p className="text-muted-foreground">
                {decision.decided_by} · {formatDateTime(decision.decided_at)}
              </p>
              {decision.note && <p className="text-muted-foreground">“{decision.note}”</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              Change
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
            <span className={cn("rounded-md border px-2 py-0.5 text-xs", TONE.muted)}>Awaiting auditor decision</span>
            <Button
              size="sm"
              variant={finding.outcome === "supported" ? "outline" : "default"}
              onClick={() => {
                onSelect();
                setEditing(true);
              }}
            >
              <Gavel className="h-4 w-4" /> Record decision
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
