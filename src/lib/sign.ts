import crypto from 'crypto';
import { config } from './config';

/**
 * Short-lived HMAC signatures for public share download URLs.
 *
 * A signature binds the share token, the file path and an expiry timestamp,
 * so a download URL cannot be reused for a different file/share and stops
 * working shortly after it is minted.
 */

/** Signed download links are valid for 5 minutes. */
export const DOWNLOAD_TTL_SEC = 5 * 60;

/** Stable signing key derived from server secrets (not exposed to clients). */
function secret(): Buffer {
  return crypto
    .createHash('sha256')
    .update(`jrjr-drive-share|${config.adminPassword}|${config.dropboxAppSecret}`)
    .digest();
}

function computeSignature(token: string, path: string, exp: number): string {
  return crypto
    .createHmac('sha256', secret())
    .update(`${token}\n${path}\n${exp}`)
    .digest('base64url');
}

/** Create an expiry timestamp + signature for a share download. */
export function signDownload(token: string, path: string): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + DOWNLOAD_TTL_SEC;
  return { exp, sig: computeSignature(token, path, exp) };
}

/** Verify a download signature and that it has not expired. */
export function verifyDownload(
  token: string,
  path: string,
  exp: number,
  sig: string,
): boolean {
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;
  const expected = computeSignature(token, path, exp);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
