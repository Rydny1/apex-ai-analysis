// The ONE seam where the pipeline calls a model. Everywhere else in the engine is
// plain code (see the code-vs-LLM map in the build brief). Two things make this
// safe and cheap:
//   1. Structured output via tool use + Zod validation - the model can only ever
//      return one of the two shapes below, never free text that could break the
//      pipeline or smuggle in an instruction from untrusted match data.
//   2. Prompt caching on the static rules block (see prompts.ts) - it's marked
//      `cache_control: ephemeral` so repeated calls in the same run don't re-bill
//      the full rules text every time.
import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { config } from '../config';
import { APEX_RULES_BLOCK, buildBreakThePickUserPrompt, buildQualitativeReadUserPrompt } from './prompts';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const qualitativeReadSchema = z.object({
  styleMatchupRead: z.string(),
  lateNewsRead: z.string(),
});

const breakThePickSchema = z.object({
  tacticalCounter: z.string(),
  squadRotationCounter: z.string(),
  situationalPrecedentCounter: z.string(),
  severity: z.enum(['WEAK', 'MODERATE', 'STRONG']),
});

export type QualitativeRead = z.infer<typeof qualitativeReadSchema>;
export type BreakThePickOutput = z.infer<typeof breakThePickSchema>;

// Tracks token usage so the per-run cost guard (see config.limits.perRunCostGuardUsd)
// can stop making new calls once a run crosses its soft budget.
export interface LlmCallCost {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}

interface LlmCallResult<T> {
  data: T;
  cost: LlmCallCost;
}

async function callWithTool<T>(userPrompt: string, toolName: string, toolSchema: z.ZodType<T>, jsonSchema: object): Promise<LlmCallResult<T>> {
  const response = await client.messages.create({
    model: config.anthropic.modelDefault,
    max_tokens: 1024,
    system: [{ type: 'text', text: APEX_RULES_BLOCK, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: userPrompt }],
    tools: [{ name: toolName, description: `Return your answer via the ${toolName} tool.`, input_schema: jsonSchema as Anthropic.Tool['input_schema'] }],
    tool_choice: { type: 'tool', name: toolName },
  });

  const toolUseBlock = response.content.find((block) => block.type === 'tool_use');
  if (!toolUseBlock || toolUseBlock.type !== 'tool_use') {
    throw new Error(`Model did not return a structured ${toolName} response.`);
  }

  // Validated here - if the model somehow returns a shape that doesn't match,
  // this throws instead of letting malformed data flow into the pipeline.
  const data = toolSchema.parse(toolUseBlock.input);

  return {
    data,
    cost: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}

export async function getQualitativeRead(matchSummary: string): Promise<LlmCallResult<QualitativeRead>> {
  return callWithTool(buildQualitativeReadUserPrompt(matchSummary), 'submit_qualitative_read', qualitativeReadSchema, {
    type: 'object',
    properties: {
      styleMatchupRead: { type: 'string' },
      lateNewsRead: { type: 'string' },
    },
    required: ['styleMatchupRead', 'lateNewsRead'],
  });
}

export async function getBreakThePick(matchSummary: string, pickSummary: string): Promise<LlmCallResult<BreakThePickOutput>> {
  return callWithTool(buildBreakThePickUserPrompt(matchSummary, pickSummary), 'submit_break_the_pick', breakThePickSchema, {
    type: 'object',
    properties: {
      tacticalCounter: { type: 'string' },
      squadRotationCounter: { type: 'string' },
      situationalPrecedentCounter: { type: 'string' },
      severity: { type: 'string', enum: ['WEAK', 'MODERATE', 'STRONG'] },
    },
    required: ['tacticalCounter', 'squadRotationCounter', 'situationalPrecedentCounter', 'severity'],
  });
}

// Rough USD cost estimate for the per-run cost guard. Sonnet-class pricing as of
// this build; kept here (not in config.ts) since it's a cost-estimation detail,
// not a runtime setting - if pricing changes, only this needs updating.
const USD_PER_INPUT_TOKEN = 3 / 1_000_000;
const USD_PER_OUTPUT_TOKEN = 15 / 1_000_000;
const USD_PER_CACHE_READ_TOKEN = 0.3 / 1_000_000;

export function estimateCostUsd(cost: LlmCallCost): number {
  return (
    cost.inputTokens * USD_PER_INPUT_TOKEN +
    cost.outputTokens * USD_PER_OUTPUT_TOKEN +
    cost.cacheReadInputTokens * USD_PER_CACHE_READ_TOKEN
  );
}
