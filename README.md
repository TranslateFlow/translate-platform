# TranslateFlow IA

Automated localization pipeline for the CXone platform. Detects changes in English source files, translates them into 10 languages using Claude (AWS Bedrock), and merges results directly into the output — no manual review, no vendor, no PRs.

---

## Supported Languages

| Code | Language |
|------|----------|
| `de` | German |
| `es` | Spanish |
| `fr` | French |
| `fr-ca` | French (Canada) |
| `ja` | Japanese |
| `ko` | Korean |
| `nl` | Dutch |
| `pt` | Portuguese |
| `zh-cn` | Chinese Simplified |
| `zh-hk` | Chinese Traditional (Hong Kong) |

---

## Requirements

- **Node.js** v18+
- **npm** or **pnpm**
- **AWS CLI v2** — [download](https://aws.amazon.com/cli/)
- **Claude Code package** installed (sets up the `bedrock-aws` AWS profile)

---

## First-Time Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Verify AWS authentication

The pipeline uses the `bedrock-aws` AWS profile, which was configured when you installed the Claude Code package (`install.bat`). Verify it works:

```bash
AWS_PROFILE=bedrock-aws aws sts get-caller-identity
```

You should see a response with `CognitoAuthenticatedRole`. If you get an error, re-run the `install.bat` from the Claude Code package.

### 3. Set the baseline

This snapshots the current `origin/` files so the pipeline knows what's already been translated. **Run this only once** (or after manually syncing translations):

```bash
npm run pipeline:init
```

You're ready to go.

---

## Daily Usage

### How it works

1. Edit one or more files in `origin/`
2. Run the pipeline
3. Translated files in `translated/` are updated automatically

### Step 1 — Edit a source file

All source files live in `origin/`. These are the English JSON files for each app:

```
origin/
  aaiAdminUI.json
  agentassisthub.json
  cxone-agent-assist-ui.json
  cxone-hybrid-webapp-my-schedule.json
  cxone-hybrid-webapp-qm-admin.json
  cxone-hybrid-webapp-qm-monitoring.json
  cxone-webapp-access-key-manager-mfe.json
  cxone-webapp-address-book.json
  cxone-webapp-admin-hierarchies-mfe.json
  cxone-webapp-admin.json
```

Example — add a new string:
```json
{
  "aaiAdminUIApp": {
    "AutomationAndAIAppTitle": "Automation & AI",
    "NewFeature": "My new feature label"
  }
}
```

Example — edit an existing string:
```json
"buttonText": "New Account"   →   "buttonText": "Create Account"
```

Example — delete a string: just remove the key from the JSON file.

### Step 2 — Run the pipeline

```bash
npm run pipeline
```

The pipeline will:
- Detect only what changed (new, modified, or deleted keys)
- Validate the strings before sending them to Claude
- Translate into all 10 languages
- Merge results into `translated/{lang}/apps/{file}.json`
- Save a validation report in `pipeline/reports/`

### Step 3 — Review the output

Check the translated files:
```
translated/de/apps/aaiAdminUI.json
translated/es/apps/aaiAdminUI.json
...
```

Check the validation report if there were warnings:
```
pipeline/reports/validation-{timestamp}.json
```

---

## What the Pipeline Does With Each Change

| Change type | Result |
|-------------|--------|
| **Add** a string | Translated into all 10 languages and merged |
| **Edit** a string | Re-translated, overwrites previous value in all 10 languages |
| **Delete** a string | Removed from all 10 translated files |
| **No changes** | Pipeline exits early — no API calls made |

---

## Available Commands

```bash
# Run the pipeline (translates changes in origin/)
npm run pipeline

# Set baseline snapshot — run once before first pipeline execution
npm run pipeline:init

# Compile TypeScript to dist/ (optional, for deployment)
npm run pipeline:build
```

---

## CI / GitHub Actions

The pipeline runs automatically on every push to `main` that modifies any file in `origin/`.

**Workflow file:** `.github/workflows/origin-pipeline.yml`

**Required GitHub secrets** (pending AWS admin setup):
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The IAM user behind those credentials needs the `AmazonBedrockFullAccess` policy attached.

> **Note:** Locally, no secrets are needed — the pipeline uses the `bedrock-aws` AWS profile
> which authenticates via your Microsoft company login automatically.

---

## Project Structure

```
platform-cxone-translations-ia/
│
├── origin/                    # Source of truth — edit these files
├── translated/                # Auto-generated output — do not edit manually
│
├── pipeline/                  # Translation pipeline (TypeScript)
│   ├── run-pipeline.ts        # Entry point / orchestrator
│   ├── types.ts               # Shared TypeScript interfaces
│   ├── agents/                # 5 independent agents
│   ├── lib/                   # Shared utilities
│   └── reports/               # Validation reports (gitignored)
│
├── .pipeline-backup/          # State snapshot used for change detection
│
├── tsconfig.json              # TypeScript config
├── ARCHITECTURE.md            # Full technical architecture
└── TODO.md                    # Pending improvements
```

---

## Troubleshooting

### "The config profile (bedrock-aws) could not be found"
Re-run `install.bat` from the Claude Code package directory:
```
C:\dev\claude\claude-code-package-v3\claude-code-package\install.bat
```

### "not authorized to perform: bedrock:InvokeModel"
Your IAM user/role doesn't have Bedrock permissions. Contact your AWS admin and ask them to attach `AmazonBedrockFullAccess` to your role.

### Pipeline ran but files weren't updated
Check if there were actually changes. If you ran `pipeline:init` after making edits, the baseline now includes those edits and the pipeline will see no delta. In that case, make the edit again and re-run.

### Validation failures in the report
Open `pipeline/reports/validation-{timestamp}.json` and look for the `issues` array per language/file. Common causes:
- Missing key — the translation batch failed partway, re-run the pipeline
- Missing placeholder — Claude dropped a `{{variable}}`, re-run for that file

---

## Architecture

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full technical design, pipeline flow diagram, and authentication details.
