import { promises as fs } from 'fs';
import path from 'path';
import { flattenObject } from './json-utils.js';

/**
 * Product/brand names that must never be translated.
 * Injected into every translation prompt.
 */
export const DO_NOT_TRANSLATE = [
  'CXone', 'CXone Mpower', 'NICE', 'Enlighten', 'Enlighten Copilot',
  'Agent Assist Hub', 'Virtual Agent Hub', 'Transcription Hub',
  'Voice Biometrics Hub', 'Cloud TTS Hub', 'Integration Hub',
  'AAI', 'ACD', 'IVR', 'CSV', 'PDF', 'UCaaS',
  'Salesforce', 'Google', 'CCAI', 'Studio', 'CXone Mpower Hubs',
  'RTIG', 'Omilia',
];

export const LANGUAGE_NAMES = {
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  'fr-ca': 'French (Canada)',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pt: 'Portuguese',
  'zh-cn': 'Chinese Simplified',
  'zh-hk': 'Chinese Traditional (Hong Kong)',
};

/**
 * Build per-language glossaries by matching English origin keys to
 * existing translations in translated/. Limits to MAX_ENTRIES per language.
 *
 * Returns: { [lang]: Array<{ en: string, translated: string }> }
 */
export async function buildGlossary(originDir, translatedDir, languages) {
  const MAX_ENTRIES = 40;
  // Reference files: small enough to use fully, well-translated across all langs
  const REF_FILES = ['aaiAdminUI.json', 'agentassisthub.json'];

  const glossary = {};
  for (const lang of languages) glossary[lang] = [];

  for (const fileName of REF_FILES) {
    const originPath = path.join(originDir, fileName);
    let originFlat;
    try {
      originFlat = flattenObject(JSON.parse(await fs.readFile(originPath, 'utf8')));
    } catch {
      continue; // File not in origin, skip
    }

    for (const lang of languages) {
      if (glossary[lang].length >= MAX_ENTRIES) continue;

      const transPath = path.join(translatedDir, lang, 'apps', fileName);
      try {
        const transFlat = flattenObject(JSON.parse(await fs.readFile(transPath, 'utf8')));

        for (const [key, engValue] of Object.entries(originFlat)) {
          if (glossary[lang].length >= MAX_ENTRIES) break;
          if (typeof engValue !== 'string' || engValue.trim() === '') continue;

          const transValue = transFlat[key];
          // Only include pairs where the translation is actually different from English
          // (same value = kept-as-is term, already covered by DO_NOT_TRANSLATE)
          if (typeof transValue === 'string' && transValue !== engValue) {
            glossary[lang].push({ en: engValue, translated: transValue });
          }
        }
      } catch {
        // Translation file missing — skip silently
      }
    }
  }

  return glossary;
}
