import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { downloadContent, getThumbnail } from './dropbox';
import { fileKind } from './utils';

const execFileAsync = promisify(execFile);

/** Disk cache for generated previews. Populated lazily, on first request. */
const PREVIEW_DIR = path.join(process.cwd(), 'data', 'previews');

/**
 * Largest PSD file accepted for preview. The whole file is buffered in memory
 * to parse it, so anything bigger risks an out-of-memory kill in a
 * memory-capped container (see mem_limit in docker-compose.yml).
 */
const MAX_PSD_BYTES = 600 * 1024 * 1024;

/** Error type carrying an HTTP status, used for clear client responses. */
export class PreviewError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PreviewError';
    this.status = status;
  }
}

/**
 * Write a log line synchronously to stdout.
 *
 * PSD decoding is CPU-heavy and runs synchronously; if it stalls or the
 * process is killed (e.g. out of memory) before Node flushes its async,
 * pipe-buffered stdout, ordinary `console.log` lines are lost — which makes
 * a hang impossible to diagnose. `fs.writeSync` flushes immediately, so the
 * last line before a failure always reaches the container logs.
 */
function log(message: string): void {
  try {
    fs.writeSync(1, `[preview] ${message}\n`);
  } catch {
    console.log(`[preview] ${message}`);
  }
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
/**
 * Above this many megapixels the flattened composite is too large to decode
 * safely in a memory-capped container (decoding needs width*height*4 bytes of
 * RAM, plus the file buffer, plus the encoder). Larger documents fall back to
 * the small thumbnail Photoshop embeds in the file.
 */
const COMPOSITE_MP_LIMIT = 200;

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : 'unknown error';
}

async function renderPsd(ab: ArrayBuffer): Promise<Buffer> {
  const bytes = new Uint8Array(ab);
  log(`renderPsd: ${bytes.length} bytes — checking signature`);

  // PSD/PSB files start with the "8BPS" magic signature. Anything else means
  // the download returned something unexpected (e.g. an error payload).
  if (
    bytes.length < 26 ||
    bytes[0] !== 0x38 ||
    bytes[1] !== 0x42 ||
    bytes[2] !== 0x50 ||
    bytes[3] !== 0x53
  ) {
    throw new PreviewError(422, 'Downloaded file is not a valid PSD document');
  }

  // The header stores height/width as big-endian uint32s at offsets 14 and 18.
  const dv = new DataView(ab);
  const height = dv.getUint32(14);
  const width = dv.getUint32(18);
  const megapixels = (width * height) / 1_000_000;
  log(`PSD document ${width}x${height} (${megapixels.toFixed(1)} MP)`);

  const { readPsd } = await loadAgPsd();
  const sharp = (await import('sharp')).default;

  // Large document: decode only the embedded thumbnail. With both layer and
  // composite image data skipped, ag-psd never allocates the huge pixel
  // buffer, so memory use stays bounded regardless of the document size.
  if (megapixels > COMPOSITE_MP_LIMIT) {
    log(`document exceeds ${COMPOSITE_MP_LIMIT} MP — using embedded thumbnail`);
    let psd;
    try {
      psd = readPsd(ab, {
        skipLayerImageData: true,
        skipCompositeImageData: true,
        useRawThumbnail: true,
      });
    } catch (err) {
      throw new PreviewError(422, `Could not parse PSD: ${errMsg(err)}`);
    }
    const thumb = psd.imageResources?.thumbnailRaw;
    if (!thumb?.data?.length) {
      throw new PreviewError(
        413,
        'PSD is too large to render and has no embedded thumbnail ' +
          '(re-save with "Maximize Compatibility" enabled)',
      );
    }
    // thumbnailRaw.data holds the thumbnail as a JPEG byte stream.
    log(`embedded thumbnail ${thumb.width}x${thumb.height}, ${thumb.data.length} JPEG bytes`);
    const jpeg = await sharp(Buffer.from(thumb.data))
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    log(`JPEG encoded from thumbnail: ${jpeg.length} bytes`);
    return jpeg;
  }

  // Small enough — decode the full composite for a crisp, full-quality preview.
  let psd;
  try {
    log('decoding PSD composite with readPsd (this runs synchronously)');
    psd = readPsd(ab, {
      skipLayerImageData: true,
      skipThumbnail: true,
      useImageData: true,
    });
    log('readPsd finished');
  } catch (err) {
    throw new PreviewError(422, `Could not parse PSD: ${errMsg(err)}`);
  }

  const image = psd.imageData;
  if (!image || !image.data || !image.width || !image.height) {
    throw new PreviewError(
      422,
      'PSD has no flattened composite image (re-save with "Maximize Compatibility" enabled)',
    );
  }

  log(`PSD parsed: composite ${image.width}x${image.height}, ${image.data.length} bytes — encoding JPEG`);

  // ag-psd's RGBA composite must be exactly width*height*4 bytes for sharp's
  // raw decoder; a mismatch would otherwise crash the native layer.
  const expected = image.width * image.height * 4;
  if (image.data.length < expected) {
    throw new PreviewError(
      422,
      `PSD composite is incomplete (${image.data.length} of ${expected} bytes)`,
    );
  }

  const raw = Buffer.from(image.data.buffer, image.data.byteOffset, expected);
  const jpeg = await sharp(raw, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
  log(`JPEG encoded: ${jpeg.length} bytes`);
  return jpeg;
}

/**
 * Render the first page of a PDF to a JPEG preview using poppler's
 * `pdftoppm`. The tool works on files, so the document is written to a
 * temporary path, rasterised, and the result re-encoded with sharp.
 */
async function renderPdf(buffer: Buffer): Promise<Buffer> {
  log(`renderPdf: ${buffer.length} bytes`);
  if (buffer.length < 5 || buffer.toString('latin1', 0, 5) !== '%PDF-') {
    throw new PreviewError(422, 'Downloaded file is not a valid PDF document');
  }

  const base = path.join(os.tmpdir(), `pdfprev-${process.pid}-${Date.now()}`);
  const input = `${base}.pdf`;
  const output = `${base}.jpg`;
  await fs.promises.writeFile(input, buffer);

  try {
    log('rendering PDF page 1 with pdftoppm');
    // -singlefile writes exactly `${base}.jpg`; -scale-to bounds the longer side.
    await execFileAsync('pdftoppm', [
      '-jpeg',
      '-singlefile',
      '-f',
      '1',
      '-l',
      '1',
      '-scale-to',
      '1600',
      input,
      base,
    ]);
    const page = await fs.promises.readFile(output);
    const sharp = (await import('sharp')).default;
    const jpeg = await sharp(page)
      .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    log(`PDF preview encoded: ${jpeg.length} bytes`);
    return jpeg;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message.includes('ENOENT')) {
      throw new PreviewError(500, 'PDF preview is unavailable (poppler is not installed)');
    }
    throw new PreviewError(422, `Could not render PDF: ${message}`);
  } finally {
    fs.promises.unlink(input).catch(() => {});
    fs.promises.unlink(output).catch(() => {});
  }
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

  if (kind !== 'image' && kind !== 'psd' && kind !== 'pdf') {
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
    log(`downloading PSD from Dropbox: ${dbxPath}`);
    const res = await downloadContent(dbxPath);
    const declared = Number(res.headers.get('content-length') ?? 0);
    log(`PSD download response: status=${res.status} content-length=${declared || '?'}`);
    // The whole file must be held in memory to parse it; refuse files large
    // enough to risk an out-of-memory kill before they are even read.
    if (declared > MAX_PSD_BYTES) {
      throw new PreviewError(
        413,
        `PSD file is too large to preview (${Math.round(declared / 1048576)} MB)`,
      );
    }
    const ab = await res.arrayBuffer();
    log(`PSD body read into memory: ${ab.byteLength} bytes`);
    body = await renderPsd(ab);
  } else if (kind === 'pdf') {
    log(`downloading PDF from Dropbox: ${dbxPath}`);
    const res = await downloadContent(dbxPath);
    body = await renderPdf(Buffer.from(await res.arrayBuffer()));
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
