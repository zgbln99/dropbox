'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/settings';
import { IconCloud } from '@/components/icons';

export default function LoginForm() {
  const router = useRouter();
  const t = useT();
  const [user, setUser] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t('loginFailed'));
        return;
      }
      router.replace('/browse');
      router.refresh();
    } catch {
      setError(t('networkError'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm animate-pop-in">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 text-white shadow-lg shadow-indigo-500/30">
          <IconCloud className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-strong">jrjr-drive</h1>
        <p className="mt-1 text-sm text-muted">{t('loginSubtitle')}</p>
      </div>

      <form onSubmit={submit} className="card p-7 backdrop-blur">
        <label className="block text-sm font-medium text-strong">
          {t('username')}
          <input
            type="text"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
            className="input mt-1.5"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-strong">
          {t('password')}
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="input mt-1.5"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy} className="btn-primary mt-6 w-full py-2.5">
          {busy ? t('signingIn') : t('signIn')}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-faint">{t('loginTagline')}</p>
    </div>
  );
}
