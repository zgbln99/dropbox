import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { getPreview } from '@/lib/preview';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Returns a cached preview image (thumbnail) for images, SVGs and PSDs.
 * Previews are generated on first request and cached under data/previews.
 */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const params = new URL(req.url).searchParams;
    const path = params.get('path') || '';
    const rev = params.get('rev');
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const name = path.slice(path.lastIndexOf('/') + 1);
    const preview = await getPreview(path, name, rev);
    if (!preview) {
      return NextResponse.json({ error: 'No preview available' }, { status: 415 });
    }
    return new NextResponse(new Uint8Array(preview.body), {
      headers: {
        'Content-Type': preview.contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
