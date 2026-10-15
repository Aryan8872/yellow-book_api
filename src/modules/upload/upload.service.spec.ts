import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UploadService } from './upload.service';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';

const imageFile = (overrides: Partial<Express.Multer.File> = {}) =>
  ({
    originalname: 'photo.png',
    mimetype: 'image/png',
    size: 1024,
    buffer: Buffer.from('x'),
    ...overrides,
  }) as Express.Multer.File;

describe('UploadService', () => {
  const mockLocalProvider = {
    upload: jest.fn(),
    delete: jest.fn(),
  };
  const mockCloudinaryProvider = {
    upload: jest.fn(),
    delete: jest.fn(),
  };

  const buildService = (storageDriver?: string) => {
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) =>
        key === 'STORAGE_DRIVER' ? storageDriver : undefined,
      ),
    };

    return new UploadService(
      mockConfig as unknown as ConfigService,
      mockLocalProvider as unknown as LocalStorageProvider,
      mockCloudinaryProvider as unknown as CloudinaryStorageProvider,
    );
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('provider selection', () => {
    it("routes uploads to cloudinary when STORAGE_DRIVER='cloudinary'", async () => {
      mockCloudinaryProvider.upload.mockResolvedValue({
        url: 'https://cdn/x.png',
        provider: 'cloudinary',
        publicId: 'x',
      });

      const result = await buildService('cloudinary').uploadFile(imageFile());

      expect(mockCloudinaryProvider.upload).toHaveBeenCalled();
      expect(mockLocalProvider.upload).not.toHaveBeenCalled();
      expect(result.url).toBe('https://cdn/x.png');
    });

    it('defaults to the local provider when STORAGE_DRIVER is unset or unknown', async () => {
      mockLocalProvider.upload.mockResolvedValue({
        url: '/uploads/x.png',
        provider: 'local',
        publicId: 'x',
      });

      await buildService(undefined).uploadFile(imageFile());
      await buildService('something-else').uploadFile(imageFile());

      expect(mockLocalProvider.upload).toHaveBeenCalledTimes(2);
      expect(mockCloudinaryProvider.upload).not.toHaveBeenCalled();
    });
  });

  describe('uploadFile validation', () => {
    it('rejects a missing file', async () => {
      await expect(
        buildService('local').uploadFile(undefined as any),
      ).rejects.toThrow('No file provided');
    });

    it('rejects disallowed MIME types and lists the allowed set', async () => {
      await expect(
        buildService('local').uploadFile(imageFile({ mimetype: 'application/pdf' })),
      ).rejects.toThrow(/JPEG, PNG, WEBP, GIF, SVG, MP4/);
      expect(mockLocalProvider.upload).not.toHaveBeenCalled();
    });

    it('accepts every allowlisted MIME type', async () => {
      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif',
        'image/svg+xml',
        'video/mp4',
      ];
      mockLocalProvider.upload.mockResolvedValue({
        url: '/u',
        provider: 'local',
        publicId: 'p',
      });

      for (const mimetype of allowed) {
        await expect(
          buildService('local').uploadFile(imageFile({ mimetype })),
        ).resolves.toBeDefined();
      }
    });

    it('rejects files over 10MB', async () => {
      await expect(
        buildService('local').uploadFile(
          imageFile({ size: 11 * 1024 * 1024 }),
        ),
      ).rejects.toThrow('exceeds maximum allowed size');
    });

    it('wraps a provider failure in a 400 with the original message', async () => {
      mockLocalProvider.upload.mockRejectedValue(new Error('CDN down'));

      await expect(buildService('local').uploadFile(imageFile())).rejects.toThrow(
        /File upload failed: CDN down/,
      );
    });
  });

  describe('uploadMultipleFiles', () => {
    it('rejects an empty or missing file list', async () => {
      const svc = buildService('local');
      await expect(svc.uploadMultipleFiles([] as any)).rejects.toThrow(
        'No files provided',
      );
      await expect(
        svc.uploadMultipleFiles(undefined as any),
      ).rejects.toThrow('No files provided');
    });

    it('uploads every file via the active provider', async () => {
      mockLocalProvider.upload.mockResolvedValue({
        url: '/u',
        provider: 'local',
        publicId: 'p',
      });

      const results = await buildService('local').uploadMultipleFiles([
        imageFile(),
        imageFile({ originalname: 'b.png' }),
      ]);

      expect(results).toHaveLength(2);
      expect(mockLocalProvider.upload).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteFile', () => {
    it('delegates to the active provider', async () => {
      mockLocalProvider.delete.mockResolvedValue(true);

      await expect(buildService('local').deleteFile('pub-1')).resolves.toBe(
        true,
      );
      expect(mockLocalProvider.delete).toHaveBeenCalledWith('pub-1');
    });
  });
});
