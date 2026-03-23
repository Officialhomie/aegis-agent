import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

export async function GET(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const prisma = getPrisma();
  const methods = await prisma.sponsoredMethod.findMany({
    orderBy: { commandName: 'asc' },
  });
  return NextResponse.json({ ok: true, methods });
}
