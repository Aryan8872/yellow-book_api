import { Module } from '@nestjs/common';
import { RedemptionService } from './redemption.service';
import { RedemptionController } from './redemption.controller';
import { RedisModule } from '../../infrastructure/redis/redis.module';
import { MetricsModule } from '../../infrastructure/metrics/metrics.module';

@Module({
  imports: [RedisModule, MetricsModule],
  controllers: [RedemptionController],
  providers: [RedemptionService],
  exports: [RedemptionService],
})
export class RedemptionModule {}
