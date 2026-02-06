import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind CSS classes with clsx
 * Handles conflicts and deduplication
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format USD amount
 */
export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format ETH amount
 */
export function formatETH(amount: number): string {
  return `${amount.toFixed(4)} ETH`;
}

/**
 * Format large numbers with K, M, B suffixes
 */
export function formatCompact(num: number): string {
  if (num >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(1)}B`;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`;
  }
  return num.toString();
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get Basescan URL for transaction
 */
export function getBasescanTxUrl(txHash: string, testnet = false): string {
  const baseUrl = testnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  return `${baseUrl}/tx/${txHash}`;
}

/**
 * Get Basescan URL for address
 */
export function getBasescanAddressUrl(address: string, testnet = false): string {
  const baseUrl = testnet ? 'https://sepolia.basescan.org' : 'https://basescan.org';
  return `${baseUrl}/address/${address}`;
}
