import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import {
  Badge,
  Button,
  Input,
  Label,
  ScrollArea,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsList,
  TabsTrigger,
  useAnalyticsQuery,
} from '@databricks/appkit-ui/react';
import { sql } from '@databricks/appkit-ui/js';
import { Calculator, FileText, MapPin, Quote, Search, ShieldCheck, X } from 'lucide-react';
import {
  AiBadge,
  AiPanel,
  EmptyBlock,
  ErrorBlock,
  LoadingBlock,
  Mono,
  PageHeader,
  Section,
  ToneBadge,
} from '../components/blocks';
import { EvidenceCrop, ScanViewer, parseBbox, type LayoutBox, type ScanBox } from '../components/ScanViewer';
import {
  DETECTION_METHOD,
  DOC_TYPE,
  FINDING_OUTCOME,
  REVIEW_OUTCOME,
  VERDICT,
  discrepancyLabel,
  outcomeOf,
} from '../lib/labels';
import { fmtAud, fmtDay, fmtInt, fmtPct, toNum } from '../lib/format';
import { cn } from '../lib/utils';

const DEMO_CLAIM = 'CLM-W0-2021-00000082';
type OutcomeFilter = 'all' | 'discrepancy_confirmed' | 'needs_more_information' | 'documents_support_claim';

/* ------------------------------------------------------------ claim list */

interface ClaimListRow {
  claim_number: string;
  review_outcome: string;
  identified_recovery_aud: number;
  primary_discrepancy_type: string;
  discrepancy_count: number;
  hospital_name: string;
  region: string;
  service_date: string;
  checks: number;
  located_evidence: number;
}

function ClaimPicker({
  rows,
  loading,
  error,
  selected,
  onSelect,
  hospital,
  onClearHospital,
}: {
  rows: ClaimListRow[];
  loading: boolean;
  error: string | null;
  selected: string | null;
  onSelect: (claim: string) => void;
  hospital: string | null;
  onClearHospital: () => void;
}) {
  const [search, setSearch] = useState('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (outcome === 'all' || r.review_outcome === outcome) &&
        (!hospital || r.hospital_name === hospital) &&
        (!q || r.claim_number.toLowerCase().includes(q) || r.hospital_name.toLowerCase().includes(q)),
    );
  }, [rows, search, outcome, hospital]);

  return (
    <Section
      title="Claims with AI-reviewed documents"
      description={`${fmtInt(filtered.length)} of ${fmtInt(rows.length)} claims`}
      contentClassName="space-y-3"
      source={
        <>
          <Mono>gold.claim_document_review</Mono> + <Mono>gold.claim_finding</Mono>
        </>
      }
    >
      <div className="relative">
        <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Claim number or hospital"
          className="pl-8"
          aria-label="Search claims"
        />
      </div>
      <Select value={outcome} onValueChange={(v) => setOutcome(v as OutcomeFilter)}>
        <SelectTrigger size="sm" className="w-full" aria-label="AI review outcome">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All outcomes</SelectItem>
          <SelectItem value="discrepancy_confirmed">Discrepancy found</SelectItem>
          <SelectItem value="needs_more_information">Needs more information</SelectItem>
          <SelectItem value="documents_support_claim">Documents support claim</SelectItem>
        </SelectContent>
      </Select>
      {hospital && (
        <Badge variant="secondary" className="gap-1">
          {hospital}
          <button type="button" onClick={onClearHospital} aria-label="Clear hospital filter">
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {error ? (
        <ErrorBlock error={error} />
      ) : loading && rows.length === 0 ? (
        <LoadingBlock height={480} />
      ) : filtered.length === 0 ? (
        <EmptyBlock title="No claims match" description="Clear the search or outcome filter." />
      ) : (
        <ScrollArea className="h-[620px] pr-2">
          <ul className="space-y-1">
            {filtered.map((r) => {
              const o = outcomeOf(REVIEW_OUTCOME, r.review_outcome);
              const active = r.claim_number === selected;
              return (
                <li key={r.claim_number}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.claim_number)}
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors',
                      active ? 'border-ai/50 bg-ai-muted/60' : 'border-transparent hover:bg-muted',
                    )}
                    aria-current={active}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-medium">{r.claim_number}</span>
                      {toNum(r.identified_recovery_aud) ? (
                        <span className="tabular text-xs font-semibold">{fmtAud(r.identified_recovery_aud, 'whole')}</span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.hospital_name || '–'}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          o.tone === 'bad' ? 'bg-destructive' : o.tone === 'warn' ? 'bg-warning' : 'bg-success',
                        )}
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {o.label}
                        {r.primary_discrepancy_type ? ` · ${discrepancyLabel(r.primary_discrepancy_type)}` : ''}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </ScrollArea>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------- findings */

interface FindingRow {
  finding_id: string;
  discrepancy_type: string;
  discrepancy_title: string;
  audit_type: string;
  detection_method: string;
  verdict: string;
  outcome: string;
  line_number: number;
  billed_item_code: string;
  billed_item_description: string;
  billed_quantity: number;
  billed_charge_aud: number;
  billed_benefit_aud: number;
  supported_fraction: number;
  supported_item_code: string;
  supported_quantity: number;
  recovery_aud: number;
  recovery_basis: string;
  documented_detail: string;
  reasoning: string;
  confidence: number;
  evidence_quote: string;
  evidence_bbox: string;
  evidence_page: number;
  source_document_type: string;
  document_id: string;
  hospital_name: string;
  region: string;
  service_date: string;
}

function ConfidenceMeter({ value }: { value: number | null }) {
  if (value === null) return null;
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" title="Model-reported confidence">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full bg-ai" style={{ width: `${pct}%` }} />
      </span>
      <span className="tabular">{pct}% confidence</span>
    </span>
  );
}

function FindingCard({
  f,
  active,
  onSelect,
}: {
  f: FindingRow;
  active: boolean;
  onSelect: () => void;
}) {
  const outcome = outcomeOf(FINDING_OUTCOME, f.outcome);
  const verdict = outcomeOf(VERDICT, f.verdict);
  const method = DETECTION_METHOD[f.detection_method];
  const located = parseBbox(f.evidence_bbox) !== null;
  const recovery = toNum(f.recovery_aud) ?? 0;
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      className={cn(
        'cursor-pointer space-y-2.5 rounded-lg border p-3 transition-colors',
        active ? 'border-evidence/60 bg-evidence-muted/30 ring-1 ring-evidence/30' : 'hover:bg-muted/50',
      )}
      aria-pressed={active}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug">{f.discrepancy_title || discrepancyLabel(f.discrepancy_type)}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            Line {fmtInt(f.line_number)} · item <span className="font-mono">{f.billed_item_code || '–'}</span>{' '}
            {f.billed_item_description} · qty {fmtInt(f.billed_quantity)}
          </div>
        </div>
        <ToneBadge tone={outcome.tone}>{outcome.label}</ToneBadge>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <ToneBadge tone={verdict.tone} className="font-normal">
          {verdict.label}
        </ToneBadge>
        <Badge variant="outline" className="font-normal" title={method?.description}>
          {method?.label ?? f.detection_method}
        </Badge>
        <ConfidenceMeter value={toNum(f.confidence)} />
      </div>

      {f.evidence_quote && (
        <blockquote className="flex gap-2 rounded-md border-l-4 border-evidence bg-muted/50 px-3 py-2 text-sm italic">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <span>
            “{f.evidence_quote}”
            <span className="mt-1 block text-[11px] not-italic text-muted-foreground">
              {DOC_TYPE[f.source_document_type] ?? f.source_document_type} ·{' '}
              {located ? (
                <span className="inline-flex items-center gap-0.5">
                  <MapPin className="h-3 w-3" /> located on scan
                </span>
              ) : (
                'not located on scan'
              )}
            </span>
          </span>
        </blockquote>
      )}

      {f.reasoning && (
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Why <AiBadge label="AI reasoning" />
          </div>
          <p className="text-sm leading-relaxed">{f.reasoning}</p>
          {f.documented_detail && (
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Documented: </span>
              {f.documented_detail}
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Calculator className="h-3.5 w-3.5" />
          Billed benefit {fmtAud(f.billed_benefit_aud, 'cents')} · supported {fmtPct(f.supported_fraction, 0)} ·{' '}
          <Mono>{f.recovery_basis || 'n/a'}</Mono>
        </span>
        <span className={cn('tabular text-sm font-semibold', recovery > 0 ? 'text-destructive' : 'text-muted-foreground')}>
          {recovery > 0 ? `Recovery ${fmtAud(recovery, 'cents')}` : 'No recovery'}
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- page */

function ClaimDetail({ claim }: { claim: string }) {
  const params = useMemo(() => ({ claim_number: sql.string(claim) }), [claim]);
  const review = useAnalyticsQuery('claim_review', params);
  const findingsQ = useAnalyticsQuery('claim_findings', params);
  const docsQ = useAnalyticsQuery('claim_documents', params);
  const elementsQ = useAnalyticsQuery('document_elements', params);

  const findings = useMemo(() => (findingsQ.data ?? []) as FindingRow[], [findingsQ.data]);
  const r = review.data?.[0];
  const docs = useMemo(() => docsQ.data ?? [], [docsQ.data]);
  const docTypes = useMemo(() => {
    const fromDocs = docs.map((d) => d.document_type);
    const fromFindings = findings.map((f) => f.source_document_type).filter(Boolean);
    const all = [...new Set([...fromDocs, ...fromFindings])];
    return all.sort((a, b) => (a === 'operative_note' ? -1 : b === 'operative_note' ? 1 : 0));
  }, [docs, findings]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [docOverride, setDocOverride] = useState<string | null>(null);
  const [showLayout, setShowLayout] = useState(false);

  // Default to the highest-value located discrepancy (query orders discrepancies first).
  const defaultFinding = findings.find((f) => f.outcome === 'discrepancy' && parseBbox(f.evidence_bbox)) ?? findings.find((f) => parseBbox(f.evidence_bbox)) ?? findings[0];
  const active = findings.find((f) => f.finding_id === activeId) ?? defaultFinding ?? null;
  const doc = docOverride ?? active?.source_document_type ?? docTypes[0] ?? 'operative_note';

  const elementsForDoc = useMemo(
    () => (elementsQ.data ?? []).filter((e) => e.document_type === doc),
    [elementsQ.data, doc],
  );
  const sourceWidth = toNum(elementsForDoc[0]?.image_width) ?? 3584;
  const sourceHeight = toNum(elementsForDoc[0]?.image_height) ?? 4800;

  const boxes: ScanBox[] = useMemo(
    () =>
      findings
        .filter((f) => f.source_document_type === doc)
        .map((f) => ({ f, bbox: parseBbox(f.evidence_bbox) }))
        .filter((x): x is { f: FindingRow; bbox: NonNullable<ReturnType<typeof parseBbox>> } => x.bbox !== null)
        .map(({ f, bbox }) => ({
          id: f.finding_id,
          bbox,
          label: `${f.discrepancy_title}: “${f.evidence_quote}”`,
          tone: f.outcome === 'discrepancy' ? 'bad' : f.outcome === 'needs_information' ? 'warn' : 'good',
        })),
    [findings, doc],
  );
  const layout: LayoutBox[] = useMemo(
    () =>
      showLayout
        ? elementsForDoc
            .map((e) => ({ e, bbox: parseBbox(e.bbox) }))
            .filter((x): x is { e: (typeof elementsForDoc)[number]; bbox: NonNullable<ReturnType<typeof parseBbox>> } => x.bbox !== null)
            .map(({ e, bbox }) => ({
              id: `${e.document_id}-${e.element_index}`,
              bbox,
              label: `${e.element_type} (${fmtPct(e.confidence, 0)}): ${e.content}`,
            }))
        : [],
    [showLayout, elementsForDoc],
  );

  const activeBbox = active && active.source_document_type === doc ? parseBbox(active.evidence_bbox) : null;
  const reviewOutcome = outcomeOf(REVIEW_OUTCOME, r?.review_outcome);
  const firstFinding = findings[0];

  if (review.error || findingsQ.error) return <ErrorBlock error={review.error ?? findingsQ.error ?? ''} />;
  if ((review.loading && !r) || (findingsQ.loading && findings.length === 0)) return <LoadingBlock height={640} label="Loading AI findings…" />;
  if (!r) return <EmptyBlock title="No AI review for this claim" description="Pick another claim from the list." />;

  const discrepancies = findings.filter((f) => f.outcome === 'discrepancy');
  const selectFinding = (id: string) => {
    setActiveId(id);
    setDocOverride(null);
  };

  return (
    <div className="space-y-4">
      {/* Claim header */}
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-mono text-lg font-semibold">{claim}</h2>
            <ToneBadge tone={reviewOutcome.tone}>{reviewOutcome.label}</ToneBadge>
          </div>
          <p className="text-sm text-muted-foreground">
            {firstFinding?.hospital_name || 'Hospital n/a'} · {firstFinding?.region || '–'} · service {fmtDay(firstFinding?.service_date)} ·{' '}
            {fmtInt(r.documents_received)} document{toNum(r.documents_received) === 1 ? '' : 's'} · reviewed {fmtDay(r.reviewed_at)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 text-right">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Discrepancies</div>
            <div className="tabular text-xl font-semibold">{fmtInt(r.discrepancy_count)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Info gaps</div>
            <div className="tabular text-xl font-semibold">{fmtInt(r.needs_information_count)}</div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Identified recovery</div>
            <div className={cn('tabular text-xl font-semibold', toNum(r.identified_recovery_aud) ? 'text-destructive' : '')}>
              {fmtAud(r.identified_recovery_aud, 'cents')}
            </div>
          </div>
        </div>
      </div>

      {r.findings_narrative && (
        <AiPanel
          title="What the AI concluded"
          footer={
            <>
              Assembled from the per-line findings below. Auditor decision: <b>pending</b> — the AI recommends, an auditor
              decides.
            </>
          }
        >
          {r.findings_narrative}
        </AiPanel>
      )}

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] xl:grid-cols-2">
        {/* Findings */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">
              {fmtInt(findings.length)} checks · {fmtInt(discrepancies.length)} discrepanc{discrepancies.length === 1 ? 'y' : 'ies'}
            </h3>
            <span className="text-xs text-muted-foreground">Click a finding to see it on the scan</span>
          </div>
          {findings.length === 0 ? (
            <EmptyBlock title="No findings recorded" description="The AI evaluated this claim but recorded no line-level checks." />
          ) : (
            <ScrollArea className="h-[800px] pr-2">
              <div className="space-y-2">
                {findings.map((f) => (
                  <FindingCard key={f.finding_id} f={f} active={active?.finding_id === f.finding_id} onSelect={() => selectFinding(f.finding_id)} />
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Scan */}
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Tabs value={doc} onValueChange={(v) => setDocOverride(v)}>
              <TabsList>
                {docTypes.map((d) => (
                  <TabsTrigger key={d} value={d}>
                    <FileText className="mr-1 h-3.5 w-3.5" />
                    {DOC_TYPE[d] ?? d}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className="flex items-center gap-2">
              <Switch id="show-layout" checked={showLayout} onCheckedChange={setShowLayout} />
              <Label htmlFor="show-layout" className="text-xs">
                Show AI-parsed layout ({fmtInt(elementsForDoc.length)} elements)
              </Label>
            </div>
          </div>
          {activeBbox && <EvidenceCrop claim={claim} doc={doc} bbox={activeBbox} />}
          <ScanViewer
            claim={claim}
            doc={doc}
            sourceWidth={sourceWidth}
            sourceHeight={sourceHeight}
            boxes={boxes}
            activeId={active?.finding_id ?? null}
            layout={layout}
            onSelect={selectFinding}
            height={activeBbox ? 640 : 760}
          />
          {docs
            .filter((d) => d.document_type === doc)
            .map((d) => {
              const summary = doc === 'operative_note' ? r.operative_note_ai_summary : r.discharge_summary_ai_summary;
              return (
                <div key={d.document_id} className="space-y-2">
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>
                      <Mono>ai_parse_document</Mono> {fmtInt(d.element_count)} elements, {fmtPct(d.avg_element_confidence)} avg
                      confidence
                    </span>
                    <span>
                      · <Mono>ai_classify</Mono> {d.type_check_passed ? 'confirmed document type' : `read as ${d.classified_document_type}`}
                    </span>
                    <span>
                      · <Mono>ai_extract</Mono> {fmtPct(d.avg_field_confidence)} field confidence
                    </span>
                  </div>
                  {summary && (
                    <AiPanel title="Clinical summary" badge={<AiBadge label="ai_summarize" detail="One-paragraph clinical summary written by ai_summarize from the PII-masked document text." />}>
                      {summary}
                    </AiPanel>
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

export function EvidencePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const params = useMemo(() => ({}), []);
  const list = useAnalyticsQuery('evidence_claims', params);
  const rows = useMemo(() => (list.data ?? []) as ClaimListRow[], [list.data]);
  const hospital = searchParams.get('hospital');
  const claimParam = searchParams.get('claim');

  const selected = useMemo(() => {
    if (claimParam) return claimParam;
    const pool = hospital ? rows.filter((r) => r.hospital_name === hospital) : rows;
    if (!hospital && rows.some((r) => r.claim_number === DEMO_CLAIM)) return DEMO_CLAIM;
    return pool[0]?.claim_number ?? null;
  }, [claimParam, hospital, rows]);

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    document.title = selected ? `${selected} · Evidence explorer` : 'Evidence explorer';
    return () => {
      document.title = 'Claims Integrity Insights';
    };
  }, [selected]);

  return (
    <>
      <PageHeader
        title="Evidence explorer"
        message="Every AI finding is traceable: the billed line, the model’s verdict and reasoning, the exact sentence it relied on — highlighted on the original scanned document — and recovery computed in SQL, not by the model."
      >
        <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs text-muted-foreground">
          <ShieldCheck className="h-4 w-4 text-success" />
          AI recommends · auditor decides
        </div>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <ClaimPicker
          rows={rows}
          loading={list.loading}
          error={list.error}
          selected={selected}
          onSelect={(c) => setParam('claim', c)}
          hospital={hospital}
          onClearHospital={() => setParam('hospital', null)}
        />
        <div className="min-w-0">
          {selected ? (
            <ClaimDetail key={selected} claim={selected} />
          ) : list.loading ? (
            <LoadingBlock height={640} />
          ) : (
            <EmptyBlock title="Select a claim" description="Choose a claim on the left to see its AI findings and evidence." />
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        <Button asChild variant="link" size="sm" className="h-auto p-0 text-xs">
          <a href={`/evidence?claim=${DEMO_CLAIM}`}>Demo claim {DEMO_CLAIM}</a>
        </Button>{' '}
        · Findings marked “Information gap” are routed to a request for more documentation, not treated as fraud.
      </p>
    </>
  );
}
