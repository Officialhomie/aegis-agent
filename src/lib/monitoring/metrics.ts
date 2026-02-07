/**
 * Aegis Agent - Monitoring Metrics
 *
 * Tracks sponsorship latency, success rate, and other key metrics.
 * In-memory storage with periodic persistence option.
 */

import { logger } from '../logger';

/**
 * Metric types for categorization.
 */
export type MetricType = 'counter' | 'gauge' | 'histogram';

/**
 * Single metric data point.
 */
interface MetricPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

/**
 * Histogram bucket configuration.
 */
interface HistogramBuckets {
  boundaries: number[];
  counts: number[];
  sum: number;
  count: number;
}

/**
 * Metric storage.
 */
interface MetricData {
  type: MetricType;
  name: string;
  description: string;
  points: MetricPoint[];
  histogram?: HistogramBuckets;
}

// In-memory metrics store
const metricsStore = new Map<string, MetricData>();

// Default histogram buckets for latency (ms)
const LATENCY_BUCKETS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];

// Retention period for metrics (1 hour)
const METRICS_RETENTION_MS = 60 * 60 * 1000;

/**
 * Initialize a counter metric.
 */
export function initCounter(name: string, description: string): void {
  if (!metricsStore.has(name)) {
    metricsStore.set(name, {
      type: 'counter',
      name,
      description,
      points: [],
    });
  }
}

/**
 * Initialize a gauge metric.
 */
export function initGauge(name: string, description: string): void {
  if (!metricsStore.has(name)) {
    metricsStore.set(name, {
      type: 'gauge',
      name,
      description,
      points: [],
    });
  }
}

/**
 * Initialize a histogram metric.
 */
export function initHistogram(
  name: string,
  description: string,
  buckets: number[] = LATENCY_BUCKETS
): void {
  if (!metricsStore.has(name)) {
    metricsStore.set(name, {
      type: 'histogram',
      name,
      description,
      points: [],
      histogram: {
        boundaries: buckets,
        counts: new Array(buckets.length + 1).fill(0),
        sum: 0,
        count: 0,
      },
    });
  }
}

/**
 * Increment a counter.
 */
export function incrementCounter(
  name: string,
  value: number = 1,
  labels?: Record<string, string>
): void {
  const metric = metricsStore.get(name);
  if (!metric || metric.type !== 'counter') {
    logger.warn('[Metrics] Counter not found or wrong type', { name });
    return;
  }

  metric.points.push({
    timestamp: Date.now(),
    value,
    labels,
  });
}

/**
 * Set a gauge value.
 */
export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>
): void {
  const metric = metricsStore.get(name);
  if (!metric || metric.type !== 'gauge') {
    logger.warn('[Metrics] Gauge not found or wrong type', { name });
    return;
  }

  metric.points.push({
    timestamp: Date.now(),
    value,
    labels,
  });
}

/**
 * Record a histogram observation.
 */
export function recordHistogram(
  name: string,
  value: number,
  labels?: Record<string, string>
): void {
  const metric = metricsStore.get(name);
  if (!metric || metric.type !== 'histogram' || !metric.histogram) {
    logger.warn('[Metrics] Histogram not found or wrong type', { name });
    return;
  }

  // Record point
  metric.points.push({
    timestamp: Date.now(),
    value,
    labels,
  });

  // Update histogram buckets
  const buckets = metric.histogram;
  buckets.sum += value;
  buckets.count += 1;

  // Find bucket and increment
  let bucketIndex = buckets.boundaries.length;
  for (let i = 0; i < buckets.boundaries.length; i++) {
    if (value <= buckets.boundaries[i]) {
      bucketIndex = i;
      break;
    }
  }
  buckets.counts[bucketIndex] += 1;
}

/**
 * Get metric statistics.
 */
export function getMetricStats(name: string, windowMs: number = METRICS_RETENTION_MS): {
  count: number;
  sum: number;
  avg: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} | null {
  const metric = metricsStore.get(name);
  if (!metric) return null;

  const cutoff = Date.now() - windowMs;
  const values = metric.points
    .filter((p) => p.timestamp >= cutoff)
    .map((p) => p.value)
    .sort((a, b) => a - b);

  if (values.length === 0) {
    return { count: 0, sum: 0, avg: 0, min: 0, max: 0, p50: 0, p95: 0, p99: 0 };
  }

  const sum = values.reduce((a, b) => a + b, 0);
  const count = values.length;

  return {
    count,
    sum,
    avg: sum / count,
    min: values[0],
    max: values[count - 1],
    p50: values[Math.floor(count * 0.5)] ?? 0,
    p95: values[Math.floor(count * 0.95)] ?? values[count - 1],
    p99: values[Math.floor(count * 0.99)] ?? values[count - 1],
  };
}

/**
 * Get counter total.
 */
export function getCounterTotal(name: string, windowMs: number = METRICS_RETENTION_MS): number {
  const metric = metricsStore.get(name);
  if (!metric || metric.type !== 'counter') return 0;

  const cutoff = Date.now() - windowMs;
  return metric.points
    .filter((p) => p.timestamp >= cutoff)
    .reduce((sum, p) => sum + p.value, 0);
}

/**
 * Get latest gauge value.
 */
export function getGaugeValue(name: string): number | null {
  const metric = metricsStore.get(name);
  if (!metric || metric.type !== 'gauge' || metric.points.length === 0) return null;

  return metric.points[metric.points.length - 1].value;
}

/**
 * Clean up old metric points.
 */
export function cleanupMetrics(): void {
  const cutoff = Date.now() - METRICS_RETENTION_MS;

  for (const metric of metricsStore.values()) {
    metric.points = metric.points.filter((p) => p.timestamp >= cutoff);
  }
}

// Clean up every 5 minutes
setInterval(cleanupMetrics, 5 * 60 * 1000);

// ============================================
// AEGIS-SPECIFIC METRICS
// ============================================

// Initialize standard metrics
initCounter('aegis_sponsorship_total', 'Total sponsorship requests');
initCounter('aegis_sponsorship_success', 'Successful sponsorship requests');
initCounter('aegis_sponsorship_failed', 'Failed sponsorship requests');
initHistogram('aegis_sponsorship_latency_ms', 'Sponsorship request latency in milliseconds');
initHistogram('aegis_bundler_latency_ms', 'Bundler submission latency in milliseconds');
initGauge('aegis_active_protocols', 'Number of active protocols');
initGauge('aegis_total_sponsored_usd', 'Total USD value sponsored');
initCounter('aegis_policy_violations', 'Policy violation count');
initCounter('aegis_circuit_breaker_trips', 'Circuit breaker trip count');

/**
 * Record a sponsorship attempt with outcome.
 */
export function recordSponsorship(opts: {
  success: boolean;
  latencyMs: number;
  protocolId: string;
  amountUSD?: number;
  error?: string;
}): void {
  const { success, latencyMs, protocolId, amountUSD, error } = opts;

  incrementCounter('aegis_sponsorship_total', 1, { protocol: protocolId });
  recordHistogram('aegis_sponsorship_latency_ms', latencyMs, { protocol: protocolId });

  if (success) {
    incrementCounter('aegis_sponsorship_success', 1, { protocol: protocolId });
    if (amountUSD) {
      const current = getGaugeValue('aegis_total_sponsored_usd') ?? 0;
      setGauge('aegis_total_sponsored_usd', current + amountUSD);
    }
  } else {
    incrementCounter('aegis_sponsorship_failed', 1, { protocol: protocolId, error: error ?? 'unknown' });
  }

  logger.debug('[Metrics] Recorded sponsorship', {
    success,
    latencyMs,
    protocolId,
    amountUSD,
  });
}

/**
 * Record bundler submission timing.
 */
export function recordBundlerLatency(latencyMs: number, success: boolean): void {
  recordHistogram('aegis_bundler_latency_ms', latencyMs, { success: String(success) });
}

/**
 * Record a policy violation.
 */
export function recordPolicyViolation(rule: string, protocolId: string): void {
  incrementCounter('aegis_policy_violations', 1, { rule, protocol: protocolId });
}

/**
 * Record a circuit breaker trip.
 */
export function recordCircuitBreakerTrip(component: string): void {
  incrementCounter('aegis_circuit_breaker_trips', 1, { component });
}

/**
 * Get sponsorship success rate.
 */
export function getSponsorshipSuccessRate(windowMs: number = METRICS_RETENTION_MS): number {
  const total = getCounterTotal('aegis_sponsorship_total', windowMs);
  const success = getCounterTotal('aegis_sponsorship_success', windowMs);

  if (total === 0) return 1.0; // No requests = 100% success rate
  return success / total;
}

/**
 * Get all metrics as a summary object.
 */
export function getMetricsSummary(): {
  sponsorship: {
    total: number;
    success: number;
    failed: number;
    successRate: number;
    latency: ReturnType<typeof getMetricStats>;
  };
  bundler: {
    latency: ReturnType<typeof getMetricStats>;
  };
  health: {
    policyViolations: number;
    circuitBreakerTrips: number;
  };
} {
  return {
    sponsorship: {
      total: getCounterTotal('aegis_sponsorship_total'),
      success: getCounterTotal('aegis_sponsorship_success'),
      failed: getCounterTotal('aegis_sponsorship_failed'),
      successRate: getSponsorshipSuccessRate(),
      latency: getMetricStats('aegis_sponsorship_latency_ms'),
    },
    bundler: {
      latency: getMetricStats('aegis_bundler_latency_ms'),
    },
    health: {
      policyViolations: getCounterTotal('aegis_policy_violations'),
      circuitBreakerTrips: getCounterTotal('aegis_circuit_breaker_trips'),
    },
  };
}

/**
 * Reset all metrics (for testing).
 */
export function resetMetrics(): void {
  metricsStore.clear();

  // Re-initialize standard metrics
  initCounter('aegis_sponsorship_total', 'Total sponsorship requests');
  initCounter('aegis_sponsorship_success', 'Successful sponsorship requests');
  initCounter('aegis_sponsorship_failed', 'Failed sponsorship requests');
  initHistogram('aegis_sponsorship_latency_ms', 'Sponsorship request latency in milliseconds');
  initHistogram('aegis_bundler_latency_ms', 'Bundler submission latency in milliseconds');
  initGauge('aegis_active_protocols', 'Number of active protocols');
  initGauge('aegis_total_sponsored_usd', 'Total USD value sponsored');
  initCounter('aegis_policy_violations', 'Policy violation count');
  initCounter('aegis_circuit_breaker_trips', 'Circuit breaker trip count');
}
