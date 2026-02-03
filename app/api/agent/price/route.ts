/**
 * x402 Pricing Endpoint
 *
 * GET /api/agent/price?action=TRANSFER&token=USDC&amount=100
 * Returns pricing for agent actions. No auth required - used by other agents to quote before payment.
 */

import { NextResponse } from 'next/server';
import { getPrice } from '../../../../src/lib/agent/observe/oracles';
import { getDefaultChainName } from '../../../../src/lib/agent/observe/chains';

const BASE_FEE_USDC = Number(process.env.X402_BASE_FEE_USDC) || 0.001;
const GAS_MARKUP = Number(process.env.X402_GAS_MARKUP) || 1.1;

const ACTION_MULTIPLIERS: Record<string, number> = {
  TRANSFER: 1,
  EXECUTE: 1.5,
  SWAP: 3,
  REBALANCE: 5,
  WAIT: 0,
  ALERT_HUMAN: 0,
};

const ESTIMATED_GAS_PER_ACTION: Record<string, bigint> = {
  TRANSFER: BigInt(65_000),
  EXECUTE: BigInt(100_000),
  SWAP: BigInt(250_000),
  REBALANCE: BigInt(350_000),
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') ?? 'TRANSFER';
    const token = searchParams.get('token') ?? 'USDC';
    const _amount = searchParams.get('amount') ?? '0';
    void _amount; // reserved for amount-based pricing

    const multiplier = ACTION_MULTIPLIERS[action] ?? 1;
    if (multiplier === 0) {
      return NextResponse.json({
        price: '0',
        currency: token,
        validFor: 300,
        action,
        note: 'No charge for WAIT or ALERT_HUMAN',
      });
    }

    let gasCostUsd = 0.01; // Fallback
    try {
      const chainName = getDefaultChainName();
      const ethPriceResult = await getPrice('ETH/USD', chainName);
      if (ethPriceResult?.price) {
        const ethUsd = Number(ethPriceResult.price);
        const gasPriceGwei = Number(process.env.CURRENT_GAS_PRICE_GWEI) || 30;
        const gasUnits = ESTIMATED_GAS_PER_ACTION[action] ?? BigInt(100_000);
        const gasCostEth = (Number(gasUnits) * gasPriceGwei * 1e9) / 1e18;
        gasCostUsd = gasCostEth * ethUsd;
      }
    } catch {
      // Keep fallback
    }

    const gasWithMarkup = gasCostUsd * GAS_MARKUP;
    const baseFee = BASE_FEE_USDC * multiplier;
    const totalUsd = baseFee + gasWithMarkup;

    const priceFormatted = totalUsd.toFixed(6);
    const priceWei = BigInt(Math.ceil(totalUsd * 1e6)).toString(); // USDC 6 decimals

    return NextResponse.json({
      price: priceFormatted,
      priceWei,
      currency: token,
      validFor: 300,
      action,
      breakdown: {
        baseFee: baseFee.toFixed(6),
        gasEstimate: gasCostUsd.toFixed(6),
        gasMarkup: GAS_MARKUP,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Price calculation failed' },
      { status: 500 }
    );
  }
}
