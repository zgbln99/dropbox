import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { uploadFile, uploadSession, SIMPLE_UPLOAD_LIMIT } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Raw-body upload. The destination path is passed via `?path=`; the body is
 * the file bytes (used by both the web UI and WebDAV PUT).
 *
 * Files of 150 MB or less are uploaded in a single request. Larger files —
 * and any upload with no declared Content-Length — are streamed to Dropbox in
 * 8 MB chunks via an upload session, so the whole file is never buffered.
 *
 * The JSON response reports the uploaded byte count for progress tracking.
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

    const contentLength = Number(req.headers.get('content-length') || '0');
    const useSimpleUpload = contentLength > 0 && contentLength <= SIMPLE_UPLOAD_LIMIT;

    const entry = useSimpleUpload
      ? await uploadFile(path, Buffer.from(await req.arrayBuffer()))
      : await uploadSession(path, req.body);

    return NextResponse.json({ entry, bytes: entry.size });
  } catch (err) {
    return errorResponse(err);
  }
}
