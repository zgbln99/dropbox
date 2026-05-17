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

/**
 * Serialise a Dropbox-API-Arg header value. The Dropbox content endpoints
 * require this header to be ASCII-only, so any non-ASCII characters (e.g. in
 * file names) must be escaped as \uXXXX — otherwise Dropbox replies 400.
 */
function apiArg(obj: unknown): string {
  // Escape every code point outside printable ASCII (Dropbox requires it).
  return JSON.stringify(obj).replace(/[^\x20-\x7e]/g, (c) =>
    `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
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

/** Total and used storage for the linked Dropbox account, in bytes. */
export async function getSpaceUsage(): Promise<{ used: number; allocated: number }> {
  const res = await rpc<{ used?: number; allocation?: { allocated?: number } }>(
    'users/get_space_usage',
    null,
  );
  return { used: res.used ?? 0, allocated: res.allocation?.allocated ?? 0 };
}

/** Get a short-lived direct download URL (offloads bandwidth from the VPS). */
export async function getTemporaryLink(path: string): Promise<string> {
  const res = await rpc<{ link: string }>('files/get_temporary_link', { path: toApiPath(path) });
  return res.link;
}

/**
 * Download raw file bytes through the Dropbox content API.
 *
 * A timeout is enforced: without one, a stalled connection would leave the
 * request (and the preview generation that awaits it) hanging indefinitely
 * with no error ever surfacing.
 */
export async function downloadContent(path: string, timeoutMs = 60_000): Promise<Response> {
  const token = await getAccessToken();
  let res: Response;
  try {
    res = await fetch('https://content.dropboxapi.com/2/files/download', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Dropbox-API-Arg': apiArg({ path: toApiPath(path) }),
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new DropboxError(504, `Download timed out after ${timeoutMs}ms`);
    }
    throw new DropboxError(502, `Download request failed: ${err instanceof Error ? err.message : err}`);
  }
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  return res;
}

/** Largest file size Dropbox accepts in a single `files/upload` request. */
export const SIMPLE_UPLOAD_LIMIT = 150 * 1024 * 1024;

/** Chunk size used for upload sessions (8 MB). */
export const UPLOAD_CHUNK_SIZE = 8 * 1024 * 1024;

/** Upload a file (<= 150 MB) in a single request, overwriting any existing file. */
export async function uploadFile(path: string, body: Buffer): Promise<DbxEntry> {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg({
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

/**
 * Re-chunk a byte stream into fixed-size buffers (the final buffer may be
 * smaller). At most ~2x the chunk size is held in memory at any time, so this
 * stays cheap regardless of the total file size.
 */
async function* rechunk(
  stream: ReadableStream<Uint8Array>,
  chunkSize: number,
): AsyncGenerator<Buffer> {
  const reader = stream.getReader();
  let parts: Buffer[] = [];
  let buffered = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.length === 0) continue;
      parts.push(Buffer.from(value));
      buffered += value.length;
      while (buffered >= chunkSize) {
        const combined = Buffer.concat(parts, buffered);
        yield combined.subarray(0, chunkSize);
        const rest = combined.subarray(chunkSize);
        parts = rest.length ? [Buffer.from(rest)] : [];
        buffered = rest.length;
      }
    }
    if (buffered > 0) {
      yield Buffer.concat(parts, buffered);
    }
  } finally {
    reader.releaseLock();
  }
}

/** POST a chunk to a Dropbox content endpoint with a JSON API argument. */
async function contentRpc<T>(
  token: string,
  endpoint: string,
  arg: unknown,
  body: Buffer,
): Promise<T> {
  const res = await fetch(`https://content.dropboxapi.com/2/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': apiArg(arg),
    },
    body: new Uint8Array(body),
  });
  if (!res.ok) {
    throw new DropboxError(res.status, await res.text());
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

/**
 * Upload a file of any size using a Dropbox upload session
 * (start / append_v2 / finish). Chunks are streamed from `stream` 8 MB at a
 * time, so memory use stays bounded even for multi-gigabyte files.
 *
 * `onProgress` is invoked with the cumulative byte count after each chunk,
 * which callers can use to surface progress.
 */
export async function uploadSession(
  path: string,
  stream: ReadableStream<Uint8Array>,
  onProgress?: (bytesUploaded: number) => void,
): Promise<DbxEntry> {
  const token = await getAccessToken();
  let sessionId: string | null = null;
  let offset = 0;
  // The final chunk is held back so it can be sent with `finish`.
  let pending: Buffer | null = null;

  for await (const chunk of rechunk(stream, UPLOAD_CHUNK_SIZE)) {
    if (pending) {
      if (sessionId === null) {
        const r = await contentRpc<{ session_id: string }>(
          token,
          'files/upload_session/start',
          { close: false },
          pending,
        );
        sessionId = r.session_id;
      } else {
        await contentRpc(
          token,
          'files/upload_session/append_v2',
          { cursor: { session_id: sessionId, offset }, close: false },
          pending,
        );
      }
      offset += pending.length;
      onProgress?.(offset);
    }
    pending = chunk;
  }

  // Open a session even when the whole file fit in a single chunk.
  if (sessionId === null) {
    const first = pending ?? Buffer.alloc(0);
    const r = await contentRpc<{ session_id: string }>(
      token,
      'files/upload_session/start',
      { close: false },
      first,
    );
    sessionId = r.session_id;
    offset += first.length;
    pending = null;
  }

  const finishBody = pending ?? Buffer.alloc(0);
  const result = await contentRpc<RawEntry>(
    token,
    'files/upload_session/finish',
    {
      cursor: { session_id: sessionId, offset },
      commit: { path: toApiPath(path), mode: 'overwrite', autorename: false, mute: true },
    },
    finishBody,
  );
  onProgress?.(offset + finishBody.length);
  return mapEntry(result);
}

/** Fetch a JPEG thumbnail for an image file. */
export async function getThumbnail(path: string, size = 'w640h480'): Promise<Buffer> {
  const token = await getAccessToken();
  const res = await fetch('https://content.dropboxapi.com/2/files/get_thumbnail_v2', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Dropbox-API-Arg': apiArg({
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
