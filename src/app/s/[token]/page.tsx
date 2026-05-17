import { headers } from 'next/headers';
import { getShareByToken, isExpired } from '@/lib/db';
import { rateLimit, getClientIp } from '@/lib/ratelimit';
import SharePublic from '@/components/SharePublic';

export const dynamic = 'force-dynamic';

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="card w-full max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-strong">{title}</h1>
        <p className="mt-2 text-sm text-muted">{message}</p>
      </div>
    </main>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Per-IP rate limit on public share page views (counters stored in SQLite).
  const ip = getClientIp(await headers());
  if (!rateLimit(`sharepage:${ip}`, 60, 60).allowed) {
    return (
      <Notice
        title="Too many requests"
        message="You've opened too many share pages. Please wait a minute and try again."
      />
    );
  }

  const share = getShareByToken(token);

  if (!share) {
    return <Notice title="Share not found" message="This link is invalid or has been removed." />;
  }
  if (isExpired(share)) {
    return <Notice title="Link expired" message="This share link is no longer available." />;
  }

  return (
    <SharePublic
      token={token}
      name={share.name}
      isFolder={!!share.is_folder}
      hasPassword={!!share.password_hash}
      allowDownload={!!share.allow_download}
      rootPath={share.path}
    />
  );
}
