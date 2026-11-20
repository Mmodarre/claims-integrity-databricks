import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, FileScan } from "lucide-react";

import type { ListQueueParams } from "@/lib/api";
import { useListQueueSuspense } from "@/lib/api";
import selector from "@/lib/selector";
import {
  formatAud,
  formatDate,
  formatScore,
  humanize,
  recommendationVariant,
  reviewOutcomeMeta,
  reviewStatusMeta,
  scoreClass,
} from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function QueueTable({
  params,
  onPageChange,
}: {
  params: ListQueueParams;
  onPageChange: (page: number) => void;
}) {
  const navigate = useNavigate();
  const { data } = useListQueueSuspense({ params, ...selector() });

  const page = params.page ?? 1;
  const pageSize = params.page_size ?? 25;
  const total = data.total;
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const lastPage = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="rounded-xl border bg-card">
      <TooltipProvider delayDuration={200}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[90px]">ML score</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead>Member</TableHead>
              <TableHead>Hospital</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>AI triage</TableHead>
              <TableHead>Document review</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-32 text-center text-muted-foreground">
                  No claims match the current filters.
                </TableCell>
              </TableRow>
            ) : (
              data.items.map((row) => {
                const outcome = reviewOutcomeMeta(row.review_outcome);
                const status = reviewStatusMeta(row.review_status);
                return (
                  <TableRow
                    key={row.claim_id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/cases/$claimId", params: { claimId: row.claim_id } })}
                  >
                    <TableCell>
                      {row.is_flagged ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className={`inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs ${scoreClass(row.ml_fraud_score)}`}
                            >
                              {formatScore(row.ml_fraud_score)}
                            </span>
                          </TooltipTrigger>
                          {row.ml_flag_reason ? (
                            <TooltipContent className="max-w-xs">{row.ml_flag_reason}</TooltipContent>
                          ) : null}
                        </Tooltip>
                      ) : (
                        <span className="text-xs text-muted-foreground">Not flagged</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{row.claim_number ?? row.claim_id}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(row.admission_date)} · {row.region ?? "—"}
                      </div>
                    </TableCell>
                    <TableCell>{row.member_full_name ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{row.hospital_name ?? "—"}</TableCell>
                    <TableCell className="text-right font-medium">{formatAud(row.total_claim_amount_aud)}</TableCell>
                    <TableCell>
                      {row.recommendation ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant={recommendationVariant(row.recommendation)}>
                            {humanize(row.recommendation)}
                          </Badge>
                          {row.discrepancy_type && row.discrepancy_type !== "none" ? (
                            <span className="text-xs text-muted-foreground">{humanize(row.discrepancy_type)}</span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.review_outcome ? (
                        <div className="flex flex-col items-start gap-1">
                          <Badge variant="outline" className={outcome.tone}>
                            <FileScan className="mr-1 h-3 w-3" />
                            {outcome.label}
                          </Badge>
                          {row.identified_recovery_aud ? (
                            <span className="text-xs text-muted-foreground">
                              {formatAud(row.identified_recovery_aud)} identified
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No scans</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant="outline" className={status.tone}>
                          {status.label}
                        </Badge>
                        {(row.actionable_findings ?? 0) > 0 ? (
                          <span className="text-xs text-muted-foreground">
                            {row.actionable_decided}/{row.actionable_findings} findings decided
                          </span>
                        ) : null}
                        {row.confirmed_recovery_aud ? (
                          <span className="text-xs font-medium text-foreground">
                            {formatAud(row.confirmed_recovery_aud)} confirmed
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TooltipProvider>

      <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-muted-foreground">
        <span>{total === 0 ? "No results" : `Showing ${start}–${end} of ${total}`}</span>
        <div className="flex items-center gap-2">
          <span>
            Page {page} of {lastPage}
          </span>
          <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" disabled={page >= lastPage} onClick={() => onPageChange(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
