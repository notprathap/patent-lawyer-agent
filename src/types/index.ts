import { z } from 'zod/v4';

// ---------------------------------------------------------------------------
// Jurisdiction
// ---------------------------------------------------------------------------
export const JurisdictionSchema = z.enum(['US', 'EU', 'UK']);
export type Jurisdiction = z.infer<typeof JurisdictionSchema>;

export const ALL_JURISDICTIONS: Jurisdiction[] = ['US', 'EU', 'UK'];

// ---------------------------------------------------------------------------
// Claim Elements
// ---------------------------------------------------------------------------
export const ClaimElementTypeSchema = z.enum(['structural', 'functional', 'method_step']);
export type ClaimElementType = z.infer<typeof ClaimElementTypeSchema>;

export const ClaimElementSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: ClaimElementTypeSchema,
  isMeansPlusFunction: z.boolean(),
});
export type ClaimElement = z.infer<typeof ClaimElementSchema>;

// ---------------------------------------------------------------------------
// Parsed Claim
// ---------------------------------------------------------------------------
export const ParsedClaimSchema = z.object({
  fullText: z.string(),
  claimNumber: z.number(),
  isIndependent: z.boolean(),
  dependsOn: z.number().optional(),
  preamble: z.string().optional(),
  transitionPhrase: z.string().optional(),
  elements: z.array(ClaimElementSchema),
});
export type ParsedClaim = z.infer<typeof ParsedClaimSchema>;

// ---------------------------------------------------------------------------
// Analysis Input
// ---------------------------------------------------------------------------
export const AnalysisInputSchema = z.object({
  claimText: z.string().min(1),
  technicalSpecification: z.string().optional(),
  jurisdictions: z.array(JurisdictionSchema).default(['US', 'EU', 'UK']),
});
export type AnalysisInput = z.infer<typeof AnalysisInputSchema>;

// ---------------------------------------------------------------------------
// Prior Art References
// ---------------------------------------------------------------------------
export const PriorArtSourceSchema = z.enum([
  'USPTO',
  'EPO',
  'UK_IPO',
  'WIPO',
  'Google_Patents',
  'Semantic_Scholar',
  'IEEE',
  'arXiv',
]);
export type PriorArtSource = z.infer<typeof PriorArtSourceSchema>;

export const PriorArtReferenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  publicationNumber: z.string().optional(),
  url: z.string(),
  source: PriorArtSourceSchema,
  date: z.string().optional(),
  relevantExcerpt: z.string(),
  jurisdictions: z.array(JurisdictionSchema),
  relevanceScore: z.number().min(0).max(1),
});
export type PriorArtReference = z.infer<typeof PriorArtReferenceSchema>;

// ---------------------------------------------------------------------------
// Element Coverage (per-element prior art mapping)
// ---------------------------------------------------------------------------
export const CoverageLevelSchema = z.enum(['strong', 'moderate', 'weak', 'none']);
export type CoverageLevel = z.infer<typeof CoverageLevelSchema>;

export const ElementCoverageSchema = z.object({
  elementId: z.string(),
  references: z.array(PriorArtReferenceSchema),
  coverageLevel: CoverageLevelSchema,
});
export type ElementCoverage = z.infer<typeof ElementCoverageSchema>;

// ---------------------------------------------------------------------------
// Prior Art Report (output of Prior Art Investigator)
// ---------------------------------------------------------------------------
export const PriorArtReportSchema = z.object({
  elementCoverages: z.array(ElementCoverageSchema),
  searchQueries: z.array(z.string()),
  sourcesSearched: z.array(PriorArtSourceSchema),
  totalReferencesFound: z.number(),
});
export type PriorArtReport = z.infer<typeof PriorArtReportSchema>;

// ---------------------------------------------------------------------------
// Agent Result (generic wrapper for all agent outputs)
// ---------------------------------------------------------------------------
export interface AgentResult<T> {
  data: T;
  reasoning: string;
  confidence: number;
  tokensUsed: {
    input: number;
    output: number;
  };
}
