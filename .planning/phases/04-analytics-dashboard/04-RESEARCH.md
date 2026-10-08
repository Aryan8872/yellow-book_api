# Phase 4: Analytics Dashboard - Research

**Created:** 2026-10-05
**Phase:** 4 - Analytics Dashboard

---

## Requirements Overview

Analytics features for admin panel (ANLY-01 through ANLY-06):

- **ANLY-01:** Redemption trends (day by day, week data for bar graph)
- **ANLY-02:** Most redeemed offers
- **ANLY-03:** Trending merchants (whose offers have been claimed more)
- **ANLY-04:** Merchant revenue analytics (revenue model: original price × redemption count)
- **ANLY-05:** Redemption summary by category (multi-series line chart data)
- **ANLY-06:** Configurable time ranges (last 7 days, last 30 days)

---

## Existing Schema Analysis

### RedemptionSession Model
```prisma
model RedemptionSession {
  id            String           @id @default(cuid())
  userId        String           @map("user_id")
  offerId       String           @map("offer_id")
  status        RedemptionStatus @default(INIT)
  savingsNpr    Decimal          @map("savings_npr") @db.Decimal(10, 2)
  codeExpiresAt DateTime         @map("code_expires_at")
  redeemedAt    DateTime?        @map("redeemed_at")
  createdAt     DateTime         @default(now()) @map("created_at")
  
  // Relations
  user   User   @relation(fields: [userId], references: [id])
  offer  Offer  @relation(fields: [offerId], references: [id])
  
  @@index([createdAt])
  @@index([status])
  @@map("redemption_sessions")
}
```

**Key fields for analytics:**
- `createdAt` - For time-based aggregation
- `status` - Filter for REDEEMED status only
- `redeemedAt` - Actual redemption timestamp
- `savingsNpr` - Savings amount per redemption
- `offerId` - Join to Offer for merchant/category data

### Offer Model
```prisma
model Offer {
  id                  String   @id @default(cuid())
  merchantId          String   @map("merchant_id")
  categoryId          String   @map("category_id")
  title               String
  originalPriceNpr    Decimal? @map("original_price_npr") @db.Decimal(10, 2)
  redemptionCount     Int      @default(0) @map("redemption_count")
  trendingScore       Decimal  @default(0) @map("trending_score") @db.Decimal(10, 2)
  
  // Relations
  merchant    Merchant            @relation(fields: [merchantId], references: [id])
  category    Category            @relation(fields: [categoryId], references: [id])
  redemptions RedemptionSession[]
  
  @@index([redemptionCount])
  @@index([trendingScore])
  @@map("offers")
}
```

**Key fields for analytics:**
- `redemptionCount` - Cached redemption count (may need recalculation)
- `trendingScore` - Pre-calculated trending score
- `originalPriceNpr` - For revenue calculation
- `merchantId` - Group by merchant
- `categoryId` - Group by category

### Merchant Model
```prisma
model Merchant {
  id   String @id @default(cuid())
  name String
  status MerchantStatus @default(PENDING_REVIEW)
  
  offers Offer[]
  
  @@index([status])
  @@map("merchants")
}
```

### Category Model
```prisma
model Category {
  id          String   @id @default(cuid())
  name        String   @unique
  offerCount  Int      @default(0) @map("offer_count")
  
  offers Offer[]
  
  @@map("categories")
}
```

---

## Data Aggregation Patterns

### 1. Redemption Trends (Day by Day)

**Query pattern:**
```typescript
// Group redemptions by date
SELECT 
  DATE(redeemedAt) as date,
  COUNT(*) as count
FROM redemption_sessions
WHERE status = 'REDEEMED'
  AND redeemedAt >= :startDate
  AND redeemedAt <= :endDate
GROUP BY DATE(redeemedAt)
ORDER BY date ASC
```

**Chart format (bar graph):**
```typescript
{
  labels: ['2026-10-01', '2026-10-02', ...],
  data: [120, 145, 98, ...]
}
```

**Week data aggregation:**
```typescript
// Group by week
SELECT 
  DATE_TRUNC('week', redeemedAt) as week,
  COUNT(*) as count
FROM redemption_sessions
WHERE status = 'REDEEMED'
  AND redeemedAt >= :startDate
  AND redeemedAt <= :endDate
GROUP BY DATE_TRUNC('week', redeemedAt)
ORDER BY week ASC
```

### 2. Most Redeemed Offers

**Query pattern:**
```typescript
SELECT 
  o.id,
  o.title,
  o.originalPriceNpr,
  COUNT(rs.id) as redemptionCount
FROM offers o
JOIN redemption_sessions rs ON rs.offerId = o.id
WHERE rs.status = 'REDEEMED'
  AND rs.redeemedAt >= :startDate
  AND rs.redeemedAt <= :endDate
GROUP BY o.id
ORDER BY redemptionCount DESC
LIMIT 10
```

**Response format:**
```typescript
{
  offers: [
    { id: '...', title: '50% off at XYZ', redemptionCount: 234, originalPriceNpr: 500 },
    ...
  ]
}
```

### 3. Trending Merchants

**Query pattern:**
```typescript
SELECT 
  m.id,
  m.name,
  COUNT(rs.id) as totalRedemptions,
  COUNT(DISTINCT rs.offerId) as uniqueOffersClaimed
FROM merchants m
JOIN offers o ON o.merchantId = m.id
JOIN redemption_sessions rs ON rs.offerId = o.id
WHERE rs.status = 'REDEEMED'
  AND rs.redeemedAt >= :startDate
  AND rs.redeemedAt <= :endDate
GROUP BY m.id
ORDER BY totalRedemptions DESC
LIMIT 10
```

**Response format:**
```typescript
{
  merchants: [
    { id: '...', name: 'Merchant A', totalRedemptions: 450, uniqueOffersClaimed: 5 },
    ...
  ]
}
```

### 4. Merchant Revenue Analytics

**Revenue model:** original price × redemption count

**Query pattern:**
```typescript
SELECT 
  m.id,
  m.name,
  COUNT(rs.id) as redemptionCount,
  SUM(o.originalPriceNpr) as totalRevenue
FROM merchants m
JOIN offers o ON o.merchantId = m.id
JOIN redemption_sessions rs ON rs.offerId = o.id
WHERE rs.status = 'REDEEMED'
  AND rs.redeemedAt >= :startDate
  AND rs.redeemedAt <= :endDate
GROUP BY m.id
ORDER BY totalRevenue DESC
```

**Response format:**
```typescript
{
  merchants: [
    { id: '...', name: 'Merchant A', redemptionCount: 120, totalRevenue: 60000 },
    ...
  ]
}
```

### 5. Redemption Summary by Category

**Query pattern (multi-series line chart):**
```typescript
SELECT 
  DATE(rs.redeemedAt) as date,
  c.name as category,
  COUNT(*) as count
FROM redemption_sessions rs
JOIN offers o ON rs.offerId = o.id
JOIN categories c ON o.categoryId = c.id
WHERE rs.status = 'REDEEMED'
  AND rs.redeemedAt >= :startDate
  AND rs.redeemedAt <= :endDate
GROUP BY DATE(rs.redeemedAt), c.name
ORDER BY date ASC, category ASC
```

**Chart format (multi-series line chart):**
```typescript
{
  labels: ['2026-10-01', '2026-10-02', ...],
  datasets: [
    { label: 'Dining', data: [45, 52, 38, ...] },
    { label: 'Wellness', data: [30, 35, 42, ...] },
    { label: 'Entertainment', data: [25, 28, 22, ...] },
    ...
  ]
}
```

### 6. Configurable Time Ranges

**Time range options:**
- Last 7 days
- Last 30 days
- Custom date range

**Implementation:**
```typescript
interface TimeRange {
  startDate: Date;
  endDate: Date;
}

function getTimeRange(range: '7d' | '30d' | 'custom', customStart?: Date, customEnd?: Date): TimeRange {
  const now = new Date();
  const endDate = new Date(now.setHours(23, 59, 59, 999));
  
  if (range === '7d') {
    const startDate = new Date(now.setDate(now.getDate() - 7));
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  
  if (range === '30d') {
    const startDate = new Date(now.setDate(now.getDate() - 30));
    startDate.setHours(0, 0, 0, 0);
    return { startDate, endDate };
  }
  
  if (range === 'custom' && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }
}
```

---

## Performance Considerations

### Database Indexes

**Existing indexes that help analytics:**
- `redemption_sessions.createdAt` - For time-based filtering
- `redemption_sessions.status` - For filtering REDEEMED status
- `offers.redemptionCount` - For sorting by popularity
- `offers.trendingScore` - For trending queries

**Recommended additional indexes:**
```prisma
model RedemptionSession {
  // ... existing fields
  
  @@index([status, redeemedAt]) // Composite index for status + time filtering
  @@index([offerId, status]) // For offer-specific analytics
}
```

### Query Optimization

1. **Always filter by status = 'REDEEMED'** - Only count actual redemptions
2. **Use date range limits** - Prevent full table scans
3. **Limit result sets** - Top 10/20 for leaderboards
4. **Consider caching** - Redis for frequently accessed analytics data
5. **Materialized views** - For complex aggregations (PostgreSQL feature)

### Caching Strategy

**Cache keys:**
- `analytics:redemption_trends:7d` - TTL: 1 hour
- `analytics:redemption_trends:30d` - TTL: 4 hours
- `analytics:top_offers:7d` - TTL: 30 minutes
- `analytics:top_merchants:7d` - TTL: 30 minutes

**Cache invalidation:**
- Invalidate on new redemption (webhook or event)
- Time-based TTL for stale data tolerance

---

## Chart Data Formats

### Bar Chart (Redemption Trends)
```typescript
interface BarChartData {
  labels: string[]; // Dates
  datasets: [{
    label: string;
    data: number[];
    backgroundColor?: string;
  }];
}
```

### Line Chart (Category Trends)
```typescript
interface LineChartData {
  labels: string[]; // Dates
  datasets: Array<{
    label: string; // Category name
    data: number[];
    borderColor?: string;
    backgroundColor?: string;
  }>;
}
```

### Leaderboard (Top Offers/Merchants)
```typescript
interface LeaderboardData {
  items: Array<{
    id: string;
    name: string;
    count: number;
    revenue?: number;
  }>;
}
```

---

## API Design Patterns

### Analytics Controller Structure

```typescript
@Controller('analytics')
@UseGuards(JwtAuthGuard, AdminOnlyGuard)
export class AnalyticsController {
  
  @Get('redemption-trends')
  async getRedemptionTrends(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getRedemptionTrends(dto);
  }
  
  @Get('top-offers')
  async getTopOffers(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getTopOffers(dto);
  }
  
  @Get('top-merchants')
  async getTopMerchants(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getTopMerchants(dto);
  }
  
  @Get('merchant-revenue')
  async getMerchantRevenue(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getMerchantRevenue(dto);
  }
  
  @Get('category-trends')
  async getCategoryTrends(@Query() dto: TimeRangeDto) {
    return this.analyticsService.getCategoryTrends(dto);
  }
}
```

### DTO Structure

```typescript
export class TimeRangeDto {
  @IsEnum(['7d', '30d', 'custom'])
  range: '7d' | '30d' | 'custom' = '7d';

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
```

---

## Integration with Next.js Admin Panel

### Response Format

All analytics endpoints should return data in chart-ready format:

```typescript
{
  success: true,
  data: {
    // Chart-specific format
  }
}
```

### Date Format

Use ISO 8601 format for dates: `YYYY-MM-DD`

### Currency Format

Return amounts as numbers (no formatting), let frontend handle display

---

## Open Questions

1. **Real-time vs cached:** Should analytics be real-time or cached with TTL?
   - Recommendation: Cache with 30min-1hr TTL for performance

2. **Historical data retention:** How long to keep detailed redemption data?
   - Recommendation: Keep raw data indefinitely, aggregate for older periods

3. **Timezone handling:** Should analytics use UTC or local timezone?
   - Recommendation: UTC for storage, convert in frontend

4. **Merchant access:** Will merchants need their own analytics dashboard?
   - Requirement says "defer to v2" - admin only for now

---

## Dependencies

### Existing Modules
- `AdminModule` - For authorization (AdminOnlyGuard)
- `PrismaModule` - For database queries
- `RedisModule` - For caching (optional but recommended)

### New Module
- `AnalyticsModule` - New module for analytics endpoints

---

## Implementation Notes

1. **Use Prisma raw queries** for complex aggregations (GROUP BY, DATE_TRUNC)
2. **Validate time ranges** - Ensure endDate > startDate
3. **Handle empty data** - Return empty arrays, not null
4. **Error handling** - Graceful degradation if queries fail
5. **Logging** - Log slow analytics queries for optimization

---

## References

- Chart.js documentation for data formats
- PostgreSQL DATE_TRUNC function for date grouping
- Prisma raw query for complex aggregations
- Redis caching patterns for analytics
