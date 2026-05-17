import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { downloadZip } from '@/lib/dropbox';
import { isSafePath } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Streams a folder from Dropbox to the client as a ZIP archive. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const path = new URL(req.url).searchParams.get('path') || '';
    if (!isSafePath(path) || path === '/' || path === '') {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const name = (path.slice(path.lastIndexOf('/') + 1) || 'archive').replace(
      /["\\\r\n]/g,
      '_',
    );
    const asciiName = name.replace(/[^\x20-\x7e]/g, '_');

    const res = await downloadZip(path);
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition':
          `attachment; filename="${asciiName}.zip"; ` +
          `filename*=UTF-8''${encodeURIComponent(name)}.zip`,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
