import { promises as fs } from 'fs';
import path from 'path';
import { flattenObject, setNestedValue } from '../lib/json-utils.js';
import type { ChangeDetectorResult, DetectedChanges, JsonObject } from '../types.js';

/**
 * Agent 1 — Change Detector
 *
 * Reads all JSON files in originDir, diffs them against the saved snapshot,
 * and returns only the delta (new/modified strings) plus deleted key paths.
 */
export async function detectChanges(
  originDir: string,
  backupDir: string,
): Promise<ChangeDetectorResult> {
  console.log('🔍 [Agent 1] Change Detector');

  // Read current origin files
  const currentFiles: Record<string, JsonObject> = {};
  const dirEntries = await fs.readdir(originDir);
  for (const file of dirEntries.filter(f => f.endsWith('.json'))) {
    currentFiles[file] = JSON.parse(await fs.readFile(path.join(originDir, file), 'utf8')) as JsonObject;
    console.log(`   📄 ${file}`);
  }

  // Load previous state snapshot
  const statePath = path.join(backupDir, 'origin-state.json');
  let previousFiles: Record<string, JsonObject> = {};
  try {
    previousFiles = JSON.parse(await fs.readFile(statePath, 'utf8')) as Record<string, JsonObject>;
    console.log('   📋 Previous state loaded');
  } catch {
    console.log('   📋 No previous state — treating all files as new (full translation)');
  }

  const changes: DetectedChanges = {
    hasChanges: false,
    newFiles: [],
    modifiedFiles: [],
    contentToTranslate: {},
    deletedKeys: {},
  };

  // New files
  for (const [file, content] of Object.entries(currentFiles)) {
    if (!previousFiles[file]) {
      changes.newFiles.push(file);
      changes.contentToTranslate[file] = content as Record<string, string | Record<string, unknown>>;
      changes.hasChanges = true;
      console.log(`   🆕 New file: ${file}`);
    }
  }

  // Changed/deleted keys in existing files
  for (const [file, current] of Object.entries(currentFiles)) {
    if (!previousFiles[file]) continue;

    const prevFlat = flattenObject(previousFiles[file]);
    const currFlat = flattenObject(current);

    const newKeys: Array<{ key: string; value: string }> = [];
    const modifiedKeys: Array<{ key: string; value: string }> = [];
    const deletedKeys: string[] = [];

    for (const [key, value] of Object.entries(currFlat)) {
      if (typeof value !== 'string') continue;
      if (!(key in prevFlat)) {
        newKeys.push({ key, value });
      } else if (prevFlat[key] !== value) {
        modifiedKeys.push({ key, value });
      }
    }

    for (const [key, value] of Object.entries(prevFlat)) {
      if (typeof value !== 'string') continue;
      if (!(key in currFlat)) deletedKeys.push(key);
    }

    if (newKeys.length + modifiedKeys.length + deletedKeys.length === 0) continue;

    changes.modifiedFiles.push(file);
    changes.hasChanges = true;
    changes.deletedKeys[file] = deletedKeys;

    const partial: JsonObject = {};
    for (const { key, value } of [...newKeys, ...modifiedKeys]) {
      setNestedValue(partial, key, value);
    }
    changes.contentToTranslate[file] = partial as Record<string, string | Record<string, unknown>>;

    console.log(`   🔄 ${file}: +${newKeys.length} new, ~${modifiedKeys.length} modified, -${deletedKeys.length} deleted`);
  }

  const totalFiles = changes.newFiles.length + changes.modifiedFiles.length;
  console.log(`   ✅ ${totalFiles} file(s) with changes\n`);
  return { changes, currentFiles };
}
