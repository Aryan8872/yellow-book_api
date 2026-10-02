import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID:
        config.get<string>('GOOGLE_CLIENT_ID') || 'mock-google-client-id',
      clientSecret:
        config.get<string>('GOOGLE_CLIENT_SECRET') || 'mock-google-secret',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ||
        'http://localhost:3000/api/v1/auth/google/callback',
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ): Promise<any> {
    const { id, name, emails } = profile;
    const email = emails && emails[0] ? emails[0].value : `${id}@google.user`;
    const fullName = name
      ? `${name.givenName || ''} ${name.familyName || ''}`.trim()
      : 'Google User';

    return this.authService.validateOAuthLogin({
      provider: 'google',
      providerId: id,
      email,
      name: fullName,
    });
  }
}
