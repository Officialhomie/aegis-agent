/**
 * OpenClaw NLP Parsers
 *
 * Extract structured data from natural language commands:
 * - Duration: "2 hours", "30 minutes", "1 day"
 * - Amount: "$500", "500 USD", "1000"
 * - Address: "0xabc...", "wallet 0x123..."
 * - Gas price: "50 gwei", "2.5 gwei"
 */

/**
 * Parse duration from natural language input
 * Examples: "2 hours", "30 minutes", "1 day", "for 2h"
 * Returns duration in milliseconds
 */
export function parseDuration(input: string): number {
  const lower = input.toLowerCase();

  // Match patterns like "2 hours", "30 minutes", "1 day"
  const hourMatch = lower.match(/(\d+)\s*(h|hr|hrs|hour|hours?)/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60 * 60 * 1000;
  }

  const minuteMatch = lower.match(/(\d+)\s*(m|min|mins|minute|minutes?)/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1]) * 60 * 1000;
  }

  const dayMatch = lower.match(/(\d+)\s*(d|day|days?)/);
  if (dayMatch) {
    return parseInt(dayMatch[1]) * 24 * 60 * 60 * 1000;
  }

  // Default: 1 hour if no match
  return 60 * 60 * 1000;
}

/**
 * Parse USD amount from natural language input
 * Examples: "$500", "500 USD", "1000", "increase cap to 500"
 * Returns amount as number
 */
export function parseAmount(input: string): number {
  const lower = input.toLowerCase();

  // Match "$500" or "500 USD" or "500 usd"
  const dollarMatch = input.match(/\$(\d+(?:\.\d+)?)/);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1]);
  }

  const usdMatch = lower.match(/(\d+(?:\.\d+)?)\s*usd/);
  if (usdMatch) {
    return parseFloat(usdMatch[1]);
  }

  // Match standalone number (e.g., "increase cap to 500")
  const numberMatch = input.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  return 0;
}

/**
 * Extract Ethereum address from input
 * Examples: "0xabc...", "block wallet 0x123...", "block 0x456"
 * Returns address or empty string
 */
export function extractAddress(input: string): string {
  const addressMatch = input.match(/(0x[a-fA-F0-9]{40})/);
  return addressMatch ? addressMatch[1] : '';
}

/**
 * Parse gas price in gwei from input
 * Examples: "50 gwei", "2.5 gwei", "set to 100"
 * Returns gas price as number (gwei)
 */
export function parseGwei(input: string): number {
  const lower = input.toLowerCase();

  // Match "50 gwei" or "2.5 gwei"
  const gweiMatch = lower.match(/(\d+(?:\.\d+)?)\s*gwei/);
  if (gweiMatch) {
    return parseFloat(gweiMatch[1]);
  }

  // Match standalone number (e.g., "set to 50")
  const numberMatch = input.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  return 0;
}

/**
 * Parse limit/count from input
 * Examples: "top 10", "show 5", "last 20"
 * Returns limit as number
 */
export function parseNumber(input: string, defaultValue: number = 10): number {
  const lower = input.toLowerCase();

  // Match "top 10", "show 5", "last 20"
  const match = lower.match(/\b(\d+)\b/);
  if (match) {
    return parseInt(match[1]);
  }

  return defaultValue;
}

/**
 * Parse time period from input
 * Examples: "this week", "last 7 days", "today", "this month"
 * Returns period identifier
 */
export function parsePeriod(input: string): string {
  const lower = input.toLowerCase();

  if (lower.includes('week')) {
    return 'week';
  }
  if (lower.includes('month')) {
    return 'month';
  }
  if (lower.includes('today') || lower.includes('day')) {
    return 'day';
  }

  // Check for "last N days"
  const daysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (daysMatch) {
    return `${daysMatch[1]}days`;
  }

  return 'week'; // Default
}

/**
 * Extract reason from block command
 * Examples: "block 0xabc because spam", "block 0x123 reason: abuse"
 */
export function extractReason(input: string): string | undefined {
  const lower = input.toLowerCase();

  // Match "because X", "reason: X", "reason X"
  const becauseMatch = lower.match(/because\s+(.+)$/);
  if (becauseMatch) {
    return becauseMatch[1].trim();
  }

  const reasonMatch = lower.match(/reason:?\s+(.+)$/);
  if (reasonMatch) {
    return reasonMatch[1].trim();
  }

  return undefined;
}

/**
 * Parse tier number from input
 * Examples: "tier 1", "tier 2", "set min tier to 1"
 * Returns tier number (1, 2, or 3) or null if invalid
 */
export function parseTier(input: string): number | null {
  const lower = input.toLowerCase();

  // Match "tier 1", "tier 2", "tier 3"
  const tierMatch = lower.match(/tier\s*(\d+)/);
  if (tierMatch) {
    const tier = parseInt(tierMatch[1]);
    if (tier >= 1 && tier <= 3) {
      return tier;
    }
  }

  // Match standalone number after "to" or "at" (e.g., "set min tier to 1")
  const toMatch = lower.match(/(?:to|at)\s*(\d+)/);
  if (toMatch) {
    const tier = parseInt(toMatch[1]);
    if (tier >= 1 && tier <= 3) {
      return tier;
    }
  }

  return null;
}

/**
 * Parse agent address from input
 * Examples: "boost agent 0xabc", "prioritize 0x123"
 * Returns address or empty string
 */
export function parseAgentAddress(input: string): string {
  return extractAddress(input);
}
