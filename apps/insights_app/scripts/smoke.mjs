// Smoke-test every data request the insights app makes. Usage: node smoke.mjs <baseUrl> [bearerToken]
const base = process.argv[2] ?? 'http://localhost:8000';
const token = process.argv[3];
const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
const S = (v) => ({ __sql_type: 'STRING', value: v });
const CLAIM = 'CLM-W0-2021-00000082';

const queries = [
  ['data_freshness', {}], ['forecast_series', { claim_type: S('Hospital') }], ['forecast_series', { claim_type: S('Ambulance') }],
  ['forecast_summary', {}], ['hospital_risk', {}], ['provider_risk', {}], ['evidence_claims', {}],
  ['claim_review', { claim_number: S(CLAIM) }], ['claim_findings', { claim_number: S(CLAIM) }],
  ['claim_documents', { claim_number: S(CLAIM) }], ['document_elements', { claim_number: S(CLAIM) }],
  ['low_confidence_documents', {}],
];
const disc = { member: 'outcome', operator: 'equals', values: ['discrepancy'] };
const slice = { and: [{ member: 'region', operator: 'equals', values: ['NSW'] }, { member: 'service_month', operator: 'gte', values: ['2022-01-01'] }, { member: 'service_month', operator: 'lte', values: ['2022-12-31'] }] };
const FUNNEL = ['flagged_claims','triaged_claims','audits_recommended','escalations','dismissed_by_ai','ai_dismissal_rate','claims_document_reviewed','discrepancies_confirmed','needs_more_information','documents_support_claim','document_hit_rate','identified_recovery','confirmed_recovery','auditor_decisions','ai_auditor_agreement_rate'];
const DOC = ['documents_processed','documents_parsed','documents_extracted','layout_elements','avg_parse_confidence','avg_extraction_confidence','type_check_pass_rate','total_checks_evaluated','total_discrepancies_found','total_llm_discrepancies','total_rule_discrepancies','total_information_gaps'];
const metrics = [
  ['claims_overview', { measures: ['claim_count','benefit_paid','member_gap','total_charged','rejection_rate','flag_rate','flagged_claims'] }],
  ['claims_overview', { measures: ['claim_count','benefit_paid','member_gap','rejection_rate','flag_rate'], dimensions: ['service_year'] }],
  ['claims_overview', { measures: ['benefit_paid','claim_count'], dimensions: ['service_month','claim_type'], orderBy: [{ field: 'service_month', direction: 'ASC' }] }],
  ['integrity_funnel', { measures: ['identified_recovery','confirmed_recovery','auditor_decisions','recovery_rate_on_flagged'] }],
  ['integrity_funnel', { measures: FUNNEL }],
  ['integrity_funnel', { measures: FUNNEL, filter: slice }],
  ['integrity_funnel', { measures: ['triaged_claims','triage_estimated_impact'], dimensions: ['triage_recommendation'] }],
  ['integrity_funnel', { measures: ['flagged_claims','audits_recommended','discrepancies_confirmed'], dimensions: ['service_month'], orderBy: [{ field: 'service_month', direction: 'ASC' }] }],
  ['integrity_funnel', { measures: ['flagged_claims','audits_recommended','claims_document_reviewed','discrepancies_confirmed','document_hit_rate','identified_recovery'], dimensions: ['region'], orderBy: [{ field: 'flagged_claims', direction: 'DESC' }], limit: 20 }],
  ['integrity_funnel', { measures: ['flagged_claims','audits_recommended','claims_document_reviewed','discrepancies_confirmed','document_hit_rate','identified_recovery'], dimensions: ['hospital_name'], orderBy: [{ field: 'flagged_claims', direction: 'DESC' }], limit: 15 }],
  ['integrity_funnel', { measures: ['cases'], dimensions: ['region'], orderBy: [{ field: 'region', direction: 'ASC' }] }],
  ['integrity_funnel', { measures: ['flagged_claims'], dimensions: ['hospital_name'], orderBy: [{ field: 'hospital_name', direction: 'ASC' }] }],
  ['document_ai', { measures: ['documents_processed','total_checks_evaluated'] }],
  ['document_ai', { measures: DOC }],
  ['document_ai', { measures: DOC, dimensions: ['document_type'] }],
  ['recovery', { measures: ['identified_recovery','pending_recovery','confirmed_recovery','discrepancy_findings','claims_with_discrepancy','information_gaps','avg_recovery_per_discrepancy','recovery_share_of_disputed_benefit','avg_confidence'] }],
  ['recovery', { measures: ['identified_recovery','discrepancy_findings'], dimensions: ['discrepancy_title','detection_method'], filter: disc }],
  ['recovery', { measures: ['discrepancy_findings','information_gaps','identified_recovery','avg_confidence','claims_with_discrepancy','findings'], dimensions: ['detection_method'] }],
  ['recovery', { measures: ['identified_recovery','discrepancy_findings'], dimensions: ['recovery_basis'], filter: disc }],
  ['recovery', { measures: ['identified_recovery','discrepancy_findings','claims_with_discrepancy'], dimensions: ['hospital_name'], filter: disc, orderBy: [{ field: 'identified_recovery', direction: 'DESC' }], limit: 10 }],
  ['recovery', { measures: ['identified_recovery','discrepancy_findings','claims_with_discrepancy'], dimensions: ['surgeon_name'], filter: { and: [{ member: 'detection_method', operator: 'equals', values: ['llm'] }, disc] }, orderBy: [{ field: 'identified_recovery', direction: 'DESC' }], limit: 10 }],
  ['recovery', { measures: ['findings'], dimensions: ['region'], orderBy: [{ field: 'region', direction: 'ASC' }] }],
];

async function sse(url, body) {
  const t0 = Date.now();
  const res = await fetch(base + url, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) return { ok: false, ms: Date.now() - t0, msg: `HTTP ${res.status} ${text.slice(0, 200)}` };
  for (const line of text.split('\n')) {
    if (!line.startsWith('data:')) continue;
    try {
      const evt = JSON.parse(line.slice(5));
      if (evt.type === 'result') return { ok: true, ms: Date.now() - t0, msg: `${Array.isArray(evt.data) ? evt.data.length : '?'} rows`, sample: Array.isArray(evt.data) ? evt.data[0] : undefined };
      if (evt.type === 'error') return { ok: false, ms: Date.now() - t0, msg: `error: ${JSON.stringify(evt).slice(0, 300)}` };
    } catch {}
  }
  return { ok: false, ms: Date.now() - t0, msg: `no result event: ${text.slice(0, 200)}` };
}

let failures = 0;
const verbose = process.env.VERBOSE === '1';
for (const [key, params] of queries) {
  const r = await sse(`/api/analytics/query/${key}`, { parameters: params, format: 'JSON_ARRAY' });
  if (!r.ok) failures++;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} query  ${key.padEnd(26)} ${String(r.ms).padStart(6)}ms  ${r.msg}${verbose && r.sample ? ' ' + JSON.stringify(r.sample).slice(0, 160) : ''}`);
}
for (const [key, body] of metrics) {
  const r = await sse(`/api/analytics/metric/${key}`, body);
  if (!r.ok) failures++;
  const label = `${key}[${(body.dimensions ?? []).join(',') || 'total'}${body.filter ? ',filtered' : ''}]`;
  console.log(`${r.ok ? 'OK  ' : 'FAIL'} metric ${label.padEnd(48)} ${String(r.ms).padStart(6)}ms  ${r.msg}${verbose && r.sample ? ' ' + JSON.stringify(r.sample).slice(0, 160) : ''}`);
}
for (const path of ['/api/app-config', '/api/whoami', `/api/scans/${CLAIM}/operative_note?w=1400`, `/api/scans/${CLAIM}/operative_note?crop=234,4389,2495,4475&w=1200`, `/api/scans/${CLAIM}/discharge_summary?w=1400`, '/api/files/files/list', `/api/files/files/raw?path=/Volumes/mehdidatalake_catalog/integrity_raw/landing/exports/_manifest.json`]) {
  const t0 = Date.now();
  const res = await fetch(base + path, { headers });
  const buf = Buffer.from(await res.arrayBuffer());
  const ct = res.headers.get('content-type');
  const expectDenied = path.startsWith('/api/files/');
  const ok = expectDenied ? res.status === 403 : res.ok;
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} GET    ${path.slice(0, 70).padEnd(70)} ${String(Date.now() - t0).padStart(6)}ms  ${res.status} ${ct} ${buf.length}B${ct?.includes('json') ? ' ' + buf.toString().slice(0, 160) : ''}${res.headers.get('x-source-width') ? ` src=${res.headers.get('x-source-width')}x${res.headers.get('x-source-height')}` : ''}`);
}
console.log(failures ? `\n${failures} FAILURES` : '\nALL OK');
process.exit(failures ? 1 : 0);
