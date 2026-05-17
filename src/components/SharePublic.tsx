'use client';

import { useCallback, useEffect, useState } from 'react';
import { fileKind, formatBytes, formatDate, isWithin } from '@/lib/utils';
import {
  FileGlyph,
  IconChevron,
  IconClose,
  IconCloud,
  IconDownload,
  IconLock,
} from '@/components/icons';

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

  // Downloads use a signed, short-lived URL minted fresh on each click.
  const download = useCallback(
    async (target: string) => {
      setError('');
      try {
        const res = await fetch(api('sign', target));
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Could not start download');
        window.location.href = data.url;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not start download');
      }
    },
    [api],
  );

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(rootPath);
          }}
          className="w-full max-w-sm animate-pop-in rounded-2xl border border-slate-200/70 bg-white/80 p-7 shadow-card backdrop-blur"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-600">
              <IconLock className="h-6 w-6" />
            </div>
            <h1 className="mt-3 text-lg font-semibold text-slate-900">Protected share</h1>
            <p className="mt-1 text-sm text-slate-500">
              Enter the password to view “{name}”.
            </p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder="Password"
            className="mt-5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}
          <button className="mt-4 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark">
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
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <div className="flex min-h-[320px] items-center justify-center bg-slate-50 p-6">
            <FilePreview entry={fileEntry} api={api} large />
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileGlyph kind={fileKind(name)} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
              <span className="truncate text-sm font-medium text-slate-800">{name}</span>
            </div>
            <button
              onClick={() => download(rootPath)}
              className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark"
            >
              <IconDownload className="h-4 w-4" />
              Download
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  const rel = path === rootPath ? [] : path.replace(rootPath, '').split('/').filter(Boolean);

  return (
    <Shell title={name}>
      <nav className="mb-4 flex items-center gap-0.5 text-sm">
        <button
          onClick={() => setPath(rootPath)}
          className={`rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 ${
            rel.length ? 'text-slate-500' : 'text-slate-900'
          }`}
        >
          {name}
        </button>
        {rel.map((c, i) => {
          const target = `${rootPath}/${rel.slice(0, i + 1).join('/')}`;
          const last = i === rel.length - 1;
          return (
            <span key={target} className="flex min-w-0 items-center">
              <IconChevron className="h-4 w-4 shrink-0 text-slate-300" />
              <button
                onClick={() => setPath(target)}
                className={`truncate rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 ${
                  last ? 'text-slate-900' : 'text-slate-500'
                }`}
              >
                {c}
              </button>
            </span>
          );
        })}
      </nav>

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-slate-400">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 py-12 text-center text-sm text-slate-400">
          This folder is empty.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li
                key={entry.path}
                className="flex items-center gap-3 px-4 py-2.5 transition hover:bg-slate-50"
              >
                <FileGlyph
                  kind={entry.tag === 'folder' ? 'folder' : fileKind(entry.name)}
                  className="h-9 w-9"
                  iconClassName="h-[18px] w-[18px]"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() =>
                    entry.tag === 'folder'
                      ? isWithin(rootPath, entry.path) && setPath(entry.path)
                      : setPreview(entry)
                  }
                >
                  <p className="truncate text-sm font-medium text-slate-800">{entry.name}</p>
                  <p className="text-xs text-slate-400">
                    {entry.tag === 'folder' ? 'Folder' : formatBytes(entry.size)}
                  </p>
                </button>
                {entry.tag === 'file' && (
                  <button
                    onClick={() => download(entry.path)}
                    title="Download"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                  >
                    <IconDownload className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-4xl animate-pop-in flex-col overflow-hidden rounded-2xl bg-white shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
              <FileGlyph
                kind={fileKind(preview.name)}
                className="h-9 w-9"
                iconClassName="h-[18px] w-[18px]"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                {preview.name}
              </span>
              <button
                onClick={() => download(preview.path)}
                className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <IconDownload className="h-4 w-4" />
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                onClick={() => setPreview(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <IconClose className="h-[18px] w-[18px]" />
              </button>
            </div>
            <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
              <FilePreview entry={preview} api={api} large />
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
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
              <IconCloud className="h-5 w-5" />
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-900">jrjr-drive</span>
          </div>
          <span className="truncate text-sm text-slate-400">{title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">{children}</main>
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
  const raw = api('view', entry.path);
  const prev = api('preview', entry.path, entry.rev || undefined);
  const cls = large ? 'max-h-[72vh]' : 'max-h-48';

  if (kind === 'image' || kind === 'svg' || kind === 'psd') {
    return (
      <img src={prev} alt={entry.name} className={`${cls} rounded-lg object-contain shadow-sm`} />
    );
  }
  if (kind === 'video') {
    return <video src={raw} controls className={`${cls} w-full rounded-lg`} />;
  }
  if (kind === 'pdf') {
    return <iframe src={raw} title={entry.name} className="h-[72vh] w-full rounded-lg" />;
  }
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <FileGlyph kind={kind} className="h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
      <p className="mt-3 text-sm text-slate-500">
        No preview available{entry.modified ? ` · ${formatDate(entry.modified)}` : ''}.
      </p>
    </div>
  );
}
