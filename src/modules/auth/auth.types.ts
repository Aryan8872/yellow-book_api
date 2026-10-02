export enum UserRole {
  USER = 'USER',
  MERCHANT_STAFF = 'MERCHANT_STAFF',
  MERCHANT_ADMIN = 'MERCHANT_ADMIN',
  ADMIN = 'ADMIN',
}

export interface JwtPayload {
  sub: string;
  email: string;
  role: UserRole;
  merchantId?: string;
  subscriptionActive?: boolean;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  merchantId?: string;
  subscriptionActive?: boolean;
}

/**
 * Safe user representation without sensitive data (passwordHash, deletedAt)
 */
export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  isVerified: boolean;
  isActive: boolean;
  createdAt: Date;
}

/**
 * Authentication tokens response
 */
export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
