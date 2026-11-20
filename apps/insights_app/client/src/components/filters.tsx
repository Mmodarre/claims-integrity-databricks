import { useMemo } from 'react';
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useMetricView,
} from '@databricks/appkit-ui/react';
import type { MetricFilter } from '@databricks/appkit-ui/js';
import { X } from 'lucide-react';

export const ALL = 'all';

export interface SliceState {
  region: string;
  hospital: string;
  year: string;
}

export const EMPTY_SLICE: SliceState = { region: ALL, hospital: ALL, year: ALL };

/** Builds a metric-view filter tree from the shared slice controls. */
export function useSliceFilter(slice: SliceState, opts: { withHospital?: boolean } = {}): MetricFilter | undefined {
  const { withHospital = true } = opts;
  return useMemo(() => {
    const preds: MetricFilter[] = [];
    if (slice.region !== ALL) preds.push({ member: 'region', operator: 'equals', values: [slice.region] });
    if (withHospital && slice.hospital !== ALL)
      preds.push({ member: 'hospital_name', operator: 'equals', values: [slice.hospital] });
    if (slice.year !== ALL) {
      preds.push({ member: 'service_month', operator: 'gte', values: [`${slice.year}-01-01`] });
      preds.push({ member: 'service_month', operator: 'lte', values: [`${slice.year}-12-31`] });
    }
    if (preds.length === 0) return undefined;
    if (preds.length === 1) return preds[0];
    return { and: preds };
  }, [slice.region, slice.hospital, slice.year, withHospital]);
}

function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
  allLabel,
  width = 'w-44',
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  allLabel: string;
  width?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={width}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** Distinct regions / hospitals, read from the metric view so options always match its dimensions. */
export function useFunnelSliceOptions() {
  const regions = useMetricView('integrity_funnel', {
    measures: ['cases'],
    dimensions: ['region'],
    orderBy: [{ field: 'region', direction: 'ASC' }],
  });
  const hospitals = useMetricView('integrity_funnel', {
    measures: ['flagged_claims'],
    dimensions: ['hospital_name'],
    orderBy: [{ field: 'hospital_name', direction: 'ASC' }],
  });
  return {
    regions: (regions.data ?? []).map((r) => r.region).filter((v): v is string => !!v),
    hospitals: (hospitals.data ?? []).map((r) => r.hospital_name).filter((v): v is string => !!v),
  };
}

export function useRecoverySliceOptions() {
  const regions = useMetricView('recovery', {
    measures: ['findings'],
    dimensions: ['region'],
    orderBy: [{ field: 'region', direction: 'ASC' }],
  });
  const hospitals = useMetricView('recovery', {
    measures: ['findings'],
    dimensions: ['hospital_name'],
    orderBy: [{ field: 'hospital_name', direction: 'ASC' }],
  });
  return {
    regions: (regions.data ?? []).map((r) => r.region).filter((v): v is string => !!v),
    hospitals: (hospitals.data ?? []).map((r) => r.hospital_name).filter((v): v is string => !!v),
  };
}

export const YEARS = ['2021', '2022', '2023'];

export function SliceControls({
  slice,
  onChange,
  regions,
  hospitals,
  showHospital = true,
}: {
  slice: SliceState;
  onChange: (next: SliceState) => void;
  regions: string[];
  hospitals: string[];
  showHospital?: boolean;
}) {
  const active = slice.region !== ALL || slice.hospital !== ALL || slice.year !== ALL;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <FilterSelect
        id="slice-year"
        label="Service year"
        value={slice.year}
        options={YEARS}
        allLabel="All years"
        width="w-32"
        onChange={(year) => onChange({ ...slice, year })}
      />
      <FilterSelect
        id="slice-region"
        label="Region"
        value={slice.region}
        options={regions}
        allLabel="All regions"
        width="w-32"
        onChange={(region) => onChange({ ...slice, region })}
      />
      {showHospital && (
        <FilterSelect
          id="slice-hospital"
          label="Hospital"
          value={slice.hospital}
          options={hospitals}
          allLabel="All hospitals"
          width="w-64"
          onChange={(hospital) => onChange({ ...slice, hospital })}
        />
      )}
      {active && (
        <Button variant="ghost" size="sm" onClick={() => onChange(EMPTY_SLICE)}>
          <X className="mr-1 h-3.5 w-3.5" /> Clear
        </Button>
      )}
    </div>
  );
}

export function describeSlice(slice: SliceState): string {
  const parts = [
    slice.year !== ALL ? `service year ${slice.year}` : 'service Jan 2021 – Dec 2023',
    slice.region !== ALL ? slice.region : null,
    slice.hospital !== ALL ? slice.hospital : null,
  ].filter(Boolean);
  return parts.join(' · ');
}
