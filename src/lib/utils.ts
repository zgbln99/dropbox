/** Shared helpers for file classification, paths and formatting. */

const IMAGE_EXT = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg']);
const VIDEO_EXT = new Set(['mp4', 'webm', 'ogg', 'mov', 'm4v']);
const PSD_EXT = new Set(['psd']);
const PDF_EXT = new Set(['pdf']);

export function ext(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

export type FileKind = 'image' | 'svg' | 'video' | 'pdf' | 'psd' | 'other';

export function fileKind(name: string): FileKind {
  const e = ext(name);
  if (e === 'svg') return 'svg';
  if (IMAGE_EXT.has(e)) return 'image';
  if (VIDEO_EXT.has(e)) return 'video';
  if (PDF_EXT.has(e)) return 'pdf';
  if (PSD_EXT.has(e)) return 'psd';
  return 'other';
}

/** Whether a thumbnail/preview image can be generated for this file. */
export function hasPreview(name: string): boolean {
  const k = fileKind(name);
  return k === 'image' || k === 'svg' || k === 'psd' || k === 'pdf';
}

/** Whether the file can be shown inline in the browser. */
export function isInlineViewable(name: string): boolean {
  const k = fileKind(name);
  return k === 'image' || k === 'svg' || k === 'video' || k === 'pdf';
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Join a folder path and a child name into a normalised portal path. */
export function joinPath(dir: string, name: string): string {
  const base = dir === '/' || dir === '' ? '' : dir.replace(/\/+$/, '');
  return `${base}/${name}`;
}

/** Parent directory of a path ('/' for top-level entries). */
export function parentPath(p: string): string {
  const trimmed = p.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  return idx <= 0 ? '/' : trimmed.slice(0, idx);
}

/**
 * Reject paths that try to escape via traversal. Dropbox paths are absolute,
 * begin with '/', and never contain '..' segments.
 */
export function isSafePath(p: string): boolean {
  if (typeof p !== 'string') return false;
  if (p === '/' || p === '') return true;
  if (!p.startsWith('/')) return false;
  return !p.split('/').includes('..');
}

/** True when `child` is the same as or nested under `base`. */
export function isWithin(base: string, child: string): boolean {
  const b = base === '/' ? '' : base.replace(/\/+$/, '');
  const c = child.replace(/\/+$/, '');
  if (b === '') return true;
  return c === b || c.startsWith(`${b}/`);
}
