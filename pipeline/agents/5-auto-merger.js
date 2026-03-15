import { promises as fs } from 'fs';
import path from 'path';
import { deepMerge, deleteNestedKey } from '../lib/json-utils.js';

/**
 * Agent 5 — Auto-Merger
 *
 * Merges translated content directly into translated/{lang}/apps/{file}.json.
 * - Deep-merges new translations over existing content (new wins on conflicts).
 * - Deletes keys that were removed from origin.
 * - Creates new files/directories if they don't exist yet.
 * - Never touches files in translated/ that have no corresponding origin file.
 */
export async function mergeTranslations(translatedContent, deletedKeys, translatedDir, languages) {
  console.log('🔀 [Agent 5] Auto-Merger');

  let totalFiles = 0;

  for (const lang of languages) {
    const langTranslations = translatedContent[lang];
    if (!langTranslations || Object.keys(langTranslations).length === 0) continue;

    for (const [file, newContent] of Object.entries(langTranslations)) {
      const filePath = path.join(translatedDir, lang, 'apps', file);

      // Load existing translation (may not exist yet)
      let existing = {};
      try {
        existing = JSON.parse(await fs.readFile(filePath, 'utf8'));
      } catch {
        // New file — will be created
      }

      // Merge: new translations take precedence for changed keys
      let merged = deepMerge(existing, newContent);

      // Apply deletions from origin
      const toDelete = deletedKeys?.[file] ?? [];
      for (const dotKey of toDelete) {
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
