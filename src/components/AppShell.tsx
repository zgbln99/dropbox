'use client';

import { useState, type ReactNode } from 'react';
import { useT } from '@/lib/settings';
import { IconCloud, IconFiles, IconLink, IconSettings, IconLogout, IconMenu } from './icons';
import type { TranslationKey } from '@/lib/i18n';

export type AppView = 'files' | 'shares' | 'settings';

const NAV: { id: AppView; Icon: typeof IconFiles; label: TranslationKey }[] = [
  { id: 'files', Icon: IconFiles, label: 'navFiles' },
  { id: 'shares', Icon: IconLink, label: 'navShared' },
  { id: 'settings', Icon: IconSettings, label: 'navSettings' },
];

export default function AppShell({
  view,
  onNavigate,
  onSignOut,
  children,
}: {
  view: AppView;
  onNavigate: (v: AppView) => void;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const t = useT();
  const [drawer, setDrawer] = useState(false);

  function go(v: AppView) {
    onNavigate(v);
    setDrawer(false);
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-sm shadow-indigo-500/30">
          <IconCloud className="h-5 w-5" />
        </div>
        <span className="text-base font-semibold tracking-tight text-strong">jrjr-drive</span>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV.map(({ id, Icon, label }) => {
          const active = view === id;
          return (
            <button
              key={id}
              onClick={() => go(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'bg-brand text-white shadow-glow'
                  : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.05]'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {t(label)}
            </button>
          );
        })}
      </nav>

      <div className="border-t divider p-3">
        <button
          onClick={onSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/[0.05]"
        >
          <IconLogout className="h-[18px] w-[18px]" />
          {t('signOut')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r divider panel lg:block">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {drawer && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 animate-fade-in bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setDrawer(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 animate-fade-in border-r divider bg-white dark:bg-[#0c1120]">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b divider panel px-4 py-3 lg:hidden">
          <button onClick={() => setDrawer(true)} className="btn-icon -ml-1">
            <IconMenu className="h-5 w-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-cyan-400 text-white">
              <IconCloud className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold text-strong">
              {t(NAV.find((n) => n.id === view)!.label)}
            </span>
          </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
