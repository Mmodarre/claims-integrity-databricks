import {
  analytics,
  createApp,
  files,
  genie,
  server,
  type FilePolicy,
} from '@databricks/appkit';
import type { Request, Response } from 'express';
import { createScanService, isValidClaimNumber, isValidDocType } from './scans';

/**
 * Genie space wiring.
 *
 * The space is created separately, so the app must start (and show a friendly
 * placeholder) when no space is configured. AppKit's genie() plugin declares a
 * *required* DATABRICKS_GENIE_SPACE_ID resource, so it is only registered when
 * the id is present. GENIE_SPACE_ID is accepted as a convenience alias.
 */
const genieSpaceId = (
  process.env.DATABRICKS_GENIE_SPACE_ID ||
  process.env.GENIE_SPACE_ID ||
  ''
).trim();
if (genieSpaceId) process.env.DATABRICKS_GENIE_SPACE_ID = genieSpaceId;

/**
 * Scans volume (DATABRICKS_VOLUME_FILES -> volume key "files") is the UC volume
 * mehdidatalake_catalog.integrity_raw.landing. It also holds raw exports, so the
 * policy only allows reading `rendered_docs/<claim_number>/<document>.jpg` and
 * denies listing, absolute paths and every write action.
 */
const SCAN_RELATIVE_PATH = /^rendered_docs\/CLM-[A-Z0-9-]{4,40}\/(discharge_summary|operative_note)\.jpg$/;
const scansReadOnly: FilePolicy = (action, resource) =>
  (action === 'raw' || action === 'download' || action === 'metadata' || action === 'exists') &&
  SCAN_RELATIVE_PATH.test(resource.path);

const plugins = [
  analytics(),
  files({ volumes: { files: { policy: scansReadOnly } } }),
  server(),
  ...(genieSpaceId ? [genie()] : []),
];

createApp({
  plugins,
  onPluginsReady(appkit) {
    const scans = createScanService(async (relativePath) => {
      const response = await appkit.files('files').download(relativePath);
      if (!response.contents) throw new Error(`Empty download for ${relativePath}`);
      return Buffer.from(await new Response(response.contents).arrayBuffer());
    });

    appkit.server.extend((app) => {
      // Who is looking (identity headers injected by the Databricks Apps proxy).
      app.get('/api/whoami', (req: Request, res: Response) => {
        res.json({
          email: req.header('x-forwarded-email') ?? null,
          user: req.header('x-forwarded-user') ?? null,
          preferredUsername: req.header('x-forwarded-preferred-username') ?? null,
        });
      });

      // Runtime feature flags for the UI (no secrets).
      app.get('/api/app-config', (_req: Request, res: Response) => {
        res.json({
          genie: {
            configured: Boolean(genieSpaceId),
            alias: 'default',
            // Genie routes in AppKit always execute on behalf of the signed-in user.
            executionIdentity: 'user',
          },
          scans: { imageProcessing: scans.imageProcessingAvailable() },
          appName: process.env.DATABRICKS_APP_NAME ?? 'claims-integrity-insights',
        });
      });

      // Scanned clinical document, downscaled for the browser (or a full-resolution
      // crop around an evidence bounding box). Bytes come from the UC volume via
      // the files plugin, running as the app service principal.
      app.get('/api/scans/:claim/:doc', async (req: Request, res: Response) => {
        const claim = String(req.params.claim ?? '');
        const doc = String(req.params.doc ?? '');
        if (!isValidClaimNumber(claim) || !isValidDocType(doc)) {
          res.status(400).json({ error: 'Invalid claim number or document type' });
          return;
        }
        try {
          const image = await scans.render(claim, doc, {
            width: typeof req.query.w === 'string' ? Number(req.query.w) : undefined,
            crop: typeof req.query.crop === 'string' ? req.query.crop : undefined,
          });
          res.setHeader('Content-Type', image.contentType);
          res.setHeader('Cache-Control', 'private, max-age=3600');
          res.setHeader('X-Source-Width', String(image.sourceWidth ?? ''));
          res.setHeader('X-Source-Height', String(image.sourceHeight ?? ''));
          res.send(image.body);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const notFound = /not.?found|404|does not exist/i.test(message);
          console.error(`[scans] ${claim}/${doc}: ${message}`);
          res.status(notFound ? 404 : 502).json({
            error: notFound ? 'Scan not found for this claim' : 'Could not load scan from volume',
          });
        }
      });
    });

    // Warm the demo claim so the first evidence view is instant.
    void scans.warm('CLM-W0-2021-00000082', 'operative_note');
  },
}).catch(console.error);
