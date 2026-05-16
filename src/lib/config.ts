/**
 * Central runtime configuration, sourced entirely from environment variables.
 */
export const config = {
  adminUser: process.env.ADMIN_USER || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  dropboxAppKey: process.env.DROPBOX_APP_KEY || '',
  dropboxAppSecret: process.env.DROPBOX_APP_SECRET || '',
  dropboxRefreshToken: process.env.DROPBOX_REFRESH_TOKEN || '',
  appUrl: (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL || 'file:./data/app.db',
};

/** Resolve the on-disk SQLite path, stripping the optional `file:` prefix. */
export function dbPath(): string {
  const url = config.databaseUrl;
  return url.startsWith('file:') ? url.slice('file:'.length) : url;
}

/** Throws if a required environment variable is missing. */
export function assertConfigured(): void {
  const missing: string[] = [];
  if (!config.adminUser) missing.push('ADMIN_USER');
  if (!config.adminPassword) missing.push('ADMIN_PASSWORD');
  if (!config.dropboxAppKey) missing.push('DROPBOX_APP_KEY');
  if (!config.dropboxAppSecret) missing.push('DROPBOX_APP_SECRET');
  if (!config.dropboxRefreshToken) missing.push('DROPBOX_REFRESH_TOKEN');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
