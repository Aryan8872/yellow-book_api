import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import { StorageProvider, UploadResult } from '../upload.interface';

@Injectable()
export class CloudinaryStorageProvider implements StorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);

  constructor(private readonly configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        'Cloudinary environment variables missing (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET). Uploads might fail if Cloudinary driver is activated.',
      );
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'offernepal',
  ): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: `offernepal/${folder}`,
          resource_type: 'auto',
        },
        (error, result: UploadApiResponse | undefined) => {
          if (error || !result) {
            this.logger.error('Cloudinary upload failed', error);
            return reject(error || new Error('Upload response empty'));
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
