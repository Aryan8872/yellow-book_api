import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { EMAIL_PROVIDER } from './providers/email-provider.token';
import type { EmailProvider, OutboundEmail } from './providers/email-provider.interface';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let provider: { send: jest.Mock };
  let sent: OutboundEmail[];

  const user = { email: 'customer@example.com', name: 'Sita' };

  beforeEach(async () => {
    sent = [];
    provider = {
      send: jest.fn((message: OutboundEmail) => {
        sent.push(message);
        return Promise.resolve();
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: EMAIL_PROVIDER, useValue: provider as EmailProvider },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('https://api.example.com') },
        },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('sendPasswordReset', () => {
    it('sends a reset email carrying the raw token in a link', async () => {
      await service.sendPasswordReset(user, 'raw-reset-token');

      expect(provider.send).toHaveBeenCalledTimes(1);
      const [message] = sent;
      expect(message.to).toBe(user.email);
      expect(message.subject).toContain('Reset your');
      expect(message.html).toContain('token=raw-reset-token');
      expect(message.text).toContain('token=raw-reset-token');
      // The raw token is the only place the secret appears; nothing else leaks.
      expect(message.html).not.toContain('resend');
    });

    it('greets without a name when the recipient has none', async () => {
      await service.sendPasswordReset({ email: 'anon@example.com' }, 't');

      expect(sent[0].text).toContain('Hi,');
    });
  });

  describe('sendEmailVerification', () => {
    it('sends a verification email carrying the raw token in a link', async () => {
      await service.sendEmailVerification(user, 'raw-verify-token');

      expect(provider.send).toHaveBeenCalledTimes(1);
      const [message] = sent;
      expect(message.to).toBe(user.email);
      expect(message.subject).toContain('Verify your');
      expect(message.html).toContain('token=raw-verify-token');
      expect(message.text).toContain('token=raw-verify-token');
    });
  });

  describe('failure isolation', () => {
    it('swallows provider errors so callers cannot be used as an oracle', async () => {
      provider.send.mockRejectedValue(new Error('provider down'));

      await expect(
        service.sendPasswordReset(user, 'raw-reset-token'),
      ).resolves.toBeUndefined();
      await expect(
        service.sendEmailVerification(user, 'raw-verify-token'),
      ).resolves.toBeUndefined();
    });
  });
});
