import { describe, it, expect } from 'vitest';
import { validateCitations } from '../../src/services/citation-validator.js';

describe('Citation Validator', () => {
  it('detects cross-contamination: US section citing EU law', async () => {
    const memo = `
# 4. US ANALYSIS

The claim lacks novelty under the Problem-Solution Approach as defined by the EPO Guidelines.

# 5. EU/EPO ANALYSIS

The inventive step analysis follows EPC Article 56.
`;

    const report = await validateCitations(memo, ['US', 'EU', 'UK']);
    const crossContam = report.issues.filter((i) => i.type === 'cross_contamination');
    expect(crossContam.length).toBeGreaterThan(0);
    expect(crossContam[0].location).toBe('US Analysis');
  });

  it('detects cross-contamination: UK section citing US law', async () => {
    const memo = `
# 4. US ANALYSIS

The claim is obvious under 35 U.S.C. § 103.

# 6. UK ANALYSIS

Applying the Graham v. John Deere factors to this claim under UK law.
`;

    const report = await validateCitations(memo, ['US', 'EU', 'UK']);
    const crossContam = report.issues.filter((i) => i.type === 'cross_contamination');
    expect(crossContam.length).toBeGreaterThan(0);
    expect(crossContam.some((c) => c.location === 'UK Analysis')).toBe(true);
  });

  it('flags missing legal citations for obviousness assertions', async () => {
    const memo = `
The claim fails the obviousness analysis because prior art teaches all elements.
`;

    const report = await validateCitations(memo, ['US']);
    const missing = report.issues.filter((i) => i.type === 'missing_citation');
    expect(missing.length).toBeGreaterThan(0);
  });

  it('passes clean memo with proper citations', async () => {
    const memo = `
# 4. US ANALYSIS

Under 35 U.S.C. § 103, applying the Graham v. John Deere factors and KSR rationales,
the claim is obvious.

# 5. EU/EPO ANALYSIS

Under EPC Article 56, using the Problem-Solution Approach, the inventive step is lacking.

# 6. UK ANALYSIS

Applying the Pozzoli test under Section 3 of the UK Patents Act 1977, the differences
are obvious to the skilled person.
`;

    const report = await validateCitations(memo, ['US', 'EU', 'UK']);
    const crossContam = report.issues.filter((i) => i.type === 'cross_contamination');
    expect(crossContam.length).toBe(0);
  });

  it('detects potentially fabricated case law', async () => {
    const memo = `
According to Smith v. Johnson (2019), the claim lacks novelty.
This was further confirmed in Roberts v. Anderson Corp (2021).
`;

    const report = await validateCitations(memo, ['US']);
    const fabricated = report.issues.filter((i) => i.type === 'fabricated_case');
    expect(fabricated.length).toBeGreaterThanOrEqual(1);
  });
});
