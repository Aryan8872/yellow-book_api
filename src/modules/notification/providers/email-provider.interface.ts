/**
 * Transactional email contract.
 *
 * The notification module is deliberately provider-agnostic: call sites talk to
 * `NotificationsService` and the concrete transport (Resend today, something
 * else tomorrow) lives behind this interface. No provider SDK types are allowed
 * to escape this boundary (D-01 / T-02-08).
 */

export interface OutboundEmail {
  /** Recipient address. */
  to: string;
  /** Subject line. */
  subject: string;
  /** Pre-rendered HTML body. */
  html: string;
  /** Plain-text alternative body. */
  text?: string;
  /** Optional logical name used for logging / provider tagging. */
  tag?: string;
}

export interface EmailProvider {
  /**
   * Delivers a transactional email. Implementations must throw on failure so
   * the caller can decide whether the failure is fatal.
   */
  send(message: OutboundEmail): Promise<void>;
}
