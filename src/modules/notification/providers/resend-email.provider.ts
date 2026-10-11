import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { EmailProvider, OutboundEmail } from './email-provider.interface';

/**
 * Resend-backed transactional email transport.
 *
 * IMPORTANT (T-02-08): this is the **only** file in the codebase allowed to
 * import the `resend` SDK. The API key is read from the server environment and
 * never returned to a client. Call sites depend on `EmailProvider`, never on a
 * Resend shape.
 */
@Injectable()
export class ResendEmailProvider implements EmailProvider {
  private readonly logger = new Logger(ResendEmailProvider.name);
  private readonly client: Resend | null;
  private readonly from: string | undefined;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    this.from = this.config.get<string>('EMAIL_FROM');

    if (!apiKey || !this.from) {
      // Mirrors CloudinaryService: missing credentials disable the integration
      // rather than crashing the whole API at boot.
      this.logger.warn(
        'RESEND_API_KEY / EMAIL_FROM missing. Transactional email is disabled.',
      );
      this.client = null;
      return;
    }

    this.client = new Resend(apiKey);
  }

  async send(message: OutboundEmail): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `Email provider not configured, skipping send (${message.tag ?? 'no-tag'})`,
      );
      return;
    }

    const { data, error } = await this.client.emails.send({
      from: this.from as string,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
    });

    if (error) {
      this.logger.error(
        `Failed to send email (${message.tag ?? 'no-tag'}): ${error.message}`,
      );
      throw new Error(
        `Email delivery failed (${message.tag ?? 'no-tag'}): ${error.message}`,
      );
    }

    this.logger.log(
      `Email sent (${message.tag ?? 'no-tag'}) id=${data?.id ?? 'unknown'}`,
    );
  }
}
