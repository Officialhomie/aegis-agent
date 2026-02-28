/**
 * OpenClaw Command Registry
 *
 * Modular command registration and dispatch system.
 * Allows commands to be registered from separate modules and executed centrally.
 */

import { logger } from '../../logger';
import { OPENCLAW_EXPANDED } from '../../config/feature-flags';
import type { ParsedCommand, CommandResult, CommandName } from './types';

/**
 * Command handler function signature
 */
export type CommandHandler = (
  cmd: ParsedCommand,
  sessionId?: string
) => Promise<CommandResult>;

/**
 * Command registration options
 */
export interface CommandOptions {
  /** Requires OPENCLAW_EXPANDED feature flag to be enabled */
  requiresExpanded?: boolean;
  /** Command is destructive (delete, revoke, etc.) and requires confirmation */
  isDestructive?: boolean;
  /** Command requires a valid session */
  requiresSession?: boolean;
  /** Description for help text */
  description?: string;
  /** Usage examples */
  examples?: string[];
  /** Category for grouping in help */
  category?: CommandCategory;
}

/**
 * Command categories for help organization
 */
export type CommandCategory =
  | 'monitoring'
  | 'execution'
  | 'policy'
  | 'tier'
  | 'agent'
  | 'protocol'
  | 'budget'
  | 'guarantee'
  | 'delegation'
  | 'heartbeat'
  | 'report'
  | 'safety'
  | 'help';

/**
 * Registered command entry
 */
interface RegisteredCommand {
  handler: CommandHandler;
  options: CommandOptions;
}

/**
 * Command registry singleton
 */
class CommandRegistry {
  private commands = new Map<CommandName, RegisteredCommand>();

  /**
   * Register a command handler
   */
  register(
    name: CommandName,
    handler: CommandHandler,
    options: CommandOptions = {}
  ): void {
    if (this.commands.has(name)) {
      logger.warn('[CommandRegistry] Overwriting existing command', { name });
    }

    this.commands.set(name, { handler, options });
    logger.debug('[CommandRegistry] Registered command', { name, options });
  }

  /**
   * Execute a registered command
   */
  async execute(
    cmd: ParsedCommand,
    sessionId?: string
  ): Promise<CommandResult> {
    const registered = this.commands.get(cmd.name);

    if (!registered) {
      return {
        success: false,
        message: `Unknown command: ${cmd.name}. Type "help" for available commands.`,
      };
    }

    const { handler, options } = registered;

    // Check feature flag
    if (options.requiresExpanded && !OPENCLAW_EXPANDED) {
      return {
        success: false,
        message: 'This command requires the OPENCLAW_EXPANDED feature to be enabled.',
      };
    }

    // Check session requirement
    if (options.requiresSession && !sessionId) {
      return {
        success: false,
        message: 'This command requires a valid session. Please authenticate first.',
      };
    }

    // Execute the handler
    try {
      const startTime = Date.now();
      const result = await handler(cmd, sessionId);
      const executionMs = Date.now() - startTime;

      logger.info('[CommandRegistry] Command executed', {
        name: cmd.name,
        success: result.success,
        executionMs,
      });

      return result;
    } catch (error) {
      logger.error('[CommandRegistry] Command execution failed', {
        name: cmd.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        message: `Command failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Check if a command is registered
   */
  has(name: CommandName): boolean {
    return this.commands.has(name);
  }

  /**
   * Get command options
   */
  getOptions(name: CommandName): CommandOptions | undefined {
    return this.commands.get(name)?.options;
  }

  /**
   * Check if a command is destructive
   */
  isDestructive(name: CommandName): boolean {
    return this.commands.get(name)?.options.isDestructive ?? false;
  }

  /**
   * Check if a command requires expanded features
   */
  requiresExpanded(name: CommandName): boolean {
    return this.commands.get(name)?.options.requiresExpanded ?? false;
  }

  /**
   * Get all registered command names
   */
  getCommandNames(): CommandName[] {
    return Array.from(this.commands.keys());
  }

  /**
   * Get available commands (respecting feature flags)
   */
  getAvailableCommands(): CommandName[] {
    return Array.from(this.commands.entries())
      .filter(([_, reg]) => !reg.options.requiresExpanded || OPENCLAW_EXPANDED)
      .map(([name]) => name);
  }

  /**
   * Get commands by category
   */
  getCommandsByCategory(): Map<CommandCategory, Array<{ name: CommandName; options: CommandOptions }>> {
    const byCategory = new Map<CommandCategory, Array<{ name: CommandName; options: CommandOptions }>>();

    for (const [name, { options }] of this.commands.entries()) {
      // Skip if requires expanded and not enabled
      if (options.requiresExpanded && !OPENCLAW_EXPANDED) {
        continue;
      }

      const category = options.category ?? 'help';
      const existing = byCategory.get(category) ?? [];
      existing.push({ name, options });
      byCategory.set(category, existing);
    }

    return byCategory;
  }

  /**
   * Generate help text for all commands
   */
  generateHelp(): string {
    const byCategory = this.getCommandsByCategory();
    const lines: string[] = ['Available Commands:', ''];

    const categoryOrder: CommandCategory[] = [
      'monitoring',
      'execution',
      'policy',
      'tier',
      'agent',
      'protocol',
      'budget',
      'guarantee',
      'delegation',
      'heartbeat',
      'report',
      'safety',
      'help',
    ];

    const categoryLabels: Record<CommandCategory, string> = {
      monitoring: 'Monitoring & Status',
      execution: 'Execution',
      policy: 'Policy Management',
      tier: 'Tier Management',
      agent: 'Agent Management',
      protocol: 'Protocol Management',
      budget: 'Budget & Funding',
      guarantee: 'Execution Guarantees',
      delegation: 'Delegations',
      heartbeat: 'Liveness & Heartbeat',
      report: 'Reports & Audit',
      safety: 'Safety & Confirmation',
      help: 'Help',
    };

    for (const category of categoryOrder) {
      const commands = byCategory.get(category);
      if (!commands || commands.length === 0) continue;

      lines.push(`[${categoryLabels[category]}]`);

      for (const { name, options } of commands) {
        const desc = options.description ?? '';
        const destructive = options.isDestructive ? ' (!)' : '';
        lines.push(`  ${name}${destructive} - ${desc}`);

        if (options.examples && options.examples.length > 0) {
          for (const example of options.examples.slice(0, 2)) {
            lines.push(`    e.g., "${example}"`);
          }
        }
      }

      lines.push('');
    }

    if (!OPENCLAW_EXPANDED) {
      lines.push('Note: Some commands require OPENCLAW_EXPANDED=true');
    }

    return lines.join('\n');
  }

  /**
   * Generate help text for a specific command
   */
  generateCommandHelp(name: CommandName): string | null {
    const registered = this.commands.get(name);
    if (!registered) return null;

    const { options } = registered;
    const lines: string[] = [
      `Command: ${name}`,
      '',
      options.description ?? 'No description available.',
      '',
    ];

    if (options.isDestructive) {
      lines.push('Warning: This is a destructive command and requires confirmation.');
      lines.push('');
    }

    if (options.requiresExpanded) {
      lines.push('Note: Requires OPENCLAW_EXPANDED=true');
      lines.push('');
    }

    if (options.examples && options.examples.length > 0) {
      lines.push('Examples:');
      for (const example of options.examples) {
        lines.push(`  "${example}"`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Clear all registered commands (for testing)
   */
  clear(): void {
    this.commands.clear();
  }
}

/**
 * Global command registry instance
 */
export const commandRegistry = new CommandRegistry();

/**
 * Helper to register a command
 */
export function registerCommand(
  name: CommandName,
  handler: CommandHandler,
  options: CommandOptions = {}
): void {
  commandRegistry.register(name, handler, options);
}

/**
 * Helper to execute a command
 */
export async function executeRegisteredCommand(
  cmd: ParsedCommand,
  sessionId?: string
): Promise<CommandResult> {
  return commandRegistry.execute(cmd, sessionId);
}
