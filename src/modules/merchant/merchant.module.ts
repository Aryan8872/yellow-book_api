import { Module } from '@nestjs/common';

// Controllers
import { MerchantProfileController } from './controllers/merchant-profile.controller';
import { MerchantBranchController } from './controllers/merchant-branch.controller';
import { MerchantStaffController } from './controllers/merchant-staff.controller';
import { MerchantAnalyticsController } from './controllers/merchant-analytics.controller';
import { MerchantOfferController } from './controllers/merchant-offer.controller';

// Services
import { MerchantService } from './merchant.service';
import { MerchantBranchService } from './services/merchant-branch.service';
import { MerchantStaffService } from './services/merchant-staff.service';
import { MerchantAnalyticsService } from './services/merchant-analytics.service';

// Analytical Query Providers
import { RevenueAnalyticsQuery } from './analytics/queries/revenue-analytics.query';
import { CustomerAnalyticsQuery } from './analytics/queries/customer-analytics.query';
import { OfferPerformanceAnalyticsQuery } from './analytics/queries/offer-performance-analytics.query';
import { BranchPerformanceAnalyticsQuery } from './analytics/queries/branch-performance-analytics.query';
import { TimeAndGrowthAnalyticsQuery } from './analytics/queries/time-and-growth-analytics.query';
import { CategoryAnalyticsQuery } from './analytics/queries/category-analytics.query';

import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { OfferModule } from '../offer/offer.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, OfferModule, UploadModule],
  controllers: [
    MerchantProfileController,
    MerchantBranchController,
    MerchantStaffController,
    MerchantAnalyticsController,
    MerchantOfferController,
  ],
  providers: [
    MerchantService,
    MerchantBranchService,
    MerchantStaffService,
    MerchantAnalyticsService,
    RevenueAnalyticsQuery,
    CustomerAnalyticsQuery,
    OfferPerformanceAnalyticsQuery,
    BranchPerformanceAnalyticsQuery,
    TimeAndGrowthAnalyticsQuery,
    CategoryAnalyticsQuery,
  ],
  exports: [
    MerchantService,
    MerchantBranchService,
    MerchantStaffService,
    MerchantAnalyticsService,
  ],
})
export class MerchantModule {}
