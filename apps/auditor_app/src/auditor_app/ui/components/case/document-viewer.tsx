import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { ExternalLink, Layers, Loader2, ZoomIn, ZoomOut } from "lucide-react";

import type { DocumentOut } from "@/lib/api";
import { useListDocumentElements } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type EvidenceBox = {
  key: string;
  bbox: number[]; // [x1, y1, x2, y2] in the scan's native pixel space
  tone: "red" | "amber" | "green";
  label?: string;
};

const TONE_CLASS: Record<EvidenceBox["tone"], string> = {
  red: "border-red-500 bg-red-500/15",
  amber: "border-amber-500 bg-amber-500/15",
  green: "border-emerald-500 bg-emerald-500/10",
};

function boxStyle(bbox: number[], w: number, h: number): CSSProperties {
  const [x1, y1, x2, y2] = bbox;
  return {
    left: `${(x1 / w) * 100}%`,
    top: `${(y1 / h) * 100}%`,
    width: `${(Math.max(x2 - x1, 1) / w) * 100}%`,
    height: `${(Math.max(y2 - y1, 1) / h) * 100}%`,
  };
}

/**
 * Rendered scan from the UC volume with evidence boxes drawn over it. Boxes come in the
 * scan's native pixel space (3584x4800) and are placed as percentages, so they line up at
 * any display size or zoom level.
 */
export function DocumentViewer({
  doc,
  boxes,
  focusKey,
  onBoxClick,
}: {
  doc: DocumentOut;
  boxes: EvidenceBox[];
  focusKey?: string | null;
  onBoxClick?: (key: string) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [showLayout, setShowLayout] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const W = doc.image_width;
  const H = doc.image_height;
  const src = `${doc.image_url}?width=${zoom > 1 ? 2400 : 1600}`;

  const { data: elements, isFetching: elementsLoading } = useListDocumentElements({
    params: { document_id: doc.document_id },
    query: { select: (d) => d.data, enabled: showLayout, staleTime: Infinity },
  });

  useEffect(() => {
    setLoaded(false);
    setFailed(false);
  }, [doc.document_id]);

  // Center the focused evidence box inside the scroll container (without scrolling the page).
  useEffect(() => {
    if (!focusKey || !loaded) return;
    const el = boxRefs.current[focusKey];
    const box = scrollRef.current;
    if (!el || !box) return;
    box.scrollTo({
      top: Math.max(el.offsetTop - box.clientHeight / 2 + el.offsetHeight / 2, 0),
      left: Math.max(el.offsetLeft - box.clientWidth / 2 + el.offsetWidth / 2, 0),
      behavior: "smooth",
    });
  }, [focusKey, loaded, zoom, doc.document_id]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="sm" onClick={() => setZoom(1)} disabled={zoom === 1}>
            <ZoomOut className="h-4 w-4" /> Fit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setZoom(2)} disabled={zoom === 2}>
            <ZoomIn className="h-4 w-4" /> 2x
          </Button>
          <Button
            variant={showLayout ? "secondary" : "outline"}
            size="sm"
            onClick={() => setShowLayout((v) => !v)}
            title="Show the layout elements parsed by ai_parse_document"
          >
            {elementsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
            Parsed layout
          </Button>
        </div>
        <a
          href={`${doc.image_url}?width=0`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Original scan <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <div ref={scrollRef} className="relative max-h-[78vh] overflow-auto rounded-md border bg-muted/40">
        <div className="relative" style={{ width: `${zoom * 100}%`, aspectRatio: `${W} / ${H}` }}>
          <img
            src={src}
            alt={doc.document_type ?? "scanned document"}
            className="block h-auto w-full select-none"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
            draggable={false}
          />
          {!loaded && !failed && (
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading scan from the volume…
            </div>
          )}
          {failed && (
            <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-destructive">
              Could not load the scan from the Unity Catalog volume.
            </div>
          )}

          {loaded &&
            showLayout &&
            (elements ?? [])
              .filter((e) => e.bbox)
              .map((e) => (
                <div
                  key={e.element_key}
                  className="pointer-events-none absolute border border-dashed border-sky-500/70 bg-sky-500/5"
                  style={boxStyle(e.bbox!, W, H)}
                  title={`${e.element_type ?? "element"} · ${e.content ?? ""}`}
                >
                  <span className="absolute -top-4 left-0 rounded bg-sky-600/80 px-1 text-[10px] leading-4 text-white">
                    {e.element_type}
                  </span>
                </div>
              ))}

          {loaded &&
            boxes.map((b) => {
              const focused = b.key === focusKey;
              return (
                <div
                  key={b.key}
                  ref={(el) => {
                    boxRefs.current[b.key] = el;
                  }}
                  onClick={() => onBoxClick?.(b.key)}
                  className={cn(
                    "absolute cursor-pointer rounded-sm border-2 transition-all",
                    TONE_CLASS[b.tone],
                    focused ? "z-10 opacity-100 ring-4 ring-offset-0 ring-primary/30" : "opacity-50 hover:opacity-90",
                  )}
                  style={boxStyle(b.bbox, W, H)}
                  title={b.label}
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}
