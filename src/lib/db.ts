import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { dbPath } from './config';

let _db: Database.Database | null = null;

/** Lazily open the SQLite database and ensure the schema exists. */
export function getDb(): Database.Database {
  if (_db) return _db;
  const file = path.resolve(dbPath());
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS shares (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      token         TEXT NOT NULL UNIQUE,
      path          TEXT NOT NULL,
      name          TEXT NOT NULL,
      is_folder     INTEGER NOT NULL DEFAULT 0,
      password_hash TEXT,
      expires_at    INTEGER,
      created_at    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);

    CREATE TABLE IF NOT EXISTS rate_limits (
      key          TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count        INTEGER NOT NULL
    );
  `);
  _db = db;
  return db;
}

export interface Share {
  id: number;
  token: string;
  path: string;
  name: string;
  is_folder: number;
  password_hash: string | null;
  expires_at: number | null;
  created_at: number;
}

/** Hash a share password with scrypt (salt:hash, both hex). */
export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(pw, salt, 32);
  return `${salt.toString('hex')}:${dk.toString('hex')}`;
}

/** Verify a plaintext password against a stored scrypt hash. */
export function verifyPassword(pw: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const dk = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 32);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === dk.length && crypto.timingSafeEqual(expected, dk);
}

export function createShare(opts: {
  path: string;
  name: string;
  isFolder: boolean;
  password?: string | null;
  expiresAt?: number | null;
}): Share {
  const db = getDb();
  const token = crypto.randomBytes(12).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO shares (token, path, name, is_folder, password_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    opts.path,
    opts.name,
    opts.isFolder ? 1 : 0,
    opts.password ? hashPassword(opts.password) : null,
    opts.expiresAt ?? null,
    now,
  );
  return getShareByToken(token)!;
}

export function getShareByToken(token: string): Share | null {
  return (getDb().prepare('SELECT * FROM shares WHERE token = ?').get(token) as Share) ?? null;
}

export function listShares(): Share[] {
  return getDb().prepare('SELECT * FROM shares ORDER BY created_at DESC').all() as Share[];
}

export function deleteShare(id: number): void {
  getDb().prepare('DELETE FROM shares WHERE id = ?').run(id);
}

/** True when a share has an expiry in the past. */
export function isExpired(share: Share): boolean {
  return share.expires_at != null && share.expires_at < Date.now();
}
