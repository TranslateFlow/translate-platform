/**
 * Flatten a nested object to dot-notation key paths.
 * { a: { b: "val" } } → { "a.b": "val" }
 */
export function flattenObject(obj, prefix = '') {
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }
  return result;
}

/**
 * Set a value in a nested object using a dot-notation path.
 */
export function setNestedValue(obj, dotKey, value) {
  const keys = dotKey.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  current[keys[keys.length - 1]] = value;
}

/**
 * Delete a key from a nested object using a dot-notation path.
 */
export function deleteNestedKey(obj, dotKey) {
  const keys = dotKey.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) return;
    current = current[keys[i]];
  }
  delete current[keys[keys.length - 1]];
}

/**
 * Deep merge source into target. Source values override target for scalar conflicts.
 */
export function deepMerge(target, source) {
  const result = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === 'object' && value !== null && !Array.isArray(value) &&
      typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(result[key], value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Rebuild a nested object from a flat dot-notation map.
 */
export function unflattenObject(flatObj) {
  const result = {};
  for (const [dotKey, value] of Object.entries(flatObj)) {
    setNestedValue(result, dotKey, value);
  }
  return result;
}
