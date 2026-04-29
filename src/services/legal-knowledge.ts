import type { Jurisdiction } from '../types/index.js';

/**
 * Static legal knowledge base — pre-RAG stopgap (replaced by vector DB in Phase 6).
 * Contains key legal standards, tests, and precedents for US, EU, and UK patent law.
 */

// ---------------------------------------------------------------------------
// US Legal Standards
// ---------------------------------------------------------------------------

const US_STANDARDS: Record<string, string> = {
  '35_USC_101': `35 U.S.C. § 101 — Patentable Subject Matter
Whoever invents or discovers any new and useful process, machine, manufacture, or composition of matter, or any new and useful improvement thereof, may obtain a patent therefor, subject to the conditions and requirements of this title.

The Alice/Mayo Framework (two-step test):
Step 1: Is the claim directed to a judicial exception (abstract idea, law of nature, natural phenomenon)?
Step 2: If yes, does the claim recite additional elements that amount to "significantly more" than the judicial exception?`,

  '35_USC_102': `35 U.S.C. § 102 — Novelty / Anticipation
A person shall be entitled to a patent unless:
(a)(1) the claimed invention was patented, described in a printed publication, or in public use, on sale, or otherwise available to the public before the effective filing date of the claimed invention; or
(a)(2) the claimed invention was described in a patent or published application naming another inventor, filed before the effective filing date.

For anticipation, a SINGLE prior art reference must disclose every element of the claim, arranged as in the claim.`,

  '35_USC_103': `35 U.S.C. § 103 — Obviousness
A patent for a claimed invention may not be obtained if the differences between the claimed invention and the prior art are such that the claimed invention as a whole would have been obvious before the effective filing date to a person having ordinary skill in the art (PHOSITA).

Graham v. John Deere Co. (1966) — Four-Factor Test:
1. Scope and content of the prior art
2. Differences between the prior art and the claims at issue
3. Level of ordinary skill in the pertinent art
4. Secondary considerations (objective indicia of non-obviousness): commercial success, long-felt but unsolved need, failure of others, copying, unexpected results

KSR International Co. v. Teleflex Inc. (2007) — Obviousness Rationales:
- Combining prior art elements according to known methods to yield predictable results
- Simple substitution of one known element for another to obtain predictable results
- Use of known technique to improve similar devices in the same way
- Applying a known technique to a known device ready for improvement to yield predictable results
- "Obvious to try" — choosing from a finite number of identified, predictable solutions with reasonable expectation of success
- Known work in one field of endeavor may prompt variations of it for use in the same or different field
- Some teaching, suggestion, or motivation in the prior art to modify or combine references (TSM test — flexible, not rigid)`,

  '35_USC_112': `35 U.S.C. § 112 — Specification / Claims
(a) Written Description + Enablement: The specification shall contain a written description of the invention, and of the manner and process of making and using it, in such full, clear, concise, and exact terms as to enable any person skilled in the art to make and use the same.
(b) Claims: The specification shall conclude with one or more claims particularly pointing out and distinctly claiming the subject matter which the inventor regards as the invention.
(f) Means-Plus-Function: An element in a claim for a combination may be expressed as a means or step for performing a specified function without the recital of structure, material, or acts in support thereof, and such claim shall be construed to cover the corresponding structure, material, or acts described in the specification and equivalents thereof.`,
};

// ---------------------------------------------------------------------------
// EU/EPO Legal Standards
// ---------------------------------------------------------------------------

const EU_STANDARDS: Record<string, string> = {
  'EPC_Art_52': `EPC Article 52 — Patentable Inventions
(1) European patents shall be granted for any inventions, in all fields of technology, provided that they are new, involve an inventive step and are susceptible of industrial application.
(2) The following shall not be regarded as inventions: (a) discoveries, scientific theories, mathematical methods; (b) aesthetic creations; (c) schemes, rules and methods for performing mental acts, playing games or doing business, and programs for computers; (d) presentations of information.
(3) Paragraph 2 excludes patentability only to the extent that the application relates to subject-matter or activities "as such."`,

  'EPC_Art_54': `EPC Article 54 — Novelty
(1) An invention shall be considered to be new if it does not form part of the state of the art.
(2) The state of the art shall comprise everything made available to the public by means of a written or oral description, by use, or in any other way, before the date of filing.
(3) The state of the art includes the content of European patent applications with earlier filing dates, published on or after the filing date.

For novelty, the disclosure must be "enabling" — a skilled person must be able to derive the claimed subject matter directly and unambiguously from the prior art.`,

  'EPC_Art_56': `EPC Article 56 — Inventive Step
An invention shall be considered as involving an inventive step if, having regard to the state of the art, it is not obvious to a person skilled in the art.

The Problem-Solution Approach (EPO's structured test):
Step 1: Determine the closest prior art — the most relevant single document that provides the best starting point.
Step 2: Establish the objective technical problem — formulated as the problem that the skilled person would set out to solve, starting from the closest prior art, to arrive at the claimed invention.
Step 3: "Could-Would" analysis — Would the skilled person, confronted with the objective technical problem and starting from the closest prior art, have arrived at the claimed invention? (Not merely: could they have?)

The key question is "would" not "could." The skilled person must have been prompted or motivated to modify the closest prior art to arrive at the invention.

Key Board of Appeal Decisions:
- T 24/81 (BASF/Metal refining) — established the Problem-Solution Approach
- T 641/00 (Two identities/COMVIK) — for mixed technical/non-technical inventions, only technical features contribute to inventive step`,

  'EPC_Art_57': `EPC Article 57 — Industrial Application
An invention shall be considered as susceptible of industrial application if it can be made or used in any kind of industry, including agriculture.`,
};

// ---------------------------------------------------------------------------
// UK Legal Standards
// ---------------------------------------------------------------------------

const UK_STANDARDS: Record<string, string> = {
  'UK_PA_1977_S1': `UK Patents Act 1977, Section 1 — Patentable Inventions
(1) A patent may be granted only for an invention in respect of which the following conditions are satisfied:
(a) the invention is new;
(b) it involves an inventive step;
(c) it is susceptible of industrial application;
(d) the grant of a patent for it is not excluded by subsections (2) and (3) or section 4A.
(2) It is hereby declared that the following are not inventions: (a) a discovery, scientific theory or mathematical method; (b) a literary, dramatic, musical or artistic work or any other aesthetic creation; (c) a scheme, rule or method for performing a mental act, playing a game or doing business, or a program for a computer; (d) the presentation of information; but the foregoing shall prevent anything from being treated as an invention only to the extent that a patent application relates to that thing "as such."`,

  'UK_PA_1977_S2': `UK Patents Act 1977, Section 2 — Novelty
(1) An invention shall be taken to be new if it does not form part of the state of the art.
(2) The state of the art comprises all matter (whether a product, a process, information about either, or anything else) which has at any time before the priority date been made available to the public (whether in the United Kingdom or elsewhere) by written or oral description, by use or in any other way.`,

  'UK_PA_1977_S3': `UK Patents Act 1977, Section 3 — Inventive Step
An invention shall be taken to involve an inventive step if it is not obvious to a person skilled in the art, having regard to any matter which forms part of the state of the art (but disregarding matter in applications with earlier priority dates not yet published).

The Windsurfing/Pozzoli Test (Pozzoli SpA v BDMO SA [2007] EWCA Civ 588):
Step 1: (a) Identify the notional "person skilled in the art"; (b) Identify the relevant common general knowledge of that person.
Step 2: Identify the inventive concept of the claim in question, or if that cannot readily be done, construe it.
Step 3: Identify what, if any, differences exist between the matter cited as being "known or used" and the alleged invention.
Step 4: Viewed without any knowledge of the alleged invention as claimed, do those differences constitute steps which would have been obvious to the person skilled in the art, or do they require any degree of invention?

Key UK Case Law:
- Windsurfing International v Tabur Marine [1985] RPC 59 — original 4-step test for inventive step
- Pozzoli SpA v BDMO SA [2007] EWCA Civ 588 — reformulated the Windsurfing test (the modern version)
- Conor Medsystems v Angiotech Pharmaceuticals [2008] UKHL 49 — "obvious to try" in the UK
- Actavis v Eli Lilly [2017] UKSC 48 — equivalents doctrine for claim construction`,

  'UK_Aerotel_Macrossan': `Aerotel/Macrossan Test for Excluded Subject Matter
Aerotel Ltd v Telco Holdings Ltd / Macrossan's Application [2006] EWCA Civ 1371

Four-step test for determining whether an invention is excluded under Section 1(2):
Step 1: Properly construe the claim.
Step 2: Identify the actual contribution.
Step 3: Ask whether it falls solely within the excluded subject matter.
Step 4: Check whether the actual or alleged contribution is actually technical in nature.

This test is applied differently from the EPO's approach to Article 52(2)/(3), leading to occasional divergence between UK and EPO outcomes on software and business method patents.`,
};

// ---------------------------------------------------------------------------
// FTO / Infringement Standards (per jurisdiction)
// ---------------------------------------------------------------------------

const FTO_US_STANDARDS: Record<string, string> = {
  'US_Literal_Infringement': `US Literal Infringement
A patent claim is literally infringed when an accused product or process embodies EVERY element of the claim, exactly as recited. Under the "all-elements rule," even a single missing element defeats literal infringement. Each element of the claim is mapped against the accused device on a one-to-one basis.

Determining literal infringement is a two-step process:
1. Claim construction (a question of law, decided by the court — Markman v. Westview Instruments, 517 U.S. 370 (1996)).
2. Comparison of the construed claim to the accused device (a question of fact).`,

  'US_Doctrine_of_Equivalents': `US Doctrine of Equivalents (DOE)
Even when an accused device does not literally infringe, infringement may still be found under the doctrine of equivalents if every element of the claim is met either literally or equivalently.

Tests for equivalence:
- Function-Way-Result Test (Graver Tank & Mfg. Co. v. Linde Air Products, 339 U.S. 605 (1950)): Does the accused element perform substantially the same function in substantially the same way to obtain substantially the same result?
- Insubstantial Differences Test: Are the differences between the claimed and accused element insubstantial?

The DOE is applied element-by-element (Warner-Jenkinson Co. v. Hilton Davis Chemical Co., 520 U.S. 17 (1997)), not to the claim as a whole.`,

  'US_Festo_PHE': `Festo / Prosecution History Estoppel
Festo Corp. v. Shoketsu Kinzoku Kogyo Kabushiki Co., 535 U.S. 722 (2002).

When a patent applicant narrows a claim during prosecution to satisfy patentability requirements (e.g., to overcome a § 102 or § 103 rejection), the applicant is presumed to have surrendered all equivalents within the territory between the original and amended claim. Prosecution history estoppel BARS recapturing that surrendered subject matter via the doctrine of equivalents.

Three rebuttal theories (where the patentee may overcome the presumption):
1. The equivalent was unforeseeable at the time of the amendment.
2. The rationale for the amendment bore no more than a tangential relation to the equivalent.
3. Some other reason suggests the patentee could not reasonably be expected to have described the equivalent.

For FTO: where prosecution history shows narrowing amendments, the DOE scope is limited and literal-only infringement analysis often suffices.`,

  'US_All_Elements_Rule': `All-Elements Rule (US)
Pennwalt Corp. v. Durand-Wayland, 833 F.2d 931 (Fed. Cir. 1987) (en banc).

For infringement (literal OR by equivalents), every element of the claim must be present in the accused device. The doctrine of equivalents is applied element-by-element, not claim-as-a-whole. Missing even one element — and lacking an equivalent for it — defeats infringement entirely.`,
};

const FTO_EU_STANDARDS: Record<string, string> = {
  'EPC_Art_69': `EPC Article 69 — Extent of Protection
(1) The extent of the protection conferred by a European patent or a European patent application shall be determined by the claims. Nevertheless, the description and drawings shall be used to interpret the claims.
(2) For the period up to grant, the extent of the protection conferred by the European patent application is determined by the claims contained in the application as published.

NOTE: EPC governs patent grant. Infringement is judged by national courts (DE, FR, NL, IT, etc., and now the Unified Patent Court for unitary patents) applying their own procedural law to the substantive claim-scope rule of Art. 69 + the Protocol below.`,

  'EPC_Art_69_Protocol': `Protocol on the Interpretation of Article 69 EPC
Article 1 — General principles:
The claims should not be interpreted in a strictly literal sense (using only the language as a guide), nor as merely a guideline (where the protection extends to anything the patentee may have contemplated). The proper interpretation lies between these extremes, and combines fair protection for the patent proprietor with a reasonable degree of legal certainty for third parties.

Article 2 — Equivalents:
For the purpose of determining the extent of protection, due account shall be taken of any element which is equivalent to an element specified in the claims.

Most national courts apply a multi-step equivalence test (e.g., Germany's Schneidmesser questions, the UK's Actavis questions). The Unified Patent Court applies a similar purposive approach.`,

  'UPC_Note': `Unified Patent Court (UPC)
Since 1 June 2023, the UPC has jurisdiction over Unitary Patents and (subject to opt-out) classical European patents in participating member states. Infringement decisions across the participating member states are issued by a single court, applying Art. 69 EPC + the Protocol with reference to national doctrine. UK is NOT a UPC participant.

For FTO across multiple EU national markets, treat the UPC as a unifier for opt-in patents and otherwise consider per-country infringement law (DE, FR, IT, NL most often).`,
};

const FTO_UK_STANDARDS: Record<string, string> = {
  'UK_Patents_Act_S60': `UK Patents Act 1977, Section 60 — Infringement
A person infringes a patent for an invention only if, while the patent is in force, he does any of the following in the United Kingdom in relation to the invention without the consent of the proprietor:
(a) where the invention is a product, makes, disposes of, offers to dispose of, uses or imports the product or keeps it whether for disposal or otherwise;
(b) where the invention is a process, uses the process or offers it for use in the United Kingdom when he knows, or it is obvious to a reasonable person, that its use without consent would be an infringement;
(c) where the invention is a process, disposes of, offers to dispose of, uses or imports any product obtained directly by means of that process or keeps any such product whether for disposal or otherwise.

Section 60 also defines indirect infringement (s.60(2)), which can capture supply of "essential means" relating to the invention.`,

  'UK_Patents_Act_S125': `UK Patents Act 1977, Section 125 — Extent of Invention
(1) For the purposes of this Act an invention for a patent for which an application has been made or for which a patent has been granted shall, unless the context otherwise requires, be taken to be that specified in a claim of the specification of the application or patent, as the case may be, as interpreted by the description and any drawings contained in that specification.
(3) The Protocol on the Interpretation of Article 69 of the European Patent Convention (which Article contains a provision corresponding to subsection (1) above) shall, as for the time being in force, apply for the purposes of subsection (1) above as it applies for the purposes of that Article.

This adopts EPC Art. 69 + the Protocol into UK law.`,

  'UK_Actavis_Equivalents': `Actavis v Eli Lilly — UK Doctrine of Equivalents
Actavis UK Ltd v Eli Lilly & Co [2017] UKSC 48.

Restated UK approach to claim construction; introduced an explicit doctrine of equivalents into UK patent law via three reformulated questions ("the Actavis questions"):
1. Notwithstanding that the variant is not within the literal meaning of the claim, does the variant achieve substantially the same result in substantially the same way as the invention?
2. Would it be obvious to the person skilled in the art, reading the patent at the priority date but knowing the variant achieves substantially the same result, that it does so in substantially the same way as the invention?
3. Would such a person have concluded that the patentee nonetheless intended that strict compliance with the literal meaning of the claim was an essential requirement of the invention?

If the answers are yes, yes, no — the variant infringes by equivalence.

The court also clarified that prosecution history is generally not relevant to construction unless (a) the issue is truly unclear from the patent itself, or (b) it would be contrary to public interest for the contents of the file to be ignored.`,

  'UK_Indirect_Infringement': `UK Indirect Infringement (s.60(2))
A person also infringes a patent for an invention if, while the patent is in force and without the consent of the proprietor, he supplies or offers to supply in the United Kingdom a person other than a licensee or other person entitled to work the invention with any of the means, relating to an essential element of the invention, for putting the invention into effect when he knows, or it is obvious to a reasonable person in the circumstances, that those means are suitable for putting, and are intended to put, the invention into effect in the United Kingdom.`,
};

// ---------------------------------------------------------------------------
// Lookup Function (used as a tool by the Patent Examiner agent)
// ---------------------------------------------------------------------------

const ALL_STANDARDS: Record<string, Record<string, string>> = {
  US: { ...US_STANDARDS, ...FTO_US_STANDARDS },
  EU: { ...EU_STANDARDS, ...FTO_EU_STANDARDS },
  UK: { ...UK_STANDARDS, ...FTO_UK_STANDARDS },
};

export interface LegalStandardResult {
  jurisdiction: string;
  standardId: string;
  content: string;
}

/**
 * Look up a legal standard by jurisdiction and topic.
 * If topic is not provided, returns all standards for the jurisdiction.
 */
export function lookupLegalStandard(
  jurisdiction: Jurisdiction,
  topic?: string,
): LegalStandardResult[] {
  const standards = ALL_STANDARDS[jurisdiction];
  if (!standards) return [];

  if (topic) {
    // Search by key match or content match
    const results: LegalStandardResult[] = [];
    const topicLower = topic.toLowerCase();

    for (const [key, content] of Object.entries(standards)) {
      if (
        key.toLowerCase().includes(topicLower) ||
        content.toLowerCase().includes(topicLower)
      ) {
        results.push({ jurisdiction, standardId: key, content });
      }
    }
    return results;
  }

  // Return all standards for the jurisdiction
  return Object.entries(standards).map(([key, content]) => ({
    jurisdiction,
    standardId: key,
    content,
  }));
}

/**
 * Get the inventive step / obviousness test for a specific jurisdiction.
 */
export function getInventiveStepTest(jurisdiction: Jurisdiction): string {
  switch (jurisdiction) {
    case 'US':
      return US_STANDARDS['35_USC_103'];
    case 'EU':
      return EU_STANDARDS['EPC_Art_56'];
    case 'UK':
      return UK_STANDARDS['UK_PA_1977_S3'];
  }
}

/**
 * Get the novelty test for a specific jurisdiction.
 */
export function getNoveltyTest(jurisdiction: Jurisdiction): string {
  switch (jurisdiction) {
    case 'US':
      return US_STANDARDS['35_USC_102'];
    case 'EU':
      return EU_STANDARDS['EPC_Art_54'];
    case 'UK':
      return UK_STANDARDS['UK_PA_1977_S2'];
  }
}

/**
 * Get the subject matter eligibility test for a specific jurisdiction.
 */
export function getEligibilityTest(jurisdiction: Jurisdiction): string {
  switch (jurisdiction) {
    case 'US':
      return US_STANDARDS['35_USC_101'];
    case 'EU':
      return EU_STANDARDS['EPC_Art_52'];
    case 'UK':
      return UK_STANDARDS['UK_PA_1977_S1'] + '\n\n' + UK_STANDARDS['UK_Aerotel_Macrossan'];
  }
}

/**
 * Get the infringement-claim-scope test for a specific jurisdiction (used in FTO).
 */
export function getInfringementTest(jurisdiction: Jurisdiction): string {
  switch (jurisdiction) {
    case 'US':
      return [
        FTO_US_STANDARDS['US_Literal_Infringement'],
        FTO_US_STANDARDS['US_Doctrine_of_Equivalents'],
        FTO_US_STANDARDS['US_Festo_PHE'],
        FTO_US_STANDARDS['US_All_Elements_Rule'],
      ].join('\n\n');
    case 'EU':
      return [
        FTO_EU_STANDARDS['EPC_Art_69'],
        FTO_EU_STANDARDS['EPC_Art_69_Protocol'],
        FTO_EU_STANDARDS['UPC_Note'],
      ].join('\n\n');
    case 'UK':
      return [
        FTO_UK_STANDARDS['UK_Patents_Act_S60'],
        FTO_UK_STANDARDS['UK_Patents_Act_S125'],
        FTO_UK_STANDARDS['UK_Actavis_Equivalents'],
        FTO_UK_STANDARDS['UK_Indirect_Infringement'],
      ].join('\n\n');
  }
}
