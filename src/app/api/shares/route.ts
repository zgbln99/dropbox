import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { createShare, listShares, shareToPublic } from '@/lib/db';
import { getMetadata } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  return NextResponse.json({ shares: listShares().map(shareToPublic) });
}

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const path = String(body.path ?? '');
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    let expiresAt: number | null = null;
    if (body.expiresAt) {
      const ts = new Date(body.expiresAt).getTime();
      if (Number.isNaN(ts)) {
        return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
      }
      expiresAt = ts;
    }

    const meta = await getMetadata(path);
    const share = createShare({
      path,
      name: meta.name || path,
      isFolder: meta.tag === 'folder',
      password: body.password ? String(body.password) : null,
      expiresAt,
      allowDownload: body.allowDownload !== false,
    });
    return NextResponse.json({ share: shareToPublic(share) });
  } catch (err) {
    return errorResponse(err);
  }
}
