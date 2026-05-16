import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { createFolder } from '@/lib/dropbox';
import { isSafePath, joinPath } from '@/lib/utils';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    // Accept either an explicit full path, or parent + name.
    const target =
      typeof body.path === 'string' && !body.name
        ? body.path
        : joinPath(String(body.parent ?? '/'), String(body.name ?? ''));
    if (!isSafePath(target) || target === '/' || target.endsWith('/')) {
      return NextResponse.json({ error: 'Invalid folder name' }, { status: 400 });
    }
    const entry = await createFolder(target);
    return NextResponse.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}
