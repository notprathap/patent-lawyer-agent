import type { Jurisdiction } from '../types/index.js';
import type {
  ParsedProduct,
  DiscoveredPatentsReport,
  FTOInfringementReport,
  PatentToCheckInput,
} from '../types/fto.js';

export type FTOStep =
  | 'pending'
  | 'validating'
  | 'deconstructing_product'
  | 'discovering_patents'
  | 'analyzing_infringement'
  | 'reflecting'
  | 'synthesizing'
  | 'complete'
  | 'failed';

export interface FTOSession {
  id: string;
  productDescription: string;
  targetMarkets: Jurisdiction[];
  patentsToCheck: PatentToCheckInput[];
  step: FTOStep;
  startedAt: Date;
  completedAt?: Date;

  parsedProduct?: ParsedProduct;
  discoveredPatents?: DiscoveredPatentsReport;
  infringementReport?: FTOInfringementReport;
  reflectionNotes?: string;
  memo?: string;

  issues: string[];
  totalTokensUsed: { input: number; output: number };
}

let counter = 0;

export function createFTOSession(
  productDescription: string,
  targetMarkets: Jurisdiction[],
  patentsToCheck: PatentToCheckInput[],
): FTOSession {
  counter++;
  return {
    id: `fto-session-${counter}-${Date.now()}`,
    productDescription,
    targetMarkets,
    patentsToCheck,
    step: 'pending',
    startedAt: new Date(),
    issues: [],
    totalTokensUsed: { input: 0, output: 0 },
  };
}

export { addTokenUsage } from './token-usage.js';
