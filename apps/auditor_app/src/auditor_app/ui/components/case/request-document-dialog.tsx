import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, FileText, Loader2, RefreshCw, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import {
  ApiError,
  getClaimWorkflowKey,
  useDraftDocumentRequest,
  useGetClaimDetail,
  useGetClaimWorkflow,
  useSendDocumentRequest,
} from "@/lib/api";
import type { SendDocRequestOut } from "@/lib/api";
import { formatDateTime, humanize } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

function errMessage(error: unknown): string {
  if (error instanceof ApiError && typeof error.body === "object" && error.body !== null) {
    return String((error.body as { detail?: unknown }).detail ?? error.message);
  }
  return error instanceof Error ? error.message : "Unexpected error";
}

type Props = {
  claimId: string;
  docType: string;
  discrepancyType?: string | null;
  reason?: string | null;
};

export function RequestDocumentDialog({ claimId, docType, discrepancyType, reason }: Props) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sent, setSent] = useState<SendDocRequestOut | null>(null);
  const queryClient = useQueryClient();

  // Requests already recorded in Lakebase for this claim (survive reloads).
  const { data: workflow } = useGetClaimWorkflow({
    params: { claim_id: claimId },
    query: { select: (d) => d.data, retry: false },
  });
  const existing = (workflow?.document_requests ?? []).find(
    (r) => r.doc_type === docType && r.status === "awaiting_document",
  );

  // Reuse the claim detail already loaded on this page (cached) for the email context.
  const { data: detail } = useGetClaimDetail({
    params: { claim_id: claimId },
    query: { select: (d) => d.data, staleTime: Infinity },
  });
  // Never put a masked value into the email (users without PII access see "***MASKED***").
  const rawMember = detail?.member?.member_full_name ?? null;
  const memberName = rawMember && !rawMember.includes("MASKED") ? rawMember : null;

  const draft = useDraftDocumentRequest();
  const send = useSendDocumentRequest();
  const docLabel = humanize(docType);

  const runDraft = () => {
    draft.mutate(
      {
        params: { claim_id: claimId },
        data: {
          doc_type: docType,
          claim_number: detail?.claim?.claim_number ?? null,
          member_full_name: memberName,
          hospital_name: detail?.hospital?.hospital_name ?? null,
          admission_date: detail?.admission?.admission_date ?? null,
          discrepancy_type: discrepancyType ?? null,
          reason: reason ?? null,
        },
      },
      {
        onSuccess: (res) => {
          setTo(res.data.to);
          setSubject(res.data.subject);
          setBody(res.data.body);
        },
        onError: (e) => toast.error("Could not draft the email", { description: errMessage(e) }),
      },
    );
  };

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && !sent && !existing) {
      setTo("");
      setSubject("");
      setBody("");
      runDraft();
    }
  };

  const onSend = () => {
    send.mutate(
      {
        params: { claim_id: claimId },
        data: {
          to,
          subject,
          body,
          doc_type: docType,
          drafted_by_ai: draft.data?.data.drafted_by_ai ?? null,
          draft_model: draft.data?.data.model ?? null,
        },
      },
      {
        onSuccess: (res) => {
          setSent(res.data);
          queryClient.invalidateQueries({ queryKey: getClaimWorkflowKey({ claim_id: claimId }) });
          queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
          toast.success("Document request recorded", { description: res.data.message });
        },
        onError: (e) => toast.error("Could not send the request", { description: errMessage(e) }),
      },
    );
  };

  const drafting = draft.isPending;
  const aiModel = draft.data?.data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {sent || existing ? (
          <Button variant="outline" size="sm" className="text-emerald-600 dark:text-emerald-400">
            <Clock className="mr-2 h-4 w-4" />
            Awaiting {docLabel.toLowerCase()}
          </Button>
        ) : (
          <Button size="sm">
            <FileText className="mr-2 h-4 w-4" />
            Request {docLabel.toLowerCase()}
          </Button>
        )}
      </DialogTrigger>

      <DialogContent className="max-w-2xl">
        {!sent && existing ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Awaiting {docLabel.toLowerCase()}
              </DialogTitle>
              <DialogDescription>
                Requested by {existing.requested_by ?? "an auditor"} on {formatDateTime(existing.requested_at)}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Request ID</span>
                <span className="font-mono">{existing.request_id}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Sent to</span>
                <span className="font-mono">{existing.recipient}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Subject</span>
                <span className="text-right">{existing.subject}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">{humanize(existing.status)}</Badge>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : sent ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                Request recorded — awaiting document
              </DialogTitle>
              <DialogDescription>{sent.message}</DialogDescription>
            </DialogHeader>
            <div className="space-y-2 rounded-md border bg-muted/40 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Request ID</span>
                <span className="font-mono">{sent.request_id}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Sent to</span>
                <span className="font-mono">{sent.to}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline">{humanize(sent.status)}</Badge>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                Request {docLabel.toLowerCase()}
              </DialogTitle>
              <DialogDescription>
                Drafted with the Foundation Model API. Review and edit before sending; the request is recorded in
                Lakebase (document_request table).
              </DialogDescription>
            </DialogHeader>

            {drafting && !body ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                Drafting the email…
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doc-to">To</Label>
                  <Input id="doc-to" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doc-subject">Subject</Label>
                  <Input id="doc-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="doc-body">Message</Label>
                  <Textarea
                    id="doc-body"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    rows={12}
                    className="font-mono text-xs leading-relaxed"
                  />
                </div>
                {aiModel && (
                  <p className="text-xs text-muted-foreground">
                    {aiModel.drafted_by_ai ? (
                      <>
                        <Sparkles className="mr-1 inline h-3 w-3" />
                        AI-drafted by <span className="font-mono">{aiModel.model}</span>
                      </>
                    ) : (
                      <>Drafted from template (model unavailable).</>
                    )}
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={runDraft} disabled={drafting || send.isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${drafting ? "animate-spin" : ""}`} />
                Regenerate
              </Button>
              <Button onClick={onSend} disabled={drafting || send.isPending || !to || !subject || !body}>
                <Send className="mr-2 h-4 w-4" />
                {send.isPending ? "Sending…" : "Send request"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
