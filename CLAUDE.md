# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Install dependencies (uses pnpm)
pnpm install

# ── New origin→translated pipeline ──────────────────────────────────────────
# Save current origin/ state as baseline (run once before first real pipeline run)
pnpm run pipeline:init

# Run the pipeline (detects changes in origin/, translates, writes to translated/)
pnpm run pipeline          # requires ANTHROPIC_API_KEY

# ── Legacy languages/ pipeline ───────────────────────────────────────────────
# Run incremental translation (production - requires API key or OAuth token)
pnpm run translate

# Run incremental translation with OAuth
pnpm run translate:oauth

# Run simulation mode (development - no API key needed)
node scripts/process-translations.js

# Reset all translated files to empty {} (interactive, prompts for confirmation)
node scripts/clean-simple.js

# Reset all translated files to empty {} (no confirmation)
node scripts/clean-force.js

# Build MCP server
pnpm run build:mcp

# Run MCP server in dev mode
pnpm run dev:mcp
```

## New Pipeline (origin → translated)

Five-agent pipeline in `pipeline/`. Each agent is independently importable and testable.

| # | Agent | File | Responsibility |
|---|-------|------|----------------|
| 1 | Change Detector | `pipeline/agents/1-change-detector.js` | Diffs `origin/` vs `.pipeline-backup/origin-state.json`; extracts only new/modified strings |
| 2 | Format QA | `pipeline/agents/2-format-qa.js` | Validates strings — blocks empties, warns on broken `{{` placeholders |
| 3 | Translator | `pipeline/agents/3-translator.js` | Calls Claude in batches of 25 keys; grounds prompts in existing `translated/` terminology |
| 4 | E2E Validator | `pipeline/agents/4-e2e-validator.js` | Checks key completeness, placeholder preservation, flags suspect non-Latin strings |
| 5 | Auto-Merger | `pipeline/agents/5-auto-merger.js` | Deep-merges results into `translated/{lang}/apps/{file}.json`; handles deletions |

**Shared utilities:** `pipeline/lib/json-utils.js` (flatten/merge/etc.), `pipeline/lib/claude-client.js` (Anthropic API), `pipeline/lib/context-builder.js` (builds per-language glossary from existing translations).

**Trigger:** `.github/workflows/origin-pipeline.yml` fires on push to `main` modifying `origin/**`. State persists via `.pipeline-backup/origin-state.json` committed alongside `translated/`.

**First-time setup:**
1. `pnpm run pipeline:init` — snapshots current `origin/` as baseline (no API call)
2. Edit a file in `origin/`, push → CI picks up only that delta

**Validation reports** land in `pipeline/reports/` (gitignored). Exit code 1 when validations fail so CI flags the run, but files are still committed.

## Legacy Architecture (languages/ pipeline)

This is an automated localization platform that translates JSON files from English (`languages/en-US/`) into 11 target languages using the Claude API.

### Two Translation Modes

**Incremental (production)** — `scripts/process-translation-incremental.js`
- Compares current `languages/en-US/` files against a saved snapshot in `.translation-backup/previous-state.json`
- Only translates new/modified keys, then deep-merges results into existing translations
- Deletes keys from translated files when removed from the source
- Requires `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`
- Calls `claude-3-5-sonnet-20241022` via Anthropic REST API with `max_tokens: 8000, temperature: 0.3`
- On first run (no backup state), performs a full translation of all files

**Simulation (development)** — `scripts/process-translations.js`
- Uses hardcoded translation dictionaries — no API key required
- Useful for testing the pipeline and file structure without incurring API costs

### MCP Server

`src/translateflow-tool/main.ts` is a Model Context Protocol server that exposes the `localization-translation-tool`. It reads files from `languages/en-US/` and returns their content as structured `FileInfoDto` objects (`src/translateflow-tool/dto/FileInfoDto.ts`) over stdio transport. The MCP server is a separate concern from the incremental script — it is used by Claude Code agents as a tool, not by the GitHub Actions pipeline.

### File Layout

```
languages/
  en-US/          # Source of truth — edit these to trigger translations
  de/, es/, fr/,  # Auto-generated translated files (do not edit manually)
  fr-ca/, it/,
  ja/, ko/, nl/,
  pt/, zh-cn/, zh-hk/
origin/            # Upstream app JSON files (source material)
translated/        # Organized output by language/app
scripts/           # Node.js translation processors
src/translateflow-tool/  # MCP server (TypeScript)
.translation-backup/     # State snapshot for incremental diffing (gitignored)
original-old-projects/   # Legacy reference project (not part of active pipeline)
```

### GitHub Actions Pipeline

`.github/workflows/actions.yml` triggers on pushes to `main` that modify `languages/en-US/**`, or manually via `workflow_dispatch`. It runs `process-translation-incremental.js` with a 90-second timeout (exits 0 on timeout so the pipeline doesn't fail), then auto-commits any changed files under `languages/` with the message `"🤖 Auto-translated files"`.

Required GitHub secrets: `ANTHROPIC_API_KEY` (or `CLAUDE_CODE_OAUTH_TOKEN`), `LOCALIZATION_MCP_TOKEN`.

### Translation Prompt Conventions

- JSON keys are never translated — only string values
- `"ACD"` is always kept as-is (application name)
- `"fake"` in context means demo/test/sample, not false/fraudulent
- Placeholders like `{{variable}}` and `%s` must be preserved unchanged
