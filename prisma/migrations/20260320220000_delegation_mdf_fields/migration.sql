-- MDF integration on Delegation (idempotent: safe if enum/columns already exist)

DO $create_enum$
BEGIN
  CREATE TYPE "DelegatorAccountType" AS ENUM ('DELEGATOR', 'EOA', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$create_enum$;

ALTER TABLE "Delegation" ADD COLUMN IF NOT EXISTS "mdfDelegationHash" TEXT;
ALTER TABLE "Delegation" ADD COLUMN IF NOT EXISTS "serializedMdfDelegation" TEXT;
ALTER TABLE "Delegation" ADD COLUMN IF NOT EXISTS "delegationManagerAddress" TEXT;

-- Add delegatorAccountType only when missing (NOT NULL + default for backfill)
DO $add_col$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'Delegation' AND column_name = 'delegatorAccountType'
  ) THEN
    ALTER TABLE "Delegation" ADD COLUMN "delegatorAccountType" "DelegatorAccountType" NOT NULL DEFAULT 'EOA';
  END IF;
END
$add_col$;

CREATE INDEX IF NOT EXISTS "Delegation_mdfDelegationHash_idx" ON "Delegation"("mdfDelegationHash");
