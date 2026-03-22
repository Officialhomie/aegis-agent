import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getPrisma } from '@/src/lib/db';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

const PatchSchema = z.object({
  dailyLimit: z.number().int().positive().optional(),
  totalLimit: z.number().int().positive().optional(),
  windowHours: z.number().int().positive().optional(),
  status: z.enum(['ACTIVE', 'PAUSED']).optional(),
});

export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 });
  }
  const prisma = getPrisma();
  const policy = await prisma.userAgentPolicy.update({
    where: { id },
    data: parsed.data,
    include: { sponsoredMethod: true },
  });
  return NextResponse.json({ ok: true, policy });
}
