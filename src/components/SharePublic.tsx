'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { fileKind, formatBytes, formatDate, isWithin, type FileKind } from '@/lib/utils';
import { useSettings } from '@/lib/settings';
import {
  FileGlyph,
  IconAlert,
  IconArrowLeft,
  IconArrowRight,
  IconChevron,
  IconClose,
  IconCloud,
  IconDownload,
  IconGrid,
  IconList,
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
  allowDownload: boolean;
  rootPath: string;
}

type ShareApi = (action: string, p?: string, rev?: string) => string;

export default function SharePublic({
  token,
  name,
  isFolder,
  hasPassword,
  allowDownload,
  rootPath,
}: Props) {
  const { view, set, t } = useSettings();
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(!hasPassword);
  const [path, setPath] = useState(rootPath);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const api = useCallback<ShareApi>(
    (action, p, rev) => {
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
    if (unlocked && isFolder) load(path);
  }, [unlocked, isFolder, path, load]);

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

  const files = useMemo(() => entries.filter((e) => e.tag === 'file'), [entries]);
  const folders = useMemo(() => entries.filter((e) => e.tag === 'folder'), [entries]);

  /* --- password gate --- */
  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load(rootPath);
          }}
          className="card w-full max-w-sm animate-pop-in p-7"
        >
          <div className="flex flex-col items-center text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <IconLock className="h-6 w-6" />
            </div>
            <h1 className="mt-3 text-lg font-semibold text-strong">{t('protectedTitle')}</h1>
            <p className="mt-1 text-sm text-muted">{t('protectedHint', { name })}</p>
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            placeholder={t('password')}
            className="input mt-5"
          />
          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </p>
          )}
          <button className="btn-primary mt-4 w-full py-2.5">{t('unlock')}</button>
        </form>
      </main>
    );
  }

  /* --- single-file share --- */
  if (!isFolder) {
    const fileEntry: Entry = { tag: 'file', name, path: rootPath, size: 0, modified: null, rev: null };
    return (
      <Shell title={name}>
        <div className="card overflow-hidden">
          <div className="flex min-h-[320px] items-center justify-center bg-slate-50 p-6 dark:bg-black/30">
            <FilePreview entry={fileEntry} api={api} />
          </div>
          <div className="flex items-center justify-between gap-3 border-t divider px-4 py-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <FileGlyph kind={fileKind(name)} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
              <span className="truncate text-sm font-medium text-strong">{name}</span>
            </div>
            {allowDownload && (
              <button onClick={() => download(rootPath)} className="btn-primary shrink-0">
                <IconDownload className="h-4 w-4" />
                {t('download')}
              </button>
            )}
          </div>
        </div>
      </Shell>
    );
  }

  /* --- folder share --- */
  const rel = path === rootPath ? [] : path.replace(rootPath, '').split('/').filter(Boolean);

  return (
    <Shell title={name}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
          <button
            onClick={() => setPath(rootPath)}
            className={`rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 dark:hover:bg-white/[0.05] ${
              rel.length ? 'text-muted' : 'text-strong'
            }`}
          >
            {name}
          </button>
          {rel.map((c, i) => {
            const target = `${rootPath}/${rel.slice(0, i + 1).join('/')}`;
            const last = i === rel.length - 1;
            return (
              <span key={target} className="flex min-w-0 items-center">
                <IconChevron className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-500" />
                <button
                  onClick={() => setPath(target)}
                  className={`truncate rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 dark:hover:bg-white/[0.05] ${
                    last ? 'text-strong' : 'text-muted'
                  }`}
                >
                  {c}
                </button>
              </span>
            );
          })}
        </nav>
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
          <button
            onClick={() => set('view', 'grid')}
            className={`rounded-lg p-1.5 transition ${
              view === 'grid'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-black/40 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <IconGrid className="h-[18px] w-[18px]" />
          </button>
          <button
            onClick={() => set('view', 'list')}
            className={`rounded-lg p-1.5 transition ${
              view === 'list'
                ? 'bg-white text-slate-900 shadow-sm dark:bg-black/40 dark:text-slate-100'
                : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            <IconList className="h-[18px] w-[18px]" />
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-12 text-center text-sm text-faint">{t('loading')}</p>
      ) : entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white/50 py-12 text-center text-sm text-faint dark:border-white/[0.08] dark:bg-white/[0.02]">
          {t('emptyTitle')}
        </p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((entry) => (
            <ShareCard
              key={entry.path}
              entry={entry}
              api={api}
              allowDownload={allowDownload}
              onOpen={() => isWithin(rootPath, entry.path) && setPath(entry.path)}
              onDownload={() => download(entry.path)}
            />
          ))}
          {files.map((entry, i) => (
            <ShareCard
              key={entry.path}
              entry={entry}
              api={api}
              allowDownload={allowDownload}
              onOpen={() => setPreviewIndex(i)}
              onDownload={() => download(entry.path)}
            />
          ))}
        </div>
      ) : (
        <div className="card overflow-hidden">
          {folders.map((entry) => (
            <ShareRow
              key={entry.path}
              entry={entry}
              allowDownload={allowDownload}
              onOpen={() => isWithin(rootPath, entry.path) && setPath(entry.path)}
              onDownload={() => download(entry.path)}
            />
          ))}
          {files.map((entry, i) => (
            <ShareRow
              key={entry.path}
              entry={entry}
              allowDownload={allowDownload}
              onOpen={() => setPreviewIndex(i)}
              onDownload={() => download(entry.path)}
            />
          ))}
        </div>
      )}

      {previewIndex !== null && files[previewIndex] && (
        <SharePreviewModal
          files={files}
          index={previewIndex}
          onIndex={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
          api={api}
          allowDownload={allowDownload}
          onDownload={download}
        />
      )}
    </Shell>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b divider panel">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-sm shadow-indigo-500/30">
              <IconCloud className="h-5 w-5" />
            </div>
            <span className="text-base font-semibold tracking-tight text-strong">jrjr-drive</span>
          </div>
          <span className="truncate text-sm text-faint">{title}</span>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

function ShareThumb({ entry, api }: { entry: Entry; api: ShareApi }) {
  const [failed, setFailed] = useState(false);
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  const isMedia = kind === 'image' || kind === 'svg' || kind === 'psd';

  if (isMedia && !failed) {
    return (
      <img
        src={api('preview', entry.path, entry.rev || undefined)}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full bg-slate-50 object-cover dark:bg-black/40"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-white/[0.05] dark:to-white/[0.02]">
      <FileGlyph kind={kind} className="h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
    </div>
  );
}

function ShareCard({
  entry,
  api,
  allowDownload,
  onOpen,
  onDownload,
}: {
  entry: Entry;
  api: ShareApi;
  allowDownload: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  return (
    <div className="group card flex flex-col transition duration-150 hover:-translate-y-0.5 hover:shadow-card">
      <button
        onClick={onOpen}
        className="block aspect-[4/3] w-full overflow-hidden rounded-t-2xl"
        title={entry.name}
      >
        <ShareThumb entry={entry} api={api} />
      </button>
      <div className="flex items-center gap-2.5 rounded-b-2xl border-t divider px-3 py-2.5">
        <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-strong">{entry.name}</p>
          <p className="truncate text-xs text-faint">
            {entry.tag === 'folder' ? 'Folder' : formatBytes(entry.size)}
          </p>
        </button>
        {entry.tag === 'file' && allowDownload && (
          <button
            onClick={onDownload}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
          >
            <IconDownload className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ShareRow({
  entry,
  allowDownload,
  onOpen,
  onDownload,
}: {
  entry: Entry;
  allowDownload: boolean;
  onOpen: () => void;
  onDownload: () => void;
}) {
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  return (
    <div className="flex items-center gap-3 border-b divider px-4 py-2.5 transition last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
      <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="truncate text-sm font-medium text-strong">{entry.name}</p>
        <p className="text-xs text-faint">
          {entry.tag === 'folder' ? 'Folder' : formatBytes(entry.size)}
        </p>
      </button>
      {entry.tag === 'file' && allowDownload && (
        <button
          onClick={onDownload}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
        >
          <IconDownload className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function PreviewImage({ src, alt }: { src: string; alt: string }) {
  const { t } = useSettings();
  const [error, setError] = useState<string | null>(null);

  if (error) {
    return (
      <div className="flex max-w-md flex-col items-center px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-500">
          <IconAlert className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-strong">{t('previewUnavailable')}</p>
        <p className="mt-1 text-sm text-muted">{error}</p>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      onError={async () => {
        try {
          const res = await fetch(src);
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setError(data.error || `Preview failed (${res.status})`);
        } catch {
          setError('Preview failed');
        }
      }}
      className="max-h-[72vh] rounded-lg object-contain shadow-sm"
    />
  );
}

function FilePreview({ entry, api }: { entry: Entry; api: ShareApi }) {
  const kind = fileKind(entry.name);
  const raw = api('view', entry.path);
  const prev = api('preview', entry.path, entry.rev || undefined);

  if (kind === 'image' || kind === 'svg' || kind === 'psd') {
    return <PreviewImage src={prev} alt={entry.name} />;
  }
  if (kind === 'video') {
    return <video src={raw} controls className="max-h-[72vh] w-full rounded-lg" />;
  }
  if (kind === 'pdf') {
    return <iframe src={raw} title={entry.name} className="h-[72vh] w-full rounded-lg" />;
  }
  return (
    <div className="flex flex-col items-center py-12 text-center">
      <FileGlyph kind={kind} className="h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
      <p className="mt-3 text-sm text-muted">
        {entry.modified ? formatDate(entry.modified) : ''}
      </p>
    </div>
  );
}

function SharePreviewModal({
  files,
  index,
  onIndex,
  onClose,
  api,
  allowDownload,
  onDownload,
}: {
  files: Entry[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  api: ShareApi;
  allowDownload: boolean;
  onDownload: (path: string) => void;
}) {
  const { t } = useSettings();
  const entry = files[index];
  const hasPrev = index > 0;
  const hasNext = index < files.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === 'ArrowRight' && index < files.length - 1) onIndex(index + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, files.length, onIndex, onClose]);

  const kind = fileKind(entry.name);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasPrev) onIndex(index - 1);
        }}
        disabled={!hasPrev}
        className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-pop transition hover:bg-white disabled:opacity-0 sm:flex dark:bg-[#161d31]/95 dark:text-slate-200"
      >
        <IconArrowLeft className="h-5 w-5" />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasNext) onIndex(index + 1);
        }}
        disabled={!hasNext}
        className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-700 shadow-pop transition hover:bg-white disabled:opacity-0 sm:flex dark:bg-[#161d31]/95 dark:text-slate-200"
      >
        <IconArrowRight className="h-5 w-5" />
      </button>

      <div
        className="modal-panel flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b divider px-4 py-3">
          <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-strong">{entry.name}</p>
            <p className="text-xs text-faint">
              {index + 1} / {files.length}
            </p>
          </div>
          {allowDownload && (
            <button onClick={() => onDownload(entry.path)} className="btn-secondary">
              <IconDownload className="h-4 w-4" />
              <span className="hidden sm:inline">{t('download')}</span>
            </button>
          )}
          <button onClick={onClose} className="btn-icon">
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4 dark:bg-black/30">
          <FilePreview entry={entry} api={api} />
        </div>
      </div>
    </div>
  );
}
