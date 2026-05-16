import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { uploadFile } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Single-request Dropbox upload limit. Larger files are rejected with 413.
const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;

/**
 * Raw-body upload. The destination path is passed via `?path=`.
 * The body is the file bytes (used by both the web UI and WebDAV PUT).
 */
export async function POST(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path') || '';
    if (!isSafePath(path) || path === '/' || path === '' || path.endsWith('/')) {
      return NextResponse.json({ error: 'Invalid destination path' }, { status: 400 });
    }
    if (!req.body) {
      return NextResponse.json({ error: 'Empty request body' }, { status: 400 });
    }

    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds the 150 MB upload limit' },
        { status: 413 },
      );
    }

    const entry = await uploadFile(path, buf);
    return NextResponse.json({ entry });
  } catch (err) {
    return errorResponse(err);
  }
}
