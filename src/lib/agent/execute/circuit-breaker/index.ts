/**
 * Circuit Breaker Module - Economic Health Checks
 *
 * Prevents execution during unfavorable economic conditions:
 * - High gas prices (>5 Gwei with hysteresis)
 * - Low reserve runway (<24 hours)
 * - Critical protocol budget depletion
 */

export { EconomicCircuitBreaker, getEconomicBreaker, type RunwayEstimate } from './economic-breaker';
