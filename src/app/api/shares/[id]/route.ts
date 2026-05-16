import { NextResponse } from 'next/server';
import { guard } from '@/lib/api';
import { deleteShare } from '@/lib/db';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = guard(req);
  if (denied) return denied;

  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) {
    return NextResponse.json({ error: 'Invalid share id' }, { status: 400 });
  }
  deleteShare(numericId);
  return NextResponse.json({ ok: true });
}
