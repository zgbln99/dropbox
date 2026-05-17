import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { getTemporaryLink } from '@/lib/dropbox';
import { recordDownload } from '@/lib/db';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Redirects to a short-lived Dropbox link so file bytes never transit the
 * VPS. Dropbox links support range requests, so this also works for inline
 * video/PDF viewing.
 */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const path = new URL(req.url).searchParams.get('path') || '';
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    recordDownload(path, path.slice(path.lastIndexOf('/') + 1));
    const link = await getTemporaryLink(path);
    return NextResponse.redirect(link, 302);
  } catch (err) {
    return errorResponse(err);
  }
}
