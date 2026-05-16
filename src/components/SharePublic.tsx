'use client';

import { useCallback, useEffect, useState } from 'react';
import { fileKind, formatBytes, formatDate, isWithin } from '@/lib/utils';

interface Entry {
  tag: 'file' | 'folder';
  name: string;
  path: string;
  size: number;
  modified: string | null;
  rev: string | null;
}

interface Props {
  token: string;
  name: string;
  isFolder: boolean;
  hasPassword: boolean;
  rootPath: string;
}

export default function SharePublic({ token, name, isFolder, hasPassword, rootPath }: Props) {
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(!hasPassword);
  const [path, setPath] = useState(rootPath);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Entry | null>(null);

  const api = useCallback(
    (action: string, p?: string, rev?: string) => {
      const params = new URLSearchParams({ action });
      if (p) params.set('path', p);
      if (rev) params.set('rev', rev);
      if (password) params.set('password', password);
      return `/api/share/${token}?${params.toString()}`;
    },
    [token, password],
  );

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(api('list', p));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setEntries(data.entries || []);
        setUnlocked(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (unlocked) load(path);
  }, [unlocked, path, load]);

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(rootPath);
          }}
          className="w-full max-w-sm rounded-xl bg-white p-8 shadow"
        >
          <h1 className="text-xl font-semibold">🔒 Protected share</h1>
          <p className="mt-1 text-sm text-slate-500">Enter the password to view “{name}”.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <button className="mt-4 w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Unlock
          </button>
        </form>
      </main>
    );
  }

  // Single-file share.
  if (!isFolder) {
    const fileEntry: Entry = {
      tag: 'file',
      name,
      path: rootPath,
      size: 0,
      modified: null,
      rev: null,
    };
    return (
      <Shell title={name}>
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <FilePreview entry={fileEntry} api={api} large />
          <a
            href={api('download', rootPath)}
            className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Download
          </a>
        </div>
      </Shell>
    );
  }

  const rel = path === rootPath ? [] : path.replace(rootPath, '').split('/').filter(Boolean);

  return (
    <Shell title={name}>
      <div className="mb-3 flex items-center gap-1 text-sm text-slate-600">
        <button onClick={() => setPath(rootPath)} className="hover:text-brand">
          {name}
        </button>
        {rel.map((c, i) => {
          const target = `${rootPath}/${rel.slice(0, i + 1).join('/')}`;
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

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-6 text-center text-sm text-slate-400">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-400">This folder is empty.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li key={entry.path} className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50">
                <button
                  className="flex flex-1 items-center gap-2 text-left text-sm"
                  onClick={() =>
                    entry.tag === 'folder'
                      ? isWithin(rootPath, entry.path) && setPath(entry.path)
                      : setPreview(entry)
                  }
                >
                  <span>{entry.tag === 'folder' ? '📁' : '📄'}</span>
                  <span className="truncate">{entry.name}</span>
                </button>
                <span className="text-xs text-slate-400">
                  {entry.tag === 'folder' ? '' : formatBytes(entry.size)}
                </span>
                {entry.tag === 'file' && (
                  <a
                    href={api('download', entry.path)}
                    className="text-xs text-brand hover:underline"
                  >
                    Download
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2">
              <span className="truncate text-sm font-medium">{preview.name}</span>
              <button onClick={() => setPreview(null)} className="text-slate-400 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-2">
              <FilePreview entry={preview} api={api} large />
            </div>
            <div className="border-t border-slate-200 p-3 text-right">
              <a
                href={api('download', preview.path)}
                className="rounded-lg bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark"
              >
                Download
              </a>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <span className="text-lg font-semibold text-brand">jrjr-drive</span>
          <span className="truncate text-sm text-slate-500">{title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl p-4">{children}</main>
    </div>
  );
}

function FilePreview({
  entry,
  api,
  large,
}: {
  entry: Entry;
  api: (action: string, p?: string, rev?: string) => string;
  large?: boolean;
}) {
  const kind = fileKind(entry.name);
  const raw = api('download', entry.path);
  const prev = api('preview', entry.path, entry.rev || undefined);
  const cls = large ? 'max-h-[70vh]' : 'max-h-48';

  if (kind === 'image' || kind === 'svg' || kind === 'psd') {
    return <img src={prev} alt={entry.name} className={`${cls} object-contain`} />;
  }
  if (kind === 'video') {
    return <video src={raw} controls className={`${cls} w-full`} />;
  }
  if (kind === 'pdf') {
    return <iframe src={raw} title={entry.name} className="h-[70vh] w-full" />;
  }
  return (
    <p className="p-6 text-sm text-slate-500">
      Preview not available{entry.modified ? ` · ${formatDate(entry.modified)}` : ''}.
    </p>
  );
}
