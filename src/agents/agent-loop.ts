import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod/v4';
import { getClaudeClient, DEFAULT_MODEL } from '../lib/claude.js';
import { logger } from '../utils/logger.js';

// Zod v4 exports toJSONSchema at runtime but the type declarations don't surface it
// through the standard import path. We import dynamically and cache it.
let _toJSONSchema: ((schema: z.ZodType) => Record<string, unknown>) | null = null;

async function getToJSONSchema(): Promise<(schema: z.ZodType) => Record<string, unknown>> {
  if (!_toJSONSchema) {
    const mod = await import('zod/v4');
    _toJSONSchema = (mod as Record<string, unknown>).toJSONSchema as typeof _toJSONSchema;
    if (!_toJSONSchema) {
      throw new Error('toJSONSchema not found in zod/v4 — check Zod version');
    }
  }
  return _toJSONSchema;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (input: unknown) => Promise<unknown>;
}

export interface AgentLoopOptions {
  model?: string;
  systemPrompt: string;
  tools?: ToolDefinition[];
  maxTurns?: number;
  maxTokens?: number;
}

export interface AgentLoopResult {
  text: string;
  tokensUsed: { input: number; output: number };
  turns: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildClaudeTools(tools: ToolDefinition[]): Promise<Anthropic.Messages.Tool[]> {
  const toJSON = await getToJSONSchema();
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: toJSON(tool.inputSchema) as Anthropic.Messages.Tool.InputSchema,
  }));
}

// ---------------------------------------------------------------------------
// Agent Loop
// ---------------------------------------------------------------------------

export async function runAgentLoop(
  userMessage: string,
  options: AgentLoopOptions,
): Promise<AgentLoopResult> {
  const client = getClaudeClient();
  const {
    model = DEFAULT_MODEL,
    systemPrompt,
    tools = [],
    maxTurns = 10,
    maxTokens = 4096,
  } = options;

  const claudeTools = tools.length > 0 ? await buildClaudeTools(tools) : undefined;
  const toolMap = new Map(tools.map((t) => [t.name, t]));

  const messages: Anthropic.Messages.MessageParam[] = [
    { role: 'user', content: userMessage },
  ];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    logger.debug({ turn: turns, model }, 'Agent loop: sending request');

    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages,
      ...(claudeTools ? { tools: claudeTools } : {}),
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;

    // Check if there are any tool_use blocks
    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.Messages.ToolUseBlock => block.type === 'tool_use',
    );

    // If no tool calls or stop_reason is end_turn with no tool_use, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      const textBlocks = response.content.filter(
        (block): block is Anthropic.Messages.TextBlock => block.type === 'text',
      );
      const text = textBlocks.map((b) => b.text).join('\n');

      logger.debug(
        { turns, inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
        'Agent loop: complete',
      );

      return {
        text,
        tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
        turns,
      };
    }

    // Process tool calls
    // First, append the assistant's response to messages
    messages.push({ role: 'assistant', content: response.content });

    // Execute each tool call and collect results
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const tool = toolMap.get(toolUse.name);

      if (!tool) {
        logger.warn({ toolName: toolUse.name }, 'Agent loop: unknown tool called');
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error: Unknown tool "${toolUse.name}"`,
          is_error: true,
        });
        continue;
      }

      try {
        // Validate input against Zod schema
        const validatedInput = tool.inputSchema.parse(toolUse.input);
        const result = await tool.execute(validatedInput);

        logger.debug({ toolName: toolUse.name }, 'Agent loop: tool executed');

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: typeof result === 'string' ? result : JSON.stringify(result),
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error({ toolName: toolUse.name, error: errorMessage }, 'Agent loop: tool error');

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: `Error executing tool: ${errorMessage}`,
          is_error: true,
        });
      }
    }

    // Append tool results
    messages.push({ role: 'user', content: toolResults });
  }

  // If we've exhausted maxTurns, return whatever text we have
  logger.warn({ maxTurns }, 'Agent loop: max turns reached');

  return {
    text: '[Agent loop terminated: maximum turns reached]',
    tokensUsed: { input: totalInputTokens, output: totalOutputTokens },
    turns,
  };
}

// ---------------------------------------------------------------------------
// Structured Output Agent Loop
// ---------------------------------------------------------------------------
// Variant that uses a "submit" tool to extract structured output from the agent.
// The agent is instructed to call the submit tool with its final result.

export interface StructuredAgentLoopOptions<T> extends AgentLoopOptions {
  outputSchema: z.ZodType;
  outputToolName?: string;
  outputToolDescription?: string;
}

export interface StructuredAgentLoopResult<T> {
  data: T;
  text: string;
  tokensUsed: { input: number; output: number };
  turns: number;
}

export async function runStructuredAgentLoop<T>(
  userMessage: string,
  options: StructuredAgentLoopOptions<T>,
): Promise<StructuredAgentLoopResult<T>> {
  const {
    outputSchema,
    outputToolName = 'submit_result',
    outputToolDescription = 'Submit the final structured result of your analysis.',
    ...agentOptions
  } = options;

  let capturedOutput: T | null = null;

  // Create the submit tool that captures structured output
  const submitTool: ToolDefinition = {
    name: outputToolName,
    description: outputToolDescription,
    inputSchema: outputSchema,
    execute: async (input: unknown) => {
      capturedOutput = input as T;
      return 'Result submitted successfully.';
    },
  };

  // Prepend submit tool to any existing tools
  const allTools = [submitTool, ...(agentOptions.tools ?? [])];

  let result = await runAgentLoop(userMessage, {
    ...agentOptions,
    tools: allTools,
  });

  // If the agent didn't call the submit tool, retry once with an explicit instruction
  if (capturedOutput === null && result.text) {
    logger.debug('Structured agent loop: agent did not call submit tool, retrying with nudge');

    const retryMessage =
      `You responded with text but did not call the "${outputToolName}" tool. ` +
      `You MUST call "${outputToolName}" with your structured analysis. ` +
      `Parse the input as best you can and submit it now. Do not respond with text.`;

    result = await runAgentLoop(
      `${userMessage}\n\n---\n\nPREVIOUS ATTEMPT:\n${result.text}\n\n---\n\nINSTRUCTION: ${retryMessage}`,
      {
        ...agentOptions,
        tools: allTools,
        maxTurns: 3,
      },
    );
  }

  if (capturedOutput === null) {
    const agentMessage = result.text?.trim() || 'No explanation provided.';
    throw new Error(
      `The agent could not process this input. Agent response: "${agentMessage.slice(0, 500)}"`,
    );
  }

  return {
    data: capturedOutput,
    text: result.text,
    tokensUsed: result.tokensUsed,
    turns: result.turns,
  };
}
