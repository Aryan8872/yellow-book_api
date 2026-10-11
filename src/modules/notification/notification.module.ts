import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import {
  EMAIL_PROVIDER,
  EmailProviderDefinition,
} from './providers/email-provider.token';

/**
 * Transactional email module (D-01).
 *
 * The concrete transport is bound to `EMAIL_PROVIDER`; tests override that token
 * with a fake instead of reaching the network.
 */
@Module({
  imports: [ConfigModule],
  providers: [NotificationsService, EmailProviderDefinition],
  exports: [NotificationsService],
})
export class NotificationModule {}
