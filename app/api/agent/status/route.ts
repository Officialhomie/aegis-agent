/**
 * Agent status - health only. Requires API auth.
 */

import { NextResponse } from 'next/server';
import { verifyApiAuth } from '../../../../src/lib/auth/api-auth';

export async function GET(request: Request) {
  const auth = verifyApiAuth(request);
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
}
