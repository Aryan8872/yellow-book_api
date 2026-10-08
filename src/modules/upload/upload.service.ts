import {
  Injectable,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StorageProvider, UploadResult } from './upload.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private activeProvider: StorageProvider;
  private readonly providerName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly localProvider: LocalStorageProvider,
    private readonly cloudinaryProvider: CloudinaryStorageProvider,
  ) {
    // STORAGE_DRIVER can be 'local' or 'cloudinary' (defaults to 'local')
    this.providerName = (
      this.configService.get<string>('STORAGE_DRIVER') || 'local'
    ).toLowerCase();

    if (this.providerName === 'cloudinary') {
      this.activeProvider = this.cloudinaryProvider;
      this.logger.log('Active Upload Storage Driver: Cloudinary');
    } else {
      this.activeProvider = this.localProvider;
      this.logger.log('Active Upload Storage Driver: Local Disk Storage');
    }
  }

  async uploadFile(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<UploadResult> {
    if (!file) {
      throw new BadRequestException('No file provided for upload.');
    }

    // Safety checks: allow images and standard media formats
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/svg+xml',
      'video/mp4',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      throw new BadRequestException(
        `Invalid file type (${file.mimetype}). Allowed types: JPEG, PNG, WEBP, GIF, SVG, MP4.`,
      );
    }

    // Limit size (10 MB max)
    const MAX_SIZE_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      throw new BadRequestException('File exceeds maximum allowed size (10MB).');
    }

    try {
      const result = await this.activeProvider.upload(file, folder);
      this.logger.log(
        `File uploaded successfully via [${result.provider}]: ${result.url}`,
      );
      return result;
    } catch (error) {
      this.logger.error(`Upload error using provider [${this.providerName}]`, error);
      throw new BadRequestException(
        `File upload failed: ${error instanceof Error ? error.message : 'Storage service error'}`,
      );
    }
  }

  async uploadMultipleFiles(
    files: Express.Multer.File[],
    folder: string = 'general',
  ): Promise<UploadResult[]> {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided.');
    }

    return Promise.all(files.map((file) => this.uploadFile(file, folder)));
  }

  async deleteFile(publicId: string): Promise<boolean> {
    return this.activeProvider.delete(publicId);
  }
}
