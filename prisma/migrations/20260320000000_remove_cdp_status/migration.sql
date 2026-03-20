-- Remove CDP-specific fields from ProtocolSponsor
ALTER TABLE "ProtocolSponsor" DROP COLUMN IF EXISTS "cdpAllowlistStatus";
ALTER TABLE "ProtocolSponsor" DROP COLUMN IF EXISTS "cdpAllowlistSubmittedAt";
ALTER TABLE "ProtocolSponsor" DROP COLUMN IF EXISTS "cdpAllowlistApprovedAt";

-- Remove PENDING_CDP from OnboardingStatus enum (requires recreating the type in Postgres)
-- Note: existing PENDING_CDP rows should be migrated to APPROVED_SIMULATION first
UPDATE "ProtocolSponsor" SET "onboardingStatus" = 'APPROVED_SIMULATION' WHERE "onboardingStatus" = 'PENDING_CDP';

-- Drop CDPStatus enum
DROP TYPE IF EXISTS "CDPStatus";
