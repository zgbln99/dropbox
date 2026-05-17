'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconCloud } from '@/components/icons';

export default function LoginForm() {
  const router = useRouter();
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
        setError(data.error || 'Login failed');
        return;
      }
      router.replace('/browse');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm animate-pop-in">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
          <IconCloud className="h-7 w-7" />
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">jrjr-drive</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to manage your files.</p>
      </div>

      <form
        onSubmit={submit}
        className="rounded-2xl border border-slate-200/70 bg-white/80 p-7 shadow-card backdrop-blur"
      >
        <label className="block text-sm font-medium text-slate-700">
          Username
          <input
            type="text"
            autoComplete="username"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        <label className="mt-4 block text-sm font-medium text-slate-700">
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/20"
          />
        </label>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="mt-6 w-full rounded-xl bg-brand py-2.5 text-sm font-semibold text-white shadow-sm shadow-indigo-500/30 transition hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-400">
        Lightweight self-hosted file portal
      </p>
    </div>
  );
}
