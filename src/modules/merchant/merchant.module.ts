import { Module } from '@nestjs/common';
import { MerchantController } from './merchant.controller';
import { MerchantService } from './merchant.service';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { OfferModule } from '../offer/offer.module';
import { UploadModule } from '../upload/upload.module';

@Module({
  imports: [PrismaModule, OfferModule, UploadModule],
  controllers: [MerchantController],
  providers: [MerchantService],
  exports: [MerchantService],
})
export class MerchantModule {}
