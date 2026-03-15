import { promises as fs } from 'fs';
import path from 'path';
import { flattenObject } from './json-utils.js';
import type { Glossary, JsonObject } from '../types.js';

/**
 * Product/brand names that must never be translated.
 * Injected into every translation prompt.
 */
export const DO_NOT_TRANSLATE: string[] = [
  'CXone', 'CXone Mpower', 'NICE', 'Enlighten', 'Enlighten Copilot',
  'Agent Assist Hub', 'Virtual Agent Hub', 'Transcription Hub',
  'Voice Biometrics Hub', 'Cloud TTS Hub', 'Integration Hub',
  'AAI', 'ACD', 'IVR', 'CSV', 'PDF', 'UCaaS',
  'Salesforce', 'Google', 'CCAI', 'Studio', 'CXone Mpower Hubs',
  'RTIG', 'Omilia',
];

export const LANGUAGE_NAMES: Record<string, string> = {
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
 */
export async function buildGlossary(
  originDir: string,
  translatedDir: string,
  languages: string[],
): Promise<Glossary> {
  const MAX_ENTRIES = 40;
  const REF_FILES = ['aaiAdminUI.json', 'agentassisthub.json'];

  const glossary: Glossary = {};
  for (const lang of languages) glossary[lang] = [];

  for (const fileName of REF_FILES) {
    const originPath = path.join(originDir, fileName);
    let originFlat: Record<string, unknown>;

    try {
      const content = JSON.parse(await fs.readFile(originPath, 'utf8')) as JsonObject;
      originFlat = flattenObject(content);
    } catch {
      continue;
    }

    for (const lang of languages) {
      if (glossary[lang].length >= MAX_ENTRIES) continue;

      const transPath = path.join(translatedDir, lang, 'apps', fileName);
      try {
        const transContent = JSON.parse(await fs.readFile(transPath, 'utf8')) as JsonObject;
        const transFlat = flattenObject(transContent);

        for (const [key, engValue] of Object.entries(originFlat)) {
          if (glossary[lang].length >= MAX_ENTRIES) break;
          if (typeof engValue !== 'string' || engValue.trim() === '') continue;

          const transValue = transFlat[key];
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
