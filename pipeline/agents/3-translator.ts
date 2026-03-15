import { flattenObject, setNestedValue } from '../lib/json-utils.js';
import { buildGlossary, DO_NOT_TRANSLATE, LANGUAGE_NAMES } from '../lib/context-builder.js';
import { callClaude } from '../lib/claude-client.js';
import type { Glossary, NestedStringObject, TranslatedContent } from '../types.js';

const BATCH_SIZE = 25;

/**
 * Agent 3 — Translator
 *
 * Translates cleanContent into all target languages using Claude via Bedrock.
 * Every prompt is grounded in terminology extracted from existing translations.
 */
export async function translateContent(
  cleanContent: Record<string, NestedStringObject>,
  languages: string[],
  originDir: string,
  translatedDir: string,
): Promise<TranslatedContent> {
  console.log('🌍 [Agent 3] Translator');

  console.log('   📚 Building terminology context from existing translations...');
  const glossary = await buildGlossary(originDir, translatedDir, languages);

  const result: TranslatedContent = {};
  for (const lang of languages) result[lang] = {};

  for (const [file, content] of Object.entries(cleanContent)) {
    const appName = file.replace('.json', '');
    console.log(`   📄 ${file}`);

    const flatEntries = Object.entries(flattenObject(content as Record<string, unknown>))
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string');

    if (flatEntries.length === 0) {
      console.log('      (no string values to translate)');
      continue;
    }

    const batches: Array<[string, string][]> = [];
    for (let i = 0; i < flatEntries.length; i += BATCH_SIZE) {
      batches.push(flatEntries.slice(i, i + BATCH_SIZE));
    }
    console.log(`      ${flatEntries.length} strings → ${batches.length} batch(es)`);

    for (let bIdx = 0; bIdx < batches.length; bIdx++) {
      const batch = Object.fromEntries(batches[bIdx]);
      console.log(`      Batch ${bIdx + 1}/${batches.length} (${batches[bIdx].length} strings)...`);

      const prompt = buildPrompt(appName, batch, languages, glossary);

      let translated: Record<string, unknown>;
      try {
        translated = await callClaude(prompt);
      } catch (err) {
        console.error(`   ❌ Batch ${bIdx + 1} failed: ${(err as Error).message}`);
        continue;
      }

      for (const lang of languages) {
        const langResult = translated[lang];
        if (!langResult || typeof langResult !== 'object') {
          console.warn(`   ⚠️  No output for lang "${lang}" in batch ${bIdx + 1}`);
          continue;
        }

        if (!result[lang][file]) result[lang][file] = {};

        for (const [key, value] of Object.entries(langResult as Record<string, unknown>)) {
          if (typeof value === 'string') {
            setNestedValue(result[lang][file] as Record<string, unknown>, key, value);
          }
        }
      }
    }
    console.log(`      ✅ Done`);
  }

  console.log(`   ✅ Translation complete\n`);
  return result;
}

function buildPrompt(
  appName: string,
  batch: Record<string, string>,
  languages: string[],
  glossary: Glossary,
): string {
  const glossaryLines = languages.flatMap(lang => {
    const entries = (glossary[lang] ?? []).slice(0, 15);
    if (entries.length === 0) return [];
    const lines = entries.map(e => `  "${e.en}" → "${e.translated}"`).join('\n');
    return [`${LANGUAGE_NAMES[lang]}:\n${lines}`];
  }).join('\n\n');

  const langStructure = languages
    .map(l => `  "${l}": { /* ${LANGUAGE_NAMES[l]} — same keys as input, translated values */ }`)
    .join(',\n');

  return `You are translating UI strings for the CXone platform by NICE — enterprise contact center software used worldwide.

APPLICATION: ${appName}

━━━ DO NOT TRANSLATE (keep exactly as written) ━━━
${DO_NOT_TRANSLATE.map(t => `• ${t}`).join('\n')}

━━━ TERMINOLOGY REFERENCE — match this style exactly ━━━
${glossaryLines || '(building from scratch — use professional enterprise software tone)'}

━━━ TRANSLATION RULES ━━━
1. Translate ONLY string values — never modify JSON keys
2. Preserve ALL {{variable}} placeholders exactly as written (e.g., {{Count}}, {{suName}})
3. Maintain professional, formal tone suitable for enterprise software UI
4. Keep brand/product names unchanged (see list above)
5. Respond ONLY with valid JSON — no markdown, no explanation

━━━ STRINGS TO TRANSLATE ━━━
${JSON.stringify(batch, null, 2)}

━━━ RESPOND WITH EXACTLY THIS JSON STRUCTURE ━━━
{
${langStructure}
}`;
}
