# TranslateFlow IA — Developer Guide

This document explains the technical design of the pipeline in depth: why it was built this way, what every file does, and how all the pieces connect.

---

## The Problem This Solves

The CXone platform ships UI strings for 10 applications across 10 languages. Historically, translation was done manually or through a vendor — slow, expensive, and inconsistent. Every time a developer changed a UI string in English, someone had to manually coordinate the translation update across 100 files (10 apps × 10 languages).

**The goal:** make translation invisible to developers. Edit an English string, push — done. The system handles the rest automatically, consistently, and with awareness of the company's specific terminology.

---

## Design Philosophy

### Why incremental instead of full re-translation?

The naive approach is: every time something changes, re-translate all files. This fails in practice because:

1. **Cost** — The files are large. Re-translating everything on every push would consume significant API tokens for no reason
2. **Speed** — Translating 10 large files × 10 languages × batches = minutes per run
3. **Stability** — Re-translating already-correct strings introduces risk of terminology drift

The pipeline instead keeps a **snapshot** of the last translated state in `.pipeline-backup/origin-state.json`. On each run it computes a precise diff — only new keys, modified values, and deleted keys are processed. A one-line change translates in seconds.

### Why a multi-agent architecture?

Each concern is isolated into its own module with a clear input/output contract:

```
Change Detection → Format QA → Translation → Validation → Merge
```

This means:
- Each agent can be tested independently
- A failure in one agent doesn't corrupt state in another
- The pipeline can be extended without touching existing agents
- Each agent's logic is small enough to reason about in isolation

### Why TypeScript?

The pipeline passes structured data between agents — changes objects, translation maps, validation reports. Without types, it's easy to introduce subtle bugs (wrong key name, missing field, wrong nesting). TypeScript catches those at development time, not at 2am in CI.

### Why `tsx` instead of compiling first?

`tsx` executes TypeScript directly — no build step. For a pipeline script that runs in CI, adding a compile step would mean: change code → compile → commit compiled output → run. With `tsx`: change code → run. Simpler, faster, and the compiled output never needs to be committed.

### Why AWS Bedrock instead of the Anthropic API directly?

The company already pays for Bedrock and has governance around it. Using Bedrock means:
- Billing goes through the existing AWS account
- Access is controlled by IAM policies (company security model)
- No separate Anthropic account to manage
- Consistent with how Claude Code itself is authenticated in this environment

The client still supports `ANTHROPIC_API_KEY` as a fallback for environments where Bedrock isn't configured.

---

## File-by-File Explanation

### `pipeline/types.ts`

The single source of truth for all data structures in the pipeline. Every agent imports its types from here.

**Why a central types file?** Agents pass data to each other. Without shared types, you'd either duplicate interfaces or have loose `any` types. A central file means: change a data structure once, TypeScript immediately shows you every place that needs updating.

Key types:
- `NestedStringObject` — a JSON object where leaf values are strings (the shape of translation content)
- `DetectedChanges` — what Agent 1 produces: which files changed, what keys changed, what was deleted
- `TranslatedContent` — what Agent 3 produces: `{ lang → { file → translatedJSON } }`
- `ValidationReport` — what Agent 4 produces: per-language, per-file pass/fail with issue details

---

### `pipeline/lib/json-utils.ts`

Pure utility functions for working with nested JSON. No side effects, no I/O.

| Function | What it does |
|----------|-------------|
| `flattenObject` | Converts `{ a: { b: "val" } }` → `{ "a.b": "val" }`. Used by change detector and translator to work with flat key paths |
| `setNestedValue` | Sets a value using a dot-notation path. Used to rebuild nested objects from flat batches |
| `deleteNestedKey` | Removes a key using dot-notation path. Used by the merger when keys are deleted from origin |
| `deepMerge` | Merges two nested objects — source wins on scalar conflicts, recurses on nested objects. Used by the merger |
| `unflattenObject` | Inverse of flattenObject. Converts flat dot-notation map back to nested JSON |

**Why flatten at all?** Two reasons:
1. The change detector needs to compare individual leaf values regardless of nesting depth
2. The translator works with flat key-value pairs in each batch — simpler to construct prompts and parse responses

---

### `pipeline/lib/claude-client.ts`

The single point of contact with Claude. Handles both AWS Bedrock and the direct Anthropic API.

**Auth priority:**
1. If `ANTHROPIC_API_KEY` is set → direct Anthropic API
2. Otherwise → AWS Bedrock using the credential chain (which respects `AWS_PROFILE`)

**Why a singleton Bedrock client?** The `BedrockRuntimeClient` is initialized once and reused across all batch calls in a pipeline run. Creating a new client per call would add overhead and re-trigger credential resolution every time.

**Response parsing:** Claude is instructed to return only JSON, but occasionally adds a preamble like "Here is the translation:". The client extracts the first `{...}` block via regex to handle this gracefully instead of failing on a parse error.

---

### `pipeline/lib/context-builder.ts`

Builds the terminology glossary that grounds every translation prompt.

**The problem it solves:** Without context, Claude might translate "Agent Assist Hub" as "Centro de Asistencia al Agente" in Spanish — which would be wrong since it's a product name that must stay as-is. Or it might use inconsistent vocabulary for terms like "Scheduling Unit" across files.

**How it works:**
1. Reads `aaiAdminUI.json` and `agentassisthub.json` from both `origin/` (English) and `translated/{lang}/apps/` (existing translations)
2. Matches keys: if the same key exists in both, the pair `{ en: "Add", translated: "Hinzufügen" }` is added to the glossary
3. Only includes pairs where the translation differs from English (same value = kept-as-is term, not useful as a style example)
4. Caps at 40 entries per language to avoid prompt bloat

**`DO_NOT_TRANSLATE` list:** Product names and abbreviations that must never be translated (CXone, Enlighten, ACD, IVR, etc.) are hardcoded here and injected into every prompt.

**`LANGUAGE_NAMES` map:** Maps language codes to full names (`"fr-ca"` → `"French (Canada)"`) for use in prompts. Claude understands language names better than codes.

---

### `pipeline/agents/1-change-detector.ts`

**Input:** `originDir`, `backupDir`
**Output:** `{ changes: DetectedChanges, currentFiles: Record<string, JsonObject> }`

The diff engine. Reads the current state of `origin/` and compares it against the snapshot in `.pipeline-backup/origin-state.json`.

**Three categories of changes:**
- **New files** — entire file content goes to `contentToTranslate`
- **Modified/new keys** — only the changed leaf string values go to `contentToTranslate`
- **Deleted keys** — dot-notation paths go to `deletedKeys` (handled by the merger, not the translator)

**Why only string leaves?** The JSON files have nested structure but only string values are translatable. Numbers, booleans, and nested objects are structural — they don't need translation. The detector explicitly filters `typeof value !== 'string'`.

**Why return `currentFiles` separately?** The orchestrator saves `currentFiles` as the new state after a successful run. The detector returns it so the orchestrator has the full content without reading the files a second time.

---

### `pipeline/agents/2-format-qa.ts`

**Input:** `contentToTranslate` (output of Agent 1)
**Output:** `{ cleanContent, qaReport }`

A lightweight pre-flight check before any API calls are made. Validates every string value that's about to be translated.

**Checks:**
- **Empty strings** — blocked entirely. An empty string would produce an empty translation, corrupting the output
- **Unclosed `{{`** — warned. The string will still be translated, but the developer should fix the source. Example: `"Hello {{name"` (missing closing `}}`)
- **Orphan `}}`** — warned for the same reason

**Why warn instead of block for placeholder issues?** A broken placeholder in the source is a bug in the source file, but it's better to translate it and flag it than to silently skip it. The developer can fix the source later; the translation can still be useful.

**Why this agent exists at all?** Claude is generally robust, but sending it empty strings or malformed content wastes tokens and can produce unexpected output. This agent is cheap (pure in-memory validation) and eliminates an entire category of edge cases before they reach the API.

---

### `pipeline/agents/3-translator.ts`

**Input:** `cleanContent`, `languages`, `originDir`, `translatedDir`
**Output:** `TranslatedContent`

The core of the pipeline. This is where English strings become translations in 10 languages.

**Batching strategy:**
```
For each file in cleanContent:
  Flatten to dot-notation key-value pairs
  Split into batches of 25 pairs
  For each batch:
    Build a prompt with glossary + rules + the 25 pairs
    Call Claude → get { lang: { key: value } } for all 10 languages
    Accumulate results per language
```

**Why 25 keys per batch?** Claude has an output token limit of 8,000. With 25 keys × ~50 chars average × 10 languages, we use roughly 6,000–7,000 output tokens — safely within budget even for longer strings.

**Why all 10 languages in one call?** The alternative is one call per language per batch — 10× more API calls, 10× slower. Claude handles multi-language output reliably in a single call. The glossary section is structured per language so Claude has clear reference for each.

**The prompt structure:**
```
1. Business context (CXone platform, enterprise software)
2. DO_NOT_TRANSLATE list (product names, abbreviations)
3. Terminology reference (glossary examples per language)
4. Translation rules (preserve placeholders, formal tone, etc.)
5. The strings to translate (flat JSON)
6. Expected output structure (exact JSON schema)
```

**Why such a structured prompt?** Each section serves a specific purpose. Without the terminology reference, Claude invents translations for product names. Without the placeholder rule, it sometimes translates `{{Count}}` as "{{Contador}}". Without the output structure, the response format varies and parsing fails.

**Error handling:** If a batch fails (API error, malformed JSON response), the pipeline logs the error and continues with the remaining batches. Partial translations are better than a complete failure, and the next pipeline run will retry the failed strings since the state won't include them.

---

### `pipeline/agents/4-e2e-validator.ts`

**Input:** `cleanContent` (what we sent to translate), `translatedContent` (what came back), `languages`
**Output:** `ValidationReport`

Post-translation sanity checks. Runs after translation but before writing to disk.

**Checks per (language, file) pair:**

1. **File presence** — did the translator produce any output at all for this combination? If a whole batch failed, the file will be missing
2. **Key completeness** — every key sent to translation must appear in the response. Missing keys mean the translator dropped content (possible token limit issue)
3. **Placeholder preservation** — extracts all `{{varName}}` tokens from the source and checks they appear in the translation. A missing placeholder like `{{Count}}` would break the UI at runtime
4. **Possible non-translation** — for non-Latin languages (Japanese, Korean, Chinese), if a translated value is identical to the English source AND is a long ASCII string, it's flagged as a warning. It might be a product name (intentionally kept) or it might be a miss

**Why run this before merging?** Writing bad translations to disk and then running CI to discover problems is slow. The validator gives immediate feedback. Even if the merge still happens (partial is better than nothing), the report tells you exactly what to fix.

**Why `status: 'pass' | 'fail' | 'warn'` instead of boolean?** The distinction between a hard failure (missing key) and a soft warning (possibly untranslated) is important. A warning file still gets merged — it might be intentionally kept in English. A failed file gets merged too (partial is better than nothing) but the CI run exits with code 1.

---

### `pipeline/agents/5-auto-merger.ts`

**Input:** `translatedContent`, `deletedKeys`, `translatedDir`, `languages`
**Output:** number of files written

The final step. Takes translated content and merges it into the existing files in `translated/`.

**Merge strategy:**
```
existing = read translated/{lang}/apps/{file}.json (or {} if new)
merged   = deepMerge(existing, newTranslations)
           → apply deletions
           → write back
```

**Why deep merge instead of replace?** The translated files have accumulated content over time. Some keys in `translated/` don't exist in `origin/` — they were added through other processes. Replacing the file entirely would destroy those. Deep merge is safe: it only updates/adds the keys we translated, leaves everything else untouched.

**Deletion propagation:** If a key was removed from `origin/`, it should also be removed from all 10 translated files. The detector tracks these as dot-notation paths, and the merger calls `deleteNestedKey` for each one before writing.

**Directory creation:** `fs.mkdir({ recursive: true })` ensures the language directory exists before writing. This means adding a new language to `translated/` is automatic — the merger will create the directory and file on first run.

---

### `pipeline/run-pipeline.ts`

The orchestrator. Wires all 5 agents together and handles cross-cutting concerns.

**`--init` mode:** When called with `--init`, it reads all origin files, saves them as the current state, and exits without making any API calls. This establishes the baseline so the next normal run only processes actual changes. Run this once when setting up, or after manually syncing translations to ensure the snapshot matches reality.

**Language discovery:** Instead of a hardcoded list, the orchestrator reads the `translated/` directory to discover available languages. This means adding a new language is as simple as creating the directory — no code change needed.

**State saving:** `saveOriginState` is called at the end of a successful run. This ensures that if the pipeline crashes mid-run (e.g., network error during translation), the state is NOT updated and the next run will retry the same changes.

**Exit code 1 on validation failures:** The pipeline exits with code 1 if any validations failed. This causes the GitHub Actions run to show as failed, making the problem visible. However, the merge still happens first — partial translations are written to disk even when there are validation issues.

---

### `tsconfig.json`

```json
{
  "target": "ES2022",
  "module": "NodeNext",
  "moduleResolution": "NodeNext"
}
```

**Why `NodeNext`?** The project uses `"type": "module"` in `package.json` (ESM). `NodeNext` is the TypeScript module mode that correctly handles ESM semantics — it requires `.js` extensions on imports (which `tsx` resolves to `.ts` files at runtime). Using `CommonJS` here would create a mismatch with the runtime module system.

**Why `skipLibCheck: true`?** The AWS SDK v3 ships with some type declaration inconsistencies across its sub-packages. `skipLibCheck` avoids noisy errors from those without affecting type checking of our own code.

---

### `.github/workflows/origin-pipeline.yml`

Triggers on any push to `main` that touches a file under `origin/`. Uses `paths` filtering so the workflow doesn't run on unrelated changes (documentation updates, pipeline code changes, etc.).

**Key steps:**
1. Checkout with `LOCALIZATION_MCP_TOKEN || GITHUB_TOKEN` — the custom token allows the bot to push back translated files. Falls back to the built-in `GITHUB_TOKEN` if the secret isn't configured
2. Configure AWS credentials from GitHub secrets
3. Run the pipeline with a 10-minute timeout
4. Commit `translated/` + `.pipeline-backup/` together — the state snapshot must be committed alongside the translations so the next CI run has the correct baseline

**Why commit `.pipeline-backup/`?** If the state weren't committed, every CI run would see all files as new (no previous state) and re-translate everything. Committing it means each run only sees the actual delta since the last run.

---

## Data Flow Summary

```
origin/{file}.json          ← developer edits this
        │
        ▼
Agent 1: flattenObject(current) DIFF flattenObject(previous)
        │
        ▼
contentToTranslate: { file: { "dot.key": "English value" } }
        │
        ▼
Agent 2: filter empty strings, flag broken placeholders
        │
        ▼
cleanContent: { file: { "dot.key": "English value" } }  (validated)
        │
        ▼
Agent 3: for each file, for each batch of 25 keys:
         callClaude(prompt with glossary + rules + batch)
         → { de: { key: "..." }, es: { key: "..." }, ... }
        │
        ▼
TranslatedContent: { de: { file: nestedJSON }, es: { ... }, ... }
        │
        ▼
Agent 4: for each (lang, file):
         check keys complete, check placeholders, check non-Latin
        │
        ▼
ValidationReport: { summary, results: [{ lang, file, status, issues }] }
        │
        ▼
Agent 5: for each (lang, file):
         existing = read translated/{lang}/apps/{file}.json
         merged = deepMerge(existing, newTranslations)
         apply deletions
         write back
        │
        ▼
translated/{lang}/apps/{file}.json  ← updated translations
.pipeline-backup/origin-state.json  ← new baseline for next run
```

---

## Adding a New Language

1. Create the directory: `translated/{lang-code}/apps/`
2. Run `npm run pipeline:init` to reset the baseline (so the new language is treated as a fresh addition)
3. The next pipeline run will create translated files for the new language automatically

No code changes required.

## Adding a New Source File

1. Place the new JSON file in `origin/`
2. Run `npm run pipeline` — Agent 1 will detect it as a new file and translate it entirely

No code changes required.

---

## Known Limitations & Future Work

See [TODO.md](./TODO.md) for the full list. Key items:

- **No persistent glossary** — the terminology context is rebuilt on every run from a small sample of files. A dedicated `pipeline/context/glossary.json` built from all translated files would give Claude richer context
- **CI blocked** — GitHub Actions can't run until the AWS admin grants Bedrock permissions to the CI IAM user
- **No retry on batch failure** — if a Claude batch fails, the pipeline logs it and moves on. The next pipeline run will retry those strings, but there's no in-run retry logic
- **State saved even on partial failure** — if translation fails for some languages, the state is still saved. Those strings won't be retried on the next run unless the source changes again
