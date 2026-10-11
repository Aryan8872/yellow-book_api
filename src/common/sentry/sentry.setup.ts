/**
 * Sentry Error Tracking & Performance Monitoring initialization.
 *
 * Initialized once, as early as possible in the application bootstrap,
 * so that instrumentation captures errors from all modules.
 *
 * Configuration is entirely environment-driven:
 *   - SENTRY_DSN: Sentry project DSN. When unset, Sentry is disabled (no-op).
 *   - SENTRY_TRACES_SAMPLE_RATE: performance monitoring sample rate (0.0 - 1.0).
 *   - SENTRY_ENVIRONMENT: optional environment tag (defaults to NODE_ENV).
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nestjs/
 */
import * as Sentry from '@sentry/node';

export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    // Sentry is optional; the app runs fine without it.
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: process.env.SENTRY_RELEASE || process.env.npm_package_version,
    // Performance monitoring sample rate (0.0 disables tracing).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    integrations: [Sentry.httpIntegration(), Sentry.expressIntegration()],
    // Never send PII / secrets to Sentry.
    sendDefaultPii: false,
  });
}

export { Sentry };
