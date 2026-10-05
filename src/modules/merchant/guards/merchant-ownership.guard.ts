import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';

@Injectable()
export class MerchantOwnershipGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Extract merchantId from params or body
    const merchantId = request.params.merchantId || request.params.id || request.body.merchantId;
    
    // Admins can access any merchant
    if (user.role === UserRole.ADMIN) return true;
    
    // Merchant users can only access their own merchant
    if (user.merchantId === merchantId) return true;
    
    throw new ForbiddenException('Access denied');
  }
}
