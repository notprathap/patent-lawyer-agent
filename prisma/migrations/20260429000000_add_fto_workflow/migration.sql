-- AlterTable: add Freedom-to-Operate (FTO) fields to Analysis
ALTER TABLE "Analysis"
  ADD COLUMN IF NOT EXISTS "productDescription"  TEXT,
  ADD COLUMN IF NOT EXISTS "targetMarkets"       TEXT[]   NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "parsedProduct"       JSONB,
  ADD COLUMN IF NOT EXISTS "discoveredPatents"   JSONB,
  ADD COLUMN IF NOT EXISTS "infringementReport"  JSONB,
  ADD COLUMN IF NOT EXISTS "overallFtoRisk"      TEXT;

-- CreateEnum: AnalysisType
DO $$
BEGIN
  CREATE TYPE "AnalysisType" AS ENUM ('DEFENSIBILITY', 'FTO');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

-- AlterTable: add analysisType column with default DEFENSIBILITY (back-compat)
ALTER TABLE "Analysis"
  ADD COLUMN IF NOT EXISTS "analysisType" "AnalysisType" NOT NULL DEFAULT 'DEFENSIBILITY';

-- AlterEnum: add new FTO statuses to AnalysisStatus
ALTER TYPE "AnalysisStatus" ADD VALUE IF NOT EXISTS 'DECONSTRUCTING_PRODUCT';
ALTER TYPE "AnalysisStatus" ADD VALUE IF NOT EXISTS 'DISCOVERING_PATENTS';
ALTER TYPE "AnalysisStatus" ADD VALUE IF NOT EXISTS 'MAPPING_PATENTS';
ALTER TYPE "AnalysisStatus" ADD VALUE IF NOT EXISTS 'ANALYZING_INFRINGEMENT';

-- CreateTable: PatentToCheck (user-supplied patents to clear in FTO mode)
CREATE TABLE IF NOT EXISTS "PatentToCheck" (
  "id"                TEXT PRIMARY KEY,
  "analysisId"        TEXT    NOT NULL,
  "publicationNumber" TEXT    NOT NULL,
  "notes"             TEXT,
  "position"          INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PatentToCheck_analysisId_fkey"
    FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PatentToCheck_analysisId_idx" ON "PatentToCheck"("analysisId");

-- CreateIndex: by analysisType
CREATE INDEX IF NOT EXISTS "Analysis_analysisType_idx" ON "Analysis"("analysisType");
