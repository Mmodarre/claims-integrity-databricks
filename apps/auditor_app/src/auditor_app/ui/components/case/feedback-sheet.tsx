import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

import { ApiError, getClaimWorkflowKey, useSubmitFeedback } from "@/lib/api";
import type { FeedbackIn } from "@/lib/api";
import { DECISIONS } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Rating } from "./rating";

type Decision = FeedbackIn["decision"];

export function FeedbackSheet({ claimId }: { claimId: string }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<Decision | undefined>(undefined);

  const reset = () => {
    setRating(0);
    setNote("");
    setDecision(undefined);
  };

  const { mutate, isPending } = useSubmitFeedback({
    mutation: {
      onSuccess: (res) => {
        toast.success("Feedback and claim decision recorded", {
          description: `Written to Lakebase auditor_feedback + auditor_decision (${res.data.claim_decision.decision})`,
        });
        queryClient.invalidateQueries({ queryKey: ["/api/queue"] });
        queryClient.invalidateQueries({ queryKey: getClaimWorkflowKey({ claim_id: claimId }) });
        setOpen(false);
        reset();
      },
      onError: (error) => {
        const message =
          error instanceof ApiError && typeof error.body === "object" && error.body !== null
            ? String((error.body as { detail?: unknown }).detail ?? error.message)
            : error.message;
        toast.error("Could not save feedback", { description: message });
      },
    },
  });

  const canSubmit = rating >= 1 && decision !== undefined && !isPending;

  const submit = () => {
    if (!decision) return;
    mutate({
      params: { claim_id: claimId },
      data: { reasoning_rating: rating, note: note.trim() || null, decision },
    });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button>
          <MessageSquarePlus className="mr-2 h-4 w-4" />
          Claim decision
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-6 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Claim decision &amp; feedback</SheetTitle>
          <SheetDescription>
            Rate the AI&apos;s reasoning and record your claim-level decision. Writes{" "}
            <span className="font-mono">auditor_feedback</span> and{" "}
            <span className="font-mono">auditor_decision</span> in Lakebase under your identity; per-finding
            decisions are recorded on each finding.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 px-4">
          <Label>AI reasoning quality</Label>
          <Rating value={rating} onChange={setRating} />
        </div>

        <div className="flex flex-col gap-2 px-4">
          <Label>Claim decision</Label>
          <Select value={decision} onValueChange={(v) => setDecision(v as Decision)}>
            <SelectTrigger>
              <SelectValue placeholder="Select a decision…" />
            </SelectTrigger>
            <SelectContent>
              {DECISIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.past}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2 px-4">
          <Label htmlFor="feedback-note">Note (optional)</Label>
          <Textarea
            id="feedback-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for your decision…"
            rows={5}
          />
        </div>

        <SheetFooter className="mt-auto">
          <Button onClick={submit} disabled={!canSubmit}>
            {isPending ? "Saving…" : "Submit feedback"}
          </Button>
          <SheetClose asChild>
            <Button variant="outline" disabled={isPending}>
              Cancel
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
