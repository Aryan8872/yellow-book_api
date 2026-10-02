import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * PrismaModule
 *
 * Marked @Global so PrismaService is available everywhere in the app
 * without needing to import PrismaModule in every feature module.
 *
 * Just add PrismaService to any feature service's constructor and it works.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
