import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { downloadContent, getThumbnail } from './dropbox';
import { fileKind } from './utils';

/** Disk cache for generated previews. Populated lazily, on first request. */
const PREVIEW_DIR = path.join(process.cwd(), 'data', 'previews');

function ensureDir(): void {
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
}

/** Cache key derived from path + revision so edits invalidate the cache. */
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

/**
 * Render a PSD to a JPEG preview. Uses ag-psd to decode the flattened
 * composite without node-canvas, then sharp to resize/encode.
 */
async function renderPsd(buffer: ArrayBuffer): Promise<Buffer> {
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(buffer, {
    skipLayerImageData: true,
    skipThumbnail: true,
    useImageData: true,
  });
  const image = psd.imageData;
  if (!image) {
    throw new Error('PSD has no composite image data');
  }
  const sharp = (await import('sharp')).default;
  return sharp(Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength), {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

/**
 * Return a cached preview image for the given Dropbox file, generating and
 * caching it on first request. Returns null for unsupported file types.
 */
export async function getPreview(
  dbxPath: string,
  fileName: string,
  rev: string | null,
): Promise<PreviewResult | null> {
  const kind = fileKind(fileName);

  // SVG previews in the browser directly — just stream the original bytes.
  if (kind === 'svg') {
    const res = await downloadContent(dbxPath);
    return { body: Buffer.from(await res.arrayBuffer()), contentType: 'image/svg+xml' };
  }

  if (kind !== 'image' && kind !== 'psd') {
    return null;
  }

  ensureDir();
  const cached = cacheFile(dbxPath, rev, kind);
  try {
    const body = await fs.promises.readFile(cached);
    return { body, contentType: 'image/jpeg' };
  } catch {
    // cache miss — fall through and generate
  }

  let body: Buffer;
  if (kind === 'psd') {
    const res = await downloadContent(dbxPath);
    body = await renderPsd(await res.arrayBuffer());
  } else {
    // Dropbox renders image thumbnails server-side — cheap on the VPS.
    body = await getThumbnail(dbxPath, 'w1024h768');
  }

  // Cache atomically so concurrent requests never read a partial file.
  const tmp = `${cached}.${process.pid}.${Date.now()}.tmp`;
  await fs.promises.writeFile(tmp, body);
  await fs.promises.rename(tmp, cached);

  return { body, contentType: 'image/jpeg' };
}
