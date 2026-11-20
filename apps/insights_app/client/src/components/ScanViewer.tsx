import { useEffect, useRef, useState } from 'react';
import { Button, Skeleton } from '@databricks/appkit-ui/react';
import { ExternalLink, ZoomIn } from 'lucide-react';
import { ErrorBlock } from './blocks';
import { cn } from '../lib/utils';

export type Bbox = [number, number, number, number];

export interface ScanBox {
  id: string;
  bbox: Bbox;
  label: string;
  tone: 'bad' | 'warn' | 'good';
}

export interface LayoutBox {
  id: string;
  bbox: Bbox;
  label: string;
}

/** Parses "x1,y1,x2,y2" (or a JSON-ish array) into a bbox in source-image pixels. */
export function parseBbox(raw: string | null | undefined): Bbox | null {
  if (!raw) return null;
  const nums = raw
    .replace(/[[\]"\s]/g, '')
    .split(',')
    .map(Number);
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = nums;
  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2];
}

export const scanUrl = (claim: string, doc: string, opts: { w?: number; crop?: Bbox } = {}) => {
  const q = new URLSearchParams();
  if (opts.w) q.set('w', String(opts.w));
  if (opts.crop) q.set('crop', opts.crop.join(','));
  const qs = q.toString();
  return `/api/scans/${encodeURIComponent(claim)}/${encodeURIComponent(doc)}${qs ? `?${qs}` : ''}`;
};

const TONE_BOX: Record<ScanBox['tone'], string> = {
  bad: 'border-evidence',
  warn: 'border-warning',
  good: 'border-success',
};

/**
 * Original scan with AI evidence boxes overlaid. Boxes are positioned in percent
 * of the source image size (3584 x 4800 by default), so they stay aligned at any
 * rendered width.
 */
export function ScanViewer({
  claim,
  doc,
  sourceWidth = 3584,
  sourceHeight = 4800,
  boxes,
  activeId,
  layout,
  onSelect,
  height = 760,
}: {
  claim: string;
  doc: string;
  sourceWidth?: number;
  sourceHeight?: number;
  boxes: ScanBox[];
  activeId: string | null;
  layout?: LayoutBox[];
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const src = scanUrl(claim, doc, { w: 1400 });
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>('loading');
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const currentStatus = loadedSrc === src ? status : 'loading';

  // Bring the active evidence into view once the page image has laid out.
  useEffect(() => {
    if (currentStatus !== 'loaded' || !activeRef.current || !scrollRef.current) return;
    const container = scrollRef.current;
    const box = activeRef.current;
    const top = box.offsetTop - container.clientHeight / 3;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeId, currentStatus, doc]);

  const pct = (b: Bbox) => ({
    left: `${(b[0] / sourceWidth) * 100}%`,
    top: `${(b[1] / sourceHeight) * 100}%`,
    width: `${((b[2] - b[0]) / sourceWidth) * 100}%`,
    height: `${((b[3] - b[1]) / sourceHeight) * 100}%`,
  });

  return (
    <div className="space-y-2">
      <div ref={scrollRef} className="relative overflow-auto rounded-lg border bg-muted/40" style={{ height }}>
        {currentStatus === 'loading' && (
          <div className="absolute inset-0 z-10 space-y-3 p-6">
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-[60%] w-full" />
            <p className="text-xs text-muted-foreground">Loading the original scan from the Unity Catalog volume…</p>
          </div>
        )}
        {currentStatus === 'error' && (
          <div className="p-6">
            <ErrorBlock title="Scan unavailable" error="The original document could not be loaded from the volume for this claim." />
          </div>
        )}
        <div className={cn('relative mx-auto w-full', currentStatus !== 'loaded' && 'invisible')} style={{ aspectRatio: `${sourceWidth} / ${sourceHeight}` }}>
          <img
            key={src}
            src={src}
            alt={`Scanned ${doc.replace('_', ' ')} for claim ${claim}`}
            className="absolute inset-0 h-full w-full select-none"
            draggable={false}
            onLoad={() => {
              setLoadedSrc(src);
              setStatus('loaded');
            }}
            onError={() => {
              setLoadedSrc(src);
              setStatus('error');
            }}
          />
          {layout?.map((l) => (
            <div
              key={l.id}
              className="pointer-events-auto absolute rounded-[2px] border border-ai/50 bg-ai/5"
              style={pct(l.bbox)}
              title={l.label}
            />
          ))}
          {boxes.map((b) => {
            const active = b.id === activeId;
            return (
              <button
                type="button"
                key={b.id}
                ref={active ? activeRef : undefined}
                onClick={() => onSelect?.(b.id)}
                className={cn(
                  'absolute rounded-sm border-2 transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  TONE_BOX[b.tone],
                  active ? 'z-20 bg-evidence-muted shadow-[0_0_0_4px_var(--evidence-muted)]' : 'z-10 border-dashed bg-transparent opacity-70 hover:opacity-100',
                )}
                style={pct(b.bbox)}
                title={b.label}
                aria-label={`Evidence: ${b.label}`}
                aria-pressed={active}
              >
                {active && (
                  <span className="absolute -top-6 left-0 whitespace-nowrap rounded bg-evidence px-1.5 py-0.5 text-[11px] font-semibold text-evidence-foreground shadow">
                    AI evidence
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>
          Original scan, {sourceWidth}×{sourceHeight}px · boxes are the bounding boxes <code>ai_parse_document</code> returned
          for the quoted text
        </span>
        <Button asChild variant="ghost" size="sm" className="h-7">
          <a href={scanUrl(claim, doc)} target="_blank" rel="noopener noreferrer">
            Full resolution <ExternalLink className="ml-1 h-3 w-3" />
          </a>
        </Button>
      </div>
    </div>
  );
}

/** Full-resolution crop around one evidence box. */
export function EvidenceCrop({ claim, doc, bbox }: { claim: string; doc: string; bbox: Bbox }) {
  const src = scanUrl(claim, doc, { crop: bbox, w: 1200 });
  const [state, setState] = useState<{ src: string; status: 'loaded' | 'error' } | null>(null);
  const status = state?.src === src ? state.status : 'loading';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ZoomIn className="h-3.5 w-3.5" /> Evidence on the original scan (full resolution)
      </div>
      <div className="relative overflow-hidden rounded-md border-2 border-evidence/60 bg-background">
        {status === 'loading' && <Skeleton className="h-20 w-full" />}
        {status === 'error' ? (
          <p className="p-3 text-xs text-destructive">Could not render the evidence crop.</p>
        ) : (
          <img
            key={src}
            src={src}
            alt="Cropped evidence region"
            className={cn('block max-h-64 w-full object-contain', status !== 'loaded' && 'hidden')}
            onLoad={() => setState({ src, status: 'loaded' })}
            onError={() => setState({ src, status: 'error' })}
          />
        )}
      </div>
    </div>
  );
}
