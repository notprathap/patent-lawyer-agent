import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';
import { runAnalysis } from './orchestrator/lead-counsel.js';
import { logger } from './utils/logger.js';
import type { Jurisdiction } from './types/index.js';

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
Patent Lawyer Agent — Patent Defensibility Analysis

Usage:
  npx tsx src/index.ts <claim-file> [options]
  npx tsx src/index.ts --claim "claim text" [options]

Options:
  --claim <text>         Provide claim text directly (instead of file)
  --jurisdictions <list> Comma-separated: US,EU,UK (default: US,EU,UK)
  --output <file>        Write memo to file (default: stdout)
  --help, -h             Show this help

Examples:
  npx tsx src/index.ts claim.txt
  npx tsx src/index.ts --claim "1. A method comprising..." --jurisdictions US,EU
  npx tsx src/index.ts claim.txt --output memo.md
`);
    process.exit(0);
  }

  // Parse arguments
  let claimText = '';
  let jurisdictions: Jurisdiction[] = ['US', 'EU', 'UK'];
  let outputFile: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--claim' && args[i + 1]) {
      claimText = args[++i];
    } else if (args[i] === '--jurisdictions' && args[i + 1]) {
      jurisdictions = args[++i].split(',').map((j) => j.trim().toUpperCase()) as Jurisdiction[];
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFile = args[++i];
    } else if (!args[i].startsWith('--')) {
      // Assume it's a file path
      claimText = readFileSync(args[i], 'utf-8').trim();
    }
  }

  if (!claimText) {
    console.error('Error: No claim text provided. Use --claim or pass a file path.');
    process.exit(1);
  }

  console.log('='.repeat(60));
  console.log('PATENT DEFENSIBILITY ANALYSIS');
  console.log('='.repeat(60));
  console.log(`Jurisdictions: ${jurisdictions.join(', ')}`);
  console.log(`Claim length: ${claimText.length} characters`);
  console.log('='.repeat(60));
  console.log();

  const startTime = Date.now();

  const result = await runAnalysis(claimText, jurisdictions);

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1);

  // Output memo
  if (outputFile) {
    writeFileSync(outputFile, result.memo, 'utf-8');
    console.log(`\nMemo written to: ${outputFile}`);
  } else {
    console.log(result.memo);
  }

  // Summary footer
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS SUMMARY');
  console.log('='.repeat(60));

  for (const score of result.confidenceReport.jurisdictionScores) {
    console.log(`  ${score.jurisdiction} Defensibility: ${score.defensibility}`);
  }

  console.log(`  Assessment Confidence: ${result.confidenceReport.assessmentConfidence}`);
  console.log(`  Duration: ${durationSec}s`);
  console.log(
    `  Tokens: ${result.session.totalTokensUsed.input} input / ${result.session.totalTokensUsed.output} output`,
  );
  console.log('='.repeat(60));
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  console.error('\nFatal error:', err.message || err);
  process.exit(1);
});
