import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { StorageProvider, UploadResult } from '../upload.interface';

@Injectable()
export class CloudinaryStorageProvider implements StorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')?.trim();

    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.logger.log(`Cloudinary configured for cloud_name: ${cloudName}`);
    } else {
      this.logger.warn(
        'Cloudinary environment variables missing or incomplete (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Uploads will fail if Cloudinary driver is activated.',
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'offernepal',
  ): Promise<UploadResult> {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME')?.trim();
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY')?.trim();
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET')?.trim();

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary is configured as STORAGE_DRIVER but required credentials (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) are missing or incomplete.',
      );
    }

    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `offernepal/${folder}`,
          resource_type: 'auto',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            const errorMsg = error?.message || 'Upload response empty from Cloudinary';
            this.logger.error(`Cloudinary upload failed: ${errorMsg}`, error);
            return reject(new Error(`Cloudinary upload failed: ${errorMsg}`));
          }

          resolve({
            url: result.secure_url || result.url,
            publicId: result.public_id,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: result.bytes || file.size,
            provider: 'cloudinary',
          });
        },
      );

      uploadStream.end(file.buffer);
    });
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId);
      return result?.result === 'ok';
    } catch (error) {
      this.logger.error(`Failed to delete Cloudinary asset: ${publicId}`, error);
      return false;
    }
  }
}
