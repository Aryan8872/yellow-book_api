export interface UploadResult {
  url: string;
  publicId: string;
  filename: string;
  mimetype: string;
  size: number;
  provider: 'local' | 'cloudinary';
}

export interface StorageProvider {
  upload(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult>;
  delete(publicId: string): Promise<boolean>;
}
