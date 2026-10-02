/**
 * Prisma Seed File
 * Run with: npx prisma db seed
 * 
 * This script seeds the database with sample merchants and offers
 * for development and testing purposes.
 */

import { PrismaClient, OfferCategory, MerchantStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  // Clean existing data (for development only)
  console.log('🧹 Cleaning existing data...');
  await prisma.redemptionSession.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.merchantStaff.deleteMany();
  await prisma.merchantBranch.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ Data cleaned');

  // Create admin user
  console.log('👤 Creating admin user...');
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.create({
    data: {
      email: 'admin@offernepal.com',
      passwordHash: adminPassword,
      name: 'Admin User',
      role: 'ADMIN',
      isVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ Admin created: ${admin.email}`);

  // Create sample merchants
  console.log('🏪 Creating sample merchants...');
  const merchants = [
    {
      name: 'Burger House',
      description: 'Premium burgers and fast food',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      contactEmail: 'contact@burgerhouse.com',
      contactPhone: '+9779800000001',
    },
    {
      name: 'Spa Wellness Center',
      description: 'Relaxation and wellness services',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      contactEmail: 'info@spawellness.com',
      contactPhone: '+9779800000002',
    },
    {
      name: 'Cinema World',
      description: 'Latest movies and entertainment',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      contactEmail: 'booking@cinemaworld.com',
      contactPhone: '+9779800000003',
    },
    {
      name: 'Fashion Boutique',
      description: 'Trendy clothing and accessories',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      contactEmail: 'sales@fashionboutique.com',
      contactPhone: '+9779800000004',
    },
    {
      name: 'Travel Nepal',
      description: 'Adventure tours and travel packages',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      contactEmail: 'info@travelnepal.com',
      contactPhone: '+9779800000005',
    },
  ];

  const createdMerchants = await Promise.all(
    merchants.map((merchant) =>
      prisma.merchant.create({
        data: merchant,
      }),
    ),
  );

  console.log(`✅ Created ${createdMerchants.length} merchants`);

  // Create merchant staff users
  console.log('👥 Creating merchant staff...');
  for (const merchant of createdMerchants) {
    const staffPassword = await bcrypt.hash('staff123', 10);
    const staffUser = await prisma.user.create({
      data: {
        email: `staff@${merchant.name.toLowerCase().replace(/\s/g, '')}.com`,
        passwordHash: staffPassword,
        name: `${merchant.name} Staff`,
        role: 'MERCHANT_STAFF',
        isVerified: true,
        isActive: true,
        merchantStaff: {
          create: {
            merchantId: merchant.id,
            role: 'MERCHANT_ADMIN',
          },
        },
      },
    });
    console.log(`✅ Staff created for ${merchant.name}: ${staffUser.email}`);
  }

  // Create sample offers
  console.log('🎁 Creating sample offers...');
  const offers = [
    // Burger House offers
    {
      merchantId: createdMerchants[0].id,
      title: '50% Off on All Burgers',
      description: 'Get 50% discount on all burger items. Valid for dine-in only.',
      terms: 'Cannot be combined with other offers. Valid for dine-in only.',
      category: OfferCategory.DINING,
      estimatedSavingsNpr: 250,
      maxPerUser: 3,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
    {
      merchantId: createdMerchants[0].id,
      title: 'Free Drink with Combo Meal',
      description: 'Get a free drink when you order any combo meal.',
      terms: 'One free drink per combo. Valid all day.',
      category: OfferCategory.DINING,
      estimatedSavingsNpr: 150,
      maxPerUser: 5,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    },
    // Spa Wellness offers
    {
      merchantId: createdMerchants[1].id,
      title: '30% Off on Full Body Massage',
      description: 'Relax with a 30% discount on our signature full body massage.',
      terms: 'Prior appointment required. Valid on weekdays only.',
      category: OfferCategory.WELLNESS,
      estimatedSavingsNpr: 900,
      maxPerUser: 2,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days
    },
    {
      merchantId: createdMerchants[1].id,
      title: 'Buy 1 Get 1 Free on Facial',
      description: 'Buy one facial treatment and get another free.',
      terms: 'Both facials must be availed on the same day.',
      category: OfferCategory.WELLNESS,
      estimatedSavingsNpr: 1500,
      maxPerUser: 1,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
    },
    // Cinema World offers
    {
      merchantId: createdMerchants[2].id,
      title: 'Buy 1 Get 1 Movie Ticket',
      description: 'Buy one movie ticket and get another free for the same show.',
      terms: 'Valid for regular shows only. Not applicable on weekends and holidays.',
      category: OfferCategory.ENTERTAINMENT,
      estimatedSavingsNpr: 400,
      maxPerUser: 3,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    {
      merchantId: createdMerchants[2].id,
      title: '20% Off on Combo Snacks',
      description: 'Get 20% discount on popcorn and drink combo.',
      terms: 'Valid with movie ticket purchase only.',
      category: OfferCategory.ENTERTAINMENT,
      estimatedSavingsNpr: 80,
      maxPerUser: 10,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
    },
    // Fashion Boutique offers
    {
      merchantId: createdMerchants[3].id,
      title: 'Flat 40% Off on Summer Collection',
      description: 'Get 40% discount on all summer collection items.',
      terms: 'Cannot be combined with other promotions.',
      category: OfferCategory.RETAIL,
      estimatedSavingsNpr: 2000,
      maxPerUser: 2,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    },
    {
      merchantId: createdMerchants[3].id,
      title: 'Buy 2 Get 1 Free on T-Shirts',
      description: 'Buy 2 t-shirts and get 1 free.',
      terms: 'Free t-shirt will be of equal or lesser value.',
      category: OfferCategory.RETAIL,
      estimatedSavingsNpr: 800,
      maxPerUser: 3,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000), // 45 days
    },
    // Travel Nepal offers
    {
      merchantId: createdMerchants[4].id,
      title: '25% Off on Pokhara Tour Package',
      description: 'Get 25% discount on our 3-day Pokhara tour package.',
      terms: 'Valid for bookings made at least 7 days in advance.',
      category: OfferCategory.TRAVEL,
      estimatedSavingsNpr: 5000,
      maxPerUser: 1,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
    },
    {
      merchantId: createdMerchants[4].id,
      title: 'Free Airport Transfer with Trekking Package',
      description: 'Get free airport transfer when you book any trekking package.',
      terms: 'Valid for packages above NPR 15,000.',
      category: OfferCategory.TRAVEL,
      estimatedSavingsNpr: 1500,
      maxPerUser: 2,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000), // 120 days
    },
  ];

  const createdOffers = await Promise.all(
    offers.map((offer) =>
      prisma.offer.create({
        data: offer,
      }),
    ),
  );

  console.log(`✅ Created ${createdOffers.length} offers`);

  // Create merchant branches
  console.log('📍 Creating merchant branches...');
  const branches = [
    {
      merchantId: createdMerchants[0].id,
      name: 'Burger House - Thamel',
      address: 'Thamel, Kathmandu',
      city: 'Kathmandu',
      lat: 27.715,
      lng: 85.31,
    },
    {
      merchantId: createdMerchants[0].id,
      name: 'Burger House - Lazimpat',
      address: 'Lazimpat, Kathmandu',
      city: 'Kathmandu',
      lat: 27.72,
      lng: 85.32,
    },
    {
      merchantId: createdMerchants[1].id,
      name: 'Spa Wellness - Pulchowk',
      address: 'Pulchowk, Lalitpur',
      city: 'Lalitpur',
      lat: 27.68,
      lng: 85.32,
    },
    {
      merchantId: createdMerchants[2].id,
      name: 'Cinema World - City Center',
      address: 'City Center, Kathmandu',
      city: 'Kathmandu',
      lat: 27.71,
      lng: 85.31,
    },
    {
      merchantId: createdMerchants[3].id,
      name: 'Fashion Boutique - Durbar Marg',
      address: 'Durbar Marg, Kathmandu',
      city: 'Kathmandu',
      lat: 27.71,
      lng: 85.32,
    },
  ];

  await Promise.all(
    branches.map((branch) =>
      prisma.merchantBranch.create({
        data: branch,
      }),
    ),
  );

  console.log(`✅ Created ${branches.length} merchant branches`);

  console.log('🎉 Seed completed successfully!');
  console.log('\n📊 Summary:');
  console.log(`   - Admin users: 1`);
  console.log(`   - Merchants: ${createdMerchants.length}`);
  console.log(`   - Merchant staff: ${createdMerchants.length}`);
  console.log(`   - Offers: ${createdOffers.length}`);
  console.log(`   - Merchant branches: ${branches.length}`);
  console.log('\n🔐 Test Credentials:');
  console.log(`   Admin: admin@offernepal.com / admin123`);
  console.log(`   Staff: staff@burgerhouse.com / staff123`);
  console.log(`   Merchant PIN: 1234 (for all merchants)`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
