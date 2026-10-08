import { Injectable, Logger } from '@nestjs/common';
import { v2 as cloudinary } from 'cloudinary';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const cloudName = this.configService.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.configService.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.configService.get<string>('CLOUDINARY_API_SECRET');

    this.isConfigured = !!(cloudName && apiKey && apiSecret);

    if (this.isConfigured) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
      });
      this.logger.log('Cloudinary configured successfully');
    } else {
      this.logger.warn('Cloudinary environment variables missing. Uploads will be disabled.');
    }
  }

  async uploadImage(
    fileBuffer: Buffer,
    filename: string,
    folder: string = 'offernepal',
  ): Promise<{ url: string; publicId: string } | null> {
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary not configured, skipping upload');
      return null;
    }

    try {
      const result = await new Promise<any>((resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder,
              public_id: `${Date.now()}-${filename.replace(/\.[^/.]+$/, '')}`,
              resource_type: 'image',
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            },
          )
          .end(fileBuffer);
      });

      return {
        url: result.secure_url,
        publicId: result.public_id,
      };
    } catch (error) {
      this.logger.error('Failed to upload image to Cloudinary', error);
      throw error;
    }
  }

  async deleteImage(publicId: string): Promise<void> {
    if (!this.isConfigured) {
      this.logger.warn('Cloudinary not configured, skipping deletion');
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId);
      this.logger.log(`Deleted image: ${publicId}`);
    } catch (error) {
      this.logger.error(`Failed to delete image: ${publicId}`, error);
      throw error;
    }
  }

  isReady(): boolean {
    return this.isConfigured;
  }
}
