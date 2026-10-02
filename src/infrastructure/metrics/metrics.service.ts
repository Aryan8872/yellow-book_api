import { Injectable, OnModuleInit } from '@nestjs/common';
import * as client from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry: client.Registry;

  public readonly httpRequestsTotal: client.Counter;
  public readonly httpRequestDurationMicroseconds: client.Histogram;
  public readonly redemptionsTotal: client.Counter;
  public readonly activeRedemptionSessions: client.Gauge;
  public readonly fraudFlagsTotal: client.Counter;
  public readonly offersCreated: client.Counter;

  constructor() {
    this.registry = new client.Registry();

    // Default Node.js system metrics (CPU, Memory, Event Loop Lag)
    client.collectDefaultMetrics({ register: this.registry });

    // Custom HTTP request counter
    this.httpRequestsTotal = new client.Counter({
      name: 'offernepal_http_requests_total',
      help: 'Total number of HTTP requests handled by OfferNepal API',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    // Custom HTTP latency histogram
    this.httpRequestDurationMicroseconds = new client.Histogram({
      name: 'offernepal_http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
      registers: [this.registry],
    });

    // Voucher & Redemption Domain Metrics
    this.redemptionsTotal = new client.Counter({
      name: 'offernepal_redemptions_total',
      help: 'Total count of completed voucher redemptions',
      labelNames: ['merchant_id', 'status'],
      registers: [this.registry],
    });

    this.activeRedemptionSessions = new client.Gauge({
      name: 'offernepal_active_redemption_sessions',
      help: 'Current active redemption sessions pending merchant validation',
      registers: [this.registry],
    });

    this.fraudFlagsTotal = new client.Counter({
      name: 'offernepal_fraud_flags_total',
      help: 'Count of triggered anti-fraud alerts (e.g. geo mismatch, pin brute force)',
      labelNames: ['reason', 'severity'],
      registers: [this.registry],
    });

    // Offer Management Metrics
    this.offersCreated = new client.Counter({
      name: 'offernepal_offers_created_total',
      help: 'Total count of offers created or deleted',
      labelNames: ['merchant_id', 'status'],
      registers: [this.registry],
    });
  }

  onModuleInit() {}

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
