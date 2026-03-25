import type {
  Jurisdiction,
  PriorArtReport,
  MultiJurisdictionAnalysis,
  ArgumentStrength,
} from '../types/index.js';

export type DefensibilityRating = 'Strong' | 'Moderate' | 'Weak';
export type AssessmentConfidence = 'High' | 'Medium' | 'Low';

export interface JurisdictionScore {
  jurisdiction: Jurisdiction;
  defensibility: DefensibilityRating;
  rationale: string;
}

export interface ConfidenceReport {
  jurisdictionScores: JurisdictionScore[];
  assessmentConfidence: AssessmentConfidence;
  confidenceRationale: string;
}

/**
 * Compute defensibility ratings per jurisdiction and overall assessment confidence.
 *
 * Defensibility = how defensible the claim is (inverse of examiner's invalidity strength).
 *   - If examiner found "strong" invalidity arguments → claim defensibility is "Weak"
 *   - If examiner found "weak" invalidity arguments → claim defensibility is "Strong"
 *
 * Assessment Confidence = how confident we are in our own analysis.
 *   - Based on: sources searched, coverage completeness, argument quality
 */
export function computeConfidenceReport(
  priorArtReport: PriorArtReport,
  analysis: MultiJurisdictionAnalysis,
  jurisdictions: Jurisdiction[],
): ConfidenceReport {
  const jurisdictionScores: JurisdictionScore[] = [];

  for (const jur of jurisdictions) {
    const score = scoreJurisdiction(jur, analysis);
    jurisdictionScores.push(score);
  }

  const assessmentConfidence = computeAssessmentConfidence(priorArtReport, analysis, jurisdictions);

  return {
    jurisdictionScores,
    ...assessmentConfidence,
  };
}

function scoreJurisdiction(
  jurisdiction: Jurisdiction,
  analysis: MultiJurisdictionAnalysis,
): JurisdictionScore {
  let overallStrength: ArgumentStrength | undefined;
  let rationale: string;

  switch (jurisdiction) {
    case 'US':
      overallStrength = analysis.us?.overallStrength;
      rationale = analysis.us?.summary || 'No US analysis available';
      break;
    case 'EU':
      overallStrength = analysis.epo?.overallStrength;
      rationale = analysis.epo?.summary || 'No EPO analysis available';
      break;
    case 'UK':
      overallStrength = analysis.uk?.overallStrength;
      rationale = analysis.uk?.summary || 'No UK analysis available';
      break;
  }

  // Invert: strong invalidity = weak defensibility
  const defensibility = invertStrength(overallStrength);

  return { jurisdiction, defensibility, rationale };
}

function invertStrength(invalidityStrength: ArgumentStrength | undefined): DefensibilityRating {
  switch (invalidityStrength) {
    case 'strong':
      return 'Weak';
    case 'moderate':
      return 'Moderate';
    case 'weak':
      return 'Strong';
    default:
      return 'Strong'; // No arguments = claim is defensible
  }
}

function computeAssessmentConfidence(
  priorArtReport: PriorArtReport,
  analysis: MultiJurisdictionAnalysis,
  jurisdictions: Jurisdiction[],
): { assessmentConfidence: AssessmentConfidence; confidenceRationale: string } {
  const factors: string[] = [];
  let score = 0;

  // Factor 1: Sources searched
  const sourcesCount = priorArtReport.sourcesSearched.length;
  if (sourcesCount >= 3) {
    score += 3;
    factors.push(`Searched ${sourcesCount} sources (thorough)`);
  } else if (sourcesCount >= 2) {
    score += 2;
    factors.push(`Searched ${sourcesCount} sources (adequate)`);
  } else {
    score += 1;
    factors.push(`Searched only ${sourcesCount} source(s) (limited)`);
  }

  // Factor 2: Prior art coverage
  // Key insight: "no coverage after thorough search" = evidence of novelty (good for confidence)
  // vs "no coverage because search was insufficient" = genuine gap (bad for confidence)
  const coverageLevels = priorArtReport.elementCoverages.map((ec) => ec.coverageLevel);
  const strongCoverage = coverageLevels.filter((l) => l === 'strong').length;
  const noneCoverage = coverageLevels.filter((l) => l === 'none').length;
  const total = coverageLevels.length;
  const queriesPerElement = total > 0 ? priorArtReport.searchQueries.length / total : 0;
  const searchWasThorough = queriesPerElement >= 1 && priorArtReport.searchQueries.length >= 3;

  // Check if the search found ANY references at all
  const totalRefsFound = priorArtReport.totalReferencesFound;
  const searchCompletelyFailed = totalRefsFound === 0 && noneCoverage === total;

  if (searchCompletelyFailed) {
    // Zero references across all elements = search failure, not novelty
    score += 0;
    factors.push(
      `Prior art search found 0 references across all ${total} elements — search likely failed (API rate limits). Low confidence in results.`,
    );
  } else if (noneCoverage === 0) {
    score += 3;
    factors.push('All elements have at least some prior art coverage');
  } else if (searchWasThorough && noneCoverage > 0 && totalRefsFound > 0) {
    // Some elements have coverage, others don't after thorough search — novelty signal
    score += 3;
    factors.push(
      `${noneCoverage}/${total} elements have no prior art after thorough search (${priorArtReport.searchQueries.length} queries, ${totalRefsFound} refs found for other elements) — likely novel`,
    );
  } else if (noneCoverage <= total * 0.25) {
    score += 2;
    factors.push(`${noneCoverage}/${total} elements have no coverage`);
  } else {
    score += 1;
    factors.push(`${noneCoverage}/${total} elements have no coverage (search may be insufficient)`);
  }

  if (strongCoverage >= total * 0.5) {
    score += 1;
    factors.push('Strong coverage on majority of elements');
  }

  // Factor 3: Jurisdiction coverage
  const analyzedCount = [
    jurisdictions.includes('US') && analysis.us,
    jurisdictions.includes('EU') && analysis.epo,
    jurisdictions.includes('UK') && analysis.uk,
  ].filter(Boolean).length;

  if (analyzedCount === jurisdictions.length) {
    score += 3;
    factors.push('All requested jurisdictions analyzed');
  } else {
    score += 1;
    factors.push(`Only ${analyzedCount}/${jurisdictions.length} jurisdictions analyzed`);
  }

  // Factor 4: Divergence analysis
  if (analysis.divergences.length > 0) {
    score += 1;
    factors.push('Cross-jurisdictional divergences identified');
  }

  // Map score to confidence
  let assessmentConfidence: AssessmentConfidence;
  if (score >= 9) {
    assessmentConfidence = 'High';
  } else if (score >= 6) {
    assessmentConfidence = 'Medium';
  } else {
    assessmentConfidence = 'Low';
  }

  return {
    assessmentConfidence,
    confidenceRationale: factors.join('. ') + '.',
  };
}
