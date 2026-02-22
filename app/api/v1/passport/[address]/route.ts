/**
 * Gas Passport V2 API Endpoint
 *
 * GET /api/v1/passport/:address
 *
 * Returns comprehensive passport data for a wallet address.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getGasPassport, formatPassportDisplay } from '@/src/lib/passport';
import { logger } from '@/src/lib/logger';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params;

    // Validate address format
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid wallet address format',
        },
        { status: 400 }
      );
    }

    // Check for query params
    const searchParams = request.nextUrl.searchParams;
    const forceRefresh = searchParams.get('refresh') === 'true';
    const includeIdentity = searchParams.get('identity') !== 'false';
    const format = searchParams.get('format') || 'full';

    // Get passport
    const passport = await getGasPassport(address, {
      forceRefresh,
      includeIdentity,
    });

    // Format response based on requested format
    if (format === 'summary') {
      return NextResponse.json({
        success: true,
        wallet: passport.walletAddress,
        tier: passport.tier,
        trustScore: passport.trustScore,
        riskLevel: passport.riskLevel,
        sponsorshipCount: passport.activity.sponsorshipCount,
        successRate: passport.activity.successRateBps / 100,
        computedAt: passport.computedAt.toISOString(),
      });
    }

    if (format === 'display') {
      const display = formatPassportDisplay(passport);
      return NextResponse.json({
        success: true,
        display,
        computedAt: passport.computedAt.toISOString(),
      });
    }

    // Full format (default)
    return NextResponse.json({
      success: true,
      passport: {
        walletAddress: passport.walletAddress,
        tier: passport.tier,
        trustScore: passport.trustScore,
        riskLevel: passport.riskLevel,

        activity: {
          sponsorshipCount: passport.activity.sponsorshipCount,
          successRate: passport.activity.successRateBps / 100,
          protocolCount: passport.activity.protocolCount,
          totalValueSponsoredUSD: passport.activity.totalValueSponsoredUSD,
          avgSponsorshipValueUSD: passport.activity.avgSponsorshipValueUSD,
          maxSponsorshipValueUSD: passport.activity.maxSponsorshipValueUSD,
          firstSponsorshipAt: passport.activity.firstSponsorshipAt?.toISOString() ?? null,
          lastSponsorshipAt: passport.activity.lastSponsorshipAt?.toISOString() ?? null,
        },

        behavior: {
          avgSponsorshipsPerWeek: passport.behavior.avgSponsorshipsPerWeek,
          consistencyScore: passport.behavior.consistencyScore,
          recencyDays: passport.behavior.recencyDays,
          peakActivityHour: passport.behavior.peakActivityHour,
        },

        risk: {
          failureRate: passport.risk.failureRateBps / 100,
          rejectionRate: passport.risk.rejectionRateBps / 100,
          flags: passport.risk.flags,
          riskLevel: passport.risk.riskLevel,
        },

        identity: {
          ensName: passport.identity.ensName,
          basename: passport.identity.basename,
          farcasterFid: passport.identity.farcasterFid,
          farcasterFollowers: passport.identity.farcasterFollowers,
          onChainTxCount: passport.identity.onChainTxCount,
          isContractDeployer: passport.identity.isContractDeployer,
          accountAgeOnChainDays: passport.identity.accountAgeOnChainDays,
        },

        valuePercentile: passport.valuePercentile,

        componentScores: passport.componentScores,

        computedAt: passport.computedAt.toISOString(),
        dataVersion: passport.dataVersion,
      },
    });
  } catch (err) {
    logger.error('[API] Passport fetch failed', { error: err });

    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to get passport',
      },
      { status: 500 }
    );
  }
}
