import { promises as fs } from 'fs';
import path from 'path';
import { flattenObject, setNestedValue } from '../lib/json-utils.js';

/**
 * Agent 1 — Change Detector
 *
 * Reads all JSON files in originDir, diffs them against the saved snapshot
 * in backupDir/origin-state.json, and returns:
 *   - changes.contentToTranslate: { [filename]: partialNestedJSON }  (new/modified strings)
 *   - changes.deletedKeys:         { [filename]: string[] }           (dot-paths removed from origin)
 *   - currentFiles:                full current origin content (for saving state later)
 */
export async function detectChanges(originDir, backupDir) {
  console.log('🔍 [Agent 1] Change Detector');

  // Read current origin files
  const currentFiles = {};
  const dirEntries = await fs.readdir(originDir);
  for (const file of dirEntries.filter(f => f.endsWith('.json'))) {
    currentFiles[file] = JSON.parse(await fs.readFile(path.join(originDir, file), 'utf8'));
    console.log(`   📄 ${file}`);
  }

  // Load previous state snapshot
  const statePath = path.join(backupDir, 'origin-state.json');
  let previousFiles = {};
  try {
    previousFiles = JSON.parse(await fs.readFile(statePath, 'utf8'));
    console.log('   📋 Previous state loaded');
  } catch {
    console.log('   📋 No previous state — treating all files as new (full translation)');
  }

  const changes = {
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
      changes.contentToTranslate[file] = content;
      changes.hasChanges = true;
      console.log(`   🆕 New file: ${file}`);
    }
  }

  // Changed/deleted keys in existing files
  for (const [file, current] of Object.entries(currentFiles)) {
    if (!previousFiles[file]) continue; // Already handled above

    const prevFlat = flattenObject(previousFiles[file]);
    const currFlat = flattenObject(current);

    const newKeys = [];
    const modifiedKeys = [];
    const deletedKeys = [];

    for (const [key, value] of Object.entries(currFlat)) {
      if (typeof value !== 'string') continue; // Only track translatable strings
      if (!(key in prevFlat)) {
        newKeys.push({ key, value });
      } else if (prevFlat[key] !== value) {
        modifiedKeys.push({ key, value });
      }
    }

    for (const [key, value] of Object.entries(prevFlat)) {
      if (typeof value !== 'string') continue;
      if (!(key in currFlat)) {
        deletedKeys.push(key);
      }
    }

    const hasFileChanges = newKeys.length + modifiedKeys.length + deletedKeys.length > 0;
    if (!hasFileChanges) continue;

    changes.modifiedFiles.push(file);
    changes.hasChanges = true;
    changes.deletedKeys[file] = deletedKeys;

    // Build a partial nested object containing only changed/new keys
    const partial = {};
    for (const { key, value } of [...newKeys, ...modifiedKeys]) {
      setNestedValue(partial, key, value);
    }
    changes.contentToTranslate[file] = partial;

    console.log(`   🔄 ${file}: +${newKeys.length} new, ~${modifiedKeys.length} modified, -${deletedKeys.length} deleted`);
  }

  const totalFiles = changes.newFiles.length + changes.modifiedFiles.length;
  console.log(`   ✅ ${totalFiles} file(s) with changes\n`);
  return { changes, currentFiles };
}
