import type { Jurisdiction } from '../types/index.js';
import type {
  DiscoveredPatentsReport,
  FTOInfringementReport,
  FTOConfidenceReport,
  FTOMarketScore,
  RiskLevel,
} from '../types/fto.js';

const RISK_RANK: Record<RiskLevel, number> = {
  Clear: 0,
  Low: 1,
  Medium: 2,
  High: 3,
};

function rankToRisk(rank: number): RiskLevel {
  if (rank >= 3) return 'High';
  if (rank >= 2) return 'Medium';
  if (rank >= 1) return 'Low';
  return 'Clear';
}

function maxRisk(...risks: RiskLevel[]): RiskLevel {
  if (risks.length === 0) return 'Clear';
  return rankToRisk(Math.max(...risks.map((r) => RISK_RANK[r])));
}

/**
 * Compute per-market and overall FTO risk + assessment confidence.
 *
 * Per-market risk is the worst-case across all analyzed patents in that market.
 * Overall risk is the worst-case across all markets.
 */
export function computeFTOConfidenceReport(
  discoveredPatents: DiscoveredPatentsReport,
  infringementReport: FTOInfringementReport,
  targetMarkets: Jurisdiction[],
): FTOConfidenceReport {
  const marketScores: FTOMarketScore[] = targetMarkets.map((market) => {
    const risksInMarket: RiskLevel[] = [];
    const blockers: string[] = [];
    for (const analysis of infringementReport.perPatentAnalyses) {
      const jr = analysis.perJurisdictionRisk.find((j) => j.jurisdiction === market);
      if (jr) {
        risksInMarket.push(jr.risk);
        if (jr.risk === 'High' || jr.risk === 'Medium') {
          blockers.push(`${analysis.publicationNumber} (${jr.risk})`);
        }
      }
    }
    const risk = maxRisk(...risksInMarket);
    const rationale =
      blockers.length > 0
        ? `Worst-case risk in ${market}: ${risk}. Blocking patents: ${blockers.join(', ')}.`
        : `No material blockers identified in ${market}.`;
    return { market, risk, rationale };
  });

  const overallRisk = maxRisk(...marketScores.map((m) => m.risk));

  // Confidence is computed from how thoroughly the analysis was conducted —
  // not how risky the result is. A confident "High risk" verdict and a
  // confident "Clear" verdict both deserve High assessment confidence if
  // backed by good data.
  const factors: string[] = [];
  let score = 0;

  // 1. Coverage: were all patents analyzed in all markets?
  const patentsAnalyzed = infringementReport.perPatentAnalyses.length;
  const totalDiscovered = discoveredPatents.patents.length;
  if (totalDiscovered === 0) {
    factors.push('No patents discovered or supplied — cannot meaningfully assess FTO risk.');
    score += 0;
  } else if (patentsAnalyzed >= totalDiscovered) {
    factors.push(`All ${totalDiscovered} discovered patents analyzed`);
    score += 3;
  } else {
    factors.push(`${patentsAnalyzed}/${totalDiscovered} discovered patents analyzed`);
    score += 1;
  }

  // 2. Independent claim coverage: was full claim text available?
  const withClaims = discoveredPatents.patents.filter(
    (p) => p.independentClaims.length > 0,
  ).length;
  if (withClaims >= totalDiscovered * 0.7) {
    factors.push(`${withClaims}/${totalDiscovered} patents have full claim text for mapping`);
    score += 3;
  } else if (withClaims >= totalDiscovered * 0.4) {
    factors.push(`${withClaims}/${totalDiscovered} patents have full claim text — partial mapping`);
    score += 2;
  } else {
    factors.push(
      `Only ${withClaims}/${totalDiscovered} patents have full claim text — many assessments rely on title/abstract only`,
    );
    score += 1;
  }

  // 3. Market coverage
  const marketsWithRisk = marketScores.length;
  if (marketsWithRisk === targetMarkets.length) {
    factors.push('All target markets assessed');
    score += 2;
  } else {
    factors.push(`Only ${marketsWithRisk}/${targetMarkets.length} target markets assessed`);
    score += 0;
  }

  // 4. Sources searched (≥2 for thorough discovery)
  if (discoveredPatents.sourcesSearched.length >= 2) {
    factors.push(`Searched ${discoveredPatents.sourcesSearched.length} sources`);
    score += 1;
  } else {
    factors.push(`Searched only ${discoveredPatents.sourcesSearched.length} source(s)`);
  }

  // 5. Cross-market divergence analysis
  if (infringementReport.divergences.length > 0) {
    factors.push('Cross-market divergences identified');
    score += 1;
  }

  let assessmentConfidence: 'High' | 'Medium' | 'Low';
  if (score >= 8) assessmentConfidence = 'High';
  else if (score >= 5) assessmentConfidence = 'Medium';
  else assessmentConfidence = 'Low';

  return {
    marketScores,
    overallRisk,
    assessmentConfidence,
    confidenceRationale: factors.join('. ') + '.',
  };
}
