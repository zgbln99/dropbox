import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { deletePath } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const { path } = await req.json();
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    await deletePath(path);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
