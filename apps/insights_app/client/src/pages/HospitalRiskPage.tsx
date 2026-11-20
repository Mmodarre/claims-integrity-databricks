import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  Button,
  Input,
  Label,
  ScatterChart,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useAnalyticsQuery,
  useChartUITokens,
  useThemeColors,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, ArrowRight, Search } from 'lucide-react';
import {
  AiBadge,
  AiPanel,
  EmptyBlock,
  ErrorBlock,
  KpiTile,
  LoadingBlock,
  Mono,
  PageHeader,
  QueryState,
  Section,
  ToneBadge,
  ZScoreBar,
} from '../components/blocks';
import { discrepancyLabel } from '../lib/labels';
import { fmtAud, fmtDec, fmtInt, fmtPct, fmtSigned, toNum } from '../lib/format';
import { cn } from '../lib/utils';

interface HospitalRow {
  hospital_id: number;
  hospital_name: string;
  region: string;
  hospital_claims: number;
  flagged_claims: number;
  flag_rate: number;
  flag_rate_peer_z: number | null;
  claims_with_discrepancy: number;
  discrepancy_findings: number;
  information_gaps: number;
  identified_recovery_aud: number;
  benefit_paid_aud: number;
  avg_length_of_stay: number;
  discrepancy_mix: string;
  triage_escalations: number;
  recovery_rank: number;
  needs_attention: boolean;
  risk_narrative: string;
  narrative_model: string;
}

type SortKey = 'recovery' | 'z' | 'flags';

/** "item_substitution x2, drg_upcoding x1" -> chips */
function parseMix(mix: string): Array<{ type: string; count: number }> {
  return mix
    .split(/[,;]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const m = p.match(/^(.*?)\s*x\s*(\d+)$/i);
      return m ? { type: m[1].trim(), count: Number(m[2]) } : { type: p, count: 1 };
    });
}

function Fact({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="rounded-md border bg-background px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('tabular text-sm font-semibold', emphasis && 'text-destructive')}>{value}</div>
    </div>
  );
}

function HospitalDetail({ h }: { h: HospitalRow }) {
  const z = toNum(h.flag_rate_peer_z);
  const mix = parseMix(h.discrepancy_mix ?? '');
  const recovery = toNum(h.identified_recovery_aud) ?? 0;
  const benefit = toNum(h.benefit_paid_aud) ?? 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold leading-tight">{h.hospital_name}</h3>
          <p className="text-sm text-muted-foreground">
            {h.region} · rank #{fmtInt(h.recovery_rank)} by identified recovery
          </p>
        </div>
        {h.needs_attention ? (
          <ToneBadge tone="bad">
            <AlertTriangle className="mr-1 h-3 w-3" /> Needs attention
          </ToneBadge>
        ) : (
          <ToneBadge tone="neutral">Routine monitoring</ToneBadge>
        )}
      </div>

      {h.risk_narrative ? (
        <AiPanel
          title="Risk assessment"
          badge={
            <AiBadge
              label="AI-generated"
              detail={
                <>
                  Written by <Mono>{h.narrative_model || 'an LLM'}</Mono> via <Mono>ai_query</Mono> in the Lakeflow pipeline,
                  from the figures shown below. Verify against them before acting.
                </>
              }
            />
          }
          footer={
            <>
              Model: <Mono>{h.narrative_model || 'not recorded'}</Mono> · generated from this hospital’s row in{' '}
              <Mono>gold.hospital_risk_profile</Mono>. Findings are not yet auditor-confirmed.
            </>
          }
        >
          {h.risk_narrative}
        </AiPanel>
      ) : (
        <EmptyBlock
          title="No AI narrative for this hospital"
          description="Narratives are written only for hospitals with flags, findings or outlier behaviour worth explaining."
        />
      )}

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Numbers the assessment is based on
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Fact label="Hospital claims" value={fmtInt(h.hospital_claims)} />
          <Fact label="Flagged" value={`${fmtInt(h.flagged_claims)} (${fmtPct(h.flag_rate)})`} />
          <Fact label="Flag-rate peer z" value={z === null ? '–' : fmtSigned(z)} emphasis={z !== null && z >= 2} />
          <Fact label="AI triage escalations" value={fmtInt(h.triage_escalations)} />
          <Fact label="Claims with discrepancy" value={fmtInt(h.claims_with_discrepancy)} />
          <Fact label="Discrepancy findings" value={fmtInt(h.discrepancy_findings)} />
          <Fact label="Information gaps" value={fmtInt(h.information_gaps)} />
          <Fact label="Identified recovery" value={fmtAud(recovery, 'cents')} emphasis={recovery > 0} />
          <Fact label="Benefit paid" value={fmtAud(benefit)} />
          <Fact label="Recovery / benefit" value={benefit ? fmtPct(recovery / benefit, 2) : '–'} />
          <Fact label="Avg length of stay" value={`${fmtDec(h.avg_length_of_stay, 1)} nights`} />
        </div>
      </div>

      {mix.length > 0 && (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Discrepancy mix</div>
          <div className="flex flex-wrap gap-1.5">
            {mix.map((m) => (
              <ToneBadge key={m.type} tone="neutral">
                {discrepancyLabel(m.type)} × {m.count}
              </ToneBadge>
            ))}
          </div>
        </div>
      )}

      {toNum(h.claims_with_discrepancy) ? (
        <Button asChild size="sm" variant="outline">
          <Link to={`/evidence?hospital=${encodeURIComponent(h.hospital_name)}`}>
            See the evidence on this hospital’s claims <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function RiskScatter({ rows, onSelect }: { rows: HospitalRow[]; onSelect: (id: number) => void }) {
  const ui = useChartUITokens();
  const div = useThemeColors('diverging');
  const cat = useThemeColors('categorical');
  const attentionColor = div[div.length - 1] ?? 'hsla(10, 80%, 40%, 1)';
  const otherColor = cat[0] ?? 'hsla(221, 83%, 53%, 1)';
  const points = useMemo(
    () => rows.filter((r) => toNum(r.flag_rate_peer_z) !== null),
    [rows],
  );
  const option = useMemo(() => {
    const toPoint = (r: HospitalRow) => ({
      value: [toNum(r.flag_rate_peer_z), toNum(r.identified_recovery_aud) ?? 0],
      name: r.hospital_name,
      id: r.hospital_id,
      claims: r.hospital_claims,
    });
    const size = (claims: number) => Math.max(6, Math.min(26, Math.sqrt(claims) * 2.2));
    return {
      grid: { left: 8, right: 16, top: 36, bottom: 28, containLabel: true },
      legend: { top: 0, left: 0, data: ['Needs attention', 'Other hospitals'], textStyle: { color: ui.axisTitle } },
      tooltip: {
        trigger: 'item',
        backgroundColor: ui.tooltipBg,
        borderColor: ui.grid,
        textStyle: { color: ui.axisTitle, fontSize: 12 },
        formatter: (p: { data: { name: string; value: [number, number]; claims: number } }) =>
          `<b>${p.data.name}</b><br/>Peer z ${fmtSigned(p.data.value[0])} · ${fmtInt(p.data.claims)} claims<br/>Identified recovery ${fmtAud(p.data.value[1])}`,
      },
      xAxis: {
        type: 'value',
        name: 'Flag-rate peer z-score',
        nameLocation: 'middle',
        nameGap: 24,
        nameTextStyle: { color: ui.axisLabel },
        axisLabel: { color: ui.axisLabel },
        splitLine: { lineStyle: { color: ui.grid } },
      },
      yAxis: {
        type: 'value',
        name: 'Identified recovery (AUD)',
        nameTextStyle: { color: ui.axisLabel },
        axisLabel: { color: ui.axisLabel, formatter: (v: number) => fmtAud(v) },
        splitLine: { lineStyle: { color: ui.grid } },
      },
      series: [
        {
          name: 'Other hospitals',
          type: 'scatter',
          data: points.filter((r) => !r.needs_attention).map(toPoint),
          symbolSize: (_v: unknown, p: { data: { claims: number } }) => size(p.data.claims),
          itemStyle: { color: otherColor, opacity: 0.45 },
        },
        {
          name: 'Needs attention',
          type: 'scatter',
          data: points.filter((r) => r.needs_attention).map(toPoint),
          symbolSize: (_v: unknown, p: { data: { claims: number } }) => size(p.data.claims),
          itemStyle: { color: attentionColor, opacity: 0.85 },
        },
      ],
    };
  }, [points, ui, attentionColor, otherColor]);

  const data = useMemo(() => points.map((r) => ({ z: toNum(r.flag_rate_peer_z) ?? 0, recovery: toNum(r.identified_recovery_aud) ?? 0 })), [points]);

  return (
    <ScatterChart
      data={data}
      xKey="z"
      yKey="recovery"
      height={340}
      options={option}
      onDataClick={(d) => {
        const raw = d.raw as { id?: number } | undefined;
        if (raw?.id !== undefined) onSelect(raw.id);
      }}
      ariaLabel="Hospitals by flag-rate peer z-score and identified recovery"
    />
  );
}

function ProvidersTable() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery('provider_risk', params);
  return (
    <Section
      title="Surgeons and providers to watch"
      description="Providers with document-confirmed discrepancies or a flag rate ≥ 2 standard deviations above peers"
      source={
        <>
          <Mono>gold.provider_risk_profile</Mono> · top 50
        </>
      }
    >
      <QueryState data={data} loading={loading} error={error} height={300}>
        {(rows) => (
          <ScrollArea className="h-[560px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Episodes</TableHead>
                  <TableHead className="text-right">Flag rate</TableHead>
                  <TableHead>Peer z</TableHead>
                  <TableHead className="text-right">Claims w/ discrepancy</TableHead>
                  <TableHead className="text-right">Identified recovery</TableHead>
                  <TableHead>Discrepancy types</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.provider_id}>
                    <TableCell className="font-medium">{r.provider_name}</TableCell>
                    <TableCell className="text-muted-foreground">{r.provider_category}</TableCell>
                    <TableCell className="tabular text-right">{fmtInt(r.episodes)}</TableCell>
                    <TableCell className="tabular text-right">{fmtPct(r.flag_rate)}</TableCell>
                    <TableCell>
                      <ZScoreBar z={toNum(r.flag_rate_peer_z)} />
                    </TableCell>
                    <TableCell className="tabular text-right">{fmtInt(r.claims_with_discrepancy)}</TableCell>
                    <TableCell className="tabular text-right">{fmtAud(r.identified_recovery_aud)}</TableCell>
                    <TableCell className="max-w-[260px] text-xs text-muted-foreground">
                      {(r.discrepancy_types || '')
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean)
                        .map(discrepancyLabel)
                        .join(', ') || '–'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </QueryState>
    </Section>
  );
}

export function HospitalRiskPage() {
  const params = useMemo(() => ({}), []);
  const { data, loading, error } = useAnalyticsQuery('hospital_risk', params);
  const rows = useMemo(() => (data ?? []) as HospitalRow[], [data]);
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('all');
  const [attentionOnly, setAttentionOnly] = useState(true);
  const [sort, setSort] = useState<SortKey>('recovery');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const regions = useMemo(() => [...new Set(rows.map((r) => r.region).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (!attentionOnly || r.needs_attention) &&
        (region === 'all' || r.region === region) &&
        (!q || r.hospital_name.toLowerCase().includes(q)),
    );
    const key = (r: HospitalRow) =>
      sort === 'recovery'
        ? (toNum(r.identified_recovery_aud) ?? 0)
        : sort === 'z'
          ? (toNum(r.flag_rate_peer_z) ?? -99)
          : (toNum(r.flagged_claims) ?? 0);
    return [...list].sort((a, b) => key(b) - key(a));
  }, [rows, search, region, attentionOnly, sort]);

  const selected = rows.find((r) => r.hospital_id === selectedId) ?? filtered[0] ?? null;
  const attention = rows.filter((r) => r.needs_attention).length;
  const outliers = rows.filter((r) => (toNum(r.flag_rate_peer_z) ?? 0) >= 2).length;
  const narratives = rows.filter((r) => r.risk_narrative).length;
  const maxRecovery = Math.max(1, ...rows.map((r) => toNum(r.identified_recovery_aud) ?? 0));
  const common = { loading: loading && !data, error };

  return (
    <>
      <PageHeader
        title="Hospital risk"
        message="Which facilities deserve an auditor’s time — ranked on peer-relative flag rates and document-confirmed findings, each explained in plain English by an LLM."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiTile label="Hospitals profiled" value={fmtInt(rows.length)} context="With at least one hospital episode" hint="gold.hospital_risk_profile" {...common} />
        <KpiTile
          label="Need attention"
          value={fmtInt(attention)}
          tone={attention ? 'bad' : undefined}
          context="Flag-rate outlier, escalations or findings"
          hint="gold.hospital_risk_profile · needs_attention"
          {...common}
        />
        <KpiTile label="Peer outliers" value={fmtInt(outliers)} context="Flag rate ≥ 2σ above peers" hint="gold.hospital_risk_profile · flag_rate_peer_z ≥ 2" {...common} />
        <KpiTile label="AI risk narratives" value={fmtInt(narratives)} ai context="Written by ai_query in the pipeline" hint="gold.hospital_risk_profile · risk_narrative" {...common} />
      </div>

      <Tabs defaultValue="hospitals" className="space-y-4">
        <TabsList>
          <TabsTrigger value="hospitals">Hospitals</TabsTrigger>
          <TabsTrigger value="providers">Surgeons &amp; providers</TabsTrigger>
        </TabsList>
        <TabsContent value="hospitals" className="space-y-6">
          {error ? (
            <ErrorBlock error={error} />
          ) : (
            <div className="grid gap-6 xl:grid-cols-5">
              <Section
                className="xl:col-span-3"
                title="Ranked hospitals"
                description={`${fmtInt(filtered.length)} shown · click a row for the AI assessment`}
                source={
                  <>
                    <Mono>gold.hospital_risk_profile</Mono> · peer z = (hospital flag rate − peer mean) / peer std dev
                  </>
                }
                actions={
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search hospital"
                        className="h-8 w-44 pl-8"
                        aria-label="Search hospitals"
                      />
                    </div>
                    <Select value={region} onValueChange={setRegion}>
                      <SelectTrigger size="sm" className="w-28" aria-label="Region">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All regions</SelectItem>
                        {regions.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                      <SelectTrigger size="sm" className="w-40" aria-label="Sort by">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="recovery">Sort: recovery</SelectItem>
                        <SelectItem value="z">Sort: peer z-score</SelectItem>
                        <SelectItem value="flags">Sort: flagged claims</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Switch id="attention-only" checked={attentionOnly} onCheckedChange={setAttentionOnly} />
                      <Label htmlFor="attention-only" className="text-xs">
                        Needs attention
                      </Label>
                    </div>
                  </div>
                }
              >
                {loading && !data ? (
                  <LoadingBlock height={480} />
                ) : filtered.length === 0 ? (
                  <EmptyBlock title="No hospitals match" description="Clear the search or turn off “Needs attention”." />
                ) : (
                  <ScrollArea className="h-[560px] pr-2">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Hospital</TableHead>
                          <TableHead className="text-right">Claims</TableHead>
                          <TableHead className="text-right">Flag rate</TableHead>
                          <TableHead>Peer z</TableHead>
                          <TableHead className="text-right">Findings</TableHead>
                          <TableHead className="text-right">Recovery</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((r) => {
                          const active = selected?.hospital_id === r.hospital_id;
                          const rec = toNum(r.identified_recovery_aud) ?? 0;
                          return (
                            <TableRow
                              key={r.hospital_id}
                              data-state={active ? 'selected' : undefined}
                              className="cursor-pointer"
                              onClick={() => setSelectedId(r.hospital_id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  setSelectedId(r.hospital_id);
                                }
                              }}
                              tabIndex={0}
                              aria-selected={active}
                            >
                              <TableCell>
                                <div className="flex items-center gap-1.5 font-medium">
                                  {r.needs_attention && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" aria-label="Needs attention" />}
                                  <span className="max-w-[230px] truncate" title={r.hospital_name}>
                                    {r.hospital_name}
                                  </span>
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {r.region}
                                  {r.risk_narrative ? ' · AI assessment' : ''}
                                </div>
                              </TableCell>
                              <TableCell className="tabular text-right">{fmtInt(r.hospital_claims)}</TableCell>
                              <TableCell className="tabular text-right">{fmtPct(r.flag_rate)}</TableCell>
                              <TableCell>
                                <ZScoreBar z={toNum(r.flag_rate_peer_z)} />
                              </TableCell>
                              <TableCell className="tabular text-right">{fmtInt(r.discrepancy_findings)}</TableCell>
                              <TableCell className="text-right">
                                <div className="tabular text-sm">{fmtAud(rec)}</div>
                                <div className="ml-auto mt-1 h-1 w-16 overflow-hidden rounded-full bg-muted">
                                  <div className="h-full bg-ai/70" style={{ width: `${(rec / maxRecovery) * 100}%` }} />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                )}
              </Section>
              <Section className="xl:col-span-2" title="AI assessment" description="Narrative, the facts behind it, and a path to the evidence">
                {loading && !data ? <LoadingBlock height={420} /> : selected ? <HospitalDetail h={selected} /> : <EmptyBlock title="Select a hospital" />}
              </Section>
            </div>
          )}
          <Section
            title="Outliers on both axes deserve the first audit"
            description="Each bubble is a hospital (size = claims). Right = flags well above peers; up = more recovery found in documents. Click a bubble to open its assessment."
            source={
              <>
                <Mono>gold.hospital_risk_profile</Mono> · flag_rate_peer_z × identified_recovery_aud
              </>
            }
          >
            {loading && !data ? <LoadingBlock height={340} /> : <RiskScatter rows={rows} onSelect={(id) => {
              setSelectedId(id);
              setAttentionOnly(false);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }} />}
          </Section>
        </TabsContent>
        <TabsContent value="providers">
          <ProvidersTable />
        </TabsContent>
      </Tabs>
    </>
  );
}
