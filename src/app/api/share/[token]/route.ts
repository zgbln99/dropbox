import { NextResponse } from 'next/server';
import { errorResponse } from '@/lib/api';
import { getShareByToken, isExpired, verifyPassword, type Share } from '@/lib/db';
import { listFolder, getTemporaryLink } from '@/lib/dropbox';
import { getPreview } from '@/lib/preview';
import { isWithin, isSafePath } from '@/lib/utils';
import { rateLimit, getClientIp } from '@/lib/ratelimit';
import { signDownload, verifyDownload, DOWNLOAD_TTL_SEC } from '@/lib/sign';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Per-IP, per-minute limits for the public share API.
const RATE_LIMITS = {
  download: { limit: 30, windowSec: 60 },
  browse: { limit: 120, windowSec: 60 },
};

function tooManyRequests(retryAfter: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please slow down and try again shortly.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, retryAfter)) } },
  );
}

/** Password supplied via query string or header. */
function suppliedPassword(req: Request, url: URL): string {
  return url.searchParams.get('password') || req.headers.get('x-share-password') || '';
}

function passwordOk(share: Share, password: string): boolean {
  if (!share.password_hash) return true;
  return !!password && verifyPassword(password, share.password_hash);
}

/** True when `path` is the shared file itself, or nested inside a shared folder. */
function withinShare(share: Share, path: string): boolean {
  return share.is_folder ? isWithin(share.path, path) : path === share.path;
}

/**
 * Public, unauthenticated share endpoint.
 *   ?action=meta                     — share info + password requirement
 *   ?action=list&path=...            — folder listing within the share
 *   ?action=sign&path=...            — mint a signed, short-lived download URL
 *   ?action=download&path=&exp=&sig= — signed file download (no password)
 *   ?action=view&path=...            — inline streaming (video/PDF)
 *   ?action=preview&path=...         — preview image for a file
 *
 * Requests are rate limited per client IP and stored in SQLite.
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(req.url);
  const action = url.searchParams.get('action') || 'meta';

  // --- per-IP rate limiting (counters persisted in SQLite) ------------------
  const ip = getClientIp(req.headers);
  const bucket = action === 'download' ? 'download' : 'browse';
  const cfg = RATE_LIMITS[bucket];
  const limited = rateLimit(`share:${bucket}:${ip}`, cfg.limit, cfg.windowSec);
  if (!limited.allowed) {
    return tooManyRequests(limited.retryAfter);
  }

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
      allowDownload: !!share.allow_download,
    });
  }

  try {
    // Downloads (and download-link minting) are refused on view-only shares.
    if ((action === 'download' || action === 'sign') && !share.allow_download) {
      return NextResponse.json(
        { error: 'Downloads are disabled for this link' },
        { status: 403 },
      );
    }

    // --- signed download: the signature authorises access, not the password.
    if (action === 'download') {
      const path = url.searchParams.get('path') || share.path;
      const exp = Number(url.searchParams.get('exp'));
      const sig = url.searchParams.get('sig') || '';
      if (!isSafePath(path) || !withinShare(share, path)) {
        return NextResponse.json({ error: 'Path is outside this share' }, { status: 403 });
      }
      if (!verifyDownload(token, path, exp, sig)) {
        return NextResponse.json(
          { error: 'Invalid or expired download link' },
          { status: 403 },
        );
      }
      return NextResponse.redirect(await getTemporaryLink(path), 302);
    }

    // --- everything below requires the share password ----------------------
    if (!passwordOk(share, suppliedPassword(req, url))) {
      return NextResponse.json({ error: 'Password required or incorrect' }, { status: 401 });
    }

    if (action === 'sign') {
      const path = url.searchParams.get('path') || share.path;
      if (!isSafePath(path) || !withinShare(share, path)) {
        return NextResponse.json({ error: 'Path is outside this share' }, { status: 403 });
      }
      const { exp, sig } = signDownload(token, path);
      const downloadUrl =
        `/api/share/${encodeURIComponent(token)}?action=download` +
        `&path=${encodeURIComponent(path)}&exp=${exp}&sig=${encodeURIComponent(sig)}`;
      return NextResponse.json({
        url: downloadUrl,
        expiresAt: exp * 1000,
        expiresInSec: DOWNLOAD_TTL_SEC,
      });
    }

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

    if (action === 'view' || action === 'preview') {
      const path = url.searchParams.get('path') || share.path;
      if (!isSafePath(path) || !withinShare(share, path)) {
        return NextResponse.json({ error: 'Path is outside this share' }, { status: 403 });
      }
      if (action === 'view') {
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
