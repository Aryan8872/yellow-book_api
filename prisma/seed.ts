/**
 * Prisma Seed File
 * Run with: npx prisma db seed
 * 
 * This script seeds the database with rich sample merchants and offers
 * with complete imagery, pricing, and branches.
 */

import { PrismaClient, MerchantStatus, District, RedemptionStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed with rich data...');

  // Clean existing data (for development only)
  console.log('🧹 Cleaning existing data...');
  await prisma.redemptionSession.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.merchantStaff.deleteMany();
  await prisma.merchantBranch.deleteMany();
  await prisma.merchant.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();

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
   const merchantPassword = await bcrypt.hash('merchant123', 10);
  const merchant = await prisma.user.create({
    data: {
      email: 'merchant@offernepal.com',
      passwordHash: merchantPassword,
      name: 'Merchant User',
      role: 'MERCHANT_ADMIN',
      isVerified: true,
      isActive: true,
    },
  });
  console.log(`✅ merchant created: ${merchant.email}`);

  // Create categories
  console.log('📁 Creating categories...');
  const categories = await Promise.all([
    prisma.category.create({
      data: {
        name: 'Dining',
        slug: 'dining',
        description: 'Food and dining offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075977.png',
        imageUrl: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=800&q=80',
        color: '#FF6B6B',
        displayOrder: 1,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Wellness',
        slug: 'wellness',
        description: 'Spa, wellness and beauty offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075966.png',
        imageUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
        color: '#4ECDC4',
        displayOrder: 2,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Entertainment',
        slug: 'entertainment',
        description: 'Cinema, events and entertainment offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075976.png',
        imageUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
        color: '#45B7D1',
        displayOrder: 3,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Retail',
        slug: 'retail',
        description: 'Shopping and retail offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075975.png',
        imageUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80',
        color: '#96CEB4',
        displayOrder: 4,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Travel',
        slug: 'travel',
        description: 'Travel and accommodation offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075974.png',
        imageUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=800&q=80',
        color: '#FFEEAD',
        displayOrder: 5,
      },
    }),
    prisma.category.create({
      data: {
        name: 'Beauty',
        slug: 'beauty',
        description: 'Beauty and grooming offers',
        iconUrl: 'https://cdn-icons-png.flaticon.com/512/3075/3075973.png',
        imageUrl: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
        color: '#D4A5A5',
        displayOrder: 6,
      },
    }),
  ]);
  console.log(`✅ Created ${categories.length} categories`);

  // Create sample merchants with rich logos and covers
  console.log('🏪 Creating sample merchants with rich branding...');
  const merchantsData = [
    {
      name: 'Burger House & Crunchy Fried Chicken',
      description: 'Nepal’s premier homegrown burger hub serving crispy artisan burgers, seasoned fries, and gourmet shakes.',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      logoUrl: 'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=300&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
      websiteUrl: 'https://burgerhouse.com.np',
      contactEmail: 'contact@burgerhouse.com',
      contactPhone: '+977-9801234567',
    },
    {
      name: 'Spa Wellness & Ayurveda Sanctuary',
      description: 'An oasis of peace offering authentic Himalayan herbal massages, therapeutic facials, and complete rejuvenation.',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      logoUrl: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=300&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=1200&q=80',
      websiteUrl: 'https://spawellnessnepal.com',
      contactEmail: 'info@spawellness.com',
      contactPhone: '+977-9801234568',
    },
    {
      name: 'QFX Cinema World',
      description: 'State of the art multiplex experience with Dolby Atmos sound, 4K laser projection, and gourmet theater concessions.',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      logoUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=300&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=1200&q=80',
      websiteUrl: 'https://qfxcinemas.com',
      contactEmail: 'booking@cinemaworld.com',
      contactPhone: '+977-9801234569',
    },
    {
      name: 'Aroma Himalayan Boutique',
      description: 'Exclusive designer apparel, hand-woven pashminas, and contemporary lifestyle accessories.',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      logoUrl: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=300&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=1200&q=80',
      websiteUrl: 'https://aromaboutique.com',
      contactEmail: 'sales@aromaboutique.com',
      contactPhone: '+977-9801234570',
    },
    {
      name: 'Himalayan Explorer & Trekking',
      description: 'Bespoke helicopter tours, Annapurna safaris, and luxury resort getaways across Nepal.',
      status: MerchantStatus.ACTIVE,
      merchantPinHash: await bcrypt.hash('1234', 10),
      logoUrl: 'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&w=300&q=80',
      coverUrl: 'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1200&q=80',
      websiteUrl: 'https://travelnepal.com',
      contactEmail: 'info@travelnepal.com',
      contactPhone: '+977-9801234571',
    },
  ];

  const createdMerchants = await Promise.all(
    merchantsData.map((merchant) =>
      prisma.merchant.create({
        data: merchant,
      }),
    ),
  );

  console.log(`✅ Created ${createdMerchants.length} merchants`);

  // Create branches with verified geo coordinates
  console.log('📍 Creating merchant branches...');
  const branchesData = [
    {
      merchantId: createdMerchants[0].id,
      name: 'Burger House - Thamel Flagship',
      address: 'Z-Street, Thamel, Kathmandu',
      district: District.KATHMANDU,
      phone :'9815016727',
      lat: 27.7153,
      lng: 85.3123,
    },
    {
      merchantId: createdMerchants[0].id,
      name: 'Burger House - Lazimpat Oasis',
      address: 'Radisson Way, Lazimpat, Kathmandu',
      district: District.KATHMANDU,
      lat: 27.7225,
            phone :'9815016727',

      lng: 85.3218,
    },
    {
      merchantId: createdMerchants[1].id,
      name: 'Spa Wellness - Pulchowk Sanctuary',
      address: 'Opposite Harihar Bhawan, Pulchowk, Lalitpur',
      district: District.KATHMANDU,
      lat: 27.6789,
            phone :'9815016727',

      lng: 85.3168,
    },
    {
      merchantId: createdMerchants[2].id,
      name: 'QFX Cinema World - Civil Mall',
      address: 'Sundhara, Kathmandu',
      district: District.KATHMANDU,
      lat: 27.7006,
            phone :'9815016727',

      lng: 85.3129,
    },
    {
      merchantId: createdMerchants[3].id,
      name: 'Aroma Boutique - Durbar Marg',
      address: "King's Way, Durbar Marg, Kathmandu",
      district: District.KATHMANDU,
      lat: 27.7112,
            phone :'9815016727',

      lng: 85.3175,
    },
    {
      merchantId: createdMerchants[4].id,
      name: 'Himalayan Explorer - Lakeside Pokhara',
      address: 'Lakeside-6, Pokhara',
      district: District.POKHARA,
      lat: 28.2096,
            phone :'9815016727',

      lng: 83.9595,
    },
  ];

  const createdBranches = await Promise.all(
    branchesData.map((branch) =>
      prisma.merchantBranch.create({
        data: branch,
      }),
    ),
  );

  console.log(`✅ Created ${branchesData.length} merchant branches`);

  // Link the merchant admin user to the first merchant
  console.log('🔗 Linking merchant admin to merchant...');
  await prisma.merchantStaff.create({
    data: {
      userId: merchant.id,
      merchantId: createdMerchants[0].id,
      role: 'MERCHANT_ADMIN',
    },
  });
  console.log(`✅ Merchant admin linked to ${createdMerchants[0].name}`);

  // Create merchant staff
  console.log('👥 Creating merchant staff...');
  for (const merchant of createdMerchants) {
    const staffPassword = await bcrypt.hash('staff123', 10);
    await prisma.user.create({
      data: {
        email: `staff@${merchant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
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
  }

  // Create rich offers
  console.log('🎁 Creating rich sample offers...');
  const sampleOffers = [
    // 1. Burger House Deals
    {
      merchantId: createdMerchants[0].id,
      categoryId: categories[0].id,
      title: 'Buy 1 Get 1 Free Gourmet Burger Combo',
      description: 'Order any double-patty signature beef, crispy chicken, or falafel burger and receive a second burger of equal or lesser value absolutely free. Served with house seasoned fries and garlic dip.',
      terms: '• Valid 7 days a week for dine-in customers only.\n• Maximum 1 voucher redemption per table per visit.\n• Not valid during official public holidays or special events.\n• Must present redemption code to staff prior to ordering.',
      estimatedSavingsNpr: 650,
      originalPriceNpr: 1300,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ["Chef's Double Patty", 'Crispy Fried Chicken', 'Outdoor Seating', 'Free Wi-Fi'],
      rating: 4.9,
      reviewsCount: 148,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // 180 days
    },
    {
      merchantId: createdMerchants[0].id,
      categoryId: categories[0].id,
      title: 'Buy 1 Get 1 Free Loaded Crispy Wings Platter',
      description: 'Enjoy 8 pieces of glazed barbecue or spicy peri-peri wings and get another 8-piece platter on the house.',
      terms: '• Valid Monday through Friday from 12:00 PM to 8:00 PM.\n• Dine-in only.',
      estimatedSavingsNpr: 450,
      originalPriceNpr: 900,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1567620832903-9fc6debc209f?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1527477378408-1bc0949310bb?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['Crispy Peri-Peri Wings', 'House Dip Selection', 'Family Friendly'],
      rating: 4.7,
      reviewsCount: 89,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    },

    // 2. Spa Wellness Deals
    {
      merchantId: createdMerchants[1].id,
      categoryId: categories[1].id,
      title: 'Buy 1 Get 1 Free Himalayan Herbal Massage (60 Mins)',
      description: 'Deep therapeutic oil massage tailored to relieve fatigue and muscle tension using authentic wild-crafted Himalayan herbal infusions.',
      terms: '• Prior appointment reservation required at least 24 hours in advance.\n• Valid for couple or two individuals arriving at the same session.\n• Sunday through Thursday only.',
      estimatedSavingsNpr: 2500,
      originalPriceNpr: 5000,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1519823551278-64ac92734fb1?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['Steam & Sauna Included', 'Organic Himalayan Oils', 'Certified Therapists'],
      rating: 4.9,
      reviewsCount: 112,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
    },
    {
      merchantId: createdMerchants[1].id,
      categoryId: categories[1].id,
      title: 'Buy 1 Get 1 Free Organic Glow Radiance Facial',
      description: 'Revitalize and nourish your skin with a 45-minute organic botanical scrub, steam, and hydration mask.',
      terms: '• Appointment required.\n• Cannot be combined with package deals.',
      estimatedSavingsNpr: 1800,
      originalPriceNpr: 3600,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['Ayurvedic Herbs', 'Hydration Boost', 'Private Treatment Rooms'],
      rating: 4.8,
      reviewsCount: 64,
      isActive: true,
      isFeatured: false,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    },

    // 3. Cinema World Deals
    {
      merchantId: createdMerchants[2].id,
      categoryId: categories[2].id,
      title: 'Buy 1 Get 1 Free Prime Movie Ticket',
      description: 'Book one standard or prime cinema seat and get the accompanying ticket free for the same screening session.',
      terms: '• Valid for Monday through Thursday shows.\n• Excludes premier night screenings and 3D glasses surcharge.',
      estimatedSavingsNpr: 450,
      originalPriceNpr: 900,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['Dolby Atmos', 'Recliner Seating', 'Laser Projection'],
      rating: 4.8,
      reviewsCount: 230,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 100 * 24 * 60 * 60 * 1000),
    },

    // 4. Boutique Deals
    {
      merchantId: createdMerchants[3].id,
      categoryId: categories[3].id,
      title: 'Buy 1 Get 1 Free Pure Pashmina Shawl or Scarf',
      description: 'Select any authentic grade-A Chyangra Pashmina piece and receive a second scarf of equal value complimentary.',
      terms: '• Valid on labeled stock items.\n• Show app redemption prior to billing.',
      estimatedSavingsNpr: 3500,
      originalPriceNpr: 7000,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1472851294608-062f824d29cc?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['100% Chyangra Pashmina', 'Hand Woven', 'Export Quality'],
      rating: 4.9,
      reviewsCount: 78,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
    },

    // 5. Travel & Trekking Deals
    {
      merchantId: createdMerchants[4].id,
      categoryId: categories[4].id,
      title: 'Buy 1 Get 1 Free Pokhara Luxury Resort Stay (1 Night)',
      description: 'Book 1 deluxe lake-facing room for a night and get the consecutive second night on a complimentary basis.',
      terms: '• Advance reservation required 7 days prior.\n• Subject to hotel occupancy availability.\n• Includes complimentary breakfast buffet for two.',
      estimatedSavingsNpr: 7500,
      originalPriceNpr: 15000,
      discountPercentage: 50,
      coverImage: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
      images: [
        'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=800&q=80',
        'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80',
      ],
      highlights: ['Lake Facing Balcony', 'Buffet Breakfast', 'Infinity Pool', 'Mountain Views'],
      rating: 5.0,
      reviewsCount: 95,
      isActive: true,
      isFeatured: true,
      validFrom: new Date(),
      validUntil: new Date(Date.now() + 150 * 24 * 60 * 60 * 1000),
    },
  ];

  const createdOffers = await Promise.all(
    sampleOffers.map((offer) =>
      prisma.offer.create({
        data: offer,
      }),
    ),
  );

  console.log(`✅ Created ${createdOffers.length} comprehensive rich offers`);

  // Create sample redemptions with varied statuses and dates (last 14 days)
  console.log('🎟️ Creating realistic redemption sessions for analytics...');
  const customerPassword = await bcrypt.hash('customer123', 10);
  const sampleCustomer = await prisma.user.create({
    data: {
      email: 'customer@offernepal.com',
      passwordHash: customerPassword,
      name: 'Aayush Sharma',
      role: 'CUSTOMER',
      isVerified: true,
      isActive: true,
    },
  });

  const statuses: RedemptionStatus[] = [
    RedemptionStatus.REDEEMED,
    RedemptionStatus.REDEEMED,
    RedemptionStatus.REDEEMED,
    RedemptionStatus.EXPIRED,
    RedemptionStatus.PENDING_SYNC,
  ];

  const redemptionRecords = [];
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // Generate 25 redemptions spread across the past 12 days
  for (let i = 0; i < 25; i++) {
    const offer = createdOffers[i % createdOffers.length];
    const branch = createdBranches.find((b) => b.merchantId === offer.merchantId) || createdBranches[0];
    const daysAgo = (i % 12);
    const createdAt = new Date(now - daysAgo * dayMs - (i * 3600000));
    const status = statuses[i % statuses.length];
    const isRedeemed = status === RedemptionStatus.REDEEMED;

    redemptionRecords.push({
      userId: sampleCustomer.id,
      offerId: offer.id,
      branchId: branch?.id || null,
      code: `ON-${Math.floor(100000 + Math.random() * 900000)}`,
      status,
      savingsNpr: offer.estimatedSavingsNpr || 250,
      codeExpiresAt: new Date(createdAt.getTime() + 15 * 60 * 1000),
      redeemedAt: isRedeemed ? new Date(createdAt.getTime() + 5 * 60 * 1000) : null,
      deviceInfo: i % 2 === 0 ? 'iPhone 15 Pro (iOS 17.4)' : 'Samsung Galaxy S24 (Android 14)',
      createdAt,
    });
  }

  await prisma.redemptionSession.createMany({
    data: redemptionRecords,
  });

  console.log(`✅ Created ${redemptionRecords.length} redemption sessions across multiple days`);
  console.log('🎉 Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
