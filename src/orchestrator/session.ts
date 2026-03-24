import type {
  Jurisdiction,
  ParsedClaim,
  PriorArtReport,
  MultiJurisdictionAnalysis,
} from '../types/index.js';

export type AnalysisStep =
  | 'pending'
  | 'validating'
  | 'deconstructing'
  | 'searching_prior_art'
  | 'examining'
  | 'reflecting'
  | 'synthesizing'
  | 'complete'
  | 'failed';

export interface AnalysisSession {
  id: string;
  claimText: string;
  technicalSpecification?: string;
  jurisdictions: Jurisdiction[];
  step: AnalysisStep;
  startedAt: Date;
  completedAt?: Date;

  // Intermediate results
  parsedClaim?: ParsedClaim;
  priorArtReport?: PriorArtReport;
  examinerAnalysis?: MultiJurisdictionAnalysis;
  reflectionNotes?: string;
  memo?: string;

  // Tracking
  issues: string[];
  totalTokensUsed: { input: number; output: number };
}

let sessionCounter = 0;

export function createSession(
  claimText: string,
  jurisdictions: Jurisdiction[],
  technicalSpecification?: string,
): AnalysisSession {
  sessionCounter++;
  return {
    id: `session-${sessionCounter}-${Date.now()}`,
    claimText,
    technicalSpecification,
    jurisdictions,
    step: 'pending',
    startedAt: new Date(),
    issues: [],
    totalTokensUsed: { input: 0, output: 0 },
  };
}

export function addTokenUsage(
  session: AnalysisSession,
  tokens: { input: number; output: number },
): void {
  session.totalTokensUsed.input += tokens.input;
  session.totalTokensUsed.output += tokens.output;
}
