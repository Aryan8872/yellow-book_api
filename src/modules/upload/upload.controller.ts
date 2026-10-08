import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Query,
  HttpStatus,
  ParseFilePipeBuilder,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiOkResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { UploadService } from './upload.service';
import { Roles } from '../auth/auth.decorators';
import { UserRole } from '../auth/auth.types';

@ApiTags('Uploads')
@ApiBearerAuth('JWT-auth')
@Controller('uploads')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post()
  @Roles(UserRole.MERCHANT_ADMIN, UserRole.MERCHANT_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Upload a single media file (images, banners, logos)',
    description:
      'Accepts multipart/form-data with file field named "file". Switches between local disk storage and Cloudinary via STORAGE_DRIVER environment variable.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'folder',
    required: false,
    description: 'Subfolder to group uploaded assets (e.g. offers, merchants, avatars)',
    example: 'offers',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
      required: ['file'],
    },
  })
  @ApiOkResponse({
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', example: 'https://res.cloudinary.com/.../image.jpg' },
        publicId: { type: 'string', example: 'offernepal/offers/abc-123' },
        filename: { type: 'string', example: 'deal-banner.png' },
        mimetype: { type: 'string', example: 'image/png' },
        size: { type: 'number', example: 1048576 },
        provider: { type: 'string', example: 'cloudinary' },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadSingle(
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addMaxSizeValidator({ maxSize: 10 * 1024 * 1024 })
        .build({
          errorHttpStatusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        }),
    )
    file: Express.Multer.File,
    @Query('folder') folder?: string,
  ) {
    return this.uploadService.uploadFile(file, folder || 'offers');
  }

  @Post('multiple')
  @Roles(UserRole.MERCHANT_ADMIN, UserRole.MERCHANT_STAFF, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Upload multiple media files simultaneously (up to 10 files)',
    description:
      'Useful for gallery sliders, multi-branch photos, or offer detail highlights.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({
    name: 'folder',
    required: false,
    example: 'offers',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: {
          type: 'array',
          items: {
            type: 'string',
            format: 'binary',
          },
        },
      },
      required: ['files'],
    },
  })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadMultiple(
    @UploadedFiles() files: Express.Multer.File[],
    @Query('folder') folder?: string,
  ) {
    return this.uploadService.uploadMultipleFiles(files, folder || 'offers');
  }
}
