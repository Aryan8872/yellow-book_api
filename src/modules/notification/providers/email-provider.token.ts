import type { Provider } from '@nestjs/common';
import { EmailProvider } from './email-provider.interface';
import { ResendEmailProvider } from './resend-email.provider';

/**
 * DI token for the transactional email transport. Registered so tests can swap
 * in a no-op/fake provider without touching the notification service.
 */
export const EMAIL_PROVIDER = 'EMAIL_PROVIDER';

export const EmailProviderDefinition: Provider = {
  provide: EMAIL_PROVIDER,
  useClass: ResendEmailProvider,
};

export type { EmailProvider };
