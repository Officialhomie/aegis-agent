/**
 * Agent status (config placeholder; can be extended with DB last run, etc.)
 */

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    mode: process.env.AGENT_EXECUTION_MODE ?? 'SIMULATION',
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasTreasury: !!process.env.TREASURY_ADDRESS,
    timestamp: new Date().toISOString(),
  });
}
