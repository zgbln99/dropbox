import type { Metadata } from 'next';
import './globals.css';
import { SettingsProvider } from '@/lib/settings';

export const metadata: Metadata = {
  title: 'jrjr-drive',
  description: 'Lightweight self-hosted Dropbox file portal',
};

/** Applies the saved theme before first paint to avoid a flash of light mode. */
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('jrjr-settings')||'{}');if(s.theme==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <SettingsProvider>{children}</SettingsProvider>
      </body>
    </html>
  );
}
