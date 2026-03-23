import { NextResponse } from 'next/server';
import { getPrisma } from '@/src/lib/db';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

export async function GET(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const sessionId = searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const limit = Math.min(Number(searchParams.get('limit') ?? '50') || 50, 200);
  const prisma = getPrisma();
  const [product, audits] = await Promise.all([
    prisma.productExecutionRecord.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    }),
    prisma.openClawAudit.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        commandName: true,
        success: true,
        executionMs: true,
        createdAt: true,
        rawInput: true,
      },
    }),
  ]);
  return NextResponse.json({ ok: true, productExecutions: product, openClawAudits: audits });
}
