import {
  Controller,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { UserRole } from '../../auth/auth.types';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/auth.decorators';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { MerchantOwnershipGuard } from '../guards/merchant-ownership.guard';
import { OfferService } from '../../offer/offer.service';
import { CreateOfferDto, UpdateOfferDto } from '../../offer/dto/offer.dto';
import { UploadService } from '../../upload/upload.service';

@ApiTags('Merchants - Offers Management')
@ApiBearerAuth('JWT-auth')
@Controller('merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MerchantOfferController {
  constructor(
    private readonly offerService: OfferService,
    private readonly uploadService: UploadService,
  ) {}

  @Post(':merchantId/offers')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Create a new offer for a merchant' })
  @ApiBody({ type: CreateOfferDto })
  @ApiResponse({ status: 201, description: 'Offer created successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to create offer for this merchant' })
  @ApiResponse({ status: 404, description: 'Merchant not found' })
  async createOffer(
    @Param('merchantId') merchantId: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.createOffer(merchantId, dto);
  }

  @Patch(':merchantId/offers/:offerId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Update an offer' })
  @ApiBody({ type: UpdateOfferDto })
  @ApiResponse({ status: 200, description: 'Offer updated successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to update this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async updateOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @Body() dto: UpdateOfferDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.updateOffer(offerId, merchantId, dto);
  }

  @Delete(':merchantId/offers/:offerId')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @ApiOperation({ summary: 'Delete an offer' })
  @ApiResponse({ status: 200, description: 'Offer deleted successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to delete this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async deleteOffer(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.offerService.deleteOffer(offerId, merchantId);
  }

  @Post(':merchantId/offers/:offerId/upload-cover')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload cover image for an offer' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to upload image for this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async uploadOfferCoverImage(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const uploadResult = await this.uploadService.uploadFile(file, 'offers/cover');
    await this.offerService.updateOffer(offerId, merchantId, { coverImage: uploadResult.url });
    return { url: uploadResult.url, publicId: uploadResult.publicId };
  }

  @Post(':merchantId/offers/:offerId/upload-images')
  @Roles(UserRole.ADMIN, UserRole.MERCHANT_ADMIN)
  @UseGuards(MerchantOwnershipGuard)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload additional images for an offer gallery' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Image uploaded successfully' })
  @ApiResponse({ status: 403, description: 'Not authorized to upload image for this offer' })
  @ApiResponse({ status: 404, description: 'Offer not found' })
  async uploadOfferGalleryImage(
    @Param('merchantId') merchantId: string,
    @Param('offerId') offerId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const uploadResult = await this.uploadService.uploadFile(file, 'offers/gallery');
    const offer = await this.offerService.getOfferById(offerId);
    const images = offer.images || [];
    images.push(uploadResult.url);
    await this.offerService.updateOffer(offerId, merchantId, { images });
    return { url: uploadResult.url, publicId: uploadResult.publicId, images };
  }
}
