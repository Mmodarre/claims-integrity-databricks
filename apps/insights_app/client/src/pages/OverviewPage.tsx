import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  BarChart,
  Button,
  ToggleGroup,
  ToggleGroupItem,
  useAnalyticsQuery,
  useMetricView,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { ArrowRight, Sparkles } from 'lucide-react';
import {
  AiBadge,
  ErrorBlock,
  KpiTile,
  LoadingBlock,
  Mono,
  PageHeader,
  QueryState,
  Section,
} from '../components/blocks';
import { ForecastChart, type ForecastMetric } from '../components/ForecastChart';
import { fmtAud, fmtChange, fmtDay, fmtInt, fmtPct, fmtPpChange, isoMonth, toNum } from '../lib/format';

const CLAIM_TYPES = ['Hospital', 'Extras', 'Ambulance'] as const;
type ClaimType = (typeof CLAIM_TYPES)[number];

function YoY({ current, previous, kind = 'pct' }: { current: unknown; previous: unknown; kind?: 'pct' | 'pp' }) {
  const c = current as string | null;
  const p = previous as string | null;
  const change = kind === 'pp' ? fmtPpChange(c, p) : fmtChange(c, p);
  if (!change) return null;
  return (
    <span>
      2023 <span className="tabular font-medium">{change}</span>
      <span className="text-muted-foreground"> vs 2022</span>
    </span>
  );
}

function ExecKpis() {
  const totals = useMetricView('claims_overview', {
    measures: ['claim_count', 'benefit_paid', 'member_gap', 'total_charged', 'rejection_rate', 'flag_rate', 'flagged_claims'],
  });
  const byYear = useMetricView('claims_overview', {
    measures: ['claim_count', 'benefit_paid', 'member_gap', 'rejection_rate', 'flag_rate'],
    dimensions: ['service_year'],
  });
  const funnel = useMetricView('integrity_funnel', {
    measures: ['identified_recovery', 'confirmed_recovery', 'auditor_decisions', 'recovery_rate_on_flagged'],
  });

  const t = totals.data?.[0];
  const y23 = byYear.data?.find((r) => String(r.service_year) === '2023');
  const y22 = byYear.data?.find((r) => String(r.service_year) === '2022');
  const f = funnel.data?.[0];
  const gapShare = t ? (toNum(t.member_gap) ?? 0) / (toNum(t.total_charged) || 1) : null;
  const decisions = toNum(f?.auditor_decisions) ?? 0;
  const common = { loading: totals.loading, error: totals.error };

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <KpiTile
        label="Claims"
        value={fmtInt(t?.claim_count)}
        context="All claim types, service Jan 2021 – Dec 2023"
        comparison={<YoY current={y23?.claim_count} previous={y22?.claim_count} />}
        hint="mv_claims_overview · Claims (COUNT of claims)"
        {...common}
      />
      <KpiTile
        label="Benefit paid"
        value={fmtAud(t?.benefit_paid)}
        unit="AUD"
        context="Paid by the fund"
        comparison={<YoY current={y23?.benefit_paid} previous={y22?.benefit_paid} />}
        hint="mv_claims_overview · Benefit paid"
        {...common}
      />
      <KpiTile
        label="Member gap"
        value={fmtAud(t?.member_gap)}
        unit="AUD"
        context={gapShare !== null ? `${fmtPct(gapShare)} of charges paid out of pocket` : undefined}
        comparison={<YoY current={y23?.member_gap} previous={y22?.member_gap} />}
        hint="mv_claims_overview · Member gap (out-of-pocket)"
        {...common}
      />
      <KpiTile
        label="Rejection rate"
        value={fmtPct(t?.rejection_rate)}
        context="Share of claims rejected"
        comparison={<YoY current={y23?.rejection_rate} previous={y22?.rejection_rate} kind="pp" />}
        hint="mv_claims_overview · Rejection rate = rejected claims / claims"
        {...common}
      />
      <KpiTile
        label="Flag rate"
        value={fmtPct(t?.flag_rate)}
        context={`${fmtInt(t?.flagged_claims)} hospital episodes flagged by the fraud model`}
        comparison={<YoY current={y23?.flag_rate} previous={y22?.flag_rate} kind="pp" />}
        hint="mv_claims_overview · Fraud-model flags / hospital episodes"
        {...common}
      />
      <KpiTile
        label="Identified recovery"
        value={fmtAud(f?.identified_recovery)}
        unit="AUD"
        ai
        loading={funnel.loading}
        error={funnel.error}
        context={
          decisions === 0
            ? 'Confirmed: awaiting auditor decisions'
            : `Confirmed ${fmtAud(f?.confirmed_recovery)} from ${fmtInt(decisions)} decisions`
        }
        comparison={
          f ? (
            <span>
              <span className="tabular font-medium">{fmtPct(f.recovery_rate_on_flagged)}</span>
              <span className="text-muted-foreground"> of benefit paid on flagged claims</span>
            </span>
          ) : null
        }
        hint="mv_integrity_funnel · Identified recovery: AI document review findings, dollars computed in SQL from fee schedules (never by the LLM)."
      />
    </div>
  );
}

/** Deterministic narrative assembled from governed metrics (not model-written). */
function IntegrityStory() {
  const funnel = useMetricView('integrity_funnel', {
    measures: [
      'flagged_claims',
      'audits_recommended',
      'ai_dismissal_rate',
      'claims_document_reviewed',
      'discrepancies_confirmed',
      'needs_more_information',
      'document_hit_rate',
      'identified_recovery',
      'auditor_decisions',
    ],
  });
  const docs = useMetricView('document_ai', { measures: ['documents_processed', 'total_checks_evaluated'] });
  const f = funnel.data?.[0];
  const d = docs.data?.[0];

  const steps = f
    ? [
        { label: 'Flagged by fraud model', value: fmtInt(f.flagged_claims) },
        { label: 'AI triage: audit recommended', value: fmtInt(f.audits_recommended), ai: true },
        { label: 'Claims with documents read by AI', value: fmtInt(f.claims_document_reviewed), ai: true },
        { label: 'Discrepancy found in documents', value: fmtInt(f.discrepancies_confirmed), ai: true },
        { label: 'Auditor decisions', value: fmtInt(f.auditor_decisions), pending: toNum(f.auditor_decisions) === 0 },
      ]
    : [];

  return (
    <Section
      title="How AI moved the integrity workload"
      description="From model flag to documented finding — every number links back to a governed metric view."
      source={
        <>
          <Mono>mv_integrity_funnel</Mono>, <Mono>mv_document_ai</Mono> · narrative assembled from these metrics, not
          written by a model
        </>
      }
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/funnel">
            Open funnel <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      }
    >
      {funnel.error ? (
        <ErrorBlock error={funnel.error} />
      ) : !f ? (
        <LoadingBlock height={110} />
      ) : (
        <>
          <ol className="grid grid-cols-2 gap-2 md:grid-cols-5">
            {steps.map((s, i) => (
              <li
                key={s.label}
                className={`relative rounded-lg border p-3 ${s.ai ? 'border-ai/30 bg-ai-muted/40' : 'bg-muted/40'}`}
              >
                <div className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <span className="tabular">{i + 1}</span>
                  {s.ai && <Sparkles className="h-3 w-3 text-ai" aria-label="AI step" />}
                </div>
                <div className="tabular mt-1 text-2xl font-semibold text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                {s.pending && <div className="mt-1 text-[11px] font-medium text-warning-foreground">Write-back in progress</div>}
              </li>
            ))}
          </ol>
          <p className="text-sm leading-relaxed text-foreground">
            AI triage kept <b className="tabular">{fmtInt(f.audits_recommended)}</b> of{' '}
            <b className="tabular">{fmtInt(f.flagged_claims)}</b> model flags for audit and set aside{' '}
            <b className="tabular">{fmtPct(f.ai_dismissal_rate)}</b> as likely false positives. It then read{' '}
            <b className="tabular">{fmtInt(d?.documents_processed)}</b> scanned clinical documents for{' '}
            <b className="tabular">{fmtInt(f.claims_document_reviewed)}</b> claims, ran{' '}
            <b className="tabular">{fmtInt(d?.total_checks_evaluated)}</b> integrity checks, and found the documents
            contradict the bill on <b className="tabular">{fmtInt(f.discrepancies_confirmed)}</b> claims (
            <b className="tabular">{fmtPct(f.document_hit_rate)}</b> hit rate) — identifying{' '}
            <b className="tabular">{fmtAud(f.identified_recovery)}</b> recoverable.{' '}
            <b className="tabular">{fmtInt(f.needs_more_information)}</b> claims were routed to “request more
            information” instead of being called fraud. Confirmed recovery will appear as auditors record decisions.
          </p>
        </>
      )}
    </Section>
  );
}

function MonthlyTrend() {
  const [measure, setMeasure] = useState<'benefit_paid' | 'claim_count'>('benefit_paid');
  const { data, loading, error, metadata } = useMetricView('claims_overview', {
    measures: ['benefit_paid', 'claim_count'],
    dimensions: ['service_month', 'claim_type'],
    orderBy: [{ field: 'service_month', direction: 'ASC' }],
  });

  const pivot = useMemo(() => {
    if (!data) return null;
    const byMonth = new Map<string, Record<string, string | number>>();
    for (const row of data) {
      const month = isoMonth(row.service_month);
      if (!month) continue;
      const entry = byMonth.get(month) ?? { month };
      entry[row.claim_type ?? 'Other'] = toNum(row[measure]) ?? 0;
      byMonth.set(month, entry);
    }
    return [...byMonth.values()].sort((a, b) => String(a.month).localeCompare(String(b.month)));
  }, [data, measure]);

  const types = useMemo(() => {
    const order = (c: string) => {
      const i = (CLAIM_TYPES as readonly string[]).indexOf(c);
      return i === -1 ? 99 : i;
    };
    return [...new Set((data ?? []).map((r) => r.claim_type ?? 'Other'))].sort((a, b) => order(a) - order(b));
  }, [data]);

  const label = metadata?.[measure]?.display_name ?? (measure === 'benefit_paid' ? 'Benefit paid' : 'Claims');

  return (
    <Section
      title={`${label} by service month and claim type`}
      description="2021 is the portfolio ramp-up year; volumes are steady from 2022."
      source={
        <>
          <Mono>mv_claims_overview</Mono> · {label} by Service month × Claim type
        </>
      }
      actions={
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={measure}
          onValueChange={(v) => v && setMeasure(v as typeof measure)}
        >
          <ToggleGroupItem value="benefit_paid">Benefit paid</ToggleGroupItem>
          <ToggleGroupItem value="claim_count">Claims</ToggleGroupItem>
        </ToggleGroup>
      }
    >
      <QueryState data={pivot} loading={loading} error={error} height={300}>
        {(rows) => (
          <BarChart
            data={rows}
            xKey="month"
            yKey={types}
            stacked
            height={300}
            showLegend
            colorPalette="categorical"
            valueFormatter={(v) => (measure === 'benefit_paid' ? fmtAud(v) : fmtInt(v))}
            ariaLabel={`${label} by month, stacked by claim type`}
          />
        )}
      </QueryState>
    </Section>
  );
}

function ForecastSection() {
  const [claimType, setClaimType] = useState<ClaimType>('Hospital');
  const [metric, setMetric] = useState<ForecastMetric>('benefit_paid');
  const params = useMemo(() => ({ claim_type: sql.string(claimType) }), [claimType]);
  const series = useAnalyticsQuery('forecast_series', params);
  const summaryParams = useMemo(() => ({}), []);
  const summary = useAnalyticsQuery('forecast_summary', summaryParams);
  const s = summary.data?.find((r) => r.claim_type === claimType);

  const projected = s ? (metric === 'claims' ? s.forecast_claims : s.forecast_benefit) : null;
  const trailing = s ? (metric === 'claims' ? s.trailing_claims : s.trailing_benefit) : null;
  const change = fmtChange(projected, trailing);
  const fmt = (v: unknown) => (metric === 'claims' ? fmtInt(v as number) : fmtAud(v as number));
  const metricLabel = metric === 'claims' ? 'claims' : 'benefit paid';

  const title = s
    ? `${claimType} ${metricLabel} projected at ${fmt(projected)} over the next ${s.forecast_weeks} weeks${
        change ? ` (${change} vs the last ${s.forecast_weeks} weeks)` : ''
      }`
    : `${claimType} ${metricLabel}: actuals and AI forecast`;

  return (
    <Section
      title={title}
      description={
        s ? (
          <>
            Weekly projection {fmtDay(s.forecast_start)} – {fmtDay(s.forecast_end)} with a 90% prediction interval
            (hatched). Generated in SQL by the <Mono>ai_forecast</Mono> AI Function.
          </>
        ) : (
          'Weekly projection with a 90% prediction interval, generated by ai_forecast.'
        )
      }
      source={
        <>
          <Mono>gold.claims_forecast</Mono> (ai_forecast over weekly <Mono>claims_fact</Mono> actuals, 2022–2023)
        </>
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <AiBadge label="AI forecast" detail="ai_forecast fits a time-series model per claim type and returns point forecasts with 90% upper/lower bounds." />
          <ToggleGroup type="single" size="sm" variant="outline" value={claimType} onValueChange={(v) => v && setClaimType(v as ClaimType)}>
            {CLAIM_TYPES.map((c) => (
              <ToggleGroupItem key={c} value={c}>
                {c}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <ToggleGroup type="single" size="sm" variant="outline" value={metric} onValueChange={(v) => v && setMetric(v as ForecastMetric)}>
            <ToggleGroupItem value="benefit_paid">Benefit</ToggleGroupItem>
            <ToggleGroupItem value="claims">Claims</ToggleGroupItem>
          </ToggleGroup>
        </div>
      }
    >
      <QueryState data={series.data} loading={series.loading} error={series.error} height={320}>
        {(rows) => <ForecastChart rows={rows} metric={metric} />}
      </QueryState>
    </Section>
  );
}

export function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Integrity at a glance"
        message="Portfolio performance, where AI found leakage, and what the next six months look like. Aggregates come from Unity Catalog metric views — the same definitions Genie uses."
      />
      <ExecKpis />
      <IntegrityStory />
      <div className="grid gap-6 xl:grid-cols-2">
        <MonthlyTrend />
        <ForecastSection />
      </div>
    </>
  );
}
