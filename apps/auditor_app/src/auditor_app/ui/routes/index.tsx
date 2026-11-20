import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import type { ListQueueParams } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryBoundary } from "@/components/query-boundary";
import {
  DEFAULT_FILTERS,
  QueueFilters,
  type QueueFilterState,
} from "@/components/queue/queue-filters";
import { QueueTable } from "@/components/queue/queue-table";

export const Route = createFileRoute("/")({
  component: QueuePage,
});

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-xl border bg-card p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function QueuePage() {
  const [filters, setFilters] = useState<QueueFilterState>(DEFAULT_FILTERS);

  // Filter changes reset to page 1; pagination changes only move the page.
  const onFilterChange = (patch: Partial<QueueFilterState>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  const onPageChange = (page: number) => setFilters((prev) => ({ ...prev, page }));

  const params: ListQueueParams = {
    min_score: filters.min_score,
    region: filters.region ?? null,
    claim_status: filters.claim_status ?? null,
    recommendation: filters.recommendation ?? null,
    review_outcome: filters.review_outcome ?? null,
    status: filters.status ?? null,
    search: filters.search ?? null,
    sort_by: filters.sort_by,
    sort_dir: filters.sort_dir,
    page: filters.page,
    page_size: filters.page_size,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Integrity worklist</h1>
        <p className="text-sm text-muted-foreground">
          ML-flagged claims and claims with scanned documents back from the hospital. Served from Lakebase: synced
          gold tables for the AI triage and document review, app tables for your decisions.
        </p>
      </div>

      <QueueFilters filters={filters} onChange={onFilterChange} />

      <QueryBoundary fallback={<TableSkeleton />}>
        <QueueTable params={params} onPageChange={onPageChange} />
      </QueryBoundary>
    </div>
  );
}
