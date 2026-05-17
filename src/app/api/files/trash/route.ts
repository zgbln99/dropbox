import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { listDeleted, restorePath } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Lists recently deleted files. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    return NextResponse.json({ entries: await listDeleted() });
  } catch (err) {
    return errorResponse(err);
  }
}

/** Restores a deleted file: body `{ path }`. */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;
  try {
    const body = await req.json();
    const path = String(body.path ?? '');
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    await restorePath(path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
