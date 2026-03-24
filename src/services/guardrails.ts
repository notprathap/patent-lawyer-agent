import { logger } from '../utils/logger.js';
import { validateCitations, type ValidationReport, type CitationIssue } from './citation-validator.js';
import type { Jurisdiction } from '../types/index.js';
import type { DefensibilityRating, AssessmentConfidence, ConfidenceReport } from './confidence-scorer.js';

export interface GuardrailResult {
  passed: boolean;
  validationReport: ValidationReport;
  confidenceAdjustment: {
    shouldDowngrade: boolean;
    reason?: string;
  };
  disclaimerPresent: boolean;
  memoWithReport: string;
}

/**
 * Run all guardrail checks on the generated memo.
 * Returns the validation result and optionally appends a validation report to the memo.
 */
export async function runGuardrails(
  memo: string,
  jurisdictions: Jurisdiction[],
  confidenceReport: ConfidenceReport,
): Promise<GuardrailResult> {
  logger.info('Guardrails: running validation checks');

  // Run citation validation
  const validationReport = await validateCitations(memo, jurisdictions);

  // Check disclaimer
  const disclaimerPresent = memo.toLowerCase().includes('disclaimer') &&
    (memo.toLowerCase().includes('not constitute legal advice') ||
     memo.toLowerCase().includes('must be reviewed'));

  if (!disclaimerPresent) {
    validationReport.issues.push({
      type: 'missing_citation',
      severity: 'error',
      description: 'Required disclaimer is missing from the memo',
    });
  }

  // Determine if confidence should be downgraded
  const errors = validationReport.issues.filter((i) => i.severity === 'error');
  const warnings = validationReport.issues.filter((i) => i.severity === 'warning');
  const fabricatedCases = validationReport.issues.filter((i) => i.type === 'fabricated_case');
  const crossContamination = validationReport.issues.filter((i) => i.type === 'cross_contamination');

  let shouldDowngrade = false;
  let downgradeReason: string | undefined;

  if (errors.length > 0) {
    shouldDowngrade = true;
    downgradeReason = `${errors.length} error(s) found: ${errors.map((e) => e.description).join('; ')}`;
  } else if (fabricatedCases.length >= 2) {
    shouldDowngrade = true;
    downgradeReason = `${fabricatedCases.length} potentially fabricated case citations detected`;
  } else if (crossContamination.length >= 3) {
    shouldDowngrade = true;
    downgradeReason = `${crossContamination.length} cross-jurisdiction contamination issues detected`;
  }

  // Apply confidence adjustment
  if (shouldDowngrade) {
    for (const score of confidenceReport.jurisdictionScores) {
      // Only downgrade, never upgrade
      if (score.defensibility === 'Strong') {
        score.defensibility = 'Moderate' as DefensibilityRating;
      }
    }
    if (confidenceReport.assessmentConfidence === 'High') {
      confidenceReport.assessmentConfidence = 'Medium' as AssessmentConfidence;
    } else if (confidenceReport.assessmentConfidence === 'Medium') {
      confidenceReport.assessmentConfidence = 'Low' as AssessmentConfidence;
    }
  }

  // Append validation report to memo
  const reportSection = formatValidationReport(validationReport, warnings, errors);
  const memoWithReport = `${memo}\n\n${reportSection}`;

  const passed = errors.length === 0;

  logger.info(
    {
      passed,
      errors: errors.length,
      warnings: warnings.length,
      fabricatedCases: fabricatedCases.length,
      crossContamination: crossContamination.length,
      disclaimerPresent,
      confidenceDowngraded: shouldDowngrade,
    },
    'Guardrails: validation complete',
  );

  return {
    passed,
    validationReport,
    confidenceAdjustment: { shouldDowngrade, reason: downgradeReason },
    disclaimerPresent,
    memoWithReport,
  };
}

function formatValidationReport(
  report: ValidationReport,
  warnings: CitationIssue[],
  errors: CitationIssue[],
): string {
  const lines: string[] = [
    '---',
    '',
    '## VALIDATION REPORT',
    '',
    `Checks performed: ${report.totalChecked} | Passed: ${report.passed} | Failed: ${report.failed}`,
    '',
  ];

  if (errors.length > 0) {
    lines.push('### Errors');
    for (const err of errors) {
      lines.push(`- **[${err.type}]** ${err.description}${err.location ? ` (${err.location})` : ''}`);
    }
    lines.push('');
  }

  if (warnings.length > 0) {
    lines.push('### Warnings');
    for (const warn of warnings) {
      lines.push(`- [${warn.type}] ${warn.description}${warn.location ? ` (${warn.location})` : ''}`);
    }
    lines.push('');
  }

  if (errors.length === 0 && warnings.length === 0) {
    lines.push('All checks passed. No issues detected.');
    lines.push('');
  }

  return lines.join('\n');
}
