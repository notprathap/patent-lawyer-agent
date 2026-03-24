-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('PENDING', 'VALIDATING', 'DECONSTRUCTING', 'SEARCHING_PRIOR_ART', 'EXAMINING', 'REFLECTING', 'SYNTHESIZING', 'COMPLETE', 'FAILED');

-- CreateTable
CREATE TABLE "Analysis" (
    "id" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "claimText" TEXT NOT NULL,
    "technicalSpec" TEXT,
    "jurisdictions" TEXT[],
    "parsedClaim" JSONB,
    "priorArtReport" JSONB,
    "examinerAnalysis" JSONB,
    "reflectionNotes" TEXT,
    "memo" TEXT,
    "confidenceReport" JSONB,
    "usRating" TEXT,
    "epoRating" TEXT,
    "ukRating" TEXT,
    "assessmentConfidence" TEXT,
    "totalInputTokens" INTEGER NOT NULL DEFAULT 0,
    "totalOutputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClaimElement" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "elementIndex" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isMeansPlusFunction" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL,

    CONSTRAINT "ClaimElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriorArtReference" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "refIndex" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publicationNumber" TEXT,
    "source" TEXT NOT NULL,
    "date" TEXT,
    "relevantExcerpt" TEXT NOT NULL,
    "jurisdictions" TEXT[],

    CONSTRAINT "PriorArtReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ElementReference" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "relevanceScore" DOUBLE PRECISION NOT NULL,
    "coverageLevel" TEXT NOT NULL,

    CONSTRAINT "ElementReference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvalidityArgument" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "jurisdiction" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "strength" TEXT NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "InvalidityArgument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SearchQuery" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchQuery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Analysis_status_idx" ON "Analysis"("status");

-- CreateIndex
CREATE INDEX "Analysis_createdAt_idx" ON "Analysis"("createdAt");

-- CreateIndex
CREATE INDEX "ClaimElement_analysisId_idx" ON "ClaimElement"("analysisId");

-- CreateIndex
CREATE INDEX "PriorArtReference_analysisId_idx" ON "PriorArtReference"("analysisId");

-- CreateIndex
CREATE INDEX "ElementReference_analysisId_idx" ON "ElementReference"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "ElementReference_elementId_referenceId_key" ON "ElementReference"("elementId", "referenceId");

-- CreateIndex
CREATE INDEX "InvalidityArgument_analysisId_idx" ON "InvalidityArgument"("analysisId");

-- CreateIndex
CREATE INDEX "InvalidityArgument_jurisdiction_idx" ON "InvalidityArgument"("jurisdiction");

-- CreateIndex
CREATE INDEX "SearchQuery_analysisId_idx" ON "SearchQuery"("analysisId");

-- AddForeignKey
ALTER TABLE "ClaimElement" ADD CONSTRAINT "ClaimElement_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriorArtReference" ADD CONSTRAINT "PriorArtReference_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementReference" ADD CONSTRAINT "ElementReference_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementReference" ADD CONSTRAINT "ElementReference_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "ClaimElement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ElementReference" ADD CONSTRAINT "ElementReference_referenceId_fkey" FOREIGN KEY ("referenceId") REFERENCES "PriorArtReference"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvalidityArgument" ADD CONSTRAINT "InvalidityArgument_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SearchQuery" ADD CONSTRAINT "SearchQuery_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "Analysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
