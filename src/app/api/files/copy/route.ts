import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { copyPath } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const { from, to } = await req.json();
    if (!isSafePath(from) || !isSafePath(to) || from === '/' || to === '/' || to.endsWith('/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const entry = await copyPath(from, to);
    return NextResponse.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}
