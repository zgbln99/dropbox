import { config } from './config';

/**
 * Minimal Dropbox API client built on `fetch` — no SDK dependency.
 * Dropbox stays the source of truth; nothing is indexed or mirrored locally.
 */

export class DropboxError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(`Dropbox API error ${status}: ${message}`);
    this.status = status;
  }
}

export interface DbxEntry {
  tag: 'file' | 'folder';
  name: string;
  path: string;
  size: number;
  modified: string | null;
  rev: string | null;
}

let cachedToken: { token: string; expires: number } | null = null;

/** Exchange the long-lived refresh token for a short-lived access token. */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const basic = Buffer.from(`${config.dropboxAppKey}:${config.dropboxAppSecret}`).toString('base64');
  const res = await fetch('https://api.dropbox.com/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: config.dropboxRefreshToken,
    }),
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expires: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.token;
}

/** Normalise a portal path into a Dropbox API path ('' for root). */
export function toApiPath(p: string): string {
  if (!p || p === '/' || p === '') return '';
  let out = p.startsWith('/') ? p : `/${p}`;
  if (out.length > 1 && out.endsWith('/')) out = out.slice(0, -1);
  return out;
}

/** Call a Dropbox RPC endpoint (api.dropboxapi.com/2/...). */
async function rpc<T = unknown>(endpoint: string, body: unknown): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`https://api.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body == null ? 'null' : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

interface RawEntry {
  '.tag': string;
  name: string;
  path_display?: string;
  path_lower?: string;
  size?: number;
  server_modified?: string;
  rev?: string;
}

function mapEntry(e: RawEntry): DbxEntry {
  return {
    tag: e['.tag'] === 'folder' ? 'folder' : 'file',
    name: e.name,
    path: e.path_display || e.path_lower || `/${e.name}`,
    size: e.size ?? 0,
    modified: e.server_modified ?? null,
    rev: e.rev ?? null,
  };
}

/** List a folder's direct children (handles pagination). */
export async function listFolder(path: string): Promise<DbxEntry[]> {
  let res = await rpc<{ entries: RawEntry[]; cursor: string; has_more: boolean }>(
    'files/list_folder',
    { path: toApiPath(path), limit: 2000 },
  );
  let entries = res.entries;
  while (res.has_more) {
    res = await rpc('files/list_folder/continue', { cursor: res.cursor });
    entries = entries.concat(res.entries);
  }
  return entries
    .map(mapEntry)
    .sort((a, b) =>
      a.tag !== b.tag
        ? a.tag === 'folder'
          ? -1
          : 1
        : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
    );
}

/** Fetch metadata for a single file or folder. */
export async function getMetadata(path: string): Promise<DbxEntry> {
  const api = toApiPath(path);
  if (api === '') {
    return { tag: 'folder', name: '', path: '/', size: 0, modified: null, rev: null };
  }
  const e = await rpc<RawEntry>('files/get_metadata', { path: api });
  return mapEntry(e);
}

/** Get a short-lived direct download URL (offloads bandwidth from the VPS). */
export async function getTemporaryLink(path: string): Promise<string> {
  const res = await rpc<{ link: string }>('files/get_temporary_link', { path: toApiPath(path) });
  return res.link;
}

/** Download raw file bytes through the Dropbox content API. */
export async function downloadContent(path: string): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/download', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({ path: toApiPath(path) }),
    },
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  return res;
}

/** Upload a file, overwriting any existing file at the same path. */
export async function uploadFile(path: string, body: Buffer): Promise<DbxEntry> {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path: toApiPath(path),
        mode: 'overwrite',
        autorename: false,
        mute: true,
      }),
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  return mapEntry((await res.json()) as RawEntry);
}

/** Fetch a JPEG thumbnail for an image file. */
export async function getThumbnail(path: string, size = 'w640h480'): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': JSON.stringify({
        resource: { '.tag': 'path', path: toApiPath(path) },
        format: { '.tag': 'jpeg' },
        size: { '.tag': size },
        mode: { '.tag': 'strict' },
      }),
    },
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function deletePath(path: string): Promise<void> {
  await rpc('files/delete_v2', { path: toApiPath(path) });
}

export async function movePath(from: string, to: string): Promise<DbxEntry> {
  const res = await rpc<{ metadata: RawEntry }>('files/move_v2', {
    from_path: toApiPath(from),
    to_path: toApiPath(to),
    autorename: false,
  });
  return mapEntry(res.metadata);
}

export async function copyPath(from: string, to: string): Promise<DbxEntry> {
  const res = await rpc<{ metadata: RawEntry }>('files/copy_v2', {
    from_path: toApiPath(from),
    to_path: toApiPath(to),
    autorename: false,
  });
  return mapEntry(res.metadata);
}

export async function createFolder(path: string): Promise<DbxEntry> {
  const res = await rpc<{ metadata: RawEntry }>('files/create_folder_v2', {
    path: toApiPath(path),
    autorename: false,
  });
  return mapEntry(res.metadata);
}
