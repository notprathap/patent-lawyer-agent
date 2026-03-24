/**
 * Real patent claims from public patents for testing the Claim Deconstructor.
 */

export interface SampleClaim {
  id: string;
  description: string;
  claimText: string;
  expectedClaimNumber: number;
  expectedIsIndependent: boolean;
  expectedMinElements: number;
  expectedHasMeansPlusFunction: boolean;
}

// US Patent 10,334,462 (Apple - Dual-camera system)
export const CLAIM_DUAL_CAMERA: SampleClaim = {
  id: 'dual-camera',
  description: 'Apple dual-camera patent — structural hardware claim',
  claimText: `1. A camera system comprising:
a first camera module having a first field of view;
a second camera module having a second field of view different from the first field of view;
a processor configured to receive image data from the first camera module and the second camera module; and
a memory coupled to the processor and configured to store instructions that, when executed by the processor, cause the processor to generate a fused image from the image data received from the first camera module and the second camera module.`,
  expectedClaimNumber: 1,
  expectedIsIndependent: true,
  expectedMinElements: 4,
  expectedHasMeansPlusFunction: false,
};

// US Patent 6,285,999 (Google - PageRank)
export const CLAIM_PAGERANK: SampleClaim = {
  id: 'pagerank',
  description: 'Google PageRank patent — method claim',
  claimText: `1. A computer implemented method of scoring a plurality of linked documents, comprising:
obtaining a plurality of documents, each document having at least one link to another document;
assigning an initial score to each of the plurality of documents;
iteratively updating the score of each document based on scores of documents linking to it; and
storing the updated scores in a data structure accessible by a search engine.`,
  expectedClaimNumber: 1,
  expectedIsIndependent: true,
  expectedMinElements: 4,
  expectedHasMeansPlusFunction: false,
};

// Synthetic claim with means-plus-function language
export const CLAIM_MEANS_PLUS_FUNCTION: SampleClaim = {
  id: 'means-plus-function',
  description: 'Synthetic claim with means-plus-function limitations',
  claimText: `1. An apparatus for processing audio signals, comprising:
means for receiving an audio input signal;
a digital filter configured to remove noise from the audio input signal;
means for converting the filtered audio signal to a digital format; and
a storage module for storing the digital audio signal.`,
  expectedClaimNumber: 1,
  expectedIsIndependent: true,
  expectedMinElements: 4,
  expectedHasMeansPlusFunction: true,
};

// Dependent claim example
export const CLAIM_DEPENDENT: SampleClaim = {
  id: 'dependent',
  description: 'Dependent claim referencing claim 1',
  claimText: `3. The camera system of claim 1, wherein the processor is further configured to apply a depth estimation algorithm to the image data from the first camera module and the second camera module to generate a depth map.`,
  expectedClaimNumber: 3,
  expectedIsIndependent: false,
  expectedMinElements: 1,
  expectedHasMeansPlusFunction: false,
};

// Complex pharmaceutical method claim
export const CLAIM_PHARMA_METHOD: SampleClaim = {
  id: 'pharma-method',
  description: 'Pharmaceutical method claim — multi-step process',
  claimText: `1. A method of treating a bacterial infection in a subject in need thereof, comprising:
administering to the subject a therapeutically effective amount of a composition comprising a first antibiotic compound selected from the group consisting of amoxicillin and ampicillin;
co-administering a beta-lactamase inhibitor in combination with the first antibiotic compound;
monitoring the subject for a reduction in bacterial load after a period of at least 48 hours; and
adjusting the dosage of the first antibiotic compound based on the monitored bacterial load.`,
  expectedClaimNumber: 1,
  expectedIsIndependent: true,
  expectedMinElements: 4,
  expectedHasMeansPlusFunction: false,
};

export const ALL_SAMPLE_CLAIMS: SampleClaim[] = [
  CLAIM_DUAL_CAMERA,
  CLAIM_PAGERANK,
  CLAIM_MEANS_PLUS_FUNCTION,
  CLAIM_DEPENDENT,
  CLAIM_PHARMA_METHOD,
];
