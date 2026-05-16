import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { movePath } from '@/lib/dropbox';
import { isSafePath, joinPath, parentPath } from '@/lib/utils';

export const runtime = 'nodejs';

/** Handles both rename (new name in same folder) and move (new full path). */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const from = String(body.from ?? '');
    const to =
      typeof body.to === 'string' && body.to
        ? body.to
        : joinPath(parentPath(from), String(body.name ?? ''));

    if (!isSafePath(from) || !isSafePath(to) || from === '/' || to === '/' || to.endsWith('/')) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }
    const entry = await movePath(from, to);
    return NextResponse.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}
