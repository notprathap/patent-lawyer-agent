import { getClaudeClient, DEFAULT_MODEL } from './lib/claude.js';
import { logger } from './utils/logger.js';

async function main() {
  logger.info('Patent Lawyer Agent — starting up');

  const client = getClaudeClient();

  logger.info({ model: DEFAULT_MODEL }, 'Testing Claude API connectivity...');

  const response = await client.messages.create({
    model: DEFAULT_MODEL,
    max_tokens: 256,
    messages: [
      {
        role: 'user',
        content:
          'You are a patent law assistant. Respond with a single sentence confirming you are ready to assist with patent analysis across US, EU, and UK jurisdictions.',
      },
    ],
  });

  const text =
    response.content[0].type === 'text' ? response.content[0].text : '(no text response)';

  logger.info(
    {
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
    },
    'Claude API response received',
  );

  console.log(`\nClaude says: ${text}\n`);
  logger.info('Phase 0 verification complete — system is operational');
}

main().catch((err) => {
  logger.error(err, 'Fatal error');
  process.exit(1);
});
