declare module 'clanker-sdk' {
  export class Clanker {
    constructor(opts: { wallet: unknown; publicClient: unknown });
    deploy(opts: {
      name: string;
      symbol: string;
      image: string;
      tokenAdmin: string;
      metadata?: { description?: string };
      context?: Record<string, string>;
      vanity?: boolean;
    }): Promise<{ txHash?: string; hash?: string; error?: string; waitForTransaction?: () => Promise<{ address: string }> }>;
  }
}
