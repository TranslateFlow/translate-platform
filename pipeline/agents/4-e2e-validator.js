import { flattenObject } from '../lib/json-utils.js';

const PLACEHOLDER_REGEX = /\{\{[\w.]+\}\}/g;

// Languages using non-Latin scripts — untranslated ASCII strings are suspicious
const NON_LATIN = new Set(['ja', 'ko', 'zh-cn', 'zh-hk']);
const ASCII_ONLY = /^[\x20-\x7E]+$/;

/**
 * Agent 4 — E2E Validator
 *
 * Runs post-translation checks on every (language, file) pair:
 *   - All source keys are present in the translation
 *   - All {{placeholder}} tokens from the source are preserved
 *   - Non-Latin languages: warn on unchanged ASCII English strings (possible miss)
 *
 * Returns a structured report object.
 */
export function validateTranslations(cleanContent, translatedContent, languages) {
  console.log('✅ [Agent 4] E2E Validator');

  const report = {
    timestamp: new Date().toISOString(),
    summary: { total: 0, passed: 0, failed: 0, warnings: 0 },
    results: [],
  };

  for (const [file, srcContent] of Object.entries(cleanContent)) {
    const srcFlat = flattenObject(srcContent);
    const stringEntries = Object.entries(srcFlat).filter(([, v]) => typeof v === 'string');

    for (const lang of languages) {
      report.summary.total++;
      const entry = { language: lang, file, status: 'pass', issues: [], warnings: [] };

      const transContent = translatedContent[lang]?.[file];
      if (!transContent) {
        entry.status = 'fail';
        entry.issues.push('No translated content produced for this file');
        report.results.push(entry);
        report.summary.failed++;
        console.log(`   ❌ ${lang}/${file}: missing entirely`);
        continue;
      }

      const transFlat = flattenObject(transContent);

      for (const [key, srcValue] of stringEntries) {
        const transValue = transFlat[key];

        // Missing key
        if (transValue === undefined) {
          entry.issues.push(`Missing key: ${key}`);
          continue;
        }

        // Placeholder preservation
        const srcPlaceholders = srcValue.match(PLACEHOLDER_REGEX) ?? [];
        if (srcPlaceholders.length > 0) {
          const transPlaceholders = transValue.match(PLACEHOLDER_REGEX) ?? [];
          const missing = srcPlaceholders.filter(p => !transPlaceholders.includes(p));
          if (missing.length > 0) {
            entry.issues.push(`${key}: missing placeholders [${missing.join(', ')}]`);
          }
        }

        // Non-Latin language: warn on suspiciously untranslated strings
        if (
          NON_LATIN.has(lang) &&
          transValue === srcValue &&
          ASCII_ONLY.test(srcValue) &&
          srcValue.length > 8
        ) {
          entry.warnings.push(`${key}: value unchanged from English — possibly untranslated`);
        }
      }

      if (entry.issues.length > 0) {
        entry.status = 'fail';
        report.summary.failed++;
        console.log(`   ❌ ${lang}/${file}: ${entry.issues.length} issue(s)`);
      } else {
        report.summary.passed++;
        if (entry.warnings.length > 0) {
          entry.status = 'warn';
          report.summary.warnings += entry.warnings.length;
          console.log(`   ⚠️  ${lang}/${file}: ${entry.warnings.length} warning(s)`);
        }
      }

      report.results.push(entry);
    }
  }

  const { total, passed, failed } = report.summary;
  console.log(`   📊 ${passed}/${total} passed, ${failed} failed, ${report.summary.warnings} warnings\n`);
  return report;
}
