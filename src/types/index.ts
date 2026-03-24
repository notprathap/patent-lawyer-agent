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
// Invalidity Analysis — Strength Rating
// ---------------------------------------------------------------------------
export const ArgumentStrengthSchema = z.enum(['strong', 'moderate', 'weak']);
export type ArgumentStrength = z.infer<typeof ArgumentStrengthSchema>;

// ---------------------------------------------------------------------------
// US Analysis (35 U.S.C. §§ 102, 103)
// ---------------------------------------------------------------------------
export const AnticipationArgumentSchema = z.object({
  referenceId: z.string(),
  referenceTitle: z.string(),
  elementMappings: z.array(
    z.object({
      elementId: z.string(),
      excerpt: z.string(),
      explanation: z.string(),
    }),
  ),
  strength: ArgumentStrengthSchema,
});
export type AnticipationArgument = z.infer<typeof AnticipationArgumentSchema>;

export const GrahamFactorsSchema = z.object({
  scopeAndContent: z.string(),
  differenceFromPriorArt: z.string(),
  levelOfOrdinarySkill: z.string(),
  secondaryConsiderations: z.string().optional(),
});
export type GrahamFactors = z.infer<typeof GrahamFactorsSchema>;

export const ObviousnessArgumentSchema = z.object({
  referenceIds: z.array(z.string()),
  referenceTitles: z.array(z.string()),
  motivationToCombine: z.string(),
  grahamFactors: GrahamFactorsSchema,
  ksrRationale: z.string().optional(),
  strength: ArgumentStrengthSchema,
});
export type ObviousnessArgument = z.infer<typeof ObviousnessArgumentSchema>;

export const USAnalysisSchema = z.object({
  anticipationArgs: z.array(AnticipationArgumentSchema),
  obviousnessArgs: z.array(ObviousnessArgumentSchema),
  strongestElements: z.array(z.string()),
  weakestElements: z.array(z.string()),
  overallStrength: ArgumentStrengthSchema,
  summary: z.string(),
});
export type USAnalysis = z.infer<typeof USAnalysisSchema>;

// ---------------------------------------------------------------------------
// EPO Analysis (EPC Articles 54, 56 — Problem-Solution Approach)
// ---------------------------------------------------------------------------
export const ProblemSolutionApproachSchema = z.object({
  closestPriorArt: z.object({
    referenceId: z.string(),
    referenceTitle: z.string(),
    justification: z.string(),
  }),
  objectiveTechnicalProblem: z.string(),
  couldWouldAnalysis: z.string(),
  conclusion: z.string(),
  strength: ArgumentStrengthSchema,
});
export type ProblemSolutionApproach = z.infer<typeof ProblemSolutionApproachSchema>;

export const EPOAnalysisSchema = z.object({
  noveltyArgs: z.array(
    z.object({
      referenceId: z.string(),
      referenceTitle: z.string(),
      explanation: z.string(),
      strength: ArgumentStrengthSchema,
    }),
  ),
  inventiveStepArgs: z.array(ProblemSolutionApproachSchema),
  strongestElements: z.array(z.string()),
  weakestElements: z.array(z.string()),
  overallStrength: ArgumentStrengthSchema,
  summary: z.string(),
});
export type EPOAnalysis = z.infer<typeof EPOAnalysisSchema>;

// ---------------------------------------------------------------------------
// UK Analysis (UK Patents Act 1977 — Windsurfing/Pozzoli Test)
// ---------------------------------------------------------------------------
export const PozzoliTestSchema = z.object({
  skilledPersonAndCGK: z.string(),
  inventiveConcept: z.string(),
  differencesFromPriorArt: z.string(),
  obviousnessAssessment: z.string(),
  conclusion: z.string(),
  strength: ArgumentStrengthSchema,
});
export type PozzoliTest = z.infer<typeof PozzoliTestSchema>;

export const UKAnalysisSchema = z.object({
  noveltyArgs: z.array(
    z.object({
      referenceId: z.string(),
      referenceTitle: z.string(),
      explanation: z.string(),
      strength: ArgumentStrengthSchema,
    }),
  ),
  inventiveStepArgs: z.array(PozzoliTestSchema),
  strongestElements: z.array(z.string()),
  weakestElements: z.array(z.string()),
  overallStrength: ArgumentStrengthSchema,
  summary: z.string(),
});
export type UKAnalysis = z.infer<typeof UKAnalysisSchema>;

// ---------------------------------------------------------------------------
// Multi-Jurisdiction Analysis (output of Patent Examiner)
// ---------------------------------------------------------------------------
export const MultiJurisdictionAnalysisSchema = z.object({
  us: USAnalysisSchema.optional(),
  epo: EPOAnalysisSchema.optional(),
  uk: UKAnalysisSchema.optional(),
  divergences: z.array(z.string()),
  overallAssessment: z.string(),
});
export type MultiJurisdictionAnalysis = z.infer<typeof MultiJurisdictionAnalysisSchema>;

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
