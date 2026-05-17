import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { deleteShare, updateShare, shareToPublic } from '@/lib/db';

export const runtime = 'nodejs';

function parseId(id: string): number | null {
  const n = Number(id);
  return Number.isInteger(n) ? n : null;
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid share id' }, { status: 400 });
  }
  deleteShare(numericId);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  const { id } = await params;
  const numericId = parseId(id);
  if (numericId === null) {
    return NextResponse.json({ error: 'Invalid share id' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const patch: { password?: string | null; expiresAt?: number | null; allowDownload?: boolean } =
      {};

    if ('password' in body) {
      patch.password = body.password ? String(body.password) : null;
    }
    if ('expiresAt' in body) {
      if (body.expiresAt) {
        const ts = new Date(body.expiresAt).getTime();
        if (Number.isNaN(ts)) {
          return NextResponse.json({ error: 'Invalid expiry date' }, { status: 400 });
        }
        patch.expiresAt = ts;
      } else {
        patch.expiresAt = null;
      }
    }
    if ('allowDownload' in body) {
      patch.allowDownload = body.allowDownload !== false;
    }

    const share = updateShare(numericId, patch);
    if (!share) {
      return NextResponse.json({ error: 'Share not found' }, { status: 404 });
    }
    return NextResponse.json({ share: shareToPublic(share) });
  } catch (err) {
    return errorResponse(err);
  }
}
