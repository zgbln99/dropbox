import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { downloadContent, getThumbnail } from './dropbox';
import { fileKind } from './utils';

/** Disk cache for generated previews. Populated lazily, on first request. */
const PREVIEW_DIR = path.join(process.cwd(), 'data', 'previews');

/** Error type carrying an HTTP status, used for clear client responses. */
export class PreviewError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PreviewError';
    this.status = status;
  }
}

function log(message: string): void {
  console.log(`[preview] ${message}`);
}

function ensureDir(): void {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

/**
 * Build a filesystem-safe cache key from the file path + revision. Hashing
 * keeps the key free of slashes/unsafe characters, and including the rev means
 * an edited file gets a fresh preview instead of a stale cached one.
 */
function cacheFile(dbxPath: string, rev: string | null, kind: string): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${kind}|${dbxPath}|${rev ?? ''}`)
    .digest('hex');
  return path.join(PREVIEW_DIR, `${hash}.jpg`);
}

export interface PreviewResult {
  body: Buffer;
  contentType: string;
}

let agPsdInitialized = false;

/**
 * Enable CMYK composite decoding in ag-psd.
 *
 * ag-psd ships a working CMYK->RGB decoder, but its public color-mode
 * allowlist (`supportedColorModes`) only contains Bitmap/Grayscale/RGB, so
 * `readPsd` rejects CMYK documents at the header check before that decoder
 * ever runs. CMYK is common for print-oriented PSDs. The allowlist lives on
 * the internal `psdReader` module and is the same mutable array `readPsd`
 * consults, so pushing the CMYK mode (4) onto it unlocks those files.
 *
 * Best-effort: if the internal module path ever changes, RGB/grayscale PSDs
 * still render and only CMYK previews are affected.
 */
async function enableCmyk(): Promise<void> {
  try {
    const reader = (await import('ag-psd/dist/psdReader.js')) as {
      supportedColorModes?: number[];
    };
    const modes = reader.supportedColorModes;
    if (Array.isArray(modes) && !modes.includes(4)) {
      modes.push(4);
    }
  } catch (err) {
    log(`could not enable CMYK support: ${err instanceof Error ? err.message : err}`);
  }
}

/**
 * Load ag-psd and, on first use, install a minimal canvas shim.
 *
 * ag-psd needs a way to allocate `ImageData` objects. In Node there is no
 * global `ImageData` and no `<canvas>`, so by default it throws
 * "Canvas not initialized". Providing a tiny `createImageData` shim lets it
 * decode the flattened composite into raw RGBA pixels without pulling in the
 * heavyweight `node-canvas` native dependency.
 */
async function loadAgPsd() {
  const agPsd = await import('ag-psd');
  if (!agPsdInitialized) {
    const init = agPsd.initializeCanvas as (
      createCanvas: unknown,
      createCanvasFromData?: unknown,
      createImageData?: unknown,
    ) => void;
    init(
      () => {
        throw new Error('canvas rendering is not supported in this environment');
      },
      undefined,
      (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
    );
    await enableCmyk();
    agPsdInitialized = true;
  }
  return agPsd;
}

/**
 * Render a PSD to a JPEG preview. ag-psd decodes the flattened composite into
 * raw RGBA pixels, then sharp resizes and encodes the result.
 */
async function renderPsd(buffer: Buffer): Promise<Buffer> {
  log(`PSD download complete, ${buffer.length} bytes — parsing`);

  // PSD/PSB files start with the "8BPS" magic signature. Anything else means
  // the download returned something unexpected (e.g. an error payload).
  if (buffer.length < 4 || buffer.toString('latin1', 0, 4) !== '8BPS') {
    throw new PreviewError(422, 'Downloaded file is not a valid PSD document');
  }

  let psd;
  try {
    const { readPsd } = await loadAgPsd();
    // ag-psd expects a plain ArrayBuffer; copy into one exactly sized.
    const ab = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    ) as ArrayBuffer;
    psd = readPsd(ab, {
      skipLayerImageData: true,
      skipThumbnail: true,
      useImageData: true,
    });
  } catch (err) {
    throw new PreviewError(
      422,
      `Could not parse PSD: ${err instanceof Error ? err.message : 'unknown error'}`,
    );
  }

  const image = psd.imageData;
  if (!image || !image.data || !image.width || !image.height) {
    throw new PreviewError(
      422,
      'PSD has no flattened composite image (re-save with "Maximize Compatibility" enabled)',
    );
  }

  log(`PSD parsed: composite ${image.width}x${image.height} — encoding JPEG`);
  const sharp = (await import('sharp')).default;
  const raw = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return sharp(raw, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Return a cached preview image for the given Dropbox file, generating and
 * caching it on first request. Returns null for unsupported file types.
 * Throws PreviewError / DropboxError with useful messages on failure.
 */
export async function getPreview(
  dbxPath: string,
  fileName: string,
  rev: string | null,
): Promise<PreviewResult | null> {
  const kind = fileKind(fileName);
  log(`getPreview path=${dbxPath} rev=${rev ?? '(none)'} kind=${kind}`);

  // SVGs render in the browser directly — just stream the original bytes.
  if (kind === 'svg') {
    const res = await downloadContent(dbxPath);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: 'image/svg+xml' };
  }

  if (kind !== 'image' && kind !== 'psd') {
    log(`no preview available for kind=${kind}`);
    return null;
  }

  ensureDir();
  const cached = cacheFile(dbxPath, rev, kind);
  try {
    const body = await fs.promises.readFile(cached);
    log(`cache hit ${path.basename(cached)} (${body.length} bytes)`);
    return { body, contentType: 'image/jpeg' };
  } catch {
    log(`cache miss — generating preview (${path.basename(cached)})`);
  }

  let body: Buffer;
  if (kind === 'psd') {
    const res = await downloadContent(dbxPath);
    body = await renderPsd(Buffer.from(await res.arrayBuffer()));
  } else {
    // Dropbox renders image thumbnails server-side — cheap on the VPS.
    body = await getThumbnail(dbxPath, 'w1024h768');
  }

  // Cache atomically so concurrent requests never read a partial file.
  const tmp = `${cached}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, body);
  await fs.promises.rename(tmp, cached);
  log(`preview cached ${path.basename(cached)} (${body.length} bytes)`);

  return { body, contentType: 'image/jpeg' };
}
