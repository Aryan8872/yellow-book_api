import { PrismaClient, PlanAudience, BillingCycle } from '@prisma/client';

const prisma = new PrismaClient();

async function seedPlans() {
  console.log('🌱 Seeding initial subscription plans & system trial configs...');

  // 1. Merchant Plans
  const merchantPlans = [
    {
      code: 'MERCHANT_FOUNDING',
      name: 'Founding Partner',
      description: 'Introductory 6-month no-fee launch package for eligible partner merchants.',
      audience: PlanAudience.MERCHANT,
      priceNpr: 0,
      billingCycle: BillingCycle.BIANNUAL,
      durationDays: 180,
      trialDays: 180,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxBranches: 3,
        maxActiveOffers: 7,
        featuredBoostCount: 0,
        staffPinCount: 3,
        analyticsTier: 'STANDARD',
        verifiedBadge: true,
      },
    },
    {
      code: 'MERCHANT_STARTER',
      name: 'Starter',
      description: 'Ideal for independent outlets looking for digital reach and redemption tracking.',
      audience: PlanAudience.MERCHANT,
      priceNpr: 1499,
      billingCycle: BillingCycle.MONTHLY,
      durationDays: 30,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxBranches: 2,
        maxActiveOffers: 8,
        featuredBoostCount: 0,
        staffPinCount: 2,
        analyticsTier: 'STANDARD',
      },
    },
    {
      code: 'MERCHANT_GROWTH',
      name: 'Growth (Standard)',
      description: 'For established merchants seeking customer retention and offer prominence.',
      audience: PlanAudience.MERCHANT,
      priceNpr: 4999,
      billingCycle: BillingCycle.MONTHLY,
      durationDays: 30,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxBranches: 5,
        maxActiveOffers: 15,
        featuredBoostCount: 2,
        staffPinCount: 5,
        analyticsTier: 'ADVANCED',
        supportSla: '24h',
      },
    },
    {
      code: 'MERCHANT_ENTERPRISE',
      name: 'Enterprise (Premium)',
      description: 'Top-tier visibility, unlimited capacity, priority placement and dedicated account management.',
      audience: PlanAudience.MERCHANT,
      priceNpr: 12999,
      billingCycle: BillingCycle.MONTHLY,
      durationDays: 30,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxBranches: -1,
        maxActiveOffers: -1,
        featuredBoostCount: 5,
        staffPinCount: -1,
        analyticsTier: 'ENTERPRISE',
        topBannerPriority: true,
        posWebhookAccess: true,
      },
    },
  ];

  for (const p of merchantPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      create: p,
      update: p,
    });
    console.log(`  ✓ Merchant plan: ${p.name}`);
  }

  // 2. User Plans
  const userPlans = [
    {
      code: 'USER_INTRO_TRIAL',
      name: 'Launch Free Trial',
      description: 'Complimentary 6 months of unlimited offer redemptions for launch users.',
      audience: PlanAudience.USER,
      priceNpr: 0,
      billingCycle: BillingCycle.BIANNUAL,
      durationDays: 180,
      trialDays: 180,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxRedemptionsPerMonth: -1,
        accessVipOffers: true,
      },
    },
    {
      code: 'USER_FREE',
      name: 'Standard Free',
      description: 'Access standard discounts with basic monthly redemptions.',
      audience: PlanAudience.USER,
      priceNpr: 0,
      billingCycle: BillingCycle.MONTHLY,
      durationDays: 30,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxRedemptionsPerMonth: 3,
        accessVipOffers: false,
      },
    },
    {
      code: 'USER_CLUB_MONTHLY',
      name: 'OfferNepal Club (Monthly)',
      description: 'Unlimited redemptions, exclusive 1-for-1 dining vouchers and weekend perks.',
      audience: PlanAudience.USER,
      priceNpr: 199,
      billingCycle: BillingCycle.MONTHLY,
      durationDays: 30,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxRedemptionsPerMonth: -1,
        accessVipOffers: true,
        familySharingMax: 4,
      },
    },
    {
      code: 'USER_CLUB_ANNUAL',
      name: 'OfferNepal Club (Annual)',
      description: 'Full year of OfferNepal Club benefits with 2 months free equivalent savings.',
      audience: PlanAudience.USER,
      priceNpr: 1499,
      billingCycle: BillingCycle.ANNUAL,
      durationDays: 365,
      trialDays: 0,
      isActive: true,
      isPublic: true,
      entitlementsJson: {
        maxRedemptionsPerMonth: -1,
        accessVipOffers: true,
        familySharingMax: 4,
      },
    },
  ];

  for (const p of userPlans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: p.code },
      create: p,
      update: p,
    });
    console.log(`  ✓ User plan: ${p.name}`);
  }

  // 3. System Trial Configs
  await prisma.systemTrialConfig.upsert({
    where: { audience: PlanAudience.USER },
    create: {
      audience: PlanAudience.USER,
      isEnabled: true,
      defaultPeriodDays: 180,
      unlimitedRedeems: true,
      notes: 'Initial 6-month free consumer promotion active',
    },
    update: {
      isEnabled: true,
      defaultPeriodDays: 180,
    },
  });

  await prisma.systemTrialConfig.upsert({
    where: { audience: PlanAudience.MERCHANT },
    create: {
      audience: PlanAudience.MERCHANT,
      isEnabled: true,
      defaultPeriodDays: 180,
      unlimitedRedeems: true,
      notes: 'Founding merchant 6-month platform waiver active',
    },
    update: {
      isEnabled: true,
      defaultPeriodDays: 180,
    },
  });

  console.log('✅ Subscription plans and trial configs seeded successfully!');
}

seedPlans()
  .catch((e) => {
    console.error('❌ Failed seeding plans:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
