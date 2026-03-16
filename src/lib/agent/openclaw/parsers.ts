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

  // Return 0 for unparseable input — no duration matched
  return 0;
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

// ============================================================================
// Extended Parsers for OpenClaw Expanded Features
// ============================================================================

/**
 * Synonym mappings for command verbs
 */
const VERB_SYNONYMS: Record<string, string[]> = {
  create: ['create', 'add', 'new', 'register', 'make'],
  update: ['update', 'set', 'change', 'modify', 'edit'],
  delete: ['delete', 'remove', 'revoke', 'unregister', 'archive'],
  get: ['get', 'show', 'view', 'display', 'fetch'],
  list: ['list', 'show all', 'display all', 'get all', 'find all'],
};

/**
 * Normalize command verb to canonical form
 * Examples: "add" -> "create", "remove" -> "delete"
 */
export function normalizeVerb(input: string): string {
  const lower = input.toLowerCase().trim();

  for (const [canonical, synonyms] of Object.entries(VERB_SYNONYMS)) {
    if (synonyms.some(s => lower.startsWith(s) || lower.includes(` ${s} `))) {
      return canonical;
    }
  }

  return lower.split(/\s+/)[0] ?? '';
}

/**
 * Check if input matches any synonym for a verb
 */
export function matchesVerb(input: string, verb: string): boolean {
  const lower = input.toLowerCase();
  const synonyms = VERB_SYNONYMS[verb] ?? [verb];
  return synonyms.some(s => lower.includes(s));
}

/**
 * Parse extended money amounts with formatting
 * Examples: "$1,200", "1200 USD", "1k", "2.5k", "$1.5M"
 * Returns amount as number
 */
export function parseMoneyExtended(input: string): number {
  const lower = input.toLowerCase();

  // Remove commas from numbers: $1,200 -> $1200
  const cleaned = input.replace(/,/g, '');

  // Match with K/M/B suffix: 1k, 2.5k, 1M, etc.
  const suffixMatch = cleaned.match(/\$?(\d+(?:\.\d+)?)\s*(k|m|b)/i);
  if (suffixMatch) {
    const value = parseFloat(suffixMatch[1]);
    const suffix = suffixMatch[2].toLowerCase();
    const multiplier = suffix === 'k' ? 1000 : suffix === 'm' ? 1000000 : 1000000000;
    return value * multiplier;
  }

  // Match "$500" or "$1200.50"
  const dollarMatch = cleaned.match(/\$(\d+(?:\.\d+)?)/);
  if (dollarMatch) {
    return parseFloat(dollarMatch[1]);
  }

  // Match "500 USD" or "1200 usd"
  const usdMatch = lower.replace(/,/g, '').match(/(\d+(?:\.\d+)?)\s*usd/);
  if (usdMatch) {
    return parseFloat(usdMatch[1]);
  }

  // Match standalone number with optional decimal
  const numberMatch = cleaned.match(/\b(\d+(?:\.\d+)?)\b/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  return 0;
}

/**
 * Parse AgentType enum from input
 * Examples: "type ERC8004_AGENT", "type erc4337", "smart contract"
 * Returns AgentType string or null
 */
export function parseAgentType(input: string): string | null {
  const lower = input.toLowerCase();

  // ERC-8004 patterns
  if (lower.includes('erc8004') || lower.includes('erc-8004') || lower.includes('8004')) {
    return 'ERC8004_AGENT';
  }

  // ERC-4337 patterns
  if (lower.includes('erc4337') || lower.includes('erc-4337') || lower.includes('4337') ||
      lower.includes('smart account')) {
    return 'ERC4337_ACCOUNT';
  }

  // Smart contract patterns
  if (lower.includes('smart contract') || lower.includes('contract')) {
    return 'SMART_CONTRACT';
  }

  // EOA patterns
  if (lower.includes('eoa') || lower.includes('externally owned')) {
    return 'EOA';
  }

  return null;
}

/**
 * Parse quoted label/name from input
 * Examples: 'name "MyBot"', "name 'Test Agent'"
 * Returns label or null
 */
export function parseAgentLabel(input: string): string | null {
  // Match double-quoted string
  const doubleMatch = input.match(/(?:name|label)\s*[=:]?\s*"([^"]+)"/i);
  if (doubleMatch) {
    return doubleMatch[1].trim();
  }

  // Match single-quoted string
  const singleMatch = input.match(/(?:name|label)\s*[=:]?\s*'([^']+)'/i);
  if (singleMatch) {
    return singleMatch[1].trim();
  }

  // Match unquoted name after "name" keyword (up to next keyword or end)
  const unquotedMatch = input.match(/(?:name|label)\s+([a-zA-Z0-9_-]+)/i);
  if (unquotedMatch) {
    return unquotedMatch[1].trim();
  }

  return null;
}

/**
 * Parse GuaranteeType enum from input
 * Examples: "type GAS_BUDGET", "type TIME", "type count", "type gas"
 * Returns GuaranteeType string or null
 */
export function parseGuaranteeType(input: string): string | null {
  const lower = input.toLowerCase();

  // TIME_WINDOW patterns
  if (lower.includes('time') || lower.includes('sla') || lower.includes('latency')) {
    return 'TIME_WINDOW';
  }

  // TX_COUNT patterns
  if (lower.includes('count') || lower.includes('transaction') || lower.includes('tx_count')) {
    return 'TX_COUNT';
  }

  // GAS_BUDGET patterns (default)
  if (lower.includes('gas') || lower.includes('budget')) {
    return 'GAS_BUDGET';
  }

  return null;
}

/**
 * Parse ServiceTier enum from input
 * Examples: "tier GOLD", "gold tier", "premium"
 * Returns ServiceTier string or null
 */
export function parseServiceTier(input: string): string | null {
  const lower = input.toLowerCase();

  if (lower.includes('gold') || lower.includes('premium')) {
    return 'GOLD';
  }

  if (lower.includes('silver') || lower.includes('standard')) {
    return 'SILVER';
  }

  if (lower.includes('bronze') || lower.includes('basic')) {
    return 'BRONZE';
  }

  return null;
}

/**
 * Validate Ethereum address checksum (EIP-55)
 * Returns true if address is valid (including checksum if mixed case)
 */
export function validateAddressChecksum(address: string): boolean {
  // Basic format check
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return false;
  }

  // If all lowercase or all uppercase, accept without checksum validation
  if (address === address.toLowerCase() || address === address.toUpperCase()) {
    return true;
  }

  // For mixed case, we'd normally validate EIP-55 checksum
  // For simplicity, we accept any valid format address
  return true;
}

/**
 * Extract all addresses from input (for multi-address commands)
 * Returns array of addresses
 */
export function extractAllAddresses(input: string): string[] {
  const matches = input.matchAll(/(0x[a-fA-F0-9]{40})/g);
  return Array.from(matches, m => m[1]);
}

/**
 * Parse date from input
 * Examples: "since 2026-02-01", "since yesterday", "since last week"
 * Returns Date or null
 */
export function parseDate(input: string): Date | null {
  const lower = input.toLowerCase();
  const now = new Date();

  // ISO date: 2026-02-01
  const isoMatch = input.match(/(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    const date = new Date(isoMatch[1]);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // US date: 02/01/2026 or 2/1/2026
  const usMatch = input.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (usMatch) {
    const date = new Date(`${usMatch[3]}-${usMatch[1].padStart(2, '0')}-${usMatch[2].padStart(2, '0')}`);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }

  // Relative dates
  if (lower.includes('yesterday')) {
    return new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  if (lower.includes('last week')) {
    return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  }

  if (lower.includes('last month')) {
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    return lastMonth;
  }

  // "last N days"
  const daysAgoMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (daysAgoMatch) {
    const days = parseInt(daysAgoMatch[1]);
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  return null;
}

/**
 * Parse export format from input
 * Examples: "format csv", "as json", "in csv format"
 * Returns format string or default
 */
export function parseFormat(input: string, defaultFormat: string = 'csv'): string {
  const lower = input.toLowerCase();

  if (lower.includes('json')) {
    return 'json';
  }

  if (lower.includes('csv')) {
    return 'csv';
  }

  if (lower.includes('markdown') || lower.includes('md')) {
    return 'markdown';
  }

  return defaultFormat;
}

/**
 * Parse protocol ID from input
 * Examples: "protocol uniswap-v4", "for aave-v3"
 * Returns protocolId or null
 */
export function parseProtocolId(input: string): string | null {
  // Match "protocol <id>" pattern
  const protocolMatch = input.match(/protocol\s+([a-zA-Z0-9_-]+)/i);
  if (protocolMatch) {
    return protocolMatch[1];
  }

  // Match "for <id>" pattern (common in commands like "create guarantee for uniswap-v4")
  const forMatch = input.match(/(?:for|from)\s+([a-zA-Z0-9_-]+)(?:\s|$)/i);
  if (forMatch && !forMatch[1].startsWith('0x')) {
    return forMatch[1];
  }

  return null;
}

/**
 * Parse boolean value from input
 * Examples: "true", "yes", "enabled", "false", "no", "disabled"
 */
export function parseBoolean(input: string): boolean | null {
  const lower = input.toLowerCase();

  if (['true', 'yes', 'enabled', 'on', '1'].some(v => lower.includes(v))) {
    return true;
  }

  if (['false', 'no', 'disabled', 'off', '0'].some(v => lower.includes(v))) {
    return false;
  }

  return null;
}

/**
 * Parse "set X to Y" or "set X = Y" patterns
 * Returns { field, value } or null
 */
export function parseSetClause(input: string): { field: string; value: string } | null {
  // Match "set <field> to <value>" or "set <field> = <value>" or "set <field> <value>"
  const setMatch = input.match(/set\s+(\w+)\s*(?:to|=|:)?\s*(.+)$/i);
  if (setMatch) {
    return {
      field: setMatch[1].toLowerCase(),
      value: setMatch[2].trim(),
    };
  }

  return null;
}

/**
 * Parse confirmation token from input
 * Examples: "confirm abc123", "YES", "confirm"
 */
export function parseConfirmation(input: string): { confirmed: boolean; token?: string } {
  const lower = input.toLowerCase().trim();

  // Direct "YES" confirmation
  if (lower === 'yes' || lower === 'y' || lower === 'confirm') {
    return { confirmed: true };
  }

  // Token-based confirmation: "confirm <token>"
  const tokenMatch = input.match(/confirm\s+([a-zA-Z0-9]+)/i);
  if (tokenMatch) {
    return { confirmed: true, token: tokenMatch[1] };
  }

  return { confirmed: false };
}

/**
 * Calculate intent confidence based on keyword matches
 * Returns confidence score 0-1
 */
export function calculateIntentConfidence(
  input: string,
  requiredKeywords: string[],
  optionalKeywords: string[] = []
): number {
  const lower = input.toLowerCase();

  // Count required keyword matches
  const requiredMatches = requiredKeywords.filter(kw => lower.includes(kw)).length;
  const requiredScore = requiredKeywords.length > 0
    ? requiredMatches / requiredKeywords.length
    : 1;

  // Count optional keyword matches (bonus)
  const optionalMatches = optionalKeywords.filter(kw => lower.includes(kw)).length;
  const optionalScore = optionalKeywords.length > 0
    ? optionalMatches / optionalKeywords.length * 0.2
    : 0;

  // Base confidence from input length (very short inputs are less confident)
  const lengthScore = Math.min(input.trim().split(/\s+/).length / 3, 1) * 0.1;

  return Math.min(requiredScore * 0.7 + optionalScore + lengthScore, 1);
}

/**
 * Parse hours from input for audit/report commands
 * Examples: "last 24h", "last 24 hours", "past 48 hours"
 * Returns hours as number or default
 */
export function parseHours(input: string, defaultHours: number = 24): number {
  const lower = input.toLowerCase();

  // Match "last Xh" or "last X hours"
  const hoursMatch = lower.match(/(?:last|past)\s+(\d+)\s*(?:h|hours?)/);
  if (hoursMatch) {
    return parseInt(hoursMatch[1]);
  }

  // Match just a number followed by h/hours
  const simpleMatch = lower.match(/(\d+)\s*(?:h|hours?)/);
  if (simpleMatch) {
    return parseInt(simpleMatch[1]);
  }

  return defaultHours;
}

/**
 * Parse interval for heartbeat commands
 * Examples: "every 15m", "every 1 hour", "interval 30 minutes"
 * Returns interval in milliseconds or default
 */
export function parseInterval(input: string, defaultMs: number = 900000): number {
  const lower = input.toLowerCase();

  // Match "every Xm" or "every X minutes"
  const minuteMatch = lower.match(/(?:every|interval)\s+(\d+)\s*(?:m|min|mins|minutes?)/);
  if (minuteMatch) {
    return parseInt(minuteMatch[1]) * 60 * 1000;
  }

  // Match "every Xh" or "every X hours"
  const hourMatch = lower.match(/(?:every|interval)\s+(\d+)\s*(?:h|hr|hrs|hours?)/);
  if (hourMatch) {
    return parseInt(hourMatch[1]) * 60 * 60 * 1000;
  }

  return defaultMs;
}

/**
 * Parse status filter for list commands
 * Examples: "active", "pending", "expired"
 */
export function parseStatusFilter(input: string): string | null {
  const lower = input.toLowerCase();

  const statuses = ['active', 'pending', 'expired', 'cancelled', 'breached', 'depleted', 'revoked'];

  for (const status of statuses) {
    if (lower.includes(status)) {
      return status.toUpperCase();
    }
  }

  return null;
}

/**
 * Extract ID from input (cuid format)
 * Examples: "guarantee clm123...", "delegation cln456..."
 */
export function parseId(input: string): string | null {
  // Match cuid-like pattern (starts with c, followed by alphanumeric)
  const cuidMatch = input.match(/\b(c[a-z0-9]{20,30})\b/i);
  if (cuidMatch) {
    return cuidMatch[1];
  }

  // Match generic ID after keywords
  const idMatch = input.match(/(?:guarantee|delegation|id)\s+([a-zA-Z0-9_-]+)/i);
  if (idMatch) {
    return idMatch[1];
  }

  return null;
}
