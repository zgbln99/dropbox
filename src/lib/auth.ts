import crypto from 'crypto';
import { config } from './config';

const COOKIE_NAME = 'jrjr_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export { COOKIE_NAME };

/** Derive a stable HMAC secret from the admin credentials. */
function secret(): Buffer {
  return crypto
    .createHash('sha256')
    .update(`jrjr-drive|${config.adminUser}|${config.adminPassword}`)
    .digest();
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Constant-time check of a username/password pair against admin credentials. */
export function checkCredentials(user: string, pass: string): boolean {
  return safeEqual(user, config.adminUser) && safeEqual(pass, config.adminPassword);
}

/** Create a signed session token for the admin user. */
export function createSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ u: config.adminUser, iat: Date.now() }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verify a session token's signature, expiry and bound user. */
export function verifySessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const dot = token.indexOf('.');
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', secret()).update(payload).digest('base64url');
  if (!safeEqual(sig, expected)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof data.iat !== 'number' || Date.now() - data.iat > SESSION_TTL_MS) return false;
    return data.u === config.adminUser;
  } catch {
    return false;
  }
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}

/**
 * Authenticate a request via either the session cookie or HTTP Basic auth.
 * Basic auth support lets WebDAV clients reuse the admin credentials.
 */
export function isAuthenticated(req: Request): boolean {
  const authz = req.headers.get('authorization');
  if (authz && authz.startsWith('Basic ')) {
    const decoded = Buffer.from(authz.slice(6), 'base64').toString('utf8');
    const idx = decoded.indexOf(':');
    if (idx >= 0 && checkCredentials(decoded.slice(0, idx), decoded.slice(idx + 1))) {
      return true;
    }
  }
  const token = readCookie(req.headers.get('cookie'), COOKIE_NAME);
  return verifySessionToken(token);
}

/** Build the Set-Cookie header value for a logged-in session. */
export function sessionCookie(token: string): string {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Build the Set-Cookie header value that clears the session. */
export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
