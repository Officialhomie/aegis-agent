/**
 * Mask sensitive data before sending to external LLM APIs.
 * Redacts private keys, API keys, and shortens wallet addresses.
 */

export function maskSensitiveData(data: unknown): unknown {
  if (typeof data === 'string') {
    // Mask wallet addresses (show first 6 and last 4)
    return data.replace(
      /0x[a-fA-F0-9]{40}/g,
      (match) => `${match.slice(0, 6)}...${match.slice(-4)}`
    );
  }
  if (Array.isArray(data)) {
    return data.map(maskSensitiveData);
  }
  if (data && typeof data === 'object') {
    const masked: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Redact sensitive keys entirely
      const keyLower = key.toLowerCase();
      if (['privatekey', 'apikey', 'secret', 'password'].includes(keyLower)) {
        masked[key] = '[REDACTED]';
      } else {
        masked[key] = maskSensitiveData(value);
      }
    }
    return masked;
  }
  return data;
}
