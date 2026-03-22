import { NextResponse } from 'next/server';
import { revokePolicy } from '@/src/lib/product/services/user-policy-service';
import { verifyControlApiKey } from '@/src/lib/product/verify-control-api-key';

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  if (!verifyControlApiKey(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const policy = await revokePolicy(id);
  return NextResponse.json({ ok: true, policy });
}
