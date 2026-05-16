/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // better-sqlite3, sharp and ag-psd are native/server-only deps.
  serverExternalPackages: ['better-sqlite3', 'sharp', 'ag-psd'],
};

export default nextConfig;
