import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'jrjr-drive',
  description: 'Lightweight self-hosted Dropbox file portal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
