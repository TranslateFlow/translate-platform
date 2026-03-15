// ── JSON ─────────────────────────────────────────────────────────────────────

export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
export type JsonObject = { [key: string]: JsonValue };
export type JsonArray = JsonValue[];

/** A JSON object whose leaf values are strings (translatable content). */
export type NestedStringObject = { [key: string]: string | NestedStringObject };

// ── Context / Glossary ───────────────────────────────────────────────────────

export interface GlossaryEntry {
  en: string;
  translated: string;
}

/** Per-language list of English → translated term pairs. */
export type Glossary = Record<string, GlossaryEntry[]>;

// ── Agent 1 — Change Detector ────────────────────────────────────────────────

export interface DetectedChanges {
  hasChanges: boolean;
  newFiles: string[];
  modifiedFiles: string[];
  /** Partial nested JSON containing only new/modified string values per file. */
  contentToTranslate: Record<string, NestedStringObject>;
  /** Dot-notation key paths removed from origin, per file. */
  deletedKeys: Record<string, string[]>;
}

export interface ChangeDetectorResult {
  changes: DetectedChanges;
  /** Full current content of every origin file (used to save state). */
  currentFiles: Record<string, JsonObject>;
}

// ── Agent 2 — Format QA ──────────────────────────────────────────────────────

export interface QAIssue {
  file: string;
  key: string;
  issue: string;
}

export interface QAReport {
  passed: number;
  failed: number;
  warnings: QAIssue[];
  issues: QAIssue[];
}

export interface FormatQAResult {
  cleanContent: Record<string, NestedStringObject>;
  qaReport: QAReport;
}

// ── Agent 3 — Translator ─────────────────────────────────────────────────────

/** { lang → { filename → translated nested JSON } } */
export type TranslatedContent = Record<string, Record<string, NestedStringObject>>;

// ── Agent 4 — E2E Validator ──────────────────────────────────────────────────

export interface ValidationEntry {
  language: string;
  file: string;
  status: 'pass' | 'fail' | 'warn';
  issues: string[];
  warnings: string[];
}

export interface ValidationReport {
  timestamp: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
  results: ValidationEntry[];
}
