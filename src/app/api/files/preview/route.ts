import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { getPreview } from '@/lib/preview';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Decode a `path` query parameter into a normalised Dropbox path.
 *
 * `URLSearchParams` already decodes once, so a normal request arrives decoded
 * (`%2Ffile.psd` -> `/file.psd`). This also defensively handles a
 * double-encoded value (`%252F...`) by decoding again. Returns null when the
 * value is missing or fails the safety check.
 */
function decodePath(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.trim();
  if (p.includes('%2F') || p.includes('%2f') || (!p.startsWith('/') && p.includes('%'))) {
    try {
      p = decodeURIComponent(p);
    } catch {
      /* leave as-is if it cannot be decoded */
    }
  }
  if (!p.startsWith('/')) p = `/${p}`;
  if (!isSafePath(p) || p === '/') return null;
  return p;
}

/**
 * Returns a cached preview image (thumbnail) for images, SVGs and PSDs.
 * PSDs are downloaded from Dropbox, decoded with ag-psd, encoded to JPEG with
 * sharp, and cached under data/previews. Previews are generated on first
 * request only.
 */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) {
    console.warn('[preview] rejected: unauthenticated request');
    return denied;
  }

  const url = new URL(req.url);
  const rawPath = url.searchParams.get('path');
  const rev = url.searchParams.get('rev');
  console.log(`[preview] request path=${JSON.stringify(rawPath)} rev=${JSON.stringify(rev)}`);

  const dbxPath = decodePath(rawPath);
  if (!dbxPath) {
    console.warn(`[preview] rejected: invalid path parameter (raw=${JSON.stringify(rawPath)})`);
    return NextResponse.json(
      { error: 'Missing or invalid "path" query parameter' },
      { status: 400 },
    );
  }

  const name = dbxPath.slice(dbxPath.lastIndexOf('/') + 1);

  try {
    const preview = await getPreview(dbxPath, name, rev);
    if (!preview) {
      console.warn(`[preview] no preview available for ${dbxPath}`);
      return NextResponse.json(
        { error: 'No preview available for this file type' },
        { status: 415 },
      );
    }
    console.log(`[preview] served ${dbxPath} (${preview.body.length} bytes, ${preview.contentType})`);
    return new NextResponse(new Uint8Array(preview.body), {
      headers: {
        'Content-Type': preview.contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    // Log the full stack server-side; return a useful JSON message to the client.
    console.error(
      `[preview] generation failed for ${dbxPath}:`,
      err instanceof Error ? err.stack || err.message : err,
    );
    return errorResponse(err);
  }
}
