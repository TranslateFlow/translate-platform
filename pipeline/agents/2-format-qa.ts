import { flattenObject, setNestedValue } from '../lib/json-utils.js';
import type { FormatQAResult, NestedStringObject, QAIssue } from '../types.js';

const UNCLOSED_PLACEHOLDER = /\{\{(?![^}]*\}\})/;
const ORPHAN_CLOSE = /(?<!\{[^}]*)\}\}/;

/**
 * Agent 2 — Format QA
 *
 * Validates all string values before sending to the translator.
 * Blocks empty strings, warns on malformed {{placeholders}}.
 */
export function runFormatQA(
  contentToTranslate: Record<string, NestedStringObject>,
): FormatQAResult {
  console.log('🧪 [Agent 2] Format QA');

  const issues: QAIssue[] = [];
  const warnings: QAIssue[] = [];
  let passed = 0;
  let failed = 0;

  const cleanContent: Record<string, NestedStringObject> = {};

  for (const [file, content] of Object.entries(contentToTranslate)) {
    const flat = flattenObject(content as Record<string, unknown>);
    const cleanFlat: Record<string, string> = {};

    for (const [key, value] of Object.entries(flat)) {
      if (typeof value !== 'string') continue;

      if (value.trim() === '') {
        issues.push({ file, key, issue: 'Empty string — skipped' });
        failed++;
        continue;
      }

      if (UNCLOSED_PLACEHOLDER.test(value)) {
        warnings.push({ file, key, issue: `Unclosed {{ in: "${value.slice(0, 60)}"` });
        console.warn(`   ⚠️  ${file} › ${key}: unclosed {{ placeholder`);
      }

      if (ORPHAN_CLOSE.test(value)) {
        warnings.push({ file, key, issue: `Orphan }} in: "${value.slice(0, 60)}"` });
        console.warn(`   ⚠️  ${file} › ${key}: orphan }} placeholder`);
      }

      cleanFlat[key] = value;
      passed++;
    }

    if (Object.keys(cleanFlat).length > 0) {
      const rebuilt: NestedStringObject = {};
      for (const [dotKey, value] of Object.entries(cleanFlat)) {
        setNestedValue(rebuilt as Record<string, unknown>, dotKey, value);
      }
      cleanContent[file] = rebuilt;
    }
  }

  console.log(`   ✅ ${passed} ok, ${failed} skipped, ${warnings.length} warnings\n`);
  return { cleanContent, qaReport: { passed, failed, warnings, issues } };
}
