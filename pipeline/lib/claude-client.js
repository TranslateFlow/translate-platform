import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Calls Claude using whichever auth is available:
 *
 *   1. ANTHROPIC_API_KEY  → direct Anthropic API (good for CI / GitHub Actions)
 *   2. AWS Bedrock        → IAM role / AWS credentials (good for local dev with Claude Code)
 *
 * Bedrock model can be overridden with BEDROCK_MODEL_ID env var.
 */

const BEDROCK_MODEL  = process.env.BEDROCK_MODEL_ID || 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';

// ── Anthropic direct API ────────────────────────────────────────────────────

async function callAnthropicAPI(prompt) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 8000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Anthropic API ${response.status}: ${err.error?.message}`);
  }

  const data = await response.json();
  process.stdout.write(
    `    💰 ${data.usage?.input_tokens ?? '?'} in / ${data.usage?.output_tokens ?? '?'} out tokens\n`
  );
  return data.content[0].text;
}

// ── AWS Bedrock ─────────────────────────────────────────────────────────────

let _bedrockClient;
function getBedrockClient() {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2',
    });
  }
  return _bedrockClient;
}

async function callBedrock(prompt) {
  const response = await getBedrockClient().send(new ConverseCommand({
    modelId: BEDROCK_MODEL,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 8000, temperature: 0.2 },
  }));

  const usage = response.usage;
  process.stdout.write(
    `    💰 ${usage?.inputTokens ?? '?'} in / ${usage?.outputTokens ?? '?'} out tokens\n`
  );
  return response.output?.message?.content?.[0]?.text;
}

// ── Public entry point ──────────────────────────────────────────────────────

export async function callClaude(prompt) {
  const useAnthropicAPI = !!process.env.ANTHROPIC_API_KEY;

  let text;
  if (useAnthropicAPI) {
    process.stdout.write(`    🔑 Using Anthropic API\n`);
    text = await callAnthropicAPI(prompt);
  } else {
    process.stdout.write(`    ☁️  Using AWS Bedrock (${BEDROCK_MODEL})\n`);
    text = await callBedrock(prompt);
  }

  if (!text) throw new Error('Empty response from Claude');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');

  return JSON.parse(match[0]);
}
