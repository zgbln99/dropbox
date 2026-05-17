import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { dbPath, config } from './config';

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
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      token          TEXT NOT NULL UNIQUE,
      path           TEXT NOT NULL,
      name           TEXT NOT NULL,
      is_folder      INTEGER NOT NULL DEFAULT 0,
      password_hash  TEXT,
      expires_at     INTEGER,
      allow_download INTEGER NOT NULL DEFAULT 1,
      created_at     INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_shares_token ON shares(token);

    CREATE TABLE IF NOT EXISTS rate_limits (
      key          TEXT PRIMARY KEY,
      window_start INTEGER NOT NULL,
      count        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS downloads (
      path     TEXT PRIMARY KEY,
      name     TEXT NOT NULL,
      count    INTEGER NOT NULL,
      last_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS storage_snapshots (
      ts        INTEGER PRIMARY KEY,
      used      INTEGER NOT NULL,
      allocated INTEGER NOT NULL
    );
  `);

  // Migration: add allow_download to databases created before it existed.
  const columns = db.prepare('PRAGMA table_info(shares)').all() as { name: string }[];
  if (!columns.some((c) => c.name === 'allow_download')) {
    db.exec('ALTER TABLE shares ADD COLUMN allow_download INTEGER NOT NULL DEFAULT 1');
  }

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
  allow_download: number;
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
  allowDownload?: boolean;
}): Share {
  const db = getDb();
  const token = crypto.randomBytes(12).toString('base64url');
  const now = Date.now();
  db.prepare(
    `INSERT INTO shares (token, path, name, is_folder, password_hash, expires_at, allow_download, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    token,
    opts.path,
    opts.name,
    opts.isFolder ? 1 : 0,
    opts.password ? hashPassword(opts.password) : null,
    opts.expiresAt ?? null,
    opts.allowDownload === false ? 0 : 1,
    now,
  );
  return getShareByToken(token)!;
}

/**
 * Update an existing share. Each field is applied only when present in
 * `patch`: `password`/`expiresAt` set to `null` clears them, a value sets
 * them, and an absent key leaves the column untouched.
 */
export function updateShare(
  id: number,
  patch: { password?: string | null; expiresAt?: number | null; allowDownload?: boolean },
): Share | null {
  const db = getDb();
  const sets: string[] = [];
  const values: (string | number | null)[] = [];

  if ('password' in patch) {
    sets.push('password_hash = ?');
    values.push(patch.password ? hashPassword(patch.password) : null);
  }
  if ('expiresAt' in patch) {
    sets.push('expires_at = ?');
    values.push(patch.expiresAt ?? null);
  }
  if ('allowDownload' in patch) {
    sets.push('allow_download = ?');
    values.push(patch.allowDownload === false ? 0 : 1);
  }
  if (sets.length) {
    values.push(id);
    db.prepare(`UPDATE shares SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
  return (db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as Share) ?? null;
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

/* ------------------------------------------------------------ statistics */

export interface DownloadStat {
  path: string;
  name: string;
  count: number;
  lastAt: number;
}

/** Increment the download counter for a file. */
export function recordDownload(path: string, name: string): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO downloads (path, name, count, last_at) VALUES (?, ?, 1, ?)
         ON CONFLICT(path) DO UPDATE SET count = count + 1, last_at = excluded.last_at, name = excluded.name`,
      )
      .run(path, name, Date.now());
  } catch {
    /* stats are best-effort — never block a download */
  }
}

/** Most-downloaded files, highest first. */
export function topDownloads(limit = 8): DownloadStat[] {
  const rows = getDb()
    .prepare('SELECT path, name, count, last_at FROM downloads ORDER BY count DESC LIMIT ?')
    .all(limit) as { path: string; name: string; count: number; last_at: number }[];
  return rows.map((r) => ({ path: r.path, name: r.name, count: r.count, lastAt: r.last_at }));
}

/** Total downloads counted across all files. */
export function totalDownloads(): number {
  const row = getDb().prepare('SELECT COALESCE(SUM(count), 0) AS total FROM downloads').get() as {
    total: number;
  };
  return row.total;
}

/** Record a storage snapshot, at most once every 12 hours. */
export function recordStorageSnapshot(used: number, allocated: number): void {
  try {
    const db = getDb();
    const last = db
      .prepare('SELECT ts FROM storage_snapshots ORDER BY ts DESC LIMIT 1')
      .get() as { ts: number } | undefined;
    if (last && Date.now() - last.ts < 12 * 60 * 60 * 1000) return;
    db.prepare('INSERT INTO storage_snapshots (ts, used, allocated) VALUES (?, ?, ?)').run(
      Date.now(),
      used,
      allocated,
    );
  } catch {
    /* best-effort */
  }
}

/** Storage snapshots, oldest first. */
export function storageHistory(limit = 60): { ts: number; used: number; allocated: number }[] {
  const rows = getDb()
    .prepare('SELECT ts, used, allocated FROM storage_snapshots ORDER BY ts DESC LIMIT ?')
    .all(limit) as { ts: number; used: number; allocated: number }[];
  return rows.reverse();
}

export interface PublicShare {
  id: number;
  token: string;
  url: string;
  path: string;
  name: string;
  isFolder: boolean;
  hasPassword: boolean;
  allowDownload: boolean;
  expiresAt: number | null;
  createdAt: number;
}

/** Project a stored share into the shape returned by the API. */
export function shareToPublic(s: Share): PublicShare {
  return {
    id: s.id,
    token: s.token,
    url: `${config.appUrl}/s/${s.token}`,
    path: s.path,
    name: s.name,
    isFolder: !!s.is_folder,
    hasPassword: !!s.password_hash,
    allowDownload: !!s.allow_download,
    expiresAt: s.expires_at,
    createdAt: s.created_at,
  };
}
