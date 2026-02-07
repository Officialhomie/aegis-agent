/**
 * Deep Health Check Endpoint
 *
 * Performs comprehensive health check of all system components.
 * Use for monitoring, alerting, and load balancer health checks.
 *
 * GET /api/health/deep
 *
 * Returns:
 * - 200 OK: All components healthy
 * - 503 Service Unavailable: Critical component unhealthy
 *
 * Query params:
 * - quick=true: Fast health check (database only)
 * - format=prometheus: Prometheus-compatible metrics format
 */

import { NextResponse } from 'next/server';
import {
  performHealthCheck,
  performQuickHealthCheck,
  type SystemHealth,
} from '@/src/lib/monitoring/health';
import { getMetricsSummary } from '@/src/lib/monitoring/metrics';
import { logger } from '@/src/lib/logger';

/**
 * Convert health check to Prometheus format.
 */
function toPrometheusFormat(health: SystemHealth): string {
  const lines: string[] = [];

  // System status (1 = healthy, 0 = unhealthy)
  lines.push('# HELP aegis_system_healthy System health status');
  lines.push('# TYPE aegis_system_healthy gauge');
  lines.push(`aegis_system_healthy ${health.status === 'healthy' ? 1 : 0}`);

  // Uptime
  lines.push('# HELP aegis_uptime_seconds System uptime in seconds');
  lines.push('# TYPE aegis_uptime_seconds counter');
  lines.push(`aegis_uptime_seconds ${Math.floor(health.uptime / 1000)}`);

  // Component status
  lines.push('# HELP aegis_component_healthy Component health status');
  lines.push('# TYPE aegis_component_healthy gauge');
  for (const component of health.components) {
    const value = component.status === 'healthy' ? 1 : component.status === 'degraded' ? 0.5 : 0;
    lines.push(`aegis_component_healthy{component="${component.name}"} ${value}`);
  }

  // Component latency
  lines.push('# HELP aegis_component_latency_ms Component response latency in milliseconds');
  lines.push('# TYPE aegis_component_latency_ms gauge');
  for (const component of health.components) {
    if (component.latencyMs !== undefined) {
      lines.push(`aegis_component_latency_ms{component="${component.name}"} ${component.latencyMs}`);
    }
  }

  // Sponsorship metrics
  lines.push('# HELP aegis_sponsorship_success_rate Sponsorship success rate');
  lines.push('# TYPE aegis_sponsorship_success_rate gauge');
  lines.push(`aegis_sponsorship_success_rate ${health.metrics.sponsorshipSuccessRate}`);

  if (health.metrics.p95LatencyMs !== null) {
    lines.push('# HELP aegis_sponsorship_p95_latency_ms P95 sponsorship latency');
    lines.push('# TYPE aegis_sponsorship_p95_latency_ms gauge');
    lines.push(`aegis_sponsorship_p95_latency_ms ${health.metrics.p95LatencyMs}`);
  }

  return lines.join('\n');
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const isQuick = searchParams.get('quick') === 'true';
  const format = searchParams.get('format');

  try {
    // Quick health check
    if (isQuick) {
      const health = await performQuickHealthCheck();

      return NextResponse.json(health, {
        status: health.status === 'healthy' ? 200 : 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      });
    }

    // Full health check
    const health = await performHealthCheck();

    // Log health check result
    if (health.status !== 'healthy') {
      logger.warn('[HealthCheck] System not fully healthy', {
        status: health.status,
        unhealthy: health.components
          .filter((c) => c.status !== 'healthy')
          .map((c) => c.name),
      });
    }

    // Prometheus format
    if (format === 'prometheus') {
      return new Response(toPrometheusFormat(health), {
        status: health.status === 'unhealthy' ? 503 : 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        },
      });
    }

    // JSON format (default)
    return NextResponse.json(health, {
      status: health.status === 'unhealthy' ? 503 : 200,
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('[HealthCheck] Health check failed', { error: message });

    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: message,
      },
      {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}

/**
 * Metrics endpoint for detailed statistics.
 */
export async function POST() {
  try {
    const metrics = getMetricsSummary();

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      metrics,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
