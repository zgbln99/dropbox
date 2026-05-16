import { NextResponse } from 'next/server';
import { isAuthenticated } from './auth';
import { DropboxError } from './dropbox';

/** Return a 401 response if the request is not authenticated, else null. */
export function guard(req: Request): NextResponse | null {
  if (isAuthenticated(req)) return null;
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

/** Convert a thrown error into a JSON error response. */
export function errorResponse(err: unknown): NextResponse {
  if (err instanceof DropboxError) {
    const status = err.status === 409 ? 404 : err.status >= 500 ? 502 : err.status;
    return NextResponse.json({ error: err.message }, { status });
  }
  const message = err instanceof Error ? err.message : 'Internal server error';
  return NextResponse.json({ error: message }, { status: 500 });
}
