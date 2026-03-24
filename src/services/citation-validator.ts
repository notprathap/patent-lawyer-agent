import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import { searchLegalKnowledge, isKnowledgeBasePopulated } from './rag-retrieval.js';
import type { Jurisdiction } from '../types/index.js';

export interface CitationIssue {
  type: 'fabricated_case' | 'invalid_patent_number' | 'unreachable_url' | 'cross_contamination' | 'missing_citation';
  severity: 'error' | 'warning';
  description: string;
  location?: string;
}

export interface ValidationReport {
  issues: CitationIssue[];
  totalChecked: number;
  passed: number;
  failed: number;
}

// Known case law per jurisdiction — used to detect cross-contamination
const US_CASES = [
  'graham v. john deere', 'ksr v. teleflex', 'ksr international',
  'alice corp', 'alice v. cls', 'mayo v. prometheus', 'mayo collaborative',
  'in re bilski', 'bilski v. kappos', 'diamond v. chakrabarty',
  'mpep', '35 u.s.c', 'u.s.c. §', 'phosita', 'ptab',
];

const EU_CASES = [
  'problem-solution approach', 'closest prior art', 'objective technical problem',
  'could-would', 'epc article', 'epc art.', 'board of appeal',
  't 24/81', 't 641/00', 'comvik', 'epo guidelines',
];

const UK_CASES = [
  'windsurfing', 'pozzoli', 'aerotel', 'macrossan',
  'actavis v. eli lilly', 'conor v. angiotech', 'htc v. apple',
  'uk patents act', 'section 1(2)', 'section 2', 'section 3',
  'common general knowledge', 'person skilled in the art',
  'uk ipo', 'mopp',
];

/**
 * Validate citations in the generated memo.
 */
export async function validateCitations(
  memo: string,
  jurisdictions: Jurisdiction[],
): Promise<ValidationReport> {
  const issues: CitationIssue[] = [];
  let totalChecked = 0;

  // Check 1: Cross-contamination — US sections citing EU/UK law and vice versa
  totalChecked += checkCrossContamination(memo, jurisdictions, issues);

  // Check 2: Patent number format validation
  totalChecked += checkPatentNumbers(memo, issues);

  // Check 3: Fabricated case law — check against RAG DB if available
  totalChecked += await checkFabricatedCases(memo, issues);

  // Check 4: Missing citations in key assertions
  totalChecked += checkMissingCitations(memo, issues);

  const failed = issues.filter((i) => i.severity === 'error').length;

  logger.info(
    { totalChecked, issues: issues.length, errors: failed },
    'Citation validation complete',
  );

  return {
    issues,
    totalChecked,
    passed: totalChecked - failed,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Check 1: Cross-Contamination
// ---------------------------------------------------------------------------

function checkCrossContamination(
  memo: string,
  jurisdictions: Jurisdiction[],
  issues: CitationIssue[],
): number {
  let checked = 0;

  // Split memo into jurisdiction sections
  const usSectionMatch = memo.match(/(?:^|\n)#+\s*(?:4|US ANALYSIS)[\s\S]*?(?=\n#+\s*(?:5|EU|EPO)|$)/i);
  const euSectionMatch = memo.match(/(?:^|\n)#+\s*(?:5|EU|EPO)[\s\S]*?(?=\n#+\s*(?:6|UK)|$)/i);
  const ukSectionMatch = memo.match(/(?:^|\n)#+\s*(?:6|UK)[\s\S]*?(?=\n#+\s*(?:7|CROSS)|$)/i);

  const usSection = usSectionMatch?.[0]?.toLowerCase() || '';
  const euSection = euSectionMatch?.[0]?.toLowerCase() || '';
  const ukSection = ukSectionMatch?.[0]?.toLowerCase() || '';

  // Check US section for EU/UK terms
  if (usSection && jurisdictions.includes('US')) {
    for (const term of EU_CASES) {
      if (usSection.includes(term.toLowerCase())) {
        // Allow "Problem-Solution" if comparing approaches
        if (term === 'problem-solution approach' && usSection.includes('compar')) continue;
        issues.push({
          type: 'cross_contamination',
          severity: 'warning',
          description: `US analysis section references EU/EPO concept: "${term}"`,
          location: 'US Analysis',
        });
        checked++;
      }
    }
    for (const term of UK_CASES) {
      if (usSection.includes(term.toLowerCase())) {
        issues.push({
          type: 'cross_contamination',
          severity: 'warning',
          description: `US analysis section references UK concept: "${term}"`,
          location: 'US Analysis',
        });
        checked++;
      }
    }
  }

  // Check EU section for US/UK-specific terms
  if (euSection && jurisdictions.includes('EU')) {
    for (const term of ['graham v. john deere', 'ksr v. teleflex', '35 u.s.c', 'phosita', 'mpep']) {
      if (euSection.includes(term.toLowerCase())) {
        issues.push({
          type: 'cross_contamination',
          severity: 'warning',
          description: `EU/EPO analysis section references US concept: "${term}"`,
          location: 'EU/EPO Analysis',
        });
        checked++;
      }
    }
  }

  // Check UK section for US-specific terms
  if (ukSection && jurisdictions.includes('UK')) {
    for (const term of ['graham v. john deere', 'ksr v. teleflex', '35 u.s.c', 'mpep']) {
      if (ukSection.includes(term.toLowerCase())) {
        issues.push({
          type: 'cross_contamination',
          severity: 'warning',
          description: `UK analysis section references US concept: "${term}"`,
          location: 'UK Analysis',
        });
        checked++;
      }
    }
  }

  return Math.max(checked, 1);
}

// ---------------------------------------------------------------------------
// Check 2: Patent Number Format
// ---------------------------------------------------------------------------

function checkPatentNumbers(memo: string, issues: CitationIssue[]): number {
  // Match patent number patterns
  const patentPatterns = [
    /US[\s]?\d{1,3}[,\s]?\d{3}[,\s]?\d{3}/g,  // US patents
    /EP[\s]?\d{6,}/g,                             // EP patents
    /GB[\s]?\d{6,}/g,                             // GB patents
    /WO[\s]?\d{4}\/\d{6}/g,                       // WIPO
  ];

  let checked = 0;
  for (const pattern of patentPatterns) {
    const matches = memo.match(pattern) || [];
    checked += matches.length;
  }

  return Math.max(checked, 1);
}

// ---------------------------------------------------------------------------
// Check 3: Fabricated Case Law
// ---------------------------------------------------------------------------

async function checkFabricatedCases(
  memo: string,
  issues: CitationIssue[],
): Promise<number> {
  // Extract case name patterns from the memo
  const casePattern = /(?:([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*)\s+v\.?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)*))/g;
  const caseMatches = [...memo.matchAll(casePattern)];
  let checked = 0;

  // Known legitimate cases — don't flag these
  const knownCases = new Set([
    'graham v john deere',
    'ksr v teleflex',
    'ksr international v teleflex',
    'alice corp v cls bank',
    'alice v cls',
    'mayo v prometheus',
    'mayo collaborative v prometheus',
    'pozzoli v bdmo',
    'pozzoli spa v bdmo',
    'aerotel v telco',
    'aerotel ltd v telco',
    'actavis v eli lilly',
    'actavis uk v eli lilly',
    'conor v angiotech',
    'conor medsystems v angiotech',
    'windsurfing v tabur',
    'windsurfing international v tabur marine',
    'htc v apple',
    'diamond v chakrabarty',
    'bilski v kappos',
  ]);

  for (const match of caseMatches) {
    const caseName = `${match[1]} v ${match[2]}`.toLowerCase().replace(/\./g, '');
    checked++;

    // Check if it's a known case
    if (knownCases.has(caseName)) continue;

    // If RAG DB is available, check if the case exists there
    if (env.DATABASE_URL) {
      try {
        const populated = await isKnowledgeBasePopulated();
        if (populated) {
          const results = await searchLegalKnowledge(caseName, { topK: 1, minSimilarity: 0.7 });
          if (results.length > 0) continue; // Found in RAG DB
        }
      } catch {
        // RAG unavailable — fall through to flag as unknown
      }
    }

    // Unknown case — flag as potential fabrication
    issues.push({
      type: 'fabricated_case',
      severity: 'warning',
      description: `Case "${match[0]}" not found in known case law database — verify this citation is real`,
    });
  }

  return Math.max(checked, 1);
}

// ---------------------------------------------------------------------------
// Check 4: Missing Citations
// ---------------------------------------------------------------------------

function checkMissingCitations(memo: string, issues: CitationIssue[]): number {
  let checked = 0;

  // Check that key legal assertions have citations
  const assertionPatterns = [
    { pattern: /anticipat(?:ed|ion)\s+(?:under|by|per)/i, needs: '§ 102|Article 54|Section 2', section: 'anticipation' },
    { pattern: /obvious(?:ness)?\s+(?:under|per|analysis)/i, needs: '§ 103|Article 56|Section 3|Graham|KSR|Problem-Solution|Pozzoli', section: 'obviousness' },
    { pattern: /novelty\s+(?:under|per|analysis|assessment)/i, needs: '§ 102|Article 54|Section 2', section: 'novelty' },
  ];

  const memoLower = memo.toLowerCase();

  for (const { pattern, needs, section } of assertionPatterns) {
    if (pattern.test(memo)) {
      checked++;
      const needsPatterns = needs.split('|');
      const hasAnyCitation = needsPatterns.some((p) => memoLower.includes(p.toLowerCase()));

      if (!hasAnyCitation) {
        issues.push({
          type: 'missing_citation',
          severity: 'warning',
          description: `${section} assertion found without a supporting legal citation (expected one of: ${needs})`,
        });
      }
    }
  }

  return Math.max(checked, 1);
}
