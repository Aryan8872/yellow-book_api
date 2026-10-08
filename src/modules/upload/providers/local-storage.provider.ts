import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { StorageProvider, UploadResult } from '../upload.interface';

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private readonly logger = new Logger(LocalStorageProvider.name);
  private readonly uploadDir: string;
  private readonly baseUrl: string;

  constructor(private readonly configService: ConfigService) {
    // Relative to api root or customizable via UPLOAD_DIR
    const customDir = this.configService.get<string>('UPLOAD_DIR');
    this.uploadDir = customDir
      ? path.resolve(customDir)
      : path.join(process.cwd(), 'uploads');

    const appPort = this.configService.get<number>('PORT', 3000);
    this.baseUrl =
      this.configService.get<string>('APP_BASE_URL') ||
      `http://localhost:${appPort}`;

    // Ensure uploads directory exists
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
      this.logger.log(`Created local storage directory at: ${this.uploadDir}`);
    }
  }

  async upload(
    file: Express.Multer.File,
    folder: string = 'general',
  ): Promise<UploadResult> {
    const targetFolder = path.join(this.uploadDir, folder);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueName = `${uuidv4()}${ext}`;
    const destinationPath = path.join(targetFolder, uniqueName);

    await fs.promises.writeFile(destinationPath, file.buffer);

    // Uniform public URL accessible via static route (e.g. /uploads/...)
    const relativeUrl = `/uploads/${folder}/${uniqueName}`;
    const fullUrl = `${this.baseUrl}${relativeUrl}`;

    return {
      url: fullUrl,
      publicId: `${folder}/${uniqueName}`,
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      provider: 'local',
    };
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      const filePath = path.join(this.uploadDir, publicId);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
        return true;
      }
      return false;
    } catch (error) {
      this.logger.error(`Failed to delete local file: ${publicId}`, error);
      return false;
    }
  }
}
