import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';

@Module({
  controllers: [UploadController],
  providers: [
    UploadService,
    LocalStorageProvider,
    CloudinaryStorageProvider,
  ],
  exports: [UploadService],
})
export class UploadModule {}
