import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { getSpaceUsage } from '@/lib/dropbox';
import { listShares, isExpired } from '@/lib/db';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Account summary for the Settings page: user, storage usage, share counts. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    const shares = listShares();
    const active = shares.filter((s) => !isExpired(s)).length;

    let storage = { used: 0, allocated: 0 };
    try {
      storage = await getSpaceUsage();
    } catch {
      // Storage info is best-effort; the page still renders without it.
    }

    return NextResponse.json({
      user: config.adminUser,
      storage,
      shares: { total: shares.length, active },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
