import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import FileBrowser from '@/components/FileBrowser';

export const dynamic = 'force-dynamic';

export default async function BrowsePage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!verifySessionToken(token)) {
    redirect('/login');
  }
  return <FileBrowser />;
}
