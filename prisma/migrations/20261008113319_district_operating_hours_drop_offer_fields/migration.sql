-- DistrictEnum
CREATE TYPE "District" AS ENUM ('JHAPA', 'KATHMANDU', 'CHITWAN', 'POKHARA');

-- Add district as nullable first so existing rows can be backfilled
ALTER TABLE "merchant_branches" ADD COLUMN "district" "District";

-- Backfill from legacy city values (valley towns map to KATHMANDU, etc.)
UPDATE "merchant_branches" SET "district" = CASE
  WHEN lower("city") LIKE '%jhapa%' THEN 'JHAPA'::"District"
  WHEN lower("city") LIKE '%kathmandu%' OR lower("city") LIKE '%lalitpur%' OR lower("city") LIKE '%bhaktapur%' THEN 'KATHMANDU'::"District"
  WHEN lower("city") LIKE '%chitwan%' OR lower("city") LIKE '%bharatpur%' THEN 'CHITWAN'::"District"
  WHEN lower("city") LIKE '%pokhara%' OR lower("city") LIKE '%kaski%' THEN 'POKHARA'::"District"
  ELSE 'KATHMANDU'::"District"
END;

ALTER TABLE "merchant_branches" ALTER COLUMN "district" SET NOT NULL;
ALTER TABLE "merchant_branches" DROP COLUMN "city";
ALTER TABLE "merchant_branches" ADD COLUMN "operating_hours" JSONB;

ALTER TABLE "offers" DROP COLUMN "discounted_price_npr";
ALTER TABLE "offers" DROP COLUMN "max_per_user";
