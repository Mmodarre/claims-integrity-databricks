import { useMemo } from 'react';
import { Link } from 'react-router';
import {
  BarChart,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  useAnalyticsQuery,
  useMetricView,
} from '@databricks/appkit-ui/react';
import {
  ArrowRight,
  Calculator,
  EyeOff,
  FileScan,
  FileText,
  ListChecks,
  Lock,
  Repeat,
  ScanText,
  Sparkles,
  Tags,
  UserCheck,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ErrorBlock,
  KpiTile,
  LoadingBlock,
  Mono,
  PageHeader,
  QueryState,
  Section,
  ToneBadge,
} from '../components/blocks';
import { DOC_TYPE } from '../lib/labels';
import { fmtInt, fmtPct } from '../lib/format';

const DOC_MEASURES = [
  'documents_processed',
  'documents_parsed',
  'documents_extracted',
  'layout_elements',
  'avg_parse_confidence',
  'avg_extraction_confidence',
  'type_check_pass_rate',
  'total_checks_evaluated',
  'total_discrepancies_found',
  'total_llm_discrepancies',
  'total_rule_discrepancies',
  'total_information_gaps',
] as const;

interface Stage {
  icon: LucideIcon;
  fn: string;
  title: string;
  what: string;
  metric?: string;
  metricLabel?: string;
}

function PipelineSchematic({ row }: { row: Record<string, string | null> }) {
  const stages: Stage[] = [
    {
      icon: FileScan,
      fn: 'Volume',
      title: 'Scans land',
      what: 'Discharge summaries and operative notes (JPG, 3584×4800) per claim',
      metric: fmtInt(row.documents_processed),
      metricLabel: 'documents',
    },
    {
      icon: ScanText,
      fn: 'ai_parse_document',
      title: 'Read the page',
      what: 'Layout elements with text, type and bounding boxes',
      metric: fmtInt(row.layout_elements),
      metricLabel: `elements · ${fmtPct(row.avg_parse_confidence)} avg confidence`,
    },
    {
      icon: EyeOff,
      fn: 'ai_mask · ai_classify',
      title: 'Protect & verify',
      what: 'Mask names, phones, emails, addresses; confirm the document type',
      metric: fmtPct(row.type_check_pass_rate),
      metricLabel: 'type check pass rate',
    },
    {
      icon: FileText,
      fn: 'ai_summarize',
      title: 'Summarise',
      what: 'One-paragraph clinical summary per document for the auditor',
    },
    {
      icon: Tags,
      fn: 'ai_extract',
      title: 'Extract facts',
      what: 'Dates, length of stay, diagnoses, procedures, devices — with citations',
      metric: fmtPct(row.avg_extraction_confidence),
      metricLabel: `field confidence · ${fmtInt(row.documents_extracted)} docs`,
    },
    {
      icon: ListChecks,
      fn: 'SQL rules · ai_query',
      title: 'Check the bill',
      what: 'Exact rules on extracted facts; LLM judgment where prose must be read',
      metric: fmtInt(row.total_checks_evaluated),
      metricLabel: `checks · ${fmtInt(row.total_discrepancies_found)} discrepancies`,
    },
    {
      icon: Calculator,
      fn: 'SQL',
      title: 'Price the finding',
      what: 'Recovery from fee schedules and benefit tables — never by the model',
    },
  ];
  return (
    <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7">
      {stages.map((s, i) => {
        const isAi = s.fn.startsWith('ai_') || s.fn.includes('ai_');
        return (
          <li key={s.title} className={`relative flex flex-col rounded-lg border p-3 ${isAi ? 'border-ai/30 bg-ai-muted/40' : 'bg-muted/30'}`}>
            <div className="flex items-center justify-between">
              <s.icon className={`h-5 w-5 ${isAi ? 'text-ai' : 'text-muted-foreground'}`} aria-hidden />
              <span className="tabular text-[11px] text-muted-foreground">{i + 1}</span>
            </div>
            <div className="mt-2 text-sm font-semibold">{s.title}</div>
            <div className="mt-0.5">
              <Mono>{s.fn}</Mono>
            </div>
            <p className="mt-1.5 flex-1 text-xs text-muted-foreground">{s.what}</p>
            {s.metric && (
              <div className="mt-2 border-t pt-2">
                <div className="tabular text-lg font-semibold">{s.metric}</div>
                <div className="text-[11px] text-muted-foreground">{s.metricLabel}</div>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

const GUARDRAILS: Array<{ icon: LucideIcon; title: string; body: string }> = [
  { icon: EyeOff, title: 'PII masked before reasoning', body: 'ai_mask removes names, phone numbers, emails and addresses from document text before any LLM review.' },
  { icon: Calculator, title: 'LLMs never compute money', body: 'Every recovery dollar is a SQL calculation over fee schedules and benefit tables.' },
  { icon: UserCheck, title: 'Gaps are not fraud', body: 'When a document is silent, the finding becomes “request more information”, not a discrepancy.' },
  { icon: Repeat, title: 'Each document read once', body: 'Streaming tables send each scan and each flagged claim to a model exactly once; reruns do not repeat AI calls.' },
  { icon: Lock, title: 'Ground truth stays locked away', body: 'Evaluation labels live in a restricted schema this app and Genie cannot read.' },
  { icon: Sparkles, title: 'Evidence or it didn’t happen', body: 'Findings quote the document; the quote is matched to a parsed element so it can be shown on the scan.' },
];

export function PipelinePage() {
  const totals = useMetricView('document_ai', { measures: DOC_MEASURES });
  const byType = useMetricView('document_ai', { measures: DOC_MEASURES, dimensions: ['document_type'] });
  const recovery = useMetricView('recovery', {
    measures: ['discrepancy_findings', 'information_gaps', 'identified_recovery'],
    dimensions: ['detection_method'],
  });
  const lowParams = useMemo(() => ({}), []);
  const low = useAnalyticsQuery('low_confidence_documents', lowParams);
  const t = totals.data?.[0] as Record<string, string | null> | undefined;
  const common = { loading: totals.loading && !t, error: totals.error };

  const methodChart = useMemo(
    () =>
      (byType.data ?? []).map((r) => ({
        document: DOC_TYPE[r.document_type ?? ''] ?? r.document_type ?? '',
        'Rules on extracted facts': Number(r.total_rule_discrepancies ?? 0),
        'LLM review (ai_query)': Number(r.total_llm_discrepancies ?? 0),
        'Information gaps': Number(r.total_information_gaps ?? 0),
      })),
    [byType.data],
  );

  return (
    <>
      <PageHeader
        title="AI pipeline transparency"
        message="What the AI did to every scanned clinical document, how confident it was, and the guardrails around it. All of it runs in Lakeflow pipelines with Databricks AI Functions — no bespoke model serving."
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiTile label="Documents processed" value={fmtInt(t?.documents_processed)} context={`${fmtInt(t?.documents_parsed)} parsed · ${fmtInt(t?.documents_extracted)} extracted`} hint="mv_document_ai · Documents processed / Parsed successfully / Facts extracted" {...common} />
        <KpiTile label="Parse confidence" value={fmtPct(t?.avg_parse_confidence)} ai context={`${fmtInt(t?.layout_elements)} layout elements`} hint="mv_document_ai · Avg parse confidence (ai_parse_document element confidence)" {...common} />
        <KpiTile label="Extraction confidence" value={fmtPct(t?.avg_extraction_confidence)} ai context="ai_extract field confidence" hint="mv_document_ai · Avg extraction confidence" {...common} />
        <KpiTile label="Type check pass rate" value={fmtPct(t?.type_check_pass_rate)} ai context="ai_classify agrees with the file" hint="mv_document_ai · Type check pass rate" {...common} />
        <KpiTile label="Integrity checks" value={fmtInt(t?.total_checks_evaluated)} context={`${fmtInt(t?.total_discrepancies_found)} discrepancies found`} hint="mv_document_ai · Integrity checks evaluated / Discrepancies found" {...common} />
        <KpiTile label="Information gaps" value={fmtInt(t?.total_information_gaps)} context="Routed to request-more-info" hint="mv_document_ai · Information gaps flagged" {...common} />
      </div>

      <Section
        title="From scanned page to priced finding in seven steps"
        description="Each AI step is a SQL function call inside a Lakeflow Spark Declarative Pipeline"
        source={
          <>
            <Mono>mv_document_ai</Mono> · Documents processed, Layout elements parsed, Avg parse / extraction confidence, Type
            check pass rate, Integrity checks evaluated, Discrepancies found
          </>
        }
      >
        {totals.error ? <ErrorBlock error={totals.error} /> : !t ? <LoadingBlock height={200} /> : <PipelineSchematic row={t} />}
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Operative notes drive most LLM findings; discharge summaries feed the rules"
          description="Discrepancies and information gaps raised per document type"
          source={
            <>
              <Mono>mv_document_ai</Mono> · Found by rules / Found by LLM review / Information gaps, by Document type
            </>
          }
        >
          <QueryState data={byType.data ? methodChart : null} loading={byType.loading} error={byType.error} height={260}>
            {(rows) => (
              <BarChart
                data={rows}
                xKey="document"
                yKey={['Rules on extracted facts', 'LLM review (ai_query)', 'Information gaps']}
                height={260}
                showLegend
                ariaLabel="Discrepancies by document type and detection method"
              />
            )}
          </QueryState>
        </Section>
        <Section
          title="By document type"
          description="Confidence and yield of each AI step"
          source={
            <>
              <Mono>mv_document_ai</Mono> by Document type
            </>
          }
        >
          <QueryState data={byType.data} loading={byType.loading} error={byType.error} height={180}>
            {(rows) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Docs</TableHead>
                    <TableHead className="text-right">Parse conf.</TableHead>
                    <TableHead className="text-right">Extract conf.</TableHead>
                    <TableHead className="text-right">Type check</TableHead>
                    <TableHead className="text-right">Checks</TableHead>
                    <TableHead className="text-right">Rule / LLM</TableHead>
                    <TableHead className="text-right">Gaps</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.document_type ?? 'unknown'}>
                      <TableCell className="font-medium">{DOC_TYPE[r.document_type ?? ''] ?? r.document_type}</TableCell>
                      <TableCell className="tabular text-right">{fmtInt(r.documents_processed)}</TableCell>
                      <TableCell className="tabular text-right">{fmtPct(r.avg_parse_confidence)}</TableCell>
                      <TableCell className="tabular text-right">{fmtPct(r.avg_extraction_confidence)}</TableCell>
                      <TableCell className="tabular text-right">{fmtPct(r.type_check_pass_rate, 0)}</TableCell>
                      <TableCell className="tabular text-right">{fmtInt(r.total_checks_evaluated)}</TableCell>
                      <TableCell className="tabular text-right">
                        {fmtInt(r.total_rule_discrepancies)} / {fmtInt(r.total_llm_discrepancies)}
                      </TableCell>
                      <TableCell className="tabular text-right">{fmtInt(r.total_information_gaps)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryState>
          <QueryState data={recovery.data} loading={recovery.loading} error={recovery.error} height={60}>
            {(rows) => (
              <p className="text-xs text-muted-foreground">
                At finding level ({' '}
                <Mono>mv_recovery</Mono>):{' '}
                {rows
                  .map(
                    (r) =>
                      `${r.detection_method === 'llm' ? 'LLM review' : 'rules'} raised ${fmtInt(r.discrepancy_findings)} discrepancies and ${fmtInt(r.information_gaps)} gaps`,
                  )
                  .join('; ')}
                .
              </p>
            )}
          </QueryState>
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section
          title="Where the AI was least certain"
          description="Lowest extraction confidence — good candidates for a human spot-check"
          source={
            <>
              <Mono>gold.document_ai_fact</Mono> · ordered by ai_extract field confidence
            </>
          }
        >
          <QueryState data={low.data} loading={low.loading} error={low.error} height={240}>
            {(rows) => (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Claim</TableHead>
                    <TableHead>Document</TableHead>
                    <TableHead className="text-right">Extract conf.</TableHead>
                    <TableHead className="text-right">Parse conf.</TableHead>
                    <TableHead className="text-right">Findings</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={`${r.claim_number}-${r.document_type}`}>
                      <TableCell className="font-mono text-xs">{r.claim_number}</TableCell>
                      <TableCell>{DOC_TYPE[r.document_type] ?? r.document_type}</TableCell>
                      <TableCell className="tabular text-right">{fmtPct(r.avg_field_confidence)}</TableCell>
                      <TableCell className="tabular text-right">{fmtPct(r.avg_element_confidence)}</TableCell>
                      <TableCell className="text-right">
                        {Number(r.discrepancies_found) > 0 ? (
                          <ToneBadge tone="bad">{fmtInt(r.discrepancies_found)} discrepancy</ToneBadge>
                        ) : Number(r.information_gaps) > 0 ? (
                          <ToneBadge tone="warn">{fmtInt(r.information_gaps)} gap</ToneBadge>
                        ) : (
                          <span className="text-xs text-muted-foreground">none</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link to={`/evidence?claim=${encodeURIComponent(r.claim_number)}`} className="inline-flex items-center text-xs text-primary underline-offset-4 hover:underline">
                          Inspect <ArrowRight className="ml-0.5 h-3 w-3" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </QueryState>
        </Section>
        <Section title="Guardrails built into the pipeline" description="Design decisions that make the output auditable">
          <ul className="grid gap-3 sm:grid-cols-2">
            {GUARDRAILS.map((g) => (
              <li key={g.title} className="flex gap-3 rounded-lg border p-3">
                <g.icon className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden />
                <div>
                  <div className="text-sm font-medium">{g.title}</div>
                  <p className="text-xs text-muted-foreground">{g.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
