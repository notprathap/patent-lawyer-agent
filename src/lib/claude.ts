import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';

let client: Anthropic | null = null;

export function getClaudeClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  return client;
}

export const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
export const PREMIUM_MODEL = 'claude-opus-4-20250514';
