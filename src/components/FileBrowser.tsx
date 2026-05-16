'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileKind, formatBytes, formatDate, joinPath, type FileKind } from '@/lib/utils';

interface Entry {
  tag: 'file' | 'folder';
  name: string;
  path: string;
  size: number;
  modified: string | null;
  rev: string | null;
}

interface ShareView {
  id: number;
  token: string;
  url: string;
  path: string;
  name: string;
  isFolder: boolean;
  hasPassword: boolean;
  expiresAt: number | null;
  createdAt: number;
}

const ICONS: Record<FileKind | 'folder', string> = {
  folder: '📁',
  image: '🖼️',
  svg: '🖼️',
  video: '🎬',
  pdf: '📄',
  psd: '🎨',
  other: '📦',
};

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/**
 * Upload a single file via XHR so upload progress events are available.
 * The server transparently switches to a chunked upload session for files
 * larger than 150 MB.
 */
function xhrUpload(
  dest: string,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/files/upload?path=${encodeURIComponent(dest)}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let message = `Upload failed (${xhr.status})`;
        try {
          message = JSON.parse(xhr.responseText).error || message;
        } catch {
          /* keep default message */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

export default function FileBrowser() {
  const router = useRouter();
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [view, setView] = useState<'files' | 'shares'>('files');
  const [preview, setPreview] = useState<Entry | null>(null);
  const [shareTarget, setShareTarget] = useState<Entry | null>(null);
  const [upload, setUpload] = useState<{
    name: string;
    index: number;
    total: number;
    percent: number;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadFolder = useCallback(async (p: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await jsonFetch<{ entries: Entry[] }>('/api/files/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      });
      setEntries(data.entries);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load folder');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view === 'files') loadFolder(path);
  }, [path, view, loadFolder]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  async function handleUpload(files: FileList | null) {
    if (!files || !files.length) return;
    const list = Array.from(files);
    setError('');
    try {
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        setUpload({ name: file.name, index: i + 1, total: list.length, percent: 0 });
        await xhrUpload(joinPath(path, file.name), file, (percent) =>
          setUpload((u) => (u ? { ...u, percent } : u)),
        );
      }
      await loadFolder(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUpload(null);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function newFolder() {
    const name = window.prompt('New folder name:');
    if (!name) return;
    try {
      await jsonFetch('/api/files/mkdir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: path, name }),
      });
      await loadFolder(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create folder');
    }
  }

  async function rename(entry: Entry) {
    const name = window.prompt('Rename to:', entry.name);
    if (!name || name === entry.name) return;
    try {
      await jsonFetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: entry.path, name }),
      });
      await loadFolder(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rename failed');
    }
  }

  async function remove(entry: Entry) {
    if (!window.confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    try {
      await jsonFetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: entry.path }),
      });
      await loadFolder(path);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    }
  }

  const crumbs = path === '/' ? [] : path.split('/').filter(Boolean);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h1 className="text-lg font-semibold text-brand">jrjr-drive</h1>
        <nav className="flex items-center gap-2 text-sm">
          <button
            onClick={() => setView('files')}
            className={`rounded px-3 py-1 ${view === 'files' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Files
          </button>
          <button
            onClick={() => setView('shares')}
            className={`rounded px-3 py-1 ${view === 'shares' ? 'bg-brand text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            Share links
          </button>
          <button onClick={logout} className="rounded px-3 py-1 text-slate-600 hover:bg-slate-100">
            Sign out
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl p-4">
        {view === 'shares' ? (
          <SharesPanel />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <div className="flex flex-1 items-center gap-1 text-sm text-slate-600">
                <button onClick={() => setPath('/')} className="hover:text-brand">
                  Home
                </button>
                {crumbs.map((c, i) => {
                  const target = `/${crumbs.slice(0, i + 1).join('/')}`;
                  return (
                    <span key={target} className="flex items-center gap-1">
                      <span className="text-slate-300">/</span>
                      <button onClick={() => setPath(target)} className="hover:text-brand">
                        {c}
                      </button>
                    </span>
                  );
                })}
              </div>
              <button
                onClick={newFolder}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                New folder
              </button>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={!!upload}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {upload
                  ? `Uploading ${upload.index}/${upload.total} — ${upload.percent}%`
                  : 'Upload'}
              </button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => handleUpload(e.target.files)}
              />
            </div>

            {upload && (
              <div className="mb-3">
                <div className="mb-1 flex justify-between text-xs text-slate-500">
                  <span className="truncate">{upload.name}</span>
                  <span>{upload.percent}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full bg-brand transition-all"
                    style={{ width: `${upload.percent}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {loading ? (
                <p className="p-6 text-center text-sm text-slate-400">Loading…</p>
              ) : entries.length === 0 ? (
                <p className="p-6 text-center text-sm text-slate-400">This folder is empty.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Size</th>
                      <th className="hidden px-4 py-2 sm:table-cell">Modified</th>
                      <th className="px-4 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.path} className="border-t border-slate-100 hover:bg-slate-50">
                        <td className="px-4 py-2">
                          <button
                            className="flex items-center gap-2 text-left"
                            onClick={() =>
                              entry.tag === 'folder' ? setPath(entry.path) : setPreview(entry)
                            }
                          >
                            <span>{entry.tag === 'folder' ? ICONS.folder : ICONS[fileKind(entry.name)]}</span>
                            <span className="truncate">{entry.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2 text-slate-500">
                          {entry.tag === 'folder' ? '—' : formatBytes(entry.size)}
                        </td>
                        <td className="hidden px-4 py-2 text-slate-500 sm:table-cell">
                          {formatDate(entry.modified)}
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex justify-end gap-3 text-xs">
                            {entry.tag === 'file' && (
                              <a
                                href={`/api/files/download?path=${encodeURIComponent(entry.path)}`}
                                className="text-brand hover:underline"
                              >
                                Download
                              </a>
                            )}
                            <button
                              onClick={() => setShareTarget(entry)}
                              className="text-brand hover:underline"
                            >
                              Share
                            </button>
                            <button onClick={() => rename(entry)} className="text-slate-500 hover:underline">
                              Rename
                            </button>
                            <button onClick={() => remove(entry)} className="text-red-600 hover:underline">
                              Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </main>

      {preview && <PreviewModal entry={preview} onClose={() => setPreview(null)} />}
      {shareTarget && (
        <ShareDialog entry={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  );
}

function PreviewModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const kind = fileKind(entry.name);
  const raw = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  const prev = `/api/files/preview?path=${encodeURIComponent(entry.path)}&rev=${encodeURIComponent(entry.rev || '')}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
          <span className="truncate text-sm font-medium">{entry.name}</span>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-2">
          {kind === 'image' || kind === 'svg' || kind === 'psd' ? (
            <img src={prev} alt={entry.name} className="max-h-[70vh] object-contain" />
          ) : kind === 'video' ? (
            <video src={raw} controls className="max-h-[70vh] w-full" />
          ) : kind === 'pdf' ? (
            <iframe src={raw} className="h-[70vh] w-full" title={entry.name} />
          ) : (
            <a href={raw} className="rounded-lg bg-brand px-4 py-2 text-sm text-white">
              Download file
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    setError('');
    try {
      const data = await jsonFetch<{ share: { url: string } }>('/api/shares', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: entry.path,
          password: password || undefined,
          expiresAt: expiresAt || undefined,
        }),
      });
      setUrl(data.share.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create share');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Share “{entry.name}”</h2>
        {url ? (
          <div className="mt-4">
            <p className="text-sm text-slate-500">Public link created:</p>
            <input
              readOnly
              value={url}
              onFocus={(e) => e.target.select()}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => navigator.clipboard?.writeText(url)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Copy
              </button>
              <button
                onClick={onClose}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Password (optional)
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="No password"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Expires (optional)
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </label>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={busy}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark disabled:opacity-60"
              >
                {busy ? 'Creating…' : 'Create link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function SharesPanel() {
  const [shares, setShares] = useState<ShareView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await jsonFetch<{ shares: ShareView[] }>('/api/shares');
      setShares(data.shares);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load shares');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(id: number) {
    if (!window.confirm('Revoke this share link?')) return;
    await fetch(`/api/shares/${id}`, { method: 'DELETE' });
    await load();
  }

  if (loading) return <p className="text-sm text-slate-400">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!shares.length) return <p className="text-sm text-slate-400">No share links yet.</p>;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-2">Name</th>
            <th className="hidden px-4 py-2 sm:table-cell">Link</th>
            <th className="px-4 py-2">Protection</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {shares.map((s) => (
            <tr key={s.id} className="border-t border-slate-100">
              <td className="px-4 py-2">{s.name}</td>
              <td className="hidden px-4 py-2 sm:table-cell">
                <a href={s.url} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                  {s.url}
                </a>
              </td>
              <td className="px-4 py-2 text-slate-500">
                {s.hasPassword ? '🔒 password' : 'public'}
                {s.expiresAt ? ` · until ${formatDate(new Date(s.expiresAt).toISOString())}` : ''}
              </td>
              <td className="px-4 py-2 text-right text-xs">
                <button
                  onClick={() => navigator.clipboard?.writeText(s.url)}
                  className="mr-3 text-brand hover:underline"
                >
                  Copy
                </button>
                <button onClick={() => revoke(s.id)} className="text-red-600 hover:underline">
                  Revoke
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
