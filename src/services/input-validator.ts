import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';
import type { Jurisdiction } from '../types/index.js';

export interface InputValidationResult {
  isValid: boolean;
  reason: string;
  eligibilityWarnings: EligibilityWarning[];
  tokensUsed: { input: number; output: number };
}

export interface EligibilityWarning {
  jurisdiction: Jurisdiction;
  concern: string;
  framework: string;
}

/**
 * Validate input and detect potential subject matter eligibility issues.
 */
export async function validateClaimInput(
  claimText: string,
  jurisdictions: Jurisdiction[],
): Promise<InputValidationResult> {
  const client = getClaudeClient();

  const jurList = jurisdictions.join(', ');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 512,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `Analyze the following text and respond in this exact format:

VALID: YES or NO
REASON: Brief explanation

ELIGIBILITY_WARNINGS:
For each of these jurisdictions (${jurList}), note if there are potential subject matter eligibility concerns:
- US: Would Alice/Mayo framework apply? (abstract idea, law of nature, natural phenomenon)
- EU: Does EPC Article 52(2)/(3) apply? (mathematical method, business method, computer program "as such")
- UK: Does Section 1(2) apply? (Aerotel/Macrossan test for excluded matter)

If no concerns for a jurisdiction, write "NONE".

TEXT:
${claimText}`,
      },
    ],
  });

  const text = response.content
    .filter((b) => b.type === 'text')
    .map((b) => 'text' in b ? (b as { text: string }).text : '')
    .join('') || '';

  // Parse response
  const isValid = /VALID:\s*YES/i.test(text);
  const reasonMatch = text.match(/REASON:\s*(.+)/i);
  const reason = reasonMatch?.[1]?.trim() || 'Unable to determine validity';

  // Parse eligibility warnings
  const eligibilityWarnings: EligibilityWarning[] = [];

  for (const jur of jurisdictions) {
    let framework: string;
    let pattern: RegExp;

    switch (jur) {
      case 'US':
        framework = 'Alice/Mayo (35 U.S.C. § 101)';
        pattern = /US:?\s*(.+?)(?=\n(?:EU|UK)|$)/is;
        break;
      case 'EU':
        framework = 'EPC Article 52(2)/(3)';
        pattern = /EU:?\s*(.+?)(?=\n(?:US|UK)|$)/is;
        break;
      case 'UK':
        framework = 'UK Patents Act Section 1(2) / Aerotel';
        pattern = /UK:?\s*(.+?)(?=\n(?:US|EU)|$)/is;
        break;
    }

    const match = text.match(pattern);
    const concern = match?.[1]?.trim() || '';

    if (concern && !concern.toUpperCase().includes('NONE') && concern.length > 5) {
      eligibilityWarnings.push({ jurisdiction: jur, concern, framework });
    }
  }

  const tokensUsed = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
  };

  logger.info(
    {
      isValid,
      eligibilityWarnings: eligibilityWarnings.length,
      tokensUsed,
    },
    'Input validation complete',
  );

  return { isValid, reason, eligibilityWarnings, tokensUsed };
}
