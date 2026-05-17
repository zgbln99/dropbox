import type { Metadata } from 'next';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';
import { ToastProvider } from '@/lib/toast';

export const metadata: Metadata = {
  title: 'ZGBLN DRIVE',
  description: 'Lightweight self-hosted Dropbox file portal',
};

/** Applies the saved theme before first paint to avoid a flash. Dark default. */
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('jrjr-settings')||'{}');var t=s.theme;var d=t==='dark'||!t||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){document.documentElement.classList.add('dark');}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SettingsProvider>
          <ToastProvider>{children}</ToastProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
