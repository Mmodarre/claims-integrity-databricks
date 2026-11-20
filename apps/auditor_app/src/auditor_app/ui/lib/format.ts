// Display helpers shared across the queue and case views.

const AUD = new Intl.NumberFormat("en-AU", {
  style: "currency",
  currency: "AUD",
  maximumFractionDigits: 2,
});

export function formatAud(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return AUD.format(value);
}

export function formatDate(value?: string | null): string {
  if (!value) return "—";
  // Accepts "2023-04-10" or full ISO timestamps; render the date part in en-AU.
  const d = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}

export function formatScore(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return value.toFixed(2);
}

export function formatBool(value?: boolean | null): string {
  if (value === null || value === undefined) return "—";
  return value ? "Yes" : "No";
}

// "los_overbilling" -> "Los overbilling"; "ASSESSED" -> "Assessed".
export function humanize(value?: string | null): string {
  if (!value) return "—";
  const spaced = value.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

export function recommendationVariant(value?: string | null): BadgeVariant {
  switch (value) {
    case "escalate":
      return "destructive";
    case "investigate":
      return "default";
    case "dismiss":
      return "secondary";
    default:
      return "outline";
  }
}

// Tone classes for outlined badges (consistent across queue and case views).
export const TONE = {
  red: "border-destructive/40 bg-destructive/10 text-destructive",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  green: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  blue: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-400",
  muted: "border-border bg-muted text-muted-foreground",
} as const;

// gold.claim_document_review.review_outcome
export function reviewOutcomeMeta(value?: string | null): { label: string; tone: string } {
  switch (value) {
    case "discrepancy_confirmed":
      return { label: "Discrepancy confirmed", tone: TONE.red };
    case "needs_more_information":
      return { label: "Needs more information", tone: TONE.amber };
    case "documents_support_claim":
      return { label: "Documents support claim", tone: TONE.green };
    default:
      return { label: "No documents", tone: TONE.muted };
  }
}

// gold.claim_finding.outcome
export function findingOutcomeMeta(value?: string | null): { label: string; tone: string } {
  switch (value) {
    case "discrepancy":
      return { label: "Discrepancy", tone: TONE.red };
    case "needs_information":
      return { label: "Needs information", tone: TONE.amber };
    case "supported":
      return { label: "Supported", tone: TONE.green };
    default:
      return { label: humanize(value), tone: TONE.muted };
  }
}

// Auditor workflow status (derived in Lakebase from decisions + document requests)
export function reviewStatusMeta(value?: string | null): { label: string; tone: string } {
  switch (value) {
    case "escalated":
      return { label: "Escalated", tone: TONE.red };
    case "awaiting_information":
      return { label: "Awaiting information", tone: TONE.amber };
    case "in_review":
      return { label: "In review", tone: TONE.blue };
    case "closed":
      return { label: "Closed", tone: TONE.green };
    default:
      return { label: "Open", tone: TONE.muted };
  }
}

export const DECISIONS = [
  { value: "confirmed", label: "Confirm", past: "Confirmed", tone: TONE.red },
  { value: "rejected", label: "Reject", past: "Rejected", tone: TONE.green },
  { value: "needs_information", label: "Needs info", past: "Needs information", tone: TONE.amber },
  { value: "escalated", label: "Escalate", past: "Escalated", tone: TONE.blue },
] as const;

export type DecisionValue = (typeof DECISIONS)[number]["value"];

export function decisionMeta(value?: string | null) {
  return DECISIONS.find((d) => d.value === value);
}

export function formatPct(value?: number | null, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

// Risk-tinted classes for the ML fraud score badge.
export function scoreClass(value?: number | null): string {
  if (value === null || value === undefined) return "border-border text-muted-foreground";
  if (value >= 0.9) return "border-destructive/30 bg-destructive/10 text-destructive";
  if (value >= 0.8) return "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400";
  return "border-border bg-muted text-foreground";
}
