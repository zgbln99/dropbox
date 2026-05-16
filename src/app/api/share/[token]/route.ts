import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getShareByToken, isExpired, verifyPassword, type Share } from '@/lib/db';
import { listFolder, getTemporaryLink } from '@/lib/dropbox';
import { getPreview } from '@/lib/preview';
import { isWithin, isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Resolve the password supplied via query string or header. */
function suppliedPassword(req: Request, url: URL): string {
  return url.searchParams.get('password') || req.headers.get('x-share-password') || '';
}

/** Validate password for a protected share. */
function passwordOk(share: Share, password: string): boolean {
  if (!share.password_hash) return true;
  return !!password && verifyPassword(password, share.password_hash);
}

/**
 * Public, unauthenticated share endpoint.
 *   ?action=meta                — share info + password requirement
 *   ?action=list&path=...       — folder listing within the share
 *   ?action=download&path=...   — redirect to a file
 *   ?action=preview&path=...    — preview image for a file
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'meta';

  const share = getShareByToken(token);
  if (!share) {
    return NextResponse.json({ error: 'Share not found' }, { status: 404 });
  }
  if (isExpired(share)) {
    return NextResponse.json({ error: 'This share link has expired' }, { status: 410 });
  }

  // Metadata is public so the page can render a password prompt.
  if (action === 'meta') {
    return NextResponse.json({
      name: share.name,
      isFolder: !!share.is_folder,
      hasPassword: !!share.password_hash,
    });
  }

  if (!passwordOk(share, suppliedPassword(req, url))) {
    return NextResponse.json({ error: 'Password required or incorrect' }, { status: 401 });
  }

  try {
    if (action === 'list') {
      if (!share.is_folder) {
        // A file share: expose only the single shared file.
        return NextResponse.json({
          path: share.path,
          root: share.path,
          name: share.name,
          isFolder: false,
          entries: [],
        });
      }
      const target = url.searchParams.get('path') || share.path;
      if (!isSafePath(target) || !isWithin(share.path, target)) {
        return NextResponse.json({ error: 'Path is outside this share' }, { status: 403 });
      }
      const entries = await listFolder(target);
      return NextResponse.json({
        path: target,
        root: share.path,
        name: share.name,
        isFolder: true,
        entries,
      });
    }

    if (action === 'download' || action === 'preview') {
      const path = url.searchParams.get('path') || share.path;
      const allowed = share.is_folder ? isWithin(share.path, path) : path === share.path;
      if (!isSafePath(path) || !allowed) {
        return NextResponse.json({ error: 'Path is outside this share' }, { status: 403 });
      }
      if (action === 'download') {
        return NextResponse.redirect(await getTemporaryLink(path), 302);
      }
      const name = path.slice(path.lastIndexOf('/') + 1);
      const preview = await getPreview(path, name, url.searchParams.get('rev'));
      if (!preview) {
        return NextResponse.json({ error: 'No preview available' }, { status: 415 });
      }
      return new NextResponse(new Uint8Array(preview.body), {
        headers: {
          'Content-Type': preview.contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    return errorResponse(err);
  }
}
