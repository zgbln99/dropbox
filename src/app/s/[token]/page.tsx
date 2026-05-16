import { getShareByToken, isExpired } from '@/lib/db';
import SharePublic from '@/components/SharePublic';

export const dynamic = 'force-dynamic';

function Notice({ title, message }: { title: string; message: string }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 text-center shadow">
        <h1 className="text-xl font-semibold text-slate-800">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">{message}</p>
      </div>
    </main>
  );
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
      rootPath={share.path}
    />
  );
}
