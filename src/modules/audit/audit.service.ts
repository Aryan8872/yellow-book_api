import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface AuditLogParams {
  entity: string;
  entityId: string;
  action: 'create' | 'update' | 'delete' | 'redeem' | 'confirm' | 'cancel';
  actorId: string;
  merchantId?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log a staff activity to the AuditLog table
   */
  async log(params: AuditLogParams): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          entity: params.entity,
          entityId: params.entityId,
          action: params.action,
          actorId: params.actorId,
          merchantId: params.merchantId,
          metadata: params.metadata || {},
        },
      });
    } catch (error: any) {
      // Don't fail the main operation if audit logging fails
      this.logger.error(`Failed to log audit entry: ${error.message}`, error);
    }
  }

  /**
   * Log offer creation
   */
  async logOfferCreated(
    actorId: string,
    offerId: string,
    merchantId: string,
    offerData: Record<string, any>,
  ): Promise<void> {
    await this.log({
      entity: 'Offer',
      entityId: offerId,
      action: 'create',
      actorId,
      merchantId,
      metadata: {
        title: offerData.title,
        categoryId: offerData.categoryId,
        estimatedSavingsNpr: offerData.estimatedSavingsNpr,
      },
    });
  }

  /**
   * Log offer update
   */
  async logOfferUpdated(
    actorId: string,
    offerId: string,
    merchantId: string,
    changes: Record<string, any>,
  ): Promise<void> {
    await this.log({
      entity: 'Offer',
      entityId: offerId,
      action: 'update',
      actorId,
      merchantId,
      metadata: {
        changedFields: Object.keys(changes),
        changes,
      },
    });
  }

  /**
   * Log offer deletion
   */
  async logOfferDeleted(
    actorId: string,
    offerId: string,
    merchantId: string,
  ): Promise<void> {
    await this.log({
      entity: 'Offer',
      entityId: offerId,
      action: 'delete',
      actorId,
      merchantId,
    });
  }

  /**
   * Log redemption confirmation by staff
   */
  async logRedemptionConfirmed(
    actorId: string,
    sessionId: string,
    merchantId: string,
    offerId: string,
  ): Promise<void> {
    await this.log({
      entity: 'RedemptionSession',
      entityId: sessionId,
      action: 'confirm',
      actorId,
      merchantId,
      metadata: {
        offerId,
      },
    });
  }

  /**
   * Log redemption cancellation by staff
   */
  async logRedemptionCancelled(
    actorId: string,
    sessionId: string,
    merchantId: string,
    reason?: string,
  ): Promise<void> {
    await this.log({
      entity: 'RedemptionSession',
      entityId: sessionId,
      action: 'cancel',
      actorId,
      merchantId,
      metadata: {
        reason,
      },
    });
  }

  /**
   * Get audit logs for a merchant
   */
  async getMerchantAuditLogs(
    merchantId: string,
    page: number = 1,
    limit: number = 50,
  ): Promise<{ logs: any[]; total: number }> {
    const skip = (page - 1) * limit;

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where: { merchantId },
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.auditLog.count({ where: { merchantId } }),
    ]);

    return { logs, total };
  }

  /**
   * Get audit logs for a specific entity
   */
  async getEntityAuditLogs(
    entity: string,
    entityId: string,
  ): Promise<any[]> {
    return this.prisma.auditLog.findMany({
      where: { entity, entityId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
