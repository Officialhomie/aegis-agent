import { DefaultBundlerAdapter } from './default-adapter';
import type { IBundler } from './types';

/**
 * Create a bundler adapter based on BUNDLER_PROVIDER env var.
 *
 * Currently returns DefaultBundlerAdapter which delegates to bundler-client.ts.
 * Future adapters (e.g. PimlicoDirectAdapter, StackupAdapter) can be added here
 * and selected without changing any other code.
 */
export function createBundler(): IBundler {
  return new DefaultBundlerAdapter();
}
