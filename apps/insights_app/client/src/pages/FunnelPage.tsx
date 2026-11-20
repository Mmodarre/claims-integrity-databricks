import { useMemo, useState } from 'react';
import {
  LineChart,
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
import { Sparkles } from 'lucide-react';
import {
  ErrorBlock,
  InlineBar,
  KpiTile,
  LoadingBlock,
  Mono,
  PageHeader,
  QueryState,
  Section,
} from '../components/blocks';
import {
  EMPTY_SLICE,
  SliceControls,
  describeSlice,
  useFunnelSliceOptions,
  useSliceFilter,
  type SliceState,
} from '../components/filters';
import { TRIAGE } from '../lib/labels';
import { fmtAud, fmtInt, fmtPct, isoMonth, toNum } from '../lib/format';
import { cn } from '../lib/utils';

const FUNNEL_MEASURES = [
  'flagged_claims',
  'triaged_claims',
  'audits_recommended',
  'escalations',
  'dismissed_by_ai',
  'ai_dismissal_rate',
  'claims_document_reviewed',
  'discrepancies_confirmed',
  'needs_more_information',
  'documents_support_claim',
  'document_hit_rate',
  'identified_recovery',
  'confirmed_recovery',
  'auditor_decisions',
  'ai_auditor_agreement_rate',
] as const;

function FunnelStages({ row }: { row: Record<string, string | null> }) {
  const flagged = toNum(row.flagged_claims) ?? 0;
  const stages = [
    { label: 'Flagged by fraud model', key: 'flagged_claims', ai: false, note: 'Deterministic risk score ≥ 0.70' },
    { label: 'AI-triaged', key: 'triaged_claims', ai: true, note: 'ai_query read claim data for every flag' },
    { label: 'Audit recommended by AI', key: 'audits_recommended', ai: true, note: 'Investigate or escalate' },
    { label: 'Documents reviewed by AI', key: 'claims_document_reviewed', ai: true, note: 'Scans available for these claims' },
    { label: 'Discrepancy found in documents', key: 'discrepancies_confirmed', ai: true, note: 'Documents contradict the bill' },
    { label: 'Auditor decision recorded', key: 'auditor_decisions', ai: false, note: 'Lakebase write-back' },
  ];
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Stage</TableHead>
          <TableHead className="w-[40%]">Claims</TableHead>
          <TableHead className="text-right">% of flagged</TableHead>
          <TableHead className="text-right">Step conversion</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stages.map((s, i) => {
          const value = toNum(row[s.key]) ?? 0;
          const prev = i === 0 ? null : toNum(row[stages[i - 1].key]);
          const pending = s.key === 'auditor_decisions' && value === 0;
          return (
            <TableRow key={s.key}>
              <TableCell>
                <div className="flex items-center gap-1.5 font-medium">
                  {s.ai && <Sparkles className="h-3.5 w-3.5 text-ai" aria-label="AI step" />}
                  {s.label}
                </div>
                <div className="text-xs text-muted-foreground">{pending ? 'Awaiting auditor decisions' : s.note}</div>
              </TableCell>
              <TableCell>
                <InlineBar value={value} max={flagged} tone={s.ai ? 'ai' : 'neutral'} label={fmtInt(value)} />
              </TableCell>
              <TableCell className="tabular text-right">{flagged ? fmtPct(value / flagged) : '–'}</TableCell>
              <TableCell className="tabular text-right text-muted-foreground">
                {prev ? fmtPct(value / prev) : '–'}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function OutcomeSplit({ row }: { row: Record<string, string | null> }) {
  const parts = [
    { label: 'Discrepancy found', value: toNum(row.discrepancies_confirmed) ?? 0, cls: 'bg-destructive/75' },
    { label: 'Needs more information', value: toNum(row.needs_more_information) ?? 0, cls: 'bg-warning' },
    { label: 'Documents support claim', value: toNum(row.documents_support_claim) ?? 0, cls: 'bg-success/75' },
  ];
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (!total) return <p className="text-sm text-muted-foreground">No claims with reviewed documents in this slice.</p>;
  return (
    <div className="space-y-3">
      <div className="flex h-6 w-full overflow-hidden rounded-md" role="img" aria-label="AI document review outcomes">
        {parts.map((p) =>
          p.value ? (
            <div key={p.label} className={cn('h-full', p.cls)} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ${p.value}`} />
          ) : null,
        )}
      </div>
      <ul className="grid gap-2 sm:grid-cols-3">
        {parts.map((p) => (
          <li key={p.label} className="flex items-start gap-2 text-sm">
            <span className={cn('mt-1 h-2.5 w-2.5 shrink-0 rounded-sm', p.cls)} />
            <span>
              <span className="tabular font-semibold">{fmtInt(p.value)}</span>{' '}
              <span className="text-muted-foreground">({fmtPct(p.value / total, 0)})</span>
              <br />
              <span className="text-xs text-muted-foreground">{p.label}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Documentation gaps are routed to “request more information”, never treated as fraud.
      </p>
    </div>
  );
}

function TriageMix({ filter }: { filter: ReturnType<typeof useSliceFilter> }) {
  const { data, loading, error } = useMetricView('integrity_funnel', {
    measures: ['triaged_claims', 'triage_estimated_impact'],
    dimensions: ['triage_recommendation'],
    filter,
  });
  const rows = useMemo(
    () =>
      (data ?? [])
        .filter((r) => r.triage_recommendation)
        .map((r) => ({
          key: r.triage_recommendation ?? '',
          label: TRIAGE[r.triage_recommendation ?? ''] ?? r.triage_recommendation ?? '',
          claims: toNum(r.triaged_claims) ?? 0,
          impact: toNum(r.triage_estimated_impact) ?? 0,
        }))
        .sort((a, b) => ['escalate', 'investigate', 'dismiss'].indexOf(a.key) - ['escalate', 'investigate', 'dismiss'].indexOf(b.key)),
    [data],
  );
  const max = Math.max(1, ...rows.map((r) => r.claims));
  return (
    <QueryState data={rows} loading={loading} error={error} height={120}>
      {(list) => (
        <div className="space-y-2">
          {list.map((r) => (
            <div key={r.key} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 text-sm">
              <span className="font-medium">{r.label}</span>
              <InlineBar
                value={r.claims}
                max={max}
                tone={r.key === 'dismiss' ? 'neutral' : r.key === 'escalate' ? 'bad' : 'ai'}
                label={fmtInt(r.claims)}
              />
              <span className="tabular w-24 text-right text-xs text-muted-foreground">{fmtAud(r.impact)} est.</span>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Estimated impact is the triage model’s claim-only estimate before documents are read.
          </p>
        </div>
      )}
    </QueryState>
  );
}

type SliceBy = 'month' | 'region' | 'hospital';

function Breakdown({ filter, sliceBy }: { filter: ReturnType<typeof useSliceFilter>; sliceBy: SliceBy }) {
  const monthly = useMetricView('integrity_funnel', {
    measures: ['flagged_claims', 'audits_recommended', 'discrepancies_confirmed'],
    dimensions: ['service_month'],
    filter,
    orderBy: [{ field: 'service_month', direction: 'ASC' }],
    autoStart: sliceBy === 'month',
  });
  const dim = sliceBy === 'hospital' ? 'hospital_name' : 'region';
  const grouped = useMetricView('integrity_funnel', {
    measures: [
      'flagged_claims',
      'audits_recommended',
      'claims_document_reviewed',
      'discrepancies_confirmed',
      'document_hit_rate',
      'identified_recovery',
    ],
    dimensions: [dim],
    filter,
    orderBy: [{ field: 'flagged_claims', direction: 'DESC' }],
    limit: sliceBy === 'hospital' ? 15 : 20,
    autoStart: sliceBy !== 'month',
  });

  if (sliceBy === 'month') {
    const rows = (monthly.data ?? []).map((r) => ({
      month: isoMonth(r.service_month),
      'Flagged': toNum(r.flagged_claims) ?? 0,
      'Audit recommended (AI)': toNum(r.audits_recommended) ?? 0,
      'Discrepancy found (AI)': toNum(r.discrepancies_confirmed) ?? 0,
    }));
    return (
      <QueryState data={monthly.data ? rows : null} loading={monthly.loading} error={monthly.error} height={280}>
        {(list) => (
          <LineChart
            data={list}
            xKey="month"
            yKey={['Flagged', 'Audit recommended (AI)', 'Discrepancy found (AI)']}
            height={280}
            showLegend
            smooth={false}
            ariaLabel="Integrity funnel stages by service month"
          />
        )}
      </QueryState>
    );
  }

  const list = grouped.data ?? null;
  const maxRecovery = Math.max(1, ...(list ?? []).map((r) => toNum(r.identified_recovery) ?? 0));
  return (
    <QueryState data={list} loading={grouped.loading} error={grouped.error} height={280}>
      {(rows) => (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{sliceBy === 'hospital' ? 'Hospital (top 15 by flags)' : 'Region'}</TableHead>
              <TableHead className="text-right">Flagged</TableHead>
              <TableHead className="text-right">Audit rec.</TableHead>
              <TableHead className="text-right">Docs reviewed</TableHead>
              <TableHead className="text-right">Discrepancy</TableHead>
              <TableHead className="text-right">Hit rate</TableHead>
              <TableHead className="w-[22%]">Identified recovery</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const name = (sliceBy === 'hospital' ? (r as { hospital_name?: string | null }).hospital_name : (r as { region?: string | null }).region) ?? '–';
              return (
                <TableRow key={name}>
                  <TableCell className="max-w-[260px] truncate font-medium" title={name}>
                    {name}
                  </TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.flagged_claims)}</TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.audits_recommended)}</TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.claims_document_reviewed)}</TableCell>
                  <TableCell className="tabular text-right">{fmtInt(r.discrepancies_confirmed)}</TableCell>
                  <TableCell className="tabular text-right">
                    {toNum(r.claims_document_reviewed) ? fmtPct(r.document_hit_rate, 0) : '–'}
                  </TableCell>
                  <TableCell>
                    <InlineBar value={toNum(r.identified_recovery) ?? 0} max={maxRecovery} tone="ai" label={fmtAud(r.identified_recovery)} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </QueryState>
  );
}

export function FunnelPage() {
  const [slice, setSlice] = useState<SliceState>(EMPTY_SLICE);
  const [sliceBy, setSliceBy] = useState<SliceBy>('region');
  const options = useFunnelSliceOptions();
  const filter = useSliceFilter(slice);
  const { data, loading, error } = useMetricView('integrity_funnel', { measures: FUNNEL_MEASURES, filter });
  const row = data?.[0] as Record<string, string | null> | undefined;
  const decisions = toNum(row?.auditor_decisions) ?? 0;
  const common = { loading: loading && !row, error };
  const scope = describeSlice(slice);

  return (
    <>
      <PageHeader
        title="Integrity funnel"
        message="Where AI removes work and where it finds leakage: from fraud-model flags, through AI triage and AI document review, to auditor decisions."
      >
        <SliceControls slice={slice} onChange={setSlice} regions={options.regions} hospitals={options.hospitals} />
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiTile label="Flagged" value={fmtInt(row?.flagged_claims)} context={scope} hint="mv_integrity_funnel · Flagged claims" {...common} />
        <KpiTile
          label="Audit recommended"
          value={fmtInt(row?.audits_recommended)}
          ai
          context={`${fmtInt(row?.escalations)} escalated`}
          hint="mv_integrity_funnel · Audits recommended by AI (investigate + escalate)"
          {...common}
        />
        <KpiTile
          label="AI dismissal rate"
          value={fmtPct(row?.ai_dismissal_rate)}
          ai
          context={`${fmtInt(row?.dismissed_by_ai)} flags judged false positives`}
          hint="mv_integrity_funnel · Dismissed by AI / AI-triaged claims"
          {...common}
        />
        <KpiTile
          label="Documents reviewed"
          value={fmtInt(row?.claims_document_reviewed)}
          ai
          context="Claims whose scans AI read"
          hint="mv_integrity_funnel · Claims with documents reviewed"
          {...common}
        />
        <KpiTile
          label="Discrepancies found"
          value={fmtInt(row?.discrepancies_confirmed)}
          ai
          context="Documents contradict the bill"
          hint="mv_integrity_funnel · Discrepancies found in documents (AI document review outcome)"
          {...common}
        />
        <KpiTile
          label="Document hit rate"
          value={fmtPct(row?.document_hit_rate)}
          ai
          context="Of claims with documents reviewed"
          hint="mv_integrity_funnel · Discrepancies found / claims with documents reviewed"
          {...common}
        />
        <KpiTile
          label="Identified recovery"
          value={fmtAud(row?.identified_recovery)}
          unit="AUD"
          ai
          context={decisions === 0 ? 'Confirmed: awaiting auditor decisions' : `Confirmed ${fmtAud(row?.confirmed_recovery)}`}
          hint="mv_integrity_funnel · Identified recovery (SQL-computed from AI findings)"
          {...common}
        />
        <KpiTile
          label="AI–auditor agreement"
          value={decisions === 0 ? 'Pending' : fmtPct(row?.ai_auditor_agreement_rate)}
          context={decisions === 0 ? 'No auditor decisions yet' : `${fmtInt(decisions)} decisions`}
          hint="mv_integrity_funnel · Share of auditor decisions that agree with the AI outcome. Populates once auditor decisions sync back from Lakebase."
          {...common}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Section
          className="xl:col-span-3"
          title={
            row
              ? `AI narrowed ${fmtInt(row.flagged_claims)} flags to ${fmtInt(row.discrepancies_confirmed)} documented discrepancies`
              : 'Funnel stages'
          }
          description={scope}
          source={
            <>
              <Mono>mv_integrity_funnel</Mono> · Flagged claims → AI-triaged → Audits recommended → Claims with documents
              reviewed → Discrepancies found → Auditor decisions
            </>
          }
        >
          {error ? <ErrorBlock error={error} /> : !row ? <LoadingBlock height={260} /> : <FunnelStages row={row} />}
        </Section>
        <div className="space-y-6 xl:col-span-2">
          <Section
            title="AI document review outcomes"
            description="What the documents said, for claims whose scans were read"
            source={
              <>
                <Mono>mv_integrity_funnel</Mono> · AI document review outcome
              </>
            }
          >
            {error ? <ErrorBlock error={error} /> : !row ? <LoadingBlock height={110} /> : <OutcomeSplit row={row} />}
          </Section>
          <Section
            title="AI triage recommendations"
            description="Claim-only triage of every flag, before documents are requested"
            source={
              <>
                <Mono>mv_integrity_funnel</Mono> · AI-triaged claims by AI triage recommendation
              </>
            }
          >
            <TriageMix filter={filter} />
          </Section>
        </div>
      </div>

      <Section
        title="Slice the funnel"
        description={scope}
        actions={
          <ToggleGroup type="single" size="sm" variant="outline" value={sliceBy} onValueChange={(v) => v && setSliceBy(v as SliceBy)}>
            <ToggleGroupItem value="month">By month</ToggleGroupItem>
            <ToggleGroupItem value="region">By region</ToggleGroupItem>
            <ToggleGroupItem value="hospital">By hospital</ToggleGroupItem>
          </ToggleGroup>
        }
        source={
          <>
            <Mono>mv_integrity_funnel</Mono> grouped by{' '}
            {sliceBy === 'month' ? 'Service month' : sliceBy === 'region' ? 'Region' : 'Hospital'}
          </>
        }
      >
        <Breakdown key={sliceBy} filter={filter} sliceBy={sliceBy} />
      </Section>
    </>
  );
}
