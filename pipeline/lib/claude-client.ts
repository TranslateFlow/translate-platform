import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

const BEDROCK_MODEL  = process.env.BEDROCK_MODEL_ID ?? 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';
const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20241022';

// ── Anthropic direct API ─────────────────────────────────────────────────────

async function callAnthropicAPI(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
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
    throw new Error(`Anthropic API ${response.status}: ${(err as any).error?.message}`);
  }

  const data = await response.json() as any;
  process.stdout.write(
    `    💰 ${data.usage?.input_tokens ?? '?'} in / ${data.usage?.output_tokens ?? '?'} out tokens\n`
  );
  return data.content[0].text as string;
}

// ── AWS Bedrock ──────────────────────────────────────────────────────────────

let _bedrockClient: BedrockRuntimeClient | undefined;

function getBedrockClient(): BedrockRuntimeClient {
  if (!_bedrockClient) {
    _bedrockClient = new BedrockRuntimeClient({
      region: process.env.AWS_REGION ?? 'us-west-2',
    });
  }
  return _bedrockClient;
}

async function callBedrock(prompt: string): Promise<string> {
  const response = await getBedrockClient().send(new ConverseCommand({
    modelId: BEDROCK_MODEL,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: { maxTokens: 8000, temperature: 0.2 },
  }));

  const { usage } = response;
  process.stdout.write(
    `    💰 ${usage?.inputTokens ?? '?'} in / ${usage?.outputTokens ?? '?'} out tokens\n`
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Bedrock');
  return text;
}

// ── Public entry point ───────────────────────────────────────────────────────

export async function callClaude(prompt: string): Promise<Record<string, unknown>> {
  const useAnthropicAPI = !!process.env.ANTHROPIC_API_KEY;

  let text: string;
  if (useAnthropicAPI) {
    process.stdout.write(`    🔑 Using Anthropic API\n`);
    text = await callAnthropicAPI(prompt);
  } else {
    process.stdout.write(`    ☁️  Using AWS Bedrock (${BEDROCK_MODEL})\n`);
    text = await callBedrock(prompt);
  }

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');

  return JSON.parse(match[0]) as Record<string, unknown>;
}
