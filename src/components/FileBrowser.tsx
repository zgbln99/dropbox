'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fileKind, formatBytes, formatDate, joinPath, type FileKind } from '@/lib/utils';
import {
  FileGlyph,
  IconChevron,
  IconClose,
  IconCloud,
  IconCopy,
  IconCheck,
  IconDownload,
  IconFiles,
  IconFolderPlus,
  IconLink,
  IconLock,
  IconLogout,
  IconMore,
  IconPencil,
  IconShare,
  IconTrash,
  IconUpload,
} from '@/components/icons';

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
    if (view === 'files') loadFolder(path);
  }, [path, view, loadFolder]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

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
  const folders = entries.filter((e) => e.tag === 'folder');
  const files = entries.filter((e) => e.tag === 'file');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
              <IconCloud className="h-5 w-5" />
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-900">jrjr-drive</span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl bg-slate-100 p-1">
              <button
                onClick={() => setView('files')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === 'files'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconFiles className="h-4 w-4" />
                <span className="hidden sm:inline">Files</span>
              </button>
              <button
                onClick={() => setView('shares')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  view === 'shares'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <IconLink className="h-4 w-4" />
                <span className="hidden sm:inline">Share links</span>
              </button>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
            >
              <IconLogout className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {view === 'shares' ? (
          <SharesPanel />
        ) : (
          <>
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <nav className="flex min-w-0 flex-1 items-center gap-0.5 text-sm">
                <button
                  onClick={() => setPath('/')}
                  className={`rounded-lg px-2 py-1 font-medium transition hover:bg-slate-100 ${
                    crumbs.length ? 'text-slate-500' : 'text-slate-900'
                  }`}
                >
                  Home
                </button>
                {crumbs.map((c, i) => {
                  const target = `/${crumbs.slice(0, i + 1).join('/')}`;
                  const last = i === crumbs.length - 1;
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

              <div className="flex items-center gap-2">
                <button
                  onClick={newFolder}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  <IconFolderPlus className="h-4 w-4" />
                  <span className="hidden sm:inline">New folder</span>
                </button>
                <button
                  onClick={() => fileInput.current?.click()}
                  disabled={!!upload}
                  className="flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark disabled:opacity-60"
                >
                  <IconUpload className="h-4 w-4" />
                  {upload ? `${upload.index}/${upload.total} · ${upload.percent}%` : 'Upload'}
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

            {upload && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                <div className="mb-1.5 flex justify-between text-xs text-slate-500">
                  <span className="truncate font-medium text-slate-600">{upload.name}</span>
                  <span>{upload.percent}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all"
                    style={{ width: `${upload.percent}%` }}
                  />
                </div>
              </div>
            )}

            {error && (
              <p className="mb-4 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
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
                dragging ? 'ring-2 ring-brand ring-offset-2' : ''
              }`}
            >
              {dragging && (
                <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-brand bg-brand-light/80 backdrop-blur-sm">
                  <IconUpload className="h-8 w-8 text-brand" />
                  <p className="mt-2 text-sm font-semibold text-brand-dark">Drop files to upload</p>
                </div>
              )}

              {loading ? (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse overflow-hidden rounded-2xl border border-slate-200/70 bg-white"
                    >
                      <div className="aspect-[4/3] bg-slate-100" />
                      <div className="flex items-center gap-2.5 border-t border-slate-100 px-3 py-3">
                        <div className="h-8 w-8 rounded-lg bg-slate-100" />
                        <div className="h-3 flex-1 rounded bg-slate-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : entries.length === 0 ? (
                <EmptyState onUpload={() => fileInput.current?.click()} />
              ) : (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
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
                  {files.map((entry) => (
                    <FileCard
                      key={entry.path}
                      entry={entry}
                      onOpen={() => setPreview(entry)}
                      onShare={() => setShareTarget(entry)}
                      onRename={() => rename(entry)}
                      onDelete={() => remove(entry)}
                    />
                  ))}
                </div>
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

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <IconFiles className="h-7 w-7" />
      </div>
      <p className="mt-4 text-sm font-medium text-slate-700">This folder is empty</p>
      <p className="mt-1 text-sm text-slate-400">Drag files here or use the upload button.</p>
      <button
        onClick={onUpload}
        className="mt-4 flex items-center gap-1.5 rounded-xl bg-brand px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark"
      >
        <IconUpload className="h-4 w-4" />
        Upload files
      </button>
    </div>
  );
}

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
        className="h-full w-full bg-slate-50 object-cover"
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <FileGlyph kind={kind} className="h-16 w-16 rounded-2xl" iconClassName="h-8 w-8" />
    </div>
  );
}

function FileCard({
  entry,
  onOpen,
  onShare,
  onRename,
  onDelete,
}: {
  entry: Entry;
  onOpen: () => void;
  onShare: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const kind: FileKind | 'folder' = entry.tag === 'folder' ? 'folder' : fileKind(entry.name);
  const meta =
    entry.tag === 'folder'
      ? 'Folder'
      : `${formatBytes(entry.size)}${entry.modified ? ` · ${formatDate(entry.modified)}` : ''}`;

  return (
    <div
      className={`group relative flex flex-col rounded-2xl border border-slate-200/70 bg-white shadow-sm transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card ${
        menu ? 'z-20' : ''
      }`}
    >
      <button
        onClick={onOpen}
        className="block aspect-[4/3] w-full overflow-hidden rounded-t-2xl"
        title={entry.name}
      >
        <CardThumb entry={entry} kind={kind} />
      </button>

      <div className="flex items-center gap-2.5 rounded-b-2xl border-t border-slate-100 px-3 py-2.5">
        <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
        <button onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-medium text-slate-800">{entry.name}</p>
          <p className="truncate text-xs text-slate-400">{meta}</p>
        </button>
        <button
          onClick={() => setMenu((m) => !m)}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 ${
            menu ? 'bg-slate-100 text-slate-700' : ''
          }`}
          title="Actions"
        >
          <IconMore className="h-[18px] w-[18px]" />
        </button>
      </div>

      {menu && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenu(false)} />
          <div className="absolute right-2 top-full z-30 mt-1.5 w-44 animate-pop-in overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-pop">
            {entry.tag === 'file' && (
              <a
                href={`/api/files/download?path=${encodeURIComponent(entry.path)}`}
                onClick={() => setMenu(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
              >
                <IconDownload className="h-4 w-4 text-slate-400" />
                Download
              </a>
            )}
            <MenuItem
              icon={<IconShare className="h-4 w-4 text-slate-400" />}
              label="Share"
              onClick={() => {
                setMenu(false);
                onShare();
              }}
            />
            <MenuItem
              icon={<IconPencil className="h-4 w-4 text-slate-400" />}
              label="Rename"
              onClick={() => {
                setMenu(false);
                onRename();
              }}
            />
            <div className="my-1 h-px bg-slate-100" />
            <MenuItem
              icon={<IconTrash className="h-4 w-4 text-red-500" />}
              label="Delete"
              danger
              onClick={() => {
                setMenu(false);
                onDelete();
              }}
            />
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-slate-50 ${
        danger ? 'text-red-600' : 'text-slate-700'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function PreviewModal({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const kind = fileKind(entry.name);
  const raw = `/api/files/download?path=${encodeURIComponent(entry.path)}`;
  const prev = `/api/files/preview?path=${encodeURIComponent(entry.path)}&rev=${encodeURIComponent(
    entry.rev || '',
  )}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-4xl animate-pop-in flex-col overflow-hidden rounded-2xl bg-white shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
          <FileGlyph kind={kind} className="h-9 w-9" iconClassName="h-[18px] w-[18px]" />
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
            {entry.name}
          </span>
          <a
            href={raw}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            <IconDownload className="h-4 w-4" />
            <span className="hidden sm:inline">Download</span>
          </a>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center overflow-auto bg-slate-50 p-4">
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
              <p className="mt-3 text-sm text-slate-500">No preview for this file type.</p>
              <a
                href={raw}
                className="mt-4 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark"
              >
                Download file
              </a>
            </div>
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
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md animate-pop-in rounded-2xl bg-white p-6 shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-light text-brand">
            <IconShare className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900">Share file</h2>
            <p className="truncate text-sm text-slate-400">{entry.name}</p>
          </div>
        </div>

        {url ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-700">Public link created</p>
            <div className="mt-1.5 flex gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-600"
              />
              <button
                onClick={copy}
                className="flex shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark"
              >
                {copied ? <IconCheck className="h-4 w-4" /> : <IconCopy className="h-4 w-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="mt-5 block text-sm font-medium text-slate-700">
              Password
              <span className="ml-1 font-normal text-slate-400">(optional)</span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="No password"
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Expires
              <span className="ml-1 font-normal text-slate-400">(optional)</span>
              <input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            {error && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                onClick={create}
                disabled={busy}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark disabled:opacity-60"
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
  const [copiedId, setCopiedId] = useState<number | null>(null);

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

  function copy(id: number, url: string) {
    navigator.clipboard?.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
  }

  if (loading) {
    return <p className="py-10 text-center text-sm text-slate-400">Loading…</p>;
  }
  if (error) {
    return (
      <p className="rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
        {error}
      </p>
    );
  }
  if (!shares.length) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <IconLink className="h-7 w-7" />
        </div>
        <p className="mt-4 text-sm font-medium text-slate-700">No share links yet</p>
        <p className="mt-1 text-sm text-slate-400">
          Create one from the Share action on any file.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {shares.map((s) => (
        <div
          key={s.id}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/70 bg-white p-3.5 shadow-sm"
        >
          <FileGlyph
            kind={s.isFolder ? 'folder' : fileKind(s.name)}
            className="h-10 w-10"
            iconClassName="h-5 w-5"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-xs text-brand hover:underline"
            >
              {s.url}
            </a>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${
                s.hasPassword ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {s.hasPassword && <IconLock className="h-3 w-3" />}
              {s.hasPassword ? 'Password' : 'Public'}
            </span>
            {s.expiresAt && (
              <span className="hidden rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-500 sm:inline">
                Until {formatDate(new Date(s.expiresAt).toISOString())}
              </span>
            )}
            <button
              onClick={() => copy(s.id, s.url)}
              title="Copy link"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              {copiedId === s.id ? (
                <IconCheck className="h-4 w-4 text-emerald-600" />
              ) : (
                <IconCopy className="h-4 w-4" />
              )}
            </button>
            <button
              onClick={() => revoke(s.id)}
              title="Revoke"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
            >
              <IconTrash className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
