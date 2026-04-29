import { z } from 'zod/v4';
import { JurisdictionSchema } from './index.js';

// ---------------------------------------------------------------------------
// Product (the user's product/process under clearance review)
// ---------------------------------------------------------------------------

export const ProductFeatureTypeSchema = z.enum([
  'component',     // physical part / module / element
  'function',      // what a part does or is configured to do
  'process_step',  // step in a method/process
  'parameter',     // value, range, threshold (e.g., "operates at 5V")
]);
export type ProductFeatureType = z.infer<typeof ProductFeatureTypeSchema>;

export const ProductFeatureSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: ProductFeatureTypeSchema,
});
export type ProductFeature = z.infer<typeof ProductFeatureSchema>;

export const ParsedProductSchema = z.object({
  fullText: z.string(),
  industry: z.string().optional(),
  features: z.array(ProductFeatureSchema),
});
export type ParsedProduct = z.infer<typeof ParsedProductSchema>;

// ---------------------------------------------------------------------------
// Patent-to-check (user-supplied) and Discovered Patent (search results)
// ---------------------------------------------------------------------------

export const PatentToCheckSchema = z.object({
  publicationNumber: z.string(),
  notes: z.string().optional(),
});
export type PatentToCheckInput = z.infer<typeof PatentToCheckSchema>;

export const PatentSourceSchema = z.enum(['USPTO', 'EPO', 'User_Provided']);
export type PatentSource = z.infer<typeof PatentSourceSchema>;

export const DiscoveredPatentSchema = z.object({
  id: z.string(),                          // P1, P2, ...
  publicationNumber: z.string(),
  title: z.string(),
  abstract: z.string().optional(),
  url: z.string(),
  source: PatentSourceSchema,
  filingDate: z.string().optional(),
  publicationDate: z.string().optional(),
  assignee: z.string().optional(),
  // Independent claim text (full text or best-effort extract)
  independentClaims: z.array(z.string()).default([]),
  // Markets where this patent likely has effect (best-effort)
  jurisdictions: z.array(JurisdictionSchema).default([]),
  // Best-effort status. We do not check legal-status feeds in v1.
  statusNote: z.string().default('Status not verified — confirm legal status before relying.'),
  // Why the agent picked this patent as a candidate blocker
  relevanceRationale: z.string(),
});
export type DiscoveredPatent = z.infer<typeof DiscoveredPatentSchema>;

export const DiscoveredPatentsReportSchema = z.object({
  patents: z.array(DiscoveredPatentSchema),
  searchQueries: z.array(z.string()),
  sourcesSearched: z.array(PatentSourceSchema),
  totalFound: z.number(),
});
export type DiscoveredPatentsReport = z.infer<typeof DiscoveredPatentsReportSchema>;

// ---------------------------------------------------------------------------
// Per-patent infringement analysis
// ---------------------------------------------------------------------------

export const RiskLevelSchema = z.enum(['Clear', 'Low', 'Medium', 'High']);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const FeatureMappingSchema = z.object({
  productFeatureId: z.string(),
  claimElementText: z.string(),
  literalMatch: z.boolean(),
  equivalentMatch: z.boolean(),
  rationale: z.string(),
});
export type FeatureMapping = z.infer<typeof FeatureMappingSchema>;

export const ClaimMappingSchema = z.object({
  patentId: z.string(),
  claimNumber: z.number().optional(),
  claimText: z.string(),
  jurisdiction: JurisdictionSchema,
  // Mapping of product features → claim elements
  mappings: z.array(FeatureMappingSchema),
  // Risk assessment for this specific claim
  literalInfringementRisk: RiskLevelSchema,
  doctrineOfEquivalentsRisk: RiskLevelSchema,
  // Jurisdiction-specific notes (e.g., Festo prosecution-history estoppel for US,
  // Actavis purposive construction for UK, EPC Art.69 + Protocol for EU)
  jurisdictionalNotes: z.string(),
});
export type ClaimMapping = z.infer<typeof ClaimMappingSchema>;

export const PatentInfringementAnalysisSchema = z.object({
  patentId: z.string(),
  publicationNumber: z.string(),
  title: z.string(),
  // One mapping per analyzed claim × jurisdiction combination
  claimMappings: z.array(ClaimMappingSchema),
  // Worst-case risk across all mapped claims, per jurisdiction
  perJurisdictionRisk: z.array(
    z.object({
      jurisdiction: JurisdictionSchema,
      risk: RiskLevelSchema,
      reasoning: z.string(),
    }),
  ),
  // Recommended action: design-around suggestions, license candidate, or drop
  recommendation: z.string(),
});
export type PatentInfringementAnalysis = z.infer<typeof PatentInfringementAnalysisSchema>;

export const FTOInfringementReportSchema = z.object({
  perPatentAnalyses: z.array(PatentInfringementAnalysisSchema),
  // Patents flagged as material blockers in any market
  blockingPatents: z.array(z.string()),     // patent IDs
  // Cross-market divergences
  divergences: z.array(z.string()),
  // Aggregated overall assessment
  overallAssessment: z.string(),
  // Design-around suggestions across patents
  designAroundOpportunities: z.array(z.string()),
});
export type FTOInfringementReport = z.infer<typeof FTOInfringementReportSchema>;

// ---------------------------------------------------------------------------
// FTO Analysis Input (what the API/orchestrator receives)
// ---------------------------------------------------------------------------

export const FTOAnalysisInputSchema = z.object({
  productDescription: z.string().min(1),
  targetMarkets: z.array(JurisdictionSchema).default(['US', 'EU', 'UK']),
  patentsToCheck: z.array(PatentToCheckSchema).default([]),
});
export type FTOAnalysisInput = z.infer<typeof FTOAnalysisInputSchema>;

// ---------------------------------------------------------------------------
// FTO Risk Score (per market) and overall
// ---------------------------------------------------------------------------

export const FTOMarketScoreSchema = z.object({
  market: JurisdictionSchema,
  risk: RiskLevelSchema,
  rationale: z.string(),
});
export type FTOMarketScore = z.infer<typeof FTOMarketScoreSchema>;

export const FTOAssessmentConfidenceSchema = z.enum(['High', 'Medium', 'Low']);
export type FTOAssessmentConfidence = z.infer<typeof FTOAssessmentConfidenceSchema>;

export const FTOConfidenceReportSchema = z.object({
  marketScores: z.array(FTOMarketScoreSchema),
  overallRisk: RiskLevelSchema,
  assessmentConfidence: FTOAssessmentConfidenceSchema,
  confidenceRationale: z.string(),
});
export type FTOConfidenceReport = z.infer<typeof FTOConfidenceReportSchema>;
