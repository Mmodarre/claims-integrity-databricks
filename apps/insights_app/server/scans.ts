/**
 * Scan rendering: fetch the original ~9 MB, 3584x4800 JPG from the UC volume
 * once, then serve downscaled pages and full-resolution evidence crops.
 * sharp is loaded lazily; if it is unavailable the original bytes are served
 * (the browser scales them and bounding boxes still line up).
 */

const DOC_TYPES = new Set(['operative_note', 'discharge_summary']);
const CLAIM_NUMBER = /^CLM-[A-Z0-9-]{4,40}$/;

export const isValidClaimNumber = (value: string) => CLAIM_NUMBER.test(value);
export const isValidDocType = (value: string) => DOC_TYPES.has(value);

type SharpFactory = typeof import('sharp');

interface RenderOptions {
  width?: number;
  crop?: string;
}

export interface RenderedScan {
  body: Buffer;
  contentType: string;
  sourceWidth?: number;
  sourceHeight?: number;
}

interface SourceScan {
  bytes: Buffer;
  width?: number;
  height?: number;
}

/** Small insertion-ordered LRU. */
class Lru<V> {
  private readonly map = new Map<string, V>();
  constructor(private readonly max: number) {}
  get(key: string): V | undefined {
    const value = this.map.get(key);
    if (value !== undefined) {
      this.map.delete(key);
      this.map.set(key, value);
    }
    return value;
  }
  delete(key: string) {
    this.map.delete(key);
  }
  set(key: string, value: V) {
    this.map.delete(key);
    this.map.set(key, value);
    while (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest === undefined) break;
      this.map.delete(oldest);
    }
  }
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function parseCrop(raw: string | undefined): [number, number, number, number] | null {
  if (!raw) return null;
  const parts = raw.split(',').map((p) => Number(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x1, y1, x2, y2] = parts;
  if (x2 <= x1 || y2 <= y1) return null;
  return [x1, y1, x2, y2];
}

export function createScanService(download: (relativePath: string) => Promise<Buffer>) {
  const sources = new Lru<Promise<SourceScan>>(16);
  const rendered = new Lru<Promise<RenderedScan>>(400);
  let sharpPromise: Promise<SharpFactory | null> | null = null;
  let sharpAvailable: boolean | null = null;

  const loadSharp = () => {
    sharpPromise ??= import('sharp')
      .then((mod): SharpFactory => {
        sharpAvailable = true;
        // CommonJS module: the callable is exposed as the default export.
        const candidate: unknown = (mod as { default?: unknown }).default ?? mod;
        if (typeof candidate !== 'function') throw new Error('sharp export is not callable');
        return candidate as SharpFactory;
      })
      .catch((err: unknown) => {
        sharpAvailable = false;
        console.warn('[scans] sharp unavailable, serving original images:', err);
        return null;
      });
    return sharpPromise;
  };
  void loadSharp();

  const loadSource = (claim: string, doc: string) => {
    const key = `${claim}/${doc}`;
    let pending = sources.get(key);
    if (!pending) {
      pending = (async () => {
        const bytes = await download(`rendered_docs/${claim}/${doc}.jpg`);
        const sharp = await loadSharp();
        if (!sharp) return { bytes };
        const meta = await sharp(bytes).metadata();
        return { bytes, width: meta.width, height: meta.height };
      })();
      // Do not cache failures.
      pending.catch(() => sources.delete(key));
      sources.set(key, pending);
    }
    return pending;
  };

  async function renderUncached(claim: string, doc: string, opts: RenderOptions): Promise<RenderedScan> {
    const source = await loadSource(claim, doc);
    const sharp = await loadSharp();
    if (!sharp || !source.width || !source.height) {
      return { body: source.bytes, contentType: 'image/jpeg', sourceWidth: source.width, sourceHeight: source.height };
    }
    const crop = parseCrop(opts.crop);
    let pipeline = sharp(source.bytes);
    let outWidth: number;
    if (crop) {
      const pad = 40;
      const left = clamp(Math.floor(crop[0] - pad), 0, source.width - 1);
      const top = clamp(Math.floor(crop[1] - pad), 0, source.height - 1);
      const right = clamp(Math.ceil(crop[2] + pad), left + 1, source.width);
      const bottom = clamp(Math.ceil(crop[3] + pad), top + 1, source.height);
      pipeline = pipeline.extract({ left, top, width: right - left, height: bottom - top });
      outWidth = clamp(Math.round(opts.width ?? 1600), 200, right - left);
    } else {
      outWidth = clamp(Math.round(opts.width ?? 1400), 200, source.width);
    }
    const body = await pipeline
      .resize({ width: outWidth, withoutEnlargement: true })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
    return { body, contentType: 'image/jpeg', sourceWidth: source.width, sourceHeight: source.height };
  }

  return {
    imageProcessingAvailable: () => sharpAvailable === true,
    render(claim: string, doc: string, opts: RenderOptions) {
      // Quantise widths so caches are effective.
      const width = opts.width && Number.isFinite(opts.width) ? Math.round(opts.width / 200) * 200 || 200 : undefined;
      const crop = parseCrop(opts.crop)?.join(',');
      const key = `${claim}/${doc}?w=${width ?? ''}&c=${crop ?? ''}`;
      let pending = rendered.get(key);
      if (!pending) {
        pending = renderUncached(claim, doc, { width, crop });
        pending.catch(() => rendered.delete(key));
        rendered.set(key, pending);
      }
      return pending;
    },
    async warm(claim: string, doc: string) {
      try {
        await this.render(claim, doc, { width: 1400 });
      } catch (err) {
        console.warn(`[scans] warm-up failed for ${claim}/${doc}:`, err instanceof Error ? err.message : err);
      }
    },
  };
}
