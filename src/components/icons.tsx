import type { SVGProps } from 'react';
import type { FileKind } from '@/lib/utils';

/** Shared wrapper: 24x24 stroke icons, sized via Tailwind w-/h- classes. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function IconCloud(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M7 18a4 4 0 0 1-.5-7.97 6 6 0 0 1 11.64-1.5A3.5 3.5 0 0 1 18.5 18Z" />
    </Icon>
  );
}

export function IconFolder(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.4a2 2 0 0 1 1.5.68l.9 1.02a2 2 0 0 0 1.5.68h5.7A2.5 2.5 0 0 1 21 9.86V16.5A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
    </Icon>
  );
}

export function IconImage(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="9" cy="9.5" r="1.6" />
      <path d="m4 17 4.5-4.5a2 2 0 0 1 2.8 0L17 18" />
      <path d="m14 15 1.8-1.8a2 2 0 0 1 2.8 0L21 15.5" />
    </Icon>
  );
}

export function IconVideo(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <rect x="3" y="5" width="13" height="14" rx="2.5" />
      <path d="m16 10 5-3v10l-5-3Z" />
    </Icon>
  );
}

export function IconPdf(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 16.5h6" />
    </Icon>
  );
}

export function IconLayers(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M12 3 3 8l9 5 9-5Z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </Icon>
  );
}

export function IconFile(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M6 3h8l5 5v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" />
      <path d="M14 3v5h5" />
    </Icon>
  );
}

export function IconUpload(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M12 16V5" />
      <path d="m7.5 9.5 4.5-4.5 4.5 4.5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function IconDownload(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M12 4v11" />
      <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </Icon>
  );
}

export function IconShare(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="m8.3 10.7 7.4-3.4M8.3 13.3l7.4 3.4" />
    </Icon>
  );
}

export function IconPencil(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M4 20h4L19 9a2 2 0 0 0-3-3L5 17Z" />
      <path d="m14 8 3 3" />
    </Icon>
  );
}

export function IconTrash(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7v12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M10 11v6M14 11v6" />
    </Icon>
  );
}

export function IconClose(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M6 6 18 18M18 6 6 18" />
    </Icon>
  );
}

export function IconPlus(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M12 5v14M5 12h14" />
    </Icon>
  );
}

export function IconFolderPlus(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.4a2 2 0 0 1 1.5.68l.9 1.02a2 2 0 0 0 1.5.68h5.7A2.5 2.5 0 0 1 21 9.86V16.5A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5Z" />
      <path d="M12 11v5M9.5 13.5h5" />
    </Icon>
  );
}

export function IconMore(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="5.5" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="18.5" r="1.4" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconChevron(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="m9 6 6 6-6 6" />
    </Icon>
  );
}

export function IconLock(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Icon>
  );
}

export function IconLogout(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M14 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 12H3" />
      <path d="m6.5 8.5-3.5 3.5 3.5 3.5" />
    </Icon>
  );
}

export function IconLink(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5" />
      <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </Icon>
  );
}

export function IconCopy(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2" />
    </Icon>
  );
}

export function IconCheck(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="m5 12.5 4.5 4.5L19 7" />
    </Icon>
  );
}

export function IconFiles(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M7 7h7l4 4v8a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z" />
      <path d="M9 7V5a2 2 0 0 1 2-2h5l4 4v8a2 2 0 0 1-2 2h-1" />
    </Icon>
  );
}

export function IconSettings(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4 5.3 5.3" />
    </Icon>
  );
}

export function IconSun(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.6 4.6l1.8 1.8M17.6 17.6l1.8 1.8M19.4 4.6l-1.8 1.8M6.4 17.6l-1.8 1.8" />
    </Icon>
  );
}

export function IconMoon(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5Z" />
    </Icon>
  );
}

export function IconGrid(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </Icon>
  );
}

export function IconList(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </Icon>
  );
}

export function IconMenu(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Icon>
  );
}

export function IconArrowLeft(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M15 6l-6 6 6 6" />
    </Icon>
  );
}

export function IconArrowRight(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

export function IconDrive(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M5 13 7.5 5.5A2 2 0 0 1 9.4 4h5.2a2 2 0 0 1 1.9 1.5L19 13" />
      <rect x="3" y="13" width="18" height="6" rx="2" />
      <path d="M7 16h.01" />
    </Icon>
  );
}

export function IconGlobe(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.5 3.8 5.7 3.8 9S14.5 18.5 12 21M12 3C9.5 5.5 8.2 8.7 8.2 12s1.3 6.5 3.8 9" />
    </Icon>
  );
}

export function IconSearch(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </Icon>
  );
}

export function IconFilter(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
    </Icon>
  );
}

export function IconEye(p: SVGProps<SVGSVGElement>) {
  return (
    <Icon {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

const KIND_META: Record<FileKind | 'folder', { Icon: typeof IconFile; fg: string; bg: string }> = {
  folder: { Icon: IconFolder, fg: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/15' },
  image: { Icon: IconImage, fg: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/15' },
  svg: { Icon: IconImage, fg: 'text-pink-600 dark:text-pink-400', bg: 'bg-pink-500/15' },
  video: { Icon: IconVideo, fg: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/15' },
  pdf: { Icon: IconPdf, fg: 'text-red-600 dark:text-red-400', bg: 'bg-red-500/15' },
  psd: { Icon: IconLayers, fg: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/15' },
  other: { Icon: IconFile, fg: 'text-slate-500 dark:text-slate-400', bg: 'bg-slate-500/15' },
};

/** A rounded tile with the colour-coded icon for a given file kind. */
export function FileGlyph({
  kind,
  className = 'h-10 w-10',
  iconClassName = 'h-5 w-5',
}: {
  kind: FileKind | 'folder';
  className?: string;
  iconClassName?: string;
}) {
  const meta = KIND_META[kind] ?? KIND_META.other;
  const { Icon: Glyph } = meta;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-lg ${meta.bg} ${meta.fg} ${className}`}
    >
      <Glyph className={iconClassName} />
    </span>
  );
}
