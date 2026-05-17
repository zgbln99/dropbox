'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  useSettings,
  type Theme,
  type ViewMode,
  type SortKey,
  type TileSize,
} from '@/lib/settings';
import { LANGUAGES, type Lang } from '@/lib/i18n';
import { formatBytes } from '@/lib/utils';
import {
  IconSun,
  IconMoon,
  IconGrid,
  IconList,
  IconGlobe,
  IconDrive,
  IconLink,
  IconSettings,
} from './icons';

interface Account {
  user: string;
  storage: { used: number; allocated: number };
  shares: { total: number; active: number };
}

function Card({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="text-slate-400 dark:text-slate-500">{icon}</span>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>
      </div>
      <div className="divide-y divider">{children}</div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-strong">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/[0.06]">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
            value === o.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-black/40 dark:text-slate-100'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsPanel() {
  const { theme, lang, view, sort, tileSize, set, t } = useSettings();
  const [account, setAccount] = useState<Account | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setAccount(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const usedPct =
    account && account.storage.allocated > 0
      ? Math.min(100, (account.storage.used / account.storage.allocated) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-strong">{t('settingsTitle')}</h1>
        <p className="mt-0.5 text-sm text-muted">{t('settingsSaved')}</p>
      </div>

      <Card title={t('appearance')} icon={<IconSettings className="h-4 w-4" />}>
        <Row label={t('theme')}>
          <Segmented<Theme>
            value={theme}
            onChange={(v) => set('theme', v)}
            options={[
              { value: 'light', label: t('themeLight'), icon: <IconSun className="h-4 w-4" /> },
              { value: 'dark', label: t('themeDark'), icon: <IconMoon className="h-4 w-4" /> },
            ]}
          />
        </Row>
        <Row label={t('language')}>
          <Segmented<Lang>
            value={lang}
            onChange={(v) => set('lang', v)}
            options={LANGUAGES.map((l) => ({ value: l.value, label: l.label }))}
          />
        </Row>
        <Row label={t('defaultView')}>
          <Segmented<ViewMode>
            value={view}
            onChange={(v) => set('view', v)}
            options={[
              { value: 'grid', label: t('viewGrid'), icon: <IconGrid className="h-4 w-4" /> },
              { value: 'list', label: t('viewList'), icon: <IconList className="h-4 w-4" /> },
            ]}
          />
        </Row>
        <Row label={t('tileSize')}>
          <Segmented<TileSize>
            value={tileSize}
            onChange={(v) => set('tileSize', v)}
            options={[
              { value: 'sm', label: t('tileSmall') },
              { value: 'md', label: t('tileMedium') },
              { value: 'lg', label: t('tileLarge') },
            ]}
          />
        </Row>
        <Row label={t('sorting')}>
          <select
            value={sort}
            onChange={(e) => set('sort', e.target.value as SortKey)}
            className="input w-auto py-2"
          >
            <option value="name">{t('sortName')}</option>
            <option value="date">{t('sortDate')}</option>
            <option value="size">{t('sortSize')}</option>
          </select>
        </Row>
      </Card>

      <Card title={t('account')} icon={<IconGlobe className="h-4 w-4" />}>
        <Row label={t('accountName')}>
          <span className="text-sm font-medium text-strong">{account?.user ?? '—'}</span>
        </Row>
        <Row label={t('activeLinks')}>
          <span className="chip">
            <IconLink className="h-3 w-3" />
            {account ? account.shares.active : '—'}
          </span>
        </Row>
        <div className="py-3.5 last:pb-0">
          <div className="mb-2 flex items-center justify-between">
            <p className="flex items-center gap-1.5 text-sm font-medium text-strong">
              <IconDrive className="h-4 w-4 text-slate-400" />
              {t('storageUsed')}
            </p>
            <p className="text-xs text-muted">
              {account
                ? `${formatBytes(account.storage.used)} / ${formatBytes(account.storage.allocated)}`
                : '—'}
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 transition-all"
              style={{ width: `${usedPct}%` }}
            />
          </div>
        </div>
      </Card>
    </div>
  );
}
