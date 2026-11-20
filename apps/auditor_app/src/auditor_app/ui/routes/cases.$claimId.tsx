import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

import { useGetClaimWorkflow } from "@/lib/api";
import { reviewStatusMeta } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryBoundary } from "@/components/query-boundary";
import { ClaimDetail } from "@/components/case/claim-detail";
import { DocumentReviewSummary, DocumentsReceivedBadge } from "@/components/case/document-review-summary";
import { EvidenceReview } from "@/components/case/evidence-review";
import { FeedbackSheet } from "@/components/case/feedback-sheet";
import { ReasoningPanel } from "@/components/case/reasoning-panel";

export const Route = createFileRoute("/cases/$claimId")({
  component: CasePage,
});

function StatusBadge({ claimId }: { claimId: string }) {
  const { data } = useGetClaimWorkflow({
    params: { claim_id: claimId },
    query: { select: (d) => d.data, retry: false },
  });
  if (!data) return null;
  const meta = reviewStatusMeta(data.review_status);
  return (
    <Badge variant="outline" className={meta.tone}>
      {meta.label}
    </Badge>
  );
}

function CasePage() {
  const { claimId } = Route.useParams();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <Link to="/" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back to worklist
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Claim review</h1>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-sm text-muted-foreground">{claimId}</p>
            <StatusBadge claimId={claimId} />
            <DocumentsReceivedBadge claimId={claimId} />
          </div>
        </div>
        <FeedbackSheet claimId={claimId} />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-6 lg:col-span-2">
          <QueryBoundary fallback={<Skeleton className="h-96 w-full" />}>
            <ReasoningPanel claimId={claimId} />
          </QueryBoundary>
          <QueryBoundary fallback={<Skeleton className="h-64 w-full" />}>
            <DocumentReviewSummary claimId={claimId} />
          </QueryBoundary>
        </div>
        <div className="lg:col-span-3">
          <QueryBoundary fallback={<Skeleton className="h-96 w-full" />}>
            <ClaimDetail claimId={claimId} />
          </QueryBoundary>
        </div>
      </div>

      <QueryBoundary fallback={<Skeleton className="h-[480px] w-full" />}>
        <EvidenceReview claimId={claimId} />
      </QueryBoundary>
    </div>
  );
}
