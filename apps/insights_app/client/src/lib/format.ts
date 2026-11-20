/** Number formatting helpers. SQL numerics arrive as strings, so every helper accepts both. */

export type Numeric = number | string | null | undefined;

export const toNum = (value: Numeric): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const audCompact = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const audWhole = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const audCents = new Intl.NumberFormat('en-AU', {
  style: 'currency',
  currency: 'AUD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const intFmt = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 });
const compactFmt = new Intl.NumberFormat('en-AU', { notation: 'compact', maximumFractionDigits: 1 });

export const fmtAud = (value: Numeric, mode: 'compact' | 'whole' | 'cents' = 'compact'): string => {
  const n = toNum(value);
  if (n === null) return '–';
  if (mode === 'cents') return audCents.format(n);
  if (mode === 'whole') return audWhole.format(n);
  return Math.abs(n) < 10_000 ? audWhole.format(n) : audCompact.format(n);
};

export const fmtInt = (value: Numeric): string => {
  const n = toNum(value);
  return n === null ? '–' : intFmt.format(n);
};

export const fmtCompact = (value: Numeric): string => {
  const n = toNum(value);
  return n === null ? '–' : compactFmt.format(n);
};

/** Ratio (0..1) to percent. */
export const fmtPct = (value: Numeric, digits = 1): string => {
  const n = toNum(value);
  return n === null ? '–' : `${(n * 100).toFixed(digits)}%`;
};

export const fmtDec = (value: Numeric, digits = 2): string => {
  const n = toNum(value);
  return n === null ? '–' : n.toFixed(digits);
};

export const fmtSigned = (value: Numeric, digits = 2): string => {
  const n = toNum(value);
  if (n === null) return '–';
  return `${n > 0 ? '+' : ''}${n.toFixed(digits)}`;
};

/** Relative change a vs b as a signed percent string. */
export const fmtChange = (current: Numeric, previous: Numeric): string | null => {
  const c = toNum(current);
  const p = toNum(previous);
  if (c === null || p === null || p === 0) return null;
  const change = (c - p) / Math.abs(p);
  return `${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%`;
};

/** Percentage-point change for ratios. */
export const fmtPpChange = (current: Numeric, previous: Numeric): string | null => {
  const c = toNum(current);
  const p = toNum(previous);
  if (c === null || p === null) return null;
  const pp = (c - p) * 100;
  return `${pp >= 0 ? '+' : ''}${pp.toFixed(1)} pp`;
};

const monthFmt = new Intl.DateTimeFormat('en-AU', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const dayFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dateTimeFmt = new Intl.DateTimeFormat('en-AU', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const parseDate = (value: string | null | undefined): Date | null => {
  if (!value) return null;
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(d.getTime()) ? null : d;
};

export const fmtMonth = (value: string | null | undefined): string => {
  const d = parseDate(value);
  return d ? monthFmt.format(d) : '–';
};

export const fmtDay = (value: string | null | undefined): string => {
  const d = parseDate(value);
  return d ? dayFmt.format(d) : '–';
};

export const fmtDateTime = (value: string | null | undefined): string => {
  const d = parseDate(value);
  return d ? dateTimeFmt.format(d) : '–';
};

/** "2023-02-01" -> "2023-02" (stable category labels for charts). */
export const isoMonth = (value: string | null | undefined): string => (value ? value.slice(0, 7) : '');
