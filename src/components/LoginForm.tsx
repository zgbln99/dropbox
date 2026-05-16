'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
    <form onSubmit={submit} className="w-full max-w-sm rounded-xl bg-white p-8 shadow">
      <h1 className="text-2xl font-semibold text-slate-800">jrjr-drive</h1>
      <p className="mt-1 text-sm text-slate-500">Sign in to manage your files.</p>

      <label className="mt-6 block text-sm font-medium text-slate-700">
        Username
        <input
          type="text"
          autoComplete="username"
          value={user}
          onChange={(e) => setUser(e.target.value)}
          required
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
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
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand focus:ring-1 focus:ring-brand"
        />
      </label>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={busy}
        className="mt-6 w-full rounded-lg bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
