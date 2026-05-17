'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileKind, formatBytes, formatDate, joinPath, type FileKind } from '@/lib/utils';
import { useSettings, type SortKey, type TileSize } from '@/lib/settings';
import type { TranslationKey } from '@/lib/i18n';
import AppShell, { type AppView } from './AppShell';
import SettingsPanel from './SettingsPanel';
import {
  FileGlyph,
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconChevron,
  IconClose,
  IconCopy,
  IconDownload,
  IconEye,
  IconFilter,
  IconFolderPlus,
  IconGrid,
  IconLink,
  IconList,
  IconLock,
  IconMore,
  IconPencil,
  IconSearch,
  IconShare,
  IconTrash,
  IconUpload,
} from './icons';

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
  allowDownload: boolean;
  expiresAt: number | null;
  createdAt: number;
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

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

function sortEntries(entries: Entry[], sort: SortKey): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.tag !== b.tag) return a.tag === 'folder' ? -1 : 1;
    if (sort === 'size') return b.size - a.size;
    if (sort === 'date') {
      return (
        new Date(b.modified || 0).getTime() - new Date(a.modified || 0).getTime()
      );
    }
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

type FilterKind = 'all' | 'images' | 'documents' | 'video' | 'design' | 'other';

const FILTERS: { value: FilterKind; label: string }[] = [
  { value: 'all', label: 'filterAll' },
  { value: 'images', label: 'filterImages' },
  { value: 'documents', label: 'filterDocuments' },
  { value: 'video', label: 'filterVideo' },
  { value: 'design', label: 'filterDesign' },
  { value: 'other', label: 'filterOther' },
];

function matchesFilter(entry: Entry, filter: FilterKind): boolean {
  if (filter === 'all') return true;
  if (entry.tag === 'folder') return false;
  const k = fileKind(entry.name);
  if (filter === 'images') return k === 'image' || k === 'svg';
  if (filter === 'documents') return k === 'pdf';
  if (filter === 'video') return k === 'video';
  if (filter === 'design') return k === 'psd';
  return k === 'other';
}

/** Responsive grid column counts per tile size. */
const GRID_COLS: Record<TileSize, string> = {
  sm: 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6',
  md: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  lg: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
};

export default function FileBrowser() {
  const router = useRouter();
  const [view, setView] = useState<AppView>('files');

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }, [router]);

  return (
    <AppShell view={view} onNavigate={setView} onSignOut={logout}>
      {view === 'files' && <FilesView />}
      {view === 'shares' && <SharesPanel />}
      {view === 'settings' && <SettingsPanel />}
    </AppShell>
  );
}

/* ------------------------------------------------------------------ Files */

function FilesView() {
  const { view, sort, tileSize, set, t } = useSettings();
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterKind>('all');
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const [shareTarget, setShareTarget] = useState<Entry | null>(null);
  const [dragging, setDragging] = useState(false);
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
    loadFolder(path);
  }, [path, loadFolder]);

  const handleUpload = useCallback(
    async (files: FileList | File[] | null) => {
      if (!files) return;
      const list = Array.from(files);
      if (!list.length) return;
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
    },
    [path, loadFolder],
  );

  async function newFolder() {
    const name = window.prompt(t('newFolderPrompt'));
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
    const name = window.prompt(t('renamePrompt'), entry.name);
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
    if (!window.confirm(t('deleteConfirm', { name: entry.name }))) return;
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
  const query = search.trim().toLowerCase();
  const visible = useMemo(() => {
    return sortEntries(entries, sort).filter(
      (e) =>
        (!query || e.name.toLowerCase().includes(query)) && matchesFilter(e, filter),
    );
  }, [entries, sort, query, filter]);
  const folders = visible.filter((e) => e.tag === 'folder');
  const files = visible.filter((e) => e.tag === 'file');

  return (
    <div>
      {/* Breadcrumbs + primary actions */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
          <button
            onClick={() => setPath('/')}
            className={`rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 dark:hover:bg-white/[0.05] ${
              crumbs.length ? 'text-muted' : 'text-strong'
            }`}
          >
            {t('home')}
          </button>
          {crumbs.map((c, i) => {
            const target = `/${crumbs.slice(0, i + 1).join('/')}`;
            const last = i === crumbs.length - 1;
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

        <div className="flex items-center gap-2">
          <button onClick={newFolder} className="btn-secondary">
            <IconFolderPlus className="h-4 w-4" />
            <span className="hidden sm:inline">{t('newFolder')}</span>
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={!!upload}
            className="btn-primary"
          >
            <IconUpload className="h-4 w-4" />
            {upload ? `${upload.index}/${upload.total} · ${upload.percent}%` : t('upload')}
          </button>
          <input
            ref={fileInput}
            type="file"
            multiple
            hidden
            onChange={(e) => handleUpload(e.target.files)}
          />
        </div>
      </div>

      {/* Search / filter / sort / view controls */}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('searchInFolder')}
            className="input py-2 pl-9 pr-9"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-faint transition hover:text-strong"
            >
              <IconClose className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="relative">
          <IconFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterKind)}
            className="input w-auto py-2 pl-9"
          >
            {FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {t(f.label as TranslationKey)}
              </option>
            ))}
          </select>
        </div>
        <select
          value={sort}
          onChange={(e) => set('sort', e.target.value as SortKey)}
          className="input w-auto py-2"
        >
          <option value="name">{t('sortName')}</option>
          <option value="date">{t('sortDate')}</option>
          <option value="size">{t('sortSize')}</option>
        </select>
        {view === 'grid' && <TileSizeControl />}
        <ViewToggle />
      </div>

      {upload && (
        <div className="mb-4 card p-3">
          <div className="mb-1.5 flex justify-between text-xs text-muted">
            <span className="truncate font-medium">{upload.name}</span>
            <span>{upload.percent}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
              style={{ width: `${upload.percent}%` }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!upload) setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!upload) handleUpload(e.dataTransfer.files);
        }}
        className={`relative rounded-2xl transition ${
          dragging ? 'ring-2 ring-brand ring-offset-2 dark:ring-offset-[#0b0f1a]' : ''
        }`}
      >
        {dragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-brand-light/80 backdrop-blur-sm dark:bg-indigo-950/70">
            <IconUpload className="h-8 w-8 text-brand" />
            <p className="mt-2 text-sm font-semibold text-brand-dark dark:text-indigo-300">
              {t('dropToUpload')}
            </p>
          </div>
        )}

        {loading ? (
          <SkeletonGrid grid={view === 'grid'} />
        ) : entries.length === 0 ? (
          <EmptyState onUpload={() => fileInput.current?.click()} />
        ) : visible.length === 0 ? (
          <NoResults />
        ) : view === 'grid' ? (
          <div className={`grid gap-4 ${GRID_COLS[tileSize]}`}>
            {folders.map((entry) => (
              <FileCard
                key={entry.path}
                entry={entry}
                onOpen={() => setPath(entry.path)}
                onShare={() => setShareTarget(entry)}
                onRename={() => rename(entry)}
                onDelete={() => remove(entry)}
              />
            ))}
            {files.map((entry, i) => (
              <FileCard
                key={entry.path}
                entry={entry}
                onOpen={() => setPreviewIndex(i)}
                onShare={() => setShareTarget(entry)}
                onRename={() => rename(entry)}
                onDelete={() => remove(entry)}
              />
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="hidden items-center gap-3 border-b divider px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-faint sm:flex">
              <span className="flex-1">{t('sortName')}</span>
              <span className="w-24">{t('sortSize')}</span>
              <span className="w-36">{t('sortDate')}</span>
              <span className="w-8" />
            </div>
            {folders.map((entry) => (
              <FileRow
                key={entry.path}
                entry={entry}
                onOpen={() => setPath(entry.path)}
                onShare={() => setShareTarget(entry)}
                onRename={() => rename(entry)}
                onDelete={() => remove(entry)}
              />
            ))}
            {files.map((entry, i) => (
              <FileRow
                key={entry.path}
                entry={entry}
                onOpen={() => setPreviewIndex(i)}
                onShare={() => setShareTarget(entry)}
                onRename={() => rename(entry)}
                onDelete={() => remove(entry)}
              />
            ))}
          </div>
        )}
      </div>

      {previewIndex !== null && files[previewIndex] && (
        <PreviewModal
          files={files}
          index={previewIndex}
          onIndex={setPreviewIndex}
          onClose={() => setPreviewIndex(null)}
        />
      )}
      {shareTarget && (
        <ShareDialog entry={shareTarget} onClose={() => setShareTarget(null)} />
      )}
    </div>
  );
}

function ViewToggle() {
  const { view, set } = useSettings();
  return (
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
  );
}

function TileSizeControl() {
  const { tileSize, set, t } = useSettings();
  const sizes: { value: TileSize; cls: string; label: TranslationKey }[] = [
    { value: 'sm', cls: 'h-3.5 w-3.5', label: 'tileSmall' },
    { value: 'md', cls: 'h-[17px] w-[17px]', label: 'tileMedium' },
    { value: 'lg', cls: 'h-5 w-5', label: 'tileLarge' },
  ];
  return (
    <div
      className="flex items-center rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]"
      title={t('tileSize')}
    >
      {sizes.map(({ value, cls, label }) => (
        <button
          key={value}
          onClick={() => set('tileSize', value)}
          title={t(label)}
          className={`flex h-7 w-8 items-center justify-center rounded-lg transition ${
            tileSize === value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-black/40 dark:text-slate-100'
              : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <IconGrid className={cls} />
        </button>
      ))}
    </div>
  );
}

function NoResults() {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-slate-500">
        <IconSearch className="h-7 w-7" />
      </div>
      <p className="mt-4 text-sm font-medium text-strong">{t('noResults')}</p>
      <p className="mt-1 text-sm text-faint">{t('noResultsHint')}</p>
    </div>
  );
}

function SkeletonGrid({ grid }: { grid: boolean }) {
  if (!grid) {
    return (
      <div className="card overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex animate-pulse items-center gap-3 border-b divider px-4 py-3">
            <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-white/[0.06]" />
            <div className="h-3 flex-1 rounded bg-slate-100 dark:bg-white/[0.06]" />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="card animate-pulse overflow-hidden">
          <div className="aspect-[4/3] bg-slate-100 dark:bg-white/[0.06]" />
          <div className="flex items-center gap-2.5 border-t divider px-3 py-3">
            <div className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/[0.06]" />
            <div className="h-3 flex-1 rounded bg-slate-100 dark:bg-white/[0.06]" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  const t = useT();
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center dark:border-white/[0.08] dark:bg-white/[0.02]">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-slate-500">
        <IconUpload className="h-7 w-7" />
      </div>
      <p className="mt-4 text-sm font-medium text-strong">{t('emptyTitle')}</p>
      <p className="mt-1 text-sm text-faint">{t('emptyHint')}</p>
      <button onClick={onUpload} className="btn-primary mt-4">
        <IconUpload className="h-4 w-4" />
        {t('uploadFiles')}
      </button>
    </div>
  );
}

function useT() {
  return useSettings().t;
}

/* ------------------------------------------------------------- File tiles */

function CardThumb({ entry, kind }: { entry: Entry; kind: FileKind | 'folder' }) {
  const [failed, setFailed] = useState(false);
  const isMedia = kind === 'image' || kind === 'svg' || kind === 'psd';

  if (isMedia && !failed) {
    const url = `/api/files/preview?path=${encodeURIComponent(entry.path)}&rev=${encodeURIComponent(
      entry.rev || '',
    )}`;
    return (
      <img
        src={url}
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

interface EntryActions {
  entry: Entry;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function ActionMenu({ entry, onShare, onRename, onDelete }: EntryActions) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100 ${
          open ? 'bg-slate-100 text-slate-700 dark:bg-white/10' : ''
        }`}
        title={t('actions')}
      >
        <IconMore className="h-[18px] w-[18px]" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="menu absolute right-0 top-full z-30 mt-1.5 w-44 animate-pop-in">
            {entry.tag === 'file' && (
              <a
                href={`/api/files/download?path=${encodeURIComponent(entry.path)}`}
                onClick={() => setOpen(false)}
                className="menu-item"
              >
                <IconDownload className="h-4 w-4 text-slate-400" />
                {t('download')}
              </a>
            )}
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onShare();
              }}
            >
              <IconShare className="h-4 w-4 text-slate-400" />
              {t('share')}
            </button>
            <button
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onRename();
              }}
            >
              <IconPencil className="h-4 w-4 text-slate-400" />
              {t('rename')}
            </button>
            <div className="my-1 h-px bg-slate-100 dark:bg-white/10" />
            <button
              className="menu-item !text-red-600 dark:!text-red-400"
              onClick={() => {
                setOpen(false);
                onDelete();
              }}
            >
              <IconTrash className="h-4 w-4 text-red-500" />
              {t('delete')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function FileCard({ entry, onOpen, ...actions }: EntryActions & { onOpen: () => void }) {
  const t = useT();
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  const meta =
    entry.tag === 'folder'
      ? t('folder')
      : `${formatBytes(entry.size)}${entry.modified ? ` · ${formatDate(entry.modified)}` : ''}`;

  return (
    <div className="group card relative flex flex-col transition duration-150 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_14px_36px_-16px_rgba(124,108,255,0.55)] dark:hover:border-brand/45">
      <button
        onClick={onOpen}
        className="block aspect-[4/3] w-full overflow-hidden rounded-t-2xl"
        title={entry.name}
      >
        <CardThumb entry={entry} kind={kind} />
      </button>
      <div className="flex items-center gap-2.5 rounded-b-2xl border-t divider px-3 py-2.5">
        <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-strong">{entry.name}</p>
          <p className="truncate text-xs text-faint">{meta}</p>
        </button>
        <ActionMenu entry={entry} {...actions} />
      </div>
    </div>
  );
}

function FileRow({ entry, onOpen, ...actions }: EntryActions & { onOpen: () => void }) {
  const t = useT();
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  return (
    <div className="flex items-center gap-3 border-b divider px-4 py-2.5 transition last:border-b-0 hover:bg-slate-50 dark:hover:bg-white/[0.05]">
      <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
      <button onClick={onOpen} className="flex min-w-0 flex-1 flex-col text-left">
        <span className="truncate text-sm font-medium text-strong">{entry.name}</span>
        <span className="text-xs text-faint sm:hidden">
          {entry.tag === 'folder' ? t('folder') : formatBytes(entry.size)}
        </span>
      </button>
      <span className="hidden w-24 text-sm text-muted sm:block">
        {entry.tag === 'folder' ? '—' : formatBytes(entry.size)}
      </span>
      <span className="hidden w-36 text-sm text-muted sm:block">{formatDate(entry.modified)}</span>
      <ActionMenu entry={entry} {...actions} />
    </div>
  );
}

/* ----------------------------------------------------------- Preview modal */

function PreviewModal({
  files,
  index,
  onIndex,
  onClose,
}: {
  files: Entry[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const t = useT();
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
  const raw = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  const prev = `/api/files/preview?path=${encodeURIComponent(entry.path)}&rev=${encodeURIComponent(
    entry.rev || '',
  )}`;

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
          <a href={raw} className="btn-secondary">
            <IconDownload className="h-4 w-4" />
            <span className="hidden sm:inline">{t('download')}</span>
          </a>
          <button onClick={onClose} className="btn-icon">
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4 dark:bg-black/30">
          {kind === 'image' || kind === 'svg' || kind === 'psd' ? (
            <img
              src={prev}
              alt={entry.name}
              className="max-h-[72vh] rounded-lg object-contain shadow-sm"
            />
          ) : kind === 'video' ? (
            <video src={raw} controls className="max-h-[72vh] w-full rounded-lg" />
          ) : kind === 'pdf' ? (
            <iframe src={raw} className="h-[72vh] w-full rounded-lg" title={entry.name} />
          ) : (
            <div className="flex flex-col items-center py-12 text-center">
              <FileGlyph kind={kind} className="h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
              <p className="mt-3 text-sm text-muted">{t('noPreview')}</p>
              <a href={raw} className="btn-primary mt-4">
                {t('downloadFile')}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- Share form fields */

type Permission = 'view' | 'download';

function ShareFormFields({
  password,
  setPassword,
  expiresAt,
  setExpiresAt,
  permission,
  setPermission,
  passwordPlaceholder,
}: {
  password: string;
  setPassword: (v: string) => void;
  expiresAt: string;
  setExpiresAt: (v: string) => void;
  permission: Permission;
  setPermission: (v: Permission) => void;
  passwordPlaceholder: string;
}) {
  const t = useT();
  return (
    <>
      <div className="mt-5">
        <p className="mb-1.5 text-sm font-medium text-strong">{t('permissions')}</p>
        <div className="grid grid-cols-2 gap-2">
          {(['view', 'download'] as Permission[]).map((p) => {
            const active = permission === p;
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPermission(p)}
                className={`rounded-xl border p-3 text-left transition ${
                  active
                    ? 'border-brand bg-brand-light dark:bg-indigo-950/50'
                    : 'border-slate-200 hover:border-slate-300 dark:border-white/[0.08] dark:hover:border-slate-600'
                }`}
              >
                <span
                  className={`flex items-center gap-1.5 text-sm font-semibold ${
                    active ? 'text-brand-dark dark:text-indigo-300' : 'text-strong'
                  }`}
                >
                  {p === 'view' ? (
                    <IconEye className="h-4 w-4" />
                  ) : (
                    <IconDownload className="h-4 w-4" />
                  )}
                  {p === 'view' ? t('permViewOnly') : t('permDownload')}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {p === 'view' ? t('permViewOnlyHint') : t('permDownloadHint')}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <label className="mt-4 block text-sm font-medium text-strong">
        {t('passwordLabel')}
        <span className="ml-1 font-normal text-faint">({t('optional')})</span>
        <input
          type="text"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={passwordPlaceholder}
          className="input mt-1.5"
        />
      </label>
      <label className="mt-4 block text-sm font-medium text-strong">
        {t('expiresLabel')}
        <span className="ml-1 font-normal text-faint">({t('optional')})</span>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className="input mt-1.5"
        />
      </label>
    </>
  );
}

function ShareDialog({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [permission, setPermission] = useState<Permission>('download');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

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
          allowDownload: permission === 'download',
        }),
      });
      setUrl(data.share.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create share');
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand dark:bg-indigo-950/60">
            <IconShare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-strong">
              {entry.tag === 'folder' ? t('shareFolder') : t('shareFile')}
            </h2>
            <p className="truncate text-sm text-faint">{entry.name}</p>
          </div>
        </div>

        {url ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-strong">{t('linkCreated')}</p>
            <div className="mt-1.5 flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="input min-w-0 flex-1 bg-slate-50 dark:bg-black/30"
              />
              <button onClick={copy} className="btn-primary shrink-0">
                {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                {copied ? t('copied') : t('copy')}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={onClose} className="btn-soft">
                {t('done')}
              </button>
            </div>
          </div>
        ) : (
          <>
            <ShareFormFields
              password={password}
              setPassword={setPassword}
              expiresAt={expiresAt}
              setExpiresAt={setExpiresAt}
              permission={permission}
              setPermission={setPermission}
              passwordPlaceholder={t('noPassword')}
            />
            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={onClose} className="btn-soft">
                {t('cancel')}
              </button>
              <button onClick={create} disabled={busy} className="btn-primary">
                {busy ? t('creating') : t('createLink')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- Shares panel */

function SharesPanel() {
  const t = useT();
  const [shares, setShares] = useState<ShareView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<ShareView | null>(null);

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
    if (!window.confirm(t('revokeConfirm'))) return;
    await fetch(`/api/shares/${id}`, { method: 'DELETE' });
    await load();
  }

  function copy(id: number, url: string) {
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
  }

  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold text-strong">{t('navShared')}</h1>

      {loading ? (
        <p className="py-10 text-center text-sm text-faint">{t('loading')}</p>
      ) : error ? (
        <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      ) : !shares.length ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/50 px-6 py-16 text-center dark:border-white/[0.08] dark:bg-white/[0.02]">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-white/[0.06] dark:text-slate-500">
            <IconLink className="h-7 w-7" />
          </div>
          <p className="mt-4 text-sm font-medium text-strong">{t('sharesEmptyTitle')}</p>
          <p className="mt-1 text-sm text-faint">{t('sharesEmptyHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shares.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 card p-3.5">
              <FileGlyph
                kind={s.isFolder ? 'folder' : fileKind(s.name)}
                className="h-10 w-10"
                iconClassName="h-5 w-5"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-strong">{s.name}</p>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate text-xs text-brand hover:underline dark:text-indigo-400"
                >
                  {s.url}
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  className={`chip ${
                    s.hasPassword
                      ? '!bg-amber-50 !text-amber-700 dark:!bg-amber-950/50 dark:!text-amber-400'
                      : ''
                  }`}
                >
                  {s.hasPassword && <IconLock className="h-3 w-3" />}
                  {s.hasPassword ? t('passwordProtected') : t('public')}
                </span>
                {!s.allowDownload && (
                  <span className="chip">
                    <IconEye className="h-3 w-3" />
                    {t('viewOnly')}
                  </span>
                )}
                {s.expiresAt && (
                  <span className="chip hidden sm:inline-flex">
                    {t('until', { date: formatDate(new Date(s.expiresAt).toISOString()) })}
                  </span>
                )}
                <button
                  onClick={() => copy(s.id, s.url)}
                  title={t('copyLink')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
                >
                  {copiedId === s.id ? (
                    <IconCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </button>
                <button
                  onClick={() => setEditing(s)}
                  title={t('edit')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-100"
                >
                  <IconPencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => revoke(s.id)}
                  title={t('revoke')}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <IconTrash className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <ShareEditModal
          share={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function ShareEditModal({
  share,
  onClose,
  onSaved,
}: {
  share: ShareView;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const [password, setPassword] = useState('');
  const [expiresAt, setExpiresAt] = useState(
    share.expiresAt ? new Date(share.expiresAt).toISOString().slice(0, 10) : '',
  );
  const [permission, setPermission] = useState<Permission>(
    share.allowDownload ? 'download' : 'view',
  );
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await jsonFetch(`/api/shares/${share.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Only send the password when the field was filled in.
          ...(password ? { password } : {}),
          expiresAt: expiresAt || null,
          allowDownload: permission === 'download',
        }),
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update share');
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand dark:bg-indigo-950/60">
            <IconPencil className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-strong">{t('editShare')}</h2>
            <p className="truncate text-sm text-faint">{share.name}</p>
          </div>
        </div>

        <ShareFormFields
          password={password}
          setPassword={setPassword}
          expiresAt={expiresAt}
          setExpiresAt={setExpiresAt}
          permission={permission}
          setPermission={setPermission}
          passwordPlaceholder={share.hasPassword ? '••••••••' : t('noPassword')}
        />
        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="btn-soft">
            {t('cancel')}
          </button>
          <button onClick={save} disabled={busy} className="btn-primary">
            {busy ? t('saving') : t('updateLink')}
          </button>
        </div>
      </div>
    </div>
  );
}
