import { Injectable, Inject, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EMAIL_PROVIDER } from './providers/email-provider.token';
import type { EmailProvider, OutboundEmail } from './providers/email-provider.interface';
import { NOTIFICATION_CONSTANTS } from './notification.constants';

/** Minimum shape of a recipient. Deliberately not a Prisma model type. */
export interface EmailRecipient {
  email: string;
  name?: string | null;
}

/**
 * Domain-facing transactional email API (D-01).
 *
 * Call sites use `sendPasswordReset(user, token)` /
 * `sendEmailVerification(user, token)` and never touch a provider shape. Email
 * failures are logged and swallowed so that a provider outage cannot turn a
 * generic 202 response into an account-enumeration oracle (T-02-01).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @Inject(EMAIL_PROVIDER) private readonly emailProvider: EmailProvider,
    private readonly config: ConfigService,
  ) {}

  /**
   * Sends a single-use password-reset link.
   *
   * @param user Recipient of the reset email
   * @param token Raw (un-hashed) reset token. Never logged, never stored raw.
   */
  async sendPasswordReset(
    user: EmailRecipient,
    token: string,
  ): Promise<void> {
    const resetUrl = this.buildUrl('/reset-password', { token });

    await this.dispatch(
      {
        to: user.email,
        subject: `Reset your ${NOTIFICATION_CONSTANTS.PRODUCT_NAME} password`,
        tag: 'password-reset',
        text:
          `Hi${greet(user)},\n\n` +
          `We received a request to reset your ${NOTIFICATION_CONSTANTS.PRODUCT_NAME} password.\n` +
          `Use the link below to choose a new one. It expires in ` +
          `${NOTIFICATION_CONSTANTS.PASSWORD_RESET_MINUTES} minutes and can be used once.\n\n` +
          `${resetUrl}\n\n` +
          `If you did not request this, you can safely ignore this email.\n`,
        html: renderEmail({
          heading: 'Reset your password',
          greeting: `Hi${greet(user)},`,
          body:
            `We received a request to reset your ${NOTIFICATION_CONSTANTS.PRODUCT_NAME} password. ` +
            `Choose a new one using the button below. This link expires in ` +
            `<strong>${NOTIFICATION_CONSTANTS.PASSWORD_RESET_MINUTES} minutes</strong> and can be used once.`,
          ctaLabel: 'Reset password',
          ctaUrl: resetUrl,
          footer:
            'If you did not request a password reset, you can safely ignore this email.',
        }),
      },
      'password reset',
    );
  }

  /**
   * Sends a single-use email-verification link.
   *
   * @param user Recipient of the verification email
   * @param token Raw (un-hashed) verification token.
   */
  async sendEmailVerification(
    user: EmailRecipient,
    token: string,
  ): Promise<void> {
    const verifyUrl = this.buildUrl('/verify-email', { token });

    await this.dispatch(
      {
        to: user.email,
        subject: `Verify your ${NOTIFICATION_CONSTANTS.PRODUCT_NAME} email`,
        tag: 'email-verification',
        text:
          `Hi${greet(user)},\n\n` +
          `Confirm your email address to finish setting up your ${NOTIFICATION_CONSTANTS.PRODUCT_NAME} account.\n` +
          `The link expires in ${NOTIFICATION_CONSTANTS.EMAIL_VERIFICATION_HOURS} hours.\n\n` +
          `${verifyUrl}\n`,
        html: renderEmail({
          heading: 'Verify your email',
          greeting: `Hi${greet(user)},`,
          body:
            `Confirm your email address to finish setting up your ` +
            `${NOTIFICATION_CONSTANTS.PRODUCT_NAME} account. This link expires in ` +
            `<strong>${NOTIFICATION_CONSTANTS.EMAIL_VERIFICATION_HOURS} hours</strong>.`,
          ctaLabel: 'Verify email',
          ctaUrl: verifyUrl,
          footer: 'If you did not create an account, you can ignore this email.',
        }),
      },
      'email verification',
    );
  }

  /**
   * Never throws: a broken mail provider must not break the caller's flow nor
   * leak whether an account exists.
   */
  private async dispatch(
    message: OutboundEmail,
    kind: string,
  ): Promise<void> {
    try {
      await this.emailProvider.send(message);
    } catch (err) {
      this.logger.error(
        `Failed to send ${kind} email to ${message.to}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  private buildUrl(path: string, params: Record<string, string>): string {
    const base =
      this.config.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    const query = new URLSearchParams(params).toString();
    return `${base.replace(/\/+$/, '')}${path}?${query}`;
  }
}

function greet(user: EmailRecipient): string {
  return user.name ? ` ${user.name}` : '';
}

/**
 * Minimal inline HTML shell. Kept local to this module so no template-engine
 * dependency is introduced.
 */
function renderEmail(options: {
  heading: string;
  greeting: string;
  body: string;
  ctaLabel: string;
  ctaUrl: string;
  footer: string;
}): string {
  const brand = NOTIFICATION_CONSTANTS.PRODUCT_NAME;
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px;">
      <h1 style="font-size:20px;margin:0 0 16px 0;">${brand}</h1>
      <h2 style="font-size:18px;margin:0 0 12px 0;">${options.heading}</h2>
      <p style="margin:0 0 12px 0;">${options.greeting}</p>
      <p style="margin:0 0 24px 0;line-height:1.5;">${options.body}</p>
      <p style="margin:0 0 24px 0;">
        <a href="${options.ctaUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;">${options.ctaLabel}</a>
      </p>
      <p style="font-size:12px;color:#6b7280;margin:0;line-height:1.5;">${options.footer}</p>
    </div>
  </body>
</html>`;
}
