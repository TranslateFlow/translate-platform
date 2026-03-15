import { flattenObject, setNestedValue } from '../lib/json-utils.js';

// Detects an unclosed {{ that has no matching }}
const UNCLOSED_PLACEHOLDER = /\{\{(?![^}]*\}\})/;
// Detects a }} with no preceding {{
const ORPHAN_CLOSE = /(?<!\{[^}]*)\}\}/;

/**
 * Agent 2 — Format QA
 *
 * Validates all string values in contentToTranslate before sending to the translator.
 * Returns cleanContent (only valid strings) and a qaReport.
 *
 * Checks:
 *   - Empty / whitespace-only values  → skipped (not sent to translator)
 *   - Unclosed {{ placeholder         → warning (still translated, flagged)
 *   - Orphan }} placeholder           → warning (still translated, flagged)
 */
export function runFormatQA(contentToTranslate) {
  console.log('🧪 [Agent 2] Format QA');

  const qaReport = { passed: 0, failed: 0, warnings: [], issues: [] };
  const cleanContent = {};

  for (const [file, content] of Object.entries(contentToTranslate)) {
    const flat = flattenObject(content);
    const cleanFlat = {};

    for (const [key, value] of Object.entries(flat)) {
      // Only validate string leaves
      if (typeof value !== 'string') continue;

      if (value.trim() === '') {
        qaReport.issues.push({ file, key, issue: 'Empty string — skipped' });
        qaReport.failed++;
        continue;
      }

      if (UNCLOSED_PLACEHOLDER.test(value)) {
        qaReport.warnings.push({ file, key, issue: `Unclosed {{ in: "${value.slice(0, 60)}"` });
        console.warn(`   ⚠️  ${file} › ${key}: unclosed {{ placeholder`);
      }

      if (ORPHAN_CLOSE.test(value)) {
        qaReport.warnings.push({ file, key, issue: `Orphan }} in: "${value.slice(0, 60)}"` });
        console.warn(`   ⚠️  ${file} › ${key}: orphan }} placeholder`);
      }

      cleanFlat[key] = value;
      qaReport.passed++;
    }

    if (Object.keys(cleanFlat).length > 0) {
      cleanContent[file] = {};
      for (const [dotKey, value] of Object.entries(cleanFlat)) {
        setNestedValue(cleanContent[file], dotKey, value);
      }
    }
  }

  console.log(`   ✅ ${qaReport.passed} ok, ${qaReport.failed} skipped, ${qaReport.warnings.length} warnings\n`);
  return { cleanContent, qaReport };
}
