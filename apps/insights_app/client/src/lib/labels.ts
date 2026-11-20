/** Human labels for codes produced by the pipelines. */

const titleCase = (value: string) =>
  value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

const DISCREPANCY_LABELS: Record<string, string> = {
  same_day_overnight: 'Same-day billed as overnight',
  los_overbilling: 'Length-of-stay overbilling',
  quantity_overstatement: 'Quantity overstated',
  duplicate_line: 'Duplicate line',
  age_eligibility: 'Age eligibility',
  bilateral_for_unilateral: 'Bilateral billed, unilateral done',
  device_phantom: 'Device billed, not implanted',
  assistant_phantom: 'Assistant billed, not present',
  item_substitution: 'Higher-fee item substituted',
  drg_upcoding: 'DRG upcoding',
  procedure_phantom: 'Procedure billed, not performed',
  device_substitution: 'Higher-tier device billed',
  premium_iol_exploit: 'Premium lens exploit',
};

export const discrepancyLabel = (code: string | null | undefined): string =>
  code ? (DISCREPANCY_LABELS[code] ?? titleCase(code)) : '–';

export const REVIEW_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  discrepancy_confirmed: { label: 'Discrepancy found', tone: 'bad' },
  needs_more_information: { label: 'Needs more information', tone: 'warn' },
  documents_support_claim: { label: 'Documents support claim', tone: 'good' },
};

export const FINDING_OUTCOME: Record<string, { label: string; tone: Tone }> = {
  discrepancy: { label: 'Discrepancy', tone: 'bad' },
  needs_information: { label: 'Information gap', tone: 'warn' },
  supported: { label: 'Supported', tone: 'good' },
};

export const VERDICT: Record<string, { label: string; tone: Tone }> = {
  contradiction: { label: 'Document contradicts bill', tone: 'bad' },
  not_documented: { label: 'Not documented', tone: 'warn' },
  supported: { label: 'Document supports bill', tone: 'good' },
};

export const DETECTION_METHOD: Record<string, { label: string; short: string; description: string }> = {
  rule: {
    label: 'Rule on AI-extracted facts',
    short: 'Rule',
    description: 'A deterministic SQL check comparing the bill with facts ai_extract pulled from the scan.',
  },
  llm: {
    label: 'LLM document review',
    short: 'LLM',
    description: 'ai_query read the clinical prose against the billed line and returned a structured verdict.',
  },
};

export const TRIAGE: Record<string, string> = {
  dismiss: 'Dismiss',
  investigate: 'Investigate',
  escalate: 'Escalate',
};

export const DOC_TYPE: Record<string, string> = {
  operative_note: 'Operative note',
  discharge_summary: 'Discharge summary',
};

export type Tone = 'good' | 'bad' | 'warn' | 'neutral' | 'ai';

export const outcomeOf = <T extends { label: string; tone: Tone }>(
  map: Record<string, T>,
  code: string | null | undefined,
): { label: string; tone: Tone } => (code && map[code]) || { label: code ? titleCase(code) : '–', tone: 'neutral' };

export { titleCase };
