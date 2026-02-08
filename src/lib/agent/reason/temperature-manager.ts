/**
 * Temperature Management - Context-aware creativity settings
 *
 * Adjusts LLM temperature based on context to enable creativity where safe
 * while maintaining deterministic behavior for financial decisions.
 *
 * Temperature Scale:
 * - 0.2: Deterministic, consistent (financial decisions)
 * - 0.5: Balanced clarity + personality (alerts)
 * - 0.7: Conversational, helpful (engagement)
 * - 0.8: Creative, diverse (social posts)
 */

import { logger } from '../../logger';

export type TemperatureContext = 'financial' | 'social' | 'engagement' | 'alert';

/**
 * Temperature settings per context
 */
const TEMPERATURE_MAP: Record<TemperatureContext, number> = {
  financial: 0.2,    // Safety critical - sponsorship decisions, swaps
  social: 0.8,       // Creative posts - Farcaster updates, announcements
  engagement: 0.7,   // Conversational - Moltbook replies, discussions
  alert: 0.5,        // Clear + personality - emergency alerts, warnings
};

/**
 * Get contextual temperature for LLM calls
 *
 * @param context - The context type (financial, social, engagement, alert)
 * @returns Temperature value (0-1)
 */
export function getContextualTemperature(context: TemperatureContext): number {
  const temperature = TEMPERATURE_MAP[context];

  logger.debug('[Temperature] Selected temperature for context', {
    context,
    temperature,
  });

  return temperature;
}

/**
 * Validate temperature is within acceptable range
 *
 * @param temperature - Temperature value to validate
 * @returns true if valid, false otherwise
 */
export function isValidTemperature(temperature: number): boolean {
  return temperature >= 0 && temperature <= 1;
}

/**
 * Get temperature description for logging/debugging
 *
 * @param context - The context type
 * @returns Human-readable description
 */
export function getTemperatureDescription(context: TemperatureContext): string {
  const descriptions: Record<TemperatureContext, string> = {
    financial: 'Deterministic and consistent (safety critical)',
    social: 'Creative and diverse (public posts)',
    engagement: 'Conversational and helpful (community interaction)',
    alert: 'Clear with personality (notifications)',
  };

  return descriptions[context];
}

/**
 * Determine context from action type
 *
 * @param actionType - Type of action being performed
 * @returns Appropriate temperature context
 */
export function getContextFromAction(
  actionType:
    | 'SPONSOR_TRANSACTION'
    | 'SWAP_RESERVES'
    | 'ALERT_PROTOCOL'
    | 'WAIT'
    | 'FARCASTER_POST'
    | 'MOLTBOOK_REPLY'
    | 'EMERGENCY_ALERT'
): TemperatureContext {
  const contextMap: Record<string, TemperatureContext> = {
    SPONSOR_TRANSACTION: 'financial',
    SWAP_RESERVES: 'financial',
    ALERT_PROTOCOL: 'alert',
    WAIT: 'financial',
    FARCASTER_POST: 'social',
    MOLTBOOK_REPLY: 'engagement',
    EMERGENCY_ALERT: 'alert',
  };

  return contextMap[actionType] || 'financial'; // Default to most conservative
}

/**
 * Log temperature selection with context
 *
 * @param context - The context type
 * @param model - The model being used
 */
export function logTemperatureSelection(
  context: TemperatureContext,
  model: string
): void {
  const temperature = getContextualTemperature(context);
  const description = getTemperatureDescription(context);

  logger.info('[Temperature] LLM configuration', {
    context,
    temperature,
    description,
    model,
  });
}

/**
 * Get recommended temperature for custom use cases
 *
 * @param useCase - Description of the use case
 * @returns Recommended temperature and context
 */
export function getRecommendedTemperature(useCase: string): {
  temperature: number;
  context: TemperatureContext;
  reason: string;
} {
  const useCaseLower = useCase.toLowerCase();

  // Financial/transactional patterns
  if (
    useCaseLower.includes('sponsor') ||
    useCaseLower.includes('swap') ||
    useCaseLower.includes('transaction') ||
    useCaseLower.includes('execute')
  ) {
    return {
      temperature: 0.2,
      context: 'financial',
      reason: 'Financial decision requires deterministic behavior',
    };
  }

  // Social media patterns
  if (
    useCaseLower.includes('farcaster') ||
    useCaseLower.includes('cast') ||
    useCaseLower.includes('post') ||
    useCaseLower.includes('announce')
  ) {
    return {
      temperature: 0.8,
      context: 'social',
      reason: 'Social post benefits from creative, diverse output',
    };
  }

  // Engagement patterns
  if (
    useCaseLower.includes('moltbook') ||
    useCaseLower.includes('reply') ||
    useCaseLower.includes('comment') ||
    useCaseLower.includes('conversation')
  ) {
    return {
      temperature: 0.7,
      context: 'engagement',
      reason: 'Community engagement requires conversational tone',
    };
  }

  // Alert patterns
  if (
    useCaseLower.includes('alert') ||
    useCaseLower.includes('warning') ||
    useCaseLower.includes('emergency') ||
    useCaseLower.includes('notify')
  ) {
    return {
      temperature: 0.5,
      context: 'alert',
      reason: 'Alerts need clarity with some personality',
    };
  }

  // Default to financial (most conservative)
  return {
    temperature: 0.2,
    context: 'financial',
    reason: 'Unknown use case - defaulting to conservative temperature',
  };
}
