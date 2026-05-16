import { NextResponse } from 'next/server';
import { checkCredentials, createSessionToken, sessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let user = '';
  let password = '';
  try {
    const body = await req.json();
    user = String(body.user ?? '');
    password = String(body.password ?? '');
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!checkCredentials(user, password)) {
    return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.headers.set('Set-Cookie', sessionCookie(createSessionToken()));
  return res;
}
