/**
 * Thin wrapper around the Anthropic Messages API.
 * Returns the parsed JSON object from Claude's response.
 */
export async function callClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is required');
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 8000,
      temperature: 0.2,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(`Claude API ${response.status}: ${err.error?.message}`);
  }

  const data = await response.json();
  process.stdout.write(
    `    💰 ${data.usage?.input_tokens ?? '?'} in / ${data.usage?.output_tokens ?? '?'} out tokens\n`
  );

  const text = data.content[0].text;
  // Extract the first JSON object from the response (Claude sometimes adds preamble)
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in Claude response');

  return JSON.parse(match[0]);
}
