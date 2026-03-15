import { promises as fs } from 'fs';
import path from 'path';
import { deepMerge, deleteNestedKey } from '../lib/json-utils.js';
import type { JsonObject, TranslatedContent } from '../types.js';

/**
 * Agent 5 — Auto-Merger
 *
 * Merges translated content directly into translated/{lang}/apps/{file}.json.
 * Deep-merges new translations over existing (new wins on conflicts).
 * Deletes keys removed from origin. Creates files/directories as needed.
 */
export async function mergeTranslations(
  translatedContent: TranslatedContent,
  deletedKeys: Record<string, string[]>,
  translatedDir: string,
  languages: string[],
): Promise<number> {
  console.log('🔀 [Agent 5] Auto-Merger');

  let totalFiles = 0;

  for (const lang of languages) {
    const langTranslations = translatedContent[lang];
    if (!langTranslations || Object.keys(langTranslations).length === 0) continue;

    for (const [file, newContent] of Object.entries(langTranslations)) {
      const filePath = path.join(translatedDir, lang, 'apps', file);

      let existing: JsonObject = {};
      try {
        existing = JSON.parse(await fs.readFile(filePath, 'utf8')) as JsonObject;
      } catch {
        // New file — will be created
      }

      let merged = deepMerge(existing, newContent as JsonObject);

      for (const dotKey of deletedKeys?.[file] ?? []) {
        deleteNestedKey(merged, dotKey);
        console.log(`   🗑️  ${lang}/apps/${file}: deleted ${dotKey}`);
      }

      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      console.log(`   ✅ ${lang}/apps/${file}`);
      totalFiles++;
    }
  }

  console.log(`   📦 ${totalFiles} file(s) written\n`);
  return totalFiles;
}
