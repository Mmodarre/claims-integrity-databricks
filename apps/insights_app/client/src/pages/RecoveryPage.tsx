import { useMemo, useState } from 'react';
import {
  BarChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  ToggleGroup,
  ToggleGroupItem,
  useMetricView,
} from '@databricks/appkit-ui/react';
import type { MetricFilter } from '@databricks/appkit-ui/js';
import {
  InlineBar,
  KpiTile,
  Mono,
  PageHeader,
  QueryState,
  Section,
  ToneBadge,
} from '../components/blocks';
import {
  EMPTY_SLICE,
  SliceControls,
  describeSlice,
  useRecoverySliceOptions,
  useSliceFilter,
  type SliceState,
} from '../components/filters';
import { DETECTION_METHOD } from '../lib/labels';
import { fmtAud, fmtDec, fmtInt, fmtPct, toNum } from '../lib/format';

type Method = 'all' | 'rule' | 'llm';

function combine(a: MetricFilter | undefined, b: MetricFilter | undefined): MetricFilter | undefined {
  if (!a) return b;
  if (!b) return a;
  return { and: [a, b] };
}

function TopList({
  dimension,
  filter,
  title,
  description,
}: {
  dimension: 'hospital_name' | 'surgeon_name';
  filter: MetricFilter | undefined;
  title: string;
  description: string;
}) {
  const { data, loading, error } = useMetricView('recovery', {
    measures: ['identified_recovery', 'discrepancy_findings', 'claims_with_discrepancy'],
    dimensions: [dimension],
    filter: combine(filter, { member: 'outcome', operator: 'equals', values: ['discrepancy'] }),
    orderBy: [{ field: 'identified_recovery', direction: 'DESC' }],
    limit: 10,
  });
  const rows = useMemo(
    () =>
      (data ?? []).map((r) => ({
        name: (dimension === 'hospital_name' ? (r as { hospital_name?: string | null }).hospital_name : (r as { surgeon_name?: string | null }).surgeon_name) ?? 'Unknown',
        recovery: toNum(r.identified_recovery) ?? 0,
        findings: toNum(r.discrepancy_findings) ?? 0,
        claims: toNum(r.claims_with_discrepancy) ?? 0,
      })),
    [data, dimension],
  );
  const max = Math.max(1, ...rows.map((r) => r.recovery));
  return (
    <Section
      title={title}
      description={description}
      source={
        <>
          <Mono>mv_recovery</Mono> · Identified recovery, Discrepancies, Claims with discrepancies by{' '}
          {dimension === 'hospital_name' ? 'Hospital' : 'Surgeon'}
        </>
      }
    >
      <QueryState data={data ? rows : null} loading={loading} error={error} height={300} empty={{ title: 'No discrepancies in this slice' }}>
        {(list) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{dimension === 'hospital_name' ? 'Hospital' : 'Surgeon'}</TableHead>
                <TableHead className="text-right">Claims</TableHead>
                <TableHead className="text-right">Findings</TableHead>
                <TableHead className="w-[42%]">Identified recovery</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="max-w-[220px] truncate font-medium" title={r.name}>
                    {r.name}
                  </TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.claims)}</TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.findings)}</TableCell>
                  <TableCell>
                    <InlineBar value={r.recovery} max={max} tone="ai" label={fmtAud(r.recovery)} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </QueryState>
    </Section>
  );
}

function ByDiscrepancy({ filter }: { filter: MetricFilter | undefined }) {
  const { data, loading, error } = useMetricView('recovery', {
    measures: ['identified_recovery', 'discrepancy_findings'],
    dimensions: ['discrepancy_title', 'detection_method'],
    filter: combine(filter, { member: 'outcome', operator: 'equals', values: ['discrepancy'] }),
  });
  const pivot = useMemo(() => {
    if (!data) return null;
    const map = new Map<string, { discrepancy: string; 'Rule on AI-extracted facts': number; 'LLM document review': number; total: number }>();
    for (const r of data) {
      const key = r.discrepancy_title ?? 'Other';
      const entry = map.get(key) ?? { discrepancy: key, 'Rule on AI-extracted facts': 0, 'LLM document review': 0, total: 0 };
      const v = toNum(r.identified_recovery) ?? 0;
      if (r.detection_method === 'rule') entry['Rule on AI-extracted facts'] += v;
      else entry['LLM document review'] += v;
      entry.total += v;
      map.set(key, entry);
    }
    // Horizontal bars render bottom-up, so sort ascending to put the largest on top.
    return [...map.values()].sort((a, b) => a.total - b.total).map(({ total: _total, ...rest }) => rest);
  }, [data]);

  const top = pivot?.[pivot.length - 1];
  return (
    <Section
      title={top ? `“${top.discrepancy}” is the largest source of identified recovery` : 'Identified recovery by discrepancy type'}
      description="Stacked by how it was detected: deterministic rules on AI-extracted facts vs LLM reading the clinical prose"
      source={
        <>
          <Mono>mv_recovery</Mono> · Identified recovery by Discrepancy × Detection method (outcome = discrepancy)
        </>
      }
    >
      <QueryState data={pivot} loading={loading} error={error} height={380} empty={{ title: 'No discrepancies in this slice' }}>
        {(rows) => (
          <BarChart
            data={rows}
            xKey="discrepancy"
            yKey={['Rule on AI-extracted facts', 'LLM document review']}
            orientation="horizontal"
            stacked
            showLegend
            height={Math.max(260, rows.length * 34 + 60)}
            valueFormatter={(v) => fmtAud(v)}
            ariaLabel="Identified recovery by discrepancy type, stacked by detection method"
          />
        )}
      </QueryState>
    </Section>
  );
}

function MethodComparison({ filter }: { filter: MetricFilter | undefined }) {
  const { data, loading, error } = useMetricView('recovery', {
    measures: ['discrepancy_findings', 'information_gaps', 'identified_recovery', 'avg_confidence', 'claims_with_discrepancy', 'findings'],
    dimensions: ['detection_method'],
    filter,
  });
  const totalRecovery = (data ?? []).reduce((a, r) => a + (toNum(r.identified_recovery) ?? 0), 0);
  return (
    <Section
      title="Rules vs LLM: both earn their place"
      description="Rules are exact where the comparison is numeric; the LLM catches what only the prose reveals"
      source={
        <>
          <Mono>mv_recovery</Mono> · by Detection method
        </>
      }
    >
      <QueryState data={data} loading={loading} error={error} height={160}>
        {(rows) => (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Checks</TableHead>
                <TableHead className="text-right">Discrepancies</TableHead>
                <TableHead className="text-right">Info gaps</TableHead>
                <TableHead className="text-right">Avg confidence</TableHead>
                <TableHead className="text-right">Recovery</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const m = DETECTION_METHOD[r.detection_method ?? ''];
                const rec = toNum(r.identified_recovery) ?? 0;
                return (
                  <TableRow key={r.detection_method ?? 'unknown'}>
                    <TableCell>
                      <div className="font-medium">{m?.label ?? r.detection_method}</div>
                      <div className="max-w-[280px] text-xs text-muted-foreground">{m?.description}</div>
                    </TableCell>
                    <TableCell className="tabular text-right">{fmtInt(r.findings)}</TableCell>
                    <TableCell className="tabular text-right">{fmtInt(r.discrepancy_findings)}</TableCell>
                    <TableCell className="tabular text-right">{fmtInt(r.information_gaps)}</TableCell>
                    <TableCell className="tabular text-right">{fmtDec(r.avg_confidence)}</TableCell>
                    <TableCell className="tabular text-right font-medium">{fmtAud(rec)}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {totalRecovery ? fmtPct(rec / totalRecovery, 0) : '–'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </QueryState>
    </Section>
  );
}

function RecoveryBasis({ filter }: { filter: MetricFilter | undefined }) {
  const { data, loading, error } = useMetricView('recovery', {
    measures: ['identified_recovery', 'discrepancy_findings'],
    dimensions: ['recovery_basis'],
    filter: combine(filter, { member: 'outcome', operator: 'equals', values: ['discrepancy'] }),
  });
  return (
    <Section
      title="How each dollar was computed"
      description="Recovery is always calculated in SQL from fee schedules and benefit tables — never by the LLM"
      source={
        <>
          <Mono>mv_recovery</Mono> · Identified recovery by Recovery basis
        </>
      }
    >
      <QueryState data={data} loading={loading} error={error} height={120}>
        {(rows) => (
          <ul className="space-y-2 text-sm">
            {rows.map((r) => {
              const basis = r.recovery_basis ?? 'unknown';
              const estimated = basis.startsWith('estimated');
              return (
                <li key={basis} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2">
                    <Mono>{basis}</Mono>
                    {estimated && <ToneBadge tone="warn">Estimate</ToneBadge>}
                  </span>
                  <span className="tabular text-right">
                    {fmtAud(r.identified_recovery)} <span className="text-xs text-muted-foreground">· {fmtInt(r.discrepancy_findings)} findings</span>
                  </span>
                </li>
              );
            })}
            <li className="pt-1 text-xs text-muted-foreground">
              <Mono>line_benefit</Mono> = billed line benefit × (1 − supported fraction). Device substitutions have no exact
              reference price, so they are estimated against the device category benefit floor.
            </li>
          </ul>
        )}
      </QueryState>
    </Section>
  );
}

export function RecoveryPage() {
  const [slice, setSlice] = useState<SliceState>(EMPTY_SLICE);
  const [method, setMethod] = useState<Method>('all');
  const options = useRecoverySliceOptions();
  const sliceFilter = useSliceFilter(slice);
  const filter = useMemo(
    () => combine(sliceFilter, method === 'all' ? undefined : { member: 'detection_method', operator: 'equals', values: [method] }),
    [sliceFilter, method],
  );
  const { data, loading, error } = useMetricView('recovery', {
    measures: [
      'identified_recovery',
      'pending_recovery',
      'confirmed_recovery',
      'discrepancy_findings',
      'claims_with_discrepancy',
      'information_gaps',
      'avg_recovery_per_discrepancy',
      'recovery_share_of_disputed_benefit',
      'avg_confidence',
    ],
    filter,
  });
  const k = data?.[0];
  const confirmed = toNum(k?.confirmed_recovery) ?? 0;
  const common = { loading: loading && !k, error };
  const scope = `${describeSlice(slice)}${method === 'all' ? '' : ` · ${DETECTION_METHOD[method].short} findings`}`;

  return (
    <>
      <PageHeader
        title="Recovery"
        message="Dollars the AI document review identified, where they come from, and how much is waiting on an auditor."
      >
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Detection</span>
          <ToggleGroup type="single" size="sm" variant="outline" value={method} onValueChange={(v) => v && setMethod(v as Method)}>
            <ToggleGroupItem value="all">All</ToggleGroupItem>
            <ToggleGroupItem value="rule">Rule</ToggleGroupItem>
            <ToggleGroupItem value="llm">LLM</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <SliceControls slice={slice} onChange={setSlice} regions={options.regions} hospitals={options.hospitals} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile
          label="Identified recovery"
          value={fmtAud(k?.identified_recovery)}
          unit="AUD"
          ai
          context={scope}
          hint="mv_recovery · Identified recovery (outcome = discrepancy)"
          {...common}
        />
        <KpiTile
          label="Awaiting auditor"
          value={fmtAud(k?.pending_recovery)}
          unit="AUD"
          context="Identified, no auditor decision yet"
          hint="mv_recovery · Recovery awaiting auditor"
          {...common}
        />
        <KpiTile
          label="Confirmed recovery"
          value={confirmed === 0 ? 'Awaiting' : fmtAud(confirmed)}
          unit={confirmed === 0 ? undefined : 'AUD'}
          context={confirmed === 0 ? 'Populates as auditors record decisions' : 'Confirmed by auditors'}
          hint="mv_recovery · Confirmed recovery (from auditor write-back via Lakebase)"
          {...common}
        />
        <KpiTile
          label="Discrepancies"
          value={fmtInt(k?.discrepancy_findings)}
          ai
          context={`${fmtInt(k?.claims_with_discrepancy)} claims · ${fmtInt(k?.information_gaps)} information gaps`}
          hint="mv_recovery · Discrepancies, Claims with discrepancies, Information gaps"
          {...common}
        />
        <KpiTile
          label="Avg recovery / discrepancy"
          value={fmtAud(k?.avg_recovery_per_discrepancy, 'whole')}
          unit="AUD"
          hint="mv_recovery · Avg recovery per discrepancy"
          {...common}
        />
        <KpiTile
          label="Recovery / disputed benefit"
          value={fmtPct(k?.recovery_share_of_disputed_benefit)}
          context="Share of the benefit on disputed lines"
          hint="mv_recovery · Recovery / disputed benefit"
          {...common}
        />
        <KpiTile
          label="Avg AI confidence"
          value={fmtDec(k?.avg_confidence)}
          ai
          context="On discrepancy findings (0–1)"
          hint="mv_recovery · Avg AI confidence (discrepancies)"
          {...common}
        />
        <KpiTile
          label="Share awaiting auditor"
          value={toNum(k?.identified_recovery) ? fmtPct((toNum(k?.pending_recovery) ?? 0) / (toNum(k?.identified_recovery) ?? 1), 0) : '–'}
          context="Of identified recovery dollars"
          hint="mv_recovery · Recovery awaiting auditor / Identified recovery"
          {...common}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <ByDiscrepancy filter={filter} />
        <div className="space-y-6">
          <MethodComparison filter={sliceFilter} />
          <RecoveryBasis filter={filter} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <TopList dimension="hospital_name" filter={filter} title="Top hospitals by identified recovery" description={scope} />
        <TopList dimension="surgeon_name" filter={filter} title="Top surgeons by identified recovery" description={scope} />
      </div>
    </>
  );
}
