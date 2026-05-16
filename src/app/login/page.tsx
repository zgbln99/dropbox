import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { COOKIE_NAME, verifySessionToken } from '@/lib/auth';
import LoginForm from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (verifySessionToken(token)) {
    redirect('/browse');
  }
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm />
    </main>
  );
}
