#!/usr/bin/env node
/**
 * TranslateFlow IA — Pipeline Orchestrator
 *
 * Runs the 5-agent translation pipeline:
 *   1. Change Detector  — diffs origin/ vs last snapshot
 *   2. Format QA        — validates strings before translation
 *   3. Translator       — calls Claude (context-grounded, batched)
 *   4. E2E Validator    — checks completeness & placeholder integrity
 *   5. Auto-Merger      — writes results to translated/
 *
 * Usage:
 *   node pipeline/run-pipeline.js           # Normal run (translates changes)
 *   node pipeline/run-pipeline.js --init    # Save current origin state as baseline (no API call)
 */

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { detectChanges } from './agents/1-change-detector.js';
import { runFormatQA } from './agents/2-format-qa.js';
import { translateContent } from './agents/3-translator.js';
import { validateTranslations } from './agents/4-e2e-validator.js';
import { mergeTranslations } from './agents/5-auto-merger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const ORIGIN_DIR    = path.join(ROOT, 'origin');
const TRANSLATED_DIR = path.join(ROOT, 'translated');
const BACKUP_DIR    = path.join(ROOT, '.pipeline-backup');
const REPORTS_DIR   = path.join(__dirname, 'reports');

const IS_INIT = process.argv.includes('--init');

/** Discover languages by listing directories under translated/ */
async function getLanguages() {
  const entries = await fs.readdir(TRANSLATED_DIR, { withFileTypes: true });
  return entries.filter(e => e.isDirectory()).map(e => e.name).sort();
}

async function saveOriginState(currentFiles) {
  await fs.mkdir(BACKUP_DIR, { recursive: true });
  await fs.writeFile(
    path.join(BACKUP_DIR, 'origin-state.json'),
    JSON.stringify(currentFiles, null, 2) + '\n',
  );
  console.log('💾 Origin state saved to .pipeline-backup/origin-state.json');
}

async function saveReport(report) {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const reportPath = path.join(REPORTS_DIR, `validation-${ts}.json`);
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`📋 Validation report: pipeline/reports/validation-${ts}.json`);
}

async function main() {
  console.log('🚀 TranslateFlow IA — Origin Pipeline');
  console.log('======================================\n');

  // ── Init mode: just snapshot current state, no translation ──────────────────
  if (IS_INIT) {
    console.log('⚙️  INIT MODE — saving current origin state as baseline\n');
    const files = await fs.readdir(ORIGIN_DIR);
    const currentFiles = {};
    for (const file of files.filter(f => f.endsWith('.json'))) {
      currentFiles[file] = JSON.parse(await fs.readFile(path.join(ORIGIN_DIR, file), 'utf8'));
      console.log(`   📄 ${file}`);
    }
    await saveOriginState(currentFiles);
    console.log('\n✅ Baseline saved. Future pipeline runs will only translate changes.');
    return;
  }

  // ── Normal mode ──────────────────────────────────────────────────────────────
  const languages = await getLanguages();
  console.log(`🌍 Target languages: ${languages.join(', ')}\n`);

  // Agent 1: Change Detection
  const { changes, currentFiles } = await detectChanges(ORIGIN_DIR, BACKUP_DIR);

  if (!changes.hasChanges) {
    console.log('✅ No changes detected — nothing to translate.');
    return;
  }

  // Agent 2: Format QA
  const { cleanContent, qaReport } = runFormatQA(changes.contentToTranslate);

  if (qaReport.failed > 0) {
    console.warn(`⚠️  ${qaReport.failed} string(s) failed QA and will be skipped\n`);
  }

  if (Object.keys(cleanContent).length === 0) {
    console.log('⚠️  No valid content to translate after QA checks.');
    return;
  }

  // Agent 3: Translation
  const translatedContent = await translateContent(cleanContent, languages, ORIGIN_DIR, TRANSLATED_DIR);

  // Agent 4: E2E Validation
  const validationReport = validateTranslations(cleanContent, translatedContent, languages);
  await saveReport(validationReport);

  // Agent 5: Auto-Merge
  // Always merge even when some validations fail — partial translations are better than nothing.
  const totalUpdated = await mergeTranslations(
    translatedContent,
    changes.deletedKeys,
    TRANSLATED_DIR,
    languages,
  );

  // Persist current state for next run's diff
  await saveOriginState(currentFiles);

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log('');
  console.log('🎉 Pipeline complete!');
  console.log(`   Files updated  : ${totalUpdated}`);
  console.log(`   Validation     : ${validationReport.summary.passed}/${validationReport.summary.total} passed`);

  if (validationReport.summary.failed > 0) {
    console.warn(`   ⚠️  ${validationReport.summary.failed} validation failure(s) — see pipeline/reports/`);
    process.exit(1); // Signal CI to flag the run, but files are still committed
  }
}

main().catch(err => {
  console.error('\n💥 Pipeline crashed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
