import { flattenObject } from '../lib/json-utils.js';
import type { NestedStringObject, TranslatedContent, ValidationReport } from '../types.js';

const PLACEHOLDER_REGEX = /\{\{[\w.]+\}\}/g;
const NON_LATIN = new Set(['ja', 'ko', 'zh-cn', 'zh-hk']);
const ASCII_ONLY = /^[\x20-\x7E]+$/;

/**
 * Agent 4 — E2E Validator
 *
 * Post-translation checks on every (language, file) pair:
 *   - All source keys present in the translation
 *   - All {{placeholder}} tokens preserved
 *   - Non-Latin languages: warn on unchanged ASCII strings (possible miss)
 */
export function validateTranslations(
  cleanContent: Record<string, NestedStringObject>,
  translatedContent: TranslatedContent,
  languages: string[],
): ValidationReport {
  console.log('✅ [Agent 4] E2E Validator');

  const report: ValidationReport = {
    timestamp: new Date().toISOString(),
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    results: [],
  };

  for (const [file, srcContent] of Object.entries(cleanContent)) {
    const srcFlat = flattenObject(srcContent as Record<string, unknown>);
    const stringEntries = Object.entries(srcFlat)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string');

    for (const lang of languages) {
      report.summary.total++;
      const entry = { language: lang, file, status: 'pass' as const, issues: [] as string[], warnings: [] as string[] };

      const transContent = translatedContent[lang]?.[file];
      if (!transContent) {
        report.results.push({ ...entry, status: 'fail', issues: ['No translated content produced for this file'] });
        report.summary.failed++;
        console.log(`   ❌ ${lang}/${file}: missing entirely`);
        continue;
      }

      const transFlat = flattenObject(transContent as Record<string, unknown>);
      const issues: string[] = [];
      const warnings: string[] = [];

      for (const [key, srcValue] of stringEntries) {
        const transValue = transFlat[key];

        if (transValue === undefined) {
          issues.push(`Missing key: ${key}`);
          continue;
        }

        if (typeof transValue === 'string') {
          const srcPlaceholders = srcValue.match(PLACEHOLDER_REGEX) ?? [];
          if (srcPlaceholders.length > 0) {
            const transPlaceholders = transValue.match(PLACEHOLDER_REGEX) ?? [];
            const missing = srcPlaceholders.filter(p => !transPlaceholders.includes(p));
            if (missing.length > 0) {
              issues.push(`${key}: missing placeholders [${missing.join(', ')}]`);
            }
          }

          if (
            NON_LATIN.has(lang) &&
            transValue === srcValue &&
            ASCII_ONLY.test(srcValue) &&
            srcValue.length > 8
          ) {
            warnings.push(`${key}: value unchanged from English — possibly untranslated`);
          }
        }
      }

      const status = issues.length > 0 ? 'fail' : warnings.length > 0 ? 'warn' : 'pass';
      report.results.push({ language: lang, file, status, issues, warnings });

      if (status === 'fail') {
        report.summary.failed++;
        console.log(`   ❌ ${lang}/${file}: ${issues.length} issue(s)`);
      } else {
        report.summary.passed++;
        if (warnings.length > 0) {
          report.summary.warnings += warnings.length;
          console.log(`   ⚠️  ${lang}/${file}: ${warnings.length} warning(s)`);
        }
      }
    }
  }

  const { total, passed, failed } = report.summary;
  console.log(`   📊 ${passed}/${total} passed, ${failed} failed, ${report.summary.warnings} warnings\n`);
  return report;
}
