import type { ReactNode } from 'react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Skeleton,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@databricks/appkit-ui/react';
import { AlertTriangle, Database, Info, Inbox, Sparkles } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Tone } from '../lib/labels';

/* ------------------------------------------------------------------ tones */

const TONE_CLASS: Record<Tone, string> = {
  good: 'border-success/30 bg-success/12 text-success',
  bad: 'border-destructive/30 bg-destructive/10 text-destructive',
  warn: 'border-warning/50 bg-warning/20 text-foreground',
  neutral: 'border-border bg-muted text-muted-foreground',
  ai: 'border-ai/30 bg-ai-muted text-ai',
};

export function ToneBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn('font-medium', TONE_CLASS[tone], className)}>
      {children}
    </Badge>
  );
}

/* --------------------------------------------------------------------- AI */

/** Uniform marker for anything a model produced. */
export function AiBadge({ label = 'AI-generated', detail }: { label?: string; detail?: ReactNode }) {
  const badge = (
    <Badge variant="outline" className={cn('gap-1 font-medium', TONE_CLASS.ai)}>
      <Sparkles className="h-3 w-3" aria-hidden />
      {label}
    </Badge>
  );
  if (!detail) return badge;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-xs">{detail}</TooltipContent>
    </Tooltip>
  );
}

/** A bordered panel holding model output, so prose from AI never looks like a fact from the warehouse. */
export function AiPanel({
  title,
  badge,
  footer,
  children,
  className,
}: {
  title?: ReactNode;
  badge?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg border border-ai/25 bg-ai-muted/50 p-4', className)}>
      {(title || badge) && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {title ? <div className="text-sm font-semibold text-foreground">{title}</div> : <span />}
          {badge ?? <AiBadge />}
        </div>
      )}
      <div className="text-sm leading-relaxed text-foreground">{children}</div>
      {footer && <div className="mt-3 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

/* ----------------------------------------------------------------- source */

export function SourceNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-xs text-muted-foreground', className)}>
      <Database className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export function Mono({ children }: { children: ReactNode }) {
  return <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{children}</code>;
}

/* ---------------------------------------------------------------- section */

export function Section({
  title,
  description,
  source,
  actions,
  children,
  className,
  contentClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  source?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={cn('gap-4', className)}>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="text-base leading-snug">{title}</CardTitle>
          {description && <CardDescription className="text-sm">{description}</CardDescription>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      <CardContent className={cn('space-y-3', contentClassName)}>
        {children}
        {source && <SourceNote>{source}</SourceNote>}
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------- KPI */

export function KpiTile({
  label,
  value,
  unit,
  context,
  comparison,
  tone,
  loading,
  error,
  ai,
  hint,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  context?: ReactNode;
  comparison?: ReactNode;
  tone?: Tone;
  loading?: boolean;
  error?: string | null;
  ai?: boolean;
  hint?: ReactNode;
}) {
  return (
    <Card className={cn('gap-2 py-4', ai && 'border-ai/30')}>
      <CardContent className="space-y-1.5 px-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
          <span className="flex items-center gap-1">
            {ai && <Sparkles className="h-3.5 w-3.5 text-ai" aria-label="Produced by AI" />}
            {hint && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 cursor-help text-muted-foreground" aria-label="Definition" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{hint}</TooltipContent>
              </Tooltip>
            )}
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-8 w-28" />
        ) : error ? (
          <div className="flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="h-4 w-4" /> Unavailable
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span
              className={cn(
                'tabular text-2xl font-semibold tracking-tight text-foreground',
                tone === 'bad' && 'text-destructive',
                tone === 'good' && 'text-success',
              )}
            >
              {value}
            </span>
            {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
          </div>
        )}
        {comparison && !loading && !error && <div className="text-xs text-foreground">{comparison}</div>}
        {context && <div className="text-xs text-muted-foreground">{context}</div>}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- states */

export function LoadingBlock({ height = 240, label }: { height?: number; label?: string }) {
  return (
    <div className="space-y-2" style={{ minHeight: height }} aria-busy="true">
      <Skeleton className="w-full rounded-md" style={{ height: height - (label ? 20 : 0) }} />
      {label && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

export function ErrorBlock({ error, title = 'Could not load this view' }: { error: string; title?: string }) {
  return (
    <Alert variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="break-words text-xs">{error}</AlertDescription>
    </Alert>
  );
}

export function EmptyBlock({
  title,
  description,
  icon,
  children,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Empty className="border border-dashed py-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon ?? <Inbox className="h-5 w-5" />}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {description && <EmptyDescription>{description}</EmptyDescription>}
      </EmptyHeader>
      {children}
    </Empty>
  );
}

/** Renders loading / error / empty consistently and only calls `children` when rows exist. */
export function QueryState<T>({
  data,
  loading,
  error,
  height,
  empty,
  children,
}: {
  data: T[] | null | undefined;
  loading: boolean;
  error: string | null;
  height?: number;
  empty?: { title: string; description?: ReactNode };
  children: (rows: T[]) => ReactNode;
}) {
  if (error) return <ErrorBlock error={error} />;
  if (loading && !data) return <LoadingBlock height={height} />;
  if (!data || data.length === 0) {
    return (
      <EmptyBlock
        title={empty?.title ?? 'No data for this selection'}
        description={empty?.description ?? 'Try clearing a filter.'}
      />
    );
  }
  return <>{children(data)}</>;
}

/* ----------------------------------------------------------------- header */

export function PageHeader({
  title,
  message,
  children,
}: {
  title: string;
  message?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {message && <p className="max-w-3xl text-sm text-muted-foreground">{message}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Horizontal inline bar used inside tables (IBCS: tables with integrated bars). */
export function InlineBar({
  value,
  max,
  tone = 'neutral',
  label,
}: {
  value: number;
  max: number;
  tone?: Tone;
  label?: ReactNode;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color =
    tone === 'bad'
      ? 'bg-destructive/70'
      : tone === 'good'
        ? 'bg-success/70'
        : tone === 'ai'
          ? 'bg-ai/70'
          : tone === 'warn'
            ? 'bg-warning'
            : 'bg-foreground/60';
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 min-w-12 flex-1 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      {label !== undefined && <span className="tabular w-16 shrink-0 text-right text-xs">{label}</span>}
    </div>
  );
}

/** Diverging bar for z-scores centred on zero (peer average). */
export function ZScoreBar({ z, range = 4 }: { z: number | null; range?: number }) {
  if (z === null || !Number.isFinite(z)) return <span className="text-xs text-muted-foreground">–</span>;
  const clamped = Math.max(-range, Math.min(range, z));
  const width = (Math.abs(clamped) / range) * 50;
  const high = z >= 2;
  return (
    <div className="flex items-center gap-2" title={`Peer z-score ${z.toFixed(2)}`}>
      <div className="relative h-2 w-20 rounded-full bg-muted">
        <div className="absolute inset-y-0 left-1/2 w-px bg-border" />
        <div
          className={cn('absolute inset-y-0 rounded-full', high ? 'bg-destructive/80' : z > 0 ? 'bg-warning' : 'bg-foreground/40')}
          style={clamped >= 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }}
        />
      </div>
      <span className={cn('tabular w-10 text-right text-xs', high && 'font-semibold text-destructive')}>
        {z > 0 ? '+' : ''}
        {z.toFixed(1)}
      </span>
    </div>
  );
}
