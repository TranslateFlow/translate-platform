import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';

/**
 * Calls Claude via AWS Bedrock using the default credential chain
 * (IAM role, ~/.aws/credentials, environment variables — whatever is configured).
 *
 * Model can be overridden with the BEDROCK_MODEL_ID environment variable.
 * Region defaults to AWS_REGION env var, then us-west-2.
 */

const DEFAULT_MODEL = 'us.anthropic.claude-3-5-sonnet-20241022-v2:0';

let _client;
function getClient() {
  if (!_client) {
    _client = new BedrockRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2',
    });
  }
  return _client;
}

export async function callClaude(prompt) {
  const modelId = process.env.BEDROCK_MODEL_ID || DEFAULT_MODEL;

  const command = new ConverseCommand({
    modelId,
    messages: [{ role: 'user', content: [{ text: prompt }] }],
    inferenceConfig: {
      maxTokens: 8000,
      temperature: 0.2,
    },
  });

  let response;
  try {
    response = await getClient().send(command);
  } catch (err) {
    throw new Error(`Bedrock API error: ${err.message}`);
  }

  const usage = response.usage;
  process.stdout.write(
    `    💰 ${usage?.inputTokens ?? '?'} in / ${usage?.outputTokens ?? '?'} out tokens\n`
  );

  const text = response.output?.message?.content?.[0]?.text;
  if (!text) throw new Error('Empty response from Bedrock');

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');

  return JSON.parse(match[0]);
}
