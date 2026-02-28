/**
 * OpenClaw Commands Index
 *
 * Central registration point for all OpenClaw command modules.
 * Import and call registerAllCommands() during application startup.
 */

import { logger } from '../../../logger';
import { registerAgentCrudCommands } from './agent-crud';
import { registerProtocolCrudCommands } from './protocol-crud';
import { registerBudgetCommands } from './budget';
import { registerGuaranteeCommands } from './guarantees';
import { registerDelegationCommands } from './delegations';
import { registerHeartbeatCommands } from './heartbeat';
import { registerReportCommands } from './reports';
import { registerHelpCommands } from './help';

// Track registration state
let isRegistered = false;

/**
 * Register all OpenClaw expanded commands
 *
 * This should be called once during application startup,
 * typically in the main entry point or API route initialization.
 */
export function registerAllCommands(): void {
  if (isRegistered) {
    logger.debug('[OpenClaw] Commands already registered, skipping');
    return;
  }

  logger.info('[OpenClaw] Registering expanded commands...');

  // Phase 2: Agent CRUD
  registerAgentCrudCommands();

  // Phase 3: Protocol CRUD
  registerProtocolCrudCommands();

  // Phase 4: Budget commands
  registerBudgetCommands();

  // Phase 5: Guarantee commands
  registerGuaranteeCommands();

  // Phase 6: Delegation commands
  registerDelegationCommands();

  // Phase 7: Heartbeat commands
  registerHeartbeatCommands();

  // Phase 8: Report commands
  registerReportCommands();

  // Phase 9: Help and safety commands
  registerHelpCommands();

  isRegistered = true;
  logger.info('[OpenClaw] All expanded commands registered');
}

/**
 * Reset registration state (for testing)
 */
export function resetCommandRegistration(): void {
  isRegistered = false;
}

// Re-export individual registration functions for fine-grained control
export { registerAgentCrudCommands } from './agent-crud';
export { registerProtocolCrudCommands } from './protocol-crud';
export { registerBudgetCommands } from './budget';
export { registerGuaranteeCommands } from './guarantees';
export { registerDelegationCommands } from './delegations';
export { registerHeartbeatCommands } from './heartbeat';
export { registerReportCommands } from './reports';
export { registerHelpCommands } from './help';
