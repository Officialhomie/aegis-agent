import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/src/lib/db';
import { getCapsForTier, normalizeTier } from '@/src/lib/product/services/entitlement-service';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

export async function GET(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const sessionId = new URL(request.url).searchParams.get('sessionId');
  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
  }
  const prisma = getPrisma();
  let row = await prisma.entitlement.findUnique({ where: { sessionId } });
  if (!row) {
    row = await prisma.entitlement.create({
      data: { sessionId, tier: 'FREE' },
    });
  }
  const tier = normalizeTier(row.tier);
  return NextResponse.json({
    ok: true,
    entitlement: row,
    caps: getCapsForTier(tier),
  });
}

const PostSchema = z.object({
  sessionId: z.string().min(1),
  tier: z.enum(['FREE', 'PRO', 'TEAM']),
});

/** Mock tier upgrade for demos (no real billing). */
export async function POST(request: Request) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const prisma = getPrisma();
  const row = await prisma.entitlement.upsert({
    where: { sessionId: parsed.data.sessionId },
    create: { sessionId: parsed.data.sessionId, tier: parsed.data.tier },
    update: { tier: parsed.data.tier },
  });
  const tier = normalizeTier(row.tier);
  return NextResponse.json({ ok: true, entitlement: row, caps: getCapsForTier(tier) });
}
