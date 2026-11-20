import { Suspense, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, RotateCcw, Search } from "lucide-react";

import { useQueueFacetsSuspense } from "@/lib/api";
import selector from "@/lib/selector";
import { humanize, reviewOutcomeMeta, reviewStatusMeta } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type QueueFilterState = {
  min_score: number;
  region?: string;
  claim_status?: string;
  recommendation?: string;
  review_outcome?: string;
  status?: string;
  search?: string;
  sort_by: string;
  sort_dir: string;
  page: number;
  page_size: number;
};

export const DEFAULT_FILTERS: QueueFilterState = {
  min_score: 0.7,
  sort_by: "score",
  sort_dir: "desc",
  page: 1,
  page_size: 25,
};

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "score", label: "ML score" },
  { value: "recovery", label: "Identified recovery" },
  { value: "est_impact", label: "Triage est. impact" },
  { value: "total", label: "Claim total" },
  { value: "admission_date", label: "Admission date" },
  { value: "claim_number", label: "Claim number" },
  { value: "member", label: "Member" },
  { value: "region", label: "Region" },
  { value: "recommendation", label: "Recommendation" },
  { value: "status", label: "Status" },
];

const ALL = "__all__";

type Props = {
  filters: QueueFilterState;
  onChange: (patch: Partial<QueueFilterState>) => void;
};

function FacetSelect({
  label,
  value,
  options,
  onValueChange,
  format = humanize,
  width = "w-[150px]",
}: {
  label: string;
  value?: string;
  options: string[];
  onValueChange: (value: string | undefined) => void;
  format?: (value: string) => string;
  width?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? ALL} onValueChange={(v) => onValueChange(v === ALL ? undefined : v)}>
        <SelectTrigger className={width}>
          <SelectValue placeholder={`All ${label.toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {format(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FacetSelects({ filters, onChange }: Props) {
  const { data: facets } = useQueueFacetsSuspense(selector());
  return (
    <>
      <FacetSelect
        label="Region"
        value={filters.region}
        options={facets.regions ?? []}
        onValueChange={(v) => onChange({ region: v })}
      />
      <FacetSelect
        label="Triage"
        value={filters.recommendation}
        options={facets.recommendations ?? []}
        onValueChange={(v) => onChange({ recommendation: v })}
      />
      <FacetSelect
        label="Document review"
        value={filters.review_outcome}
        options={facets.review_outcomes ?? []}
        onValueChange={(v) => onChange({ review_outcome: v })}
        format={(v) => reviewOutcomeMeta(v).label}
        width="w-[200px]"
      />
      <FacetSelect
        label="Status"
        value={filters.status}
        options={facets.statuses ?? []}
        onValueChange={(v) => onChange({ status: v })}
        format={(v) => reviewStatusMeta(v).label}
        width="w-[170px]"
      />
      <FacetSelect
        label="Claim status"
        value={filters.claim_status}
        options={facets.claim_statuses ?? []}
        onValueChange={(v) => onChange({ claim_status: v })}
        width="w-[120px]"
      />
    </>
  );
}

function FacetSkeleton() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-9 w-[150px]" />
        </div>
      ))}
    </>
  );
}

export function QueueFilters({ filters, onChange }: Props) {
  const [searchText, setSearchText] = useState(filters.search ?? "");

  useEffect(() => {
    const t = setTimeout(() => {
      const next = searchText.trim() || undefined;
      if (next !== filters.search) onChange({ search: next });
    }, 350);
    return () => clearTimeout(t);
    // Only react to keystrokes; filters.search/onChange intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  const reset = () => {
    setSearchText("");
    onChange({ ...DEFAULT_FILTERS });
  };

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Search</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Claim # or member…"
            className="w-[220px] pl-8"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Min ML score:{" "}
          <span className="font-mono text-foreground">
            {filters.min_score <= 0.7 ? "any" : filters.min_score.toFixed(2)}
          </span>
        </Label>
        <Slider
          className="w-[180px] py-2.5"
          min={0.7}
          max={1}
          step={0.01}
          value={[filters.min_score]}
          onValueChange={([v]) => onChange({ min_score: v })}
        />
      </div>

      <Suspense fallback={<FacetSkeleton />}>
        <FacetSelects filters={filters} onChange={onChange} />
      </Suspense>

      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Sort by</Label>
        <div className="flex items-center gap-2">
          <Select value={filters.sort_by} onValueChange={(v) => onChange({ sort_by: v })}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            aria-label="Toggle sort direction"
            onClick={() => onChange({ sort_dir: filters.sort_dir === "asc" ? "desc" : "asc" })}
          >
            {filters.sort_dir === "asc" ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <Button variant="ghost" size="sm" className="ml-auto" onClick={reset}>
        <RotateCcw className="mr-1.5 h-4 w-4" />
        Reset
      </Button>
    </div>
  );
}
