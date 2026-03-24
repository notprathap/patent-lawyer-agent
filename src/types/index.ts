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
