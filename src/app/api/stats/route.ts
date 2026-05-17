import { NextResponse } from 'next/server';
import { guard, errorResponse } from '@/lib/api';
import { getSpaceUsage } from '@/lib/dropbox';
import {
  listShares,
  isExpired,
  topDownloads,
  totalDownloads,
  recordStorageSnapshot,
  storageHistory,
} from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Aggregated statistics for the Stats page. */
export async function GET(req: Request) {
  const denied = guard(req);
  if (denied) return denied;

  try {
    let storage = { used: 0, allocated: 0 };
    try {
      storage = await getSpaceUsage();
      // Opportunistic: build storage history as the page is used over time.
      recordStorageSnapshot(storage.used, storage.allocated);
    } catch {
      /* storage info is best-effort */
    }

    const active = listShares().filter((s) => !isExpired(s)).length;

    return NextResponse.json({
      storage,
      history: storageHistory(),
      topDownloads: topDownloads(8),
      totalDownloads: totalDownloads(),
      activeShares: active,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
