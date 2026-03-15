# TranslateFlow IA — Architecture

## Overview

Automated localization pipeline that detects changes in English source files,
translates them using Claude (via AWS Bedrock), and merges results directly
into the translated output — no manual review, no vendor, no PRs.

---

## Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                         TRIGGER                                      │
│                                                                      │
│   Local: npm run pipeline                                            │
│   CI:    push to main → origin/** changed → GitHub Actions fires    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 1 — Change Detector                                          │
│  pipeline/agents/1-change-detector.ts                               │
│                                                                      │
│  • Reads all 10 JSON files from  origin/                            │
│  • Loads previous snapshot from  .pipeline-backup/origin-state.json │
│  • Diffs: finds new keys, modified values, deleted keys             │
│  • Outputs only the DELTA (not full files) → saves API tokens       │
│                                                                      │
│  Returns: ChangeDetectorResult                                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ DetectedChanges { contentToTranslate, deletedKeys }
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 2 — Format QA                                                │
│  pipeline/agents/2-format-qa.ts                                     │
│                                                                      │
│  • Blocks empty string values                                       │
│  • Warns on broken {{placeholders (unclosed braces)                 │
│  • Passes only clean strings to the translator                      │
│                                                                      │
│  Returns: FormatQAResult { cleanContent, qaReport }                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ cleanContent: Record<string, NestedStringObject>
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 3 — Translator  ⬅️  CORE                                     │
│  pipeline/agents/3-translator.ts                                    │
│                                                                      │
│  1. Builds terminology glossary from existing translated/ files     │
│     (matches English origin keys → existing translations for        │
│      style/tone consistency)                                        │
│                                                                      │
│  2. Batches strings (25 keys/call) and calls Claude:               │
│     • All 10 languages in one API call per batch                    │
│     • Prompt includes: glossary, DO_NOT_TRANSLATE list,             │
│       placeholder rules, business context                           │
│                                                                      │
│  3. Claude model: us.anthropic.claude-3-5-sonnet-20241022-v2:0     │
│     via AWS Bedrock (bedrock-aws profile → company Cognito auth)    │
│                                                                      │
│  Returns: TranslatedContent { lang → { file → nestedJSON } }       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ TranslatedContent
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 4 — E2E Validator                                            │
│  pipeline/agents/4-e2e-validator.ts                                 │
│                                                                      │
│  • Checks all source keys are present in every translation          │
│  • Verifies {{placeholder}} tokens are preserved                    │
│  • Flags unchanged ASCII strings in non-Latin languages (ja/ko/zh)  │
│  • Writes report to pipeline/reports/validation-{timestamp}.json    │
│                                                                      │
│  Returns: ValidationReport                                          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ ValidationReport
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  AGENT 5 — Auto-Merger                                              │
│  pipeline/agents/5-auto-merger.ts                                   │
│                                                                      │
│  • Loads existing translated/{lang}/apps/{file}.json                │
│  • Deep-merges new translations (new wins on conflicts)             │
│  • Deletes keys that were removed from origin/                      │
│  • Writes back — no PR, no manual step                              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STATE SAVE                                                          │
│  .pipeline-backup/origin-state.json  ← snapshot of current origin/ │
│  (committed to git so CI always has the previous state for diffing) │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Folder Structure

```
platform-cxone-translations-ia/
│
├── origin/                          # Source of truth (English)
│   ├── aaiAdminUI.json              # 10 app JSON files
│   ├── agentassisthub.json          # Edit these to trigger translations
│   └── ...
│
├── translated/                      # Auto-generated output (never edit manually)
│   ├── de/apps/                     # German
│   ├── es/apps/                     # Spanish
│   ├── fr/apps/                     # French
│   ├── fr-ca/apps/                  # French (Canada)
│   ├── ja/apps/                     # Japanese
│   ├── ko/apps/                     # Korean
│   ├── nl/apps/                     # Dutch
│   ├── pt/apps/                     # Portuguese
│   ├── zh-cn/apps/                  # Chinese Simplified
│   └── zh-hk/apps/                  # Chinese Traditional
│
├── pipeline/                        # The 5-agent pipeline (TypeScript)
│   ├── run-pipeline.ts              # Orchestrator (entry point)
│   ├── types.ts                     # Shared interfaces and types
│   ├── agents/
│   │   ├── 1-change-detector.ts     # Diffs origin/ vs snapshot
│   │   ├── 2-format-qa.ts           # Validates strings pre-translation
│   │   ├── 3-translator.ts          # Calls Claude via Bedrock (batched)
│   │   ├── 4-e2e-validator.ts       # Post-translation checks
│   │   └── 5-auto-merger.ts         # Merges into translated/
│   ├── lib/
│   │   ├── claude-client.ts         # AWS Bedrock + Anthropic API wrapper
│   │   ├── context-builder.ts       # Builds terminology glossary
│   │   └── json-utils.ts            # flatten / deepMerge / setNestedValue
│   └── reports/                     # Validation reports (gitignored)
│
├── .pipeline-backup/                # Origin state snapshot for diffing
│   └── origin-state.json            # Committed to git for CI continuity
│
├── tsconfig.json                    # TypeScript compiler config
├── ARCHITECTURE.md                  # This file
├── README.md                        # Setup and usage guide
├── TODO.md                          # Pending tasks
│
└── .github/workflows/
    └── origin-pipeline.yml          # CI: triggers on origin/** push
```

---

## TypeScript Setup

The pipeline is fully written in TypeScript and executed directly via `tsx`
(no compilation step needed for development or CI).

```
pipeline/types.ts          ← shared interfaces used across all agents
     │
     ├── JsonObject / JsonValue / NestedStringObject   (JSON primitives)
     ├── DetectedChanges / ChangeDetectorResult        (Agent 1)
     ├── QAIssue / QAReport / FormatQAResult           (Agent 2)
     ├── TranslatedContent                             (Agent 3)
     └── ValidationEntry / ValidationReport            (Agent 4)
```

**tsconfig.json** targets `ES2022` with `NodeNext` module resolution (required for
ESM + TypeScript). `skipLibCheck: true` avoids noise from AWS SDK type declarations.

**Running:** `tsx pipeline/run-pipeline.ts` — executes TypeScript directly without
a build step. Use `npm run pipeline:build` to compile to `dist/` if needed for deployment.

---

## Authentication

```
Local development
─────────────────
npm run pipeline
      │
      ▼
AWS_PROFILE=bedrock-aws  (set automatically in run-pipeline.ts)
      │
      ▼
~/.aws/config  →  credential-process.exe
      │
      ▼
Microsoft company login (Azure AD)  →  Cognito  →  AWS IAM Role
      │
      ▼
AWS Bedrock  →  Claude


CI / GitHub Actions  (pending AWS admin setup)
──────────────────────────────────────────────
AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY secrets
      │
      ▼
IAM user with AmazonBedrockFullAccess policy
      │
      ▼
AWS Bedrock  →  Claude


Fallback (any environment)
──────────────────────────
ANTHROPIC_API_KEY env var set
      │
      ▼
Direct Anthropic API  →  Claude
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **TypeScript** | Strict types on all agent interfaces prevents runtime errors and makes the codebase easier to extend |
| **Incremental diffing** | Only translates changed strings — saves tokens and time |
| **Batch size: 25 keys** | Safe limit for Claude's output token budget per call |
| **All 10 languages per call** | One API call per batch instead of 10 — 10x fewer calls |
| **Context grounding** | Glossary built from existing translations ensures consistent terminology |
| **Deep merge (no replace)** | Existing manual translations are preserved; only changed keys are updated |
| **Deletions propagated** | Keys removed from `origin/` are deleted from all 10 translated files |
| **State committed to git** | `.pipeline-backup/` in git means CI always has previous state for diffing |
| **GitHub Actions trigger** | Event-driven (push to `origin/**`) — no long-running process needed |
| **tsx runner** | Runs TypeScript directly — no build step in development or CI |

---

## Change Behavior Reference

| Action in `origin/` | Pipeline result |
|---------------------|----------------|
| Add a new string | Translated into all 10 languages, merged into translated/ |
| Edit an existing string | Re-translated, overwrites old value in all 10 languages |
| Delete a string | Removed from all 10 translated files |
| No changes | Pipeline exits early — no API calls made |
