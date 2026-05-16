import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { listFolder } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const { path = '/' } = await req.json();
    if (!isSafePath(path)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const entries = await listFolder(path);
    return NextResponse.json({ path, entries });
  } catch (err) {
    return errorResponse(err);
  }
}
