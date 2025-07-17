# Translation Platform MVP

## 🌍 Description
Automated translation platform that uses **Model Context Protocol (MCP)** to process localization files in multiple languages.

## 🏗️ Architecture
- **MCP Tool Integration**: `localization-translation-tool` for automatic extraction
- **GitHub Actions**: Automated pipeline on every push/PR
- **Multi-language**: Support for 11 languages
- **JSON Structure**: Structured translation files

## 🚀 Supported Languages
- 🇺🇸 English (US) - Base
- 🇪🇸 Español
- 🇫🇷 Français  
- 🇫🇷 Français (Canada)
- 🇩🇪 Deutsch
- 🇵🇹 Português
- 🇯🇵 日本語
- 🇰🇷 한국어
- 🇳🇱 Nederlands
- 🇨🇳 中文 (简体)
- 🇭🇰 中文 (繁體)

## 📁 Project Structure
```
translate-platform/
├── .github/workflows/     # GitHub Actions
├── languages/            # Translation files
│   ├── en-US/           # Base language
│   ├── es/              # Spanish
│   ├── fr/              # French
│   └── ...              # Other languages
├── scripts/             # Processing scripts
├── src/                 # Source code
└── translations-zip/    # ZIPs to process
```

## 🔧 Setup

### Required Environment Variables
```bash
ANTHROPIC_API_KEY=your_api_key_here
TARGET_LANGUAGES=es,fr,de,pt,ja,ko,nl,zh-cn,zh-hk
```

### Installation
```bash
npm install
```

### Local Processing
```bash
node scripts/process-translations.js
```

## 🤖 GitHub Actions Pipeline

### Automatic Triggers
- ✅ Push to `main` or `ft-lp-test`
- ✅ Pull requests with changes in `languages/en-US/`
- ✅ Manual trigger (`workflow_dispatch`)

### Jobs
1. **process-translations**: Processes files with MCP tool
2. **zip-n-push**: Generates artifacts for download

## 📋 Usage

### 1. Adding New Translations
1. Place JSON files in `languages/en-US/`
2. Commit and push
3. GitHub Actions will process automatically

### 2. Processing ZIP Files
1. Place ZIP files in `translations-zip/`
2. Run the pipeline
3. Files will be extracted and organized

### 3. Validation
The pipeline includes automatic validation of:
- ✅ Valid JSON structure
- ✅ Complete files per language
- ✅ Status reporting

## 🛠️ MCP Tool Integration

The project uses the `localization-translation-tool` which:
- Extracts files from translation ZIPs
- Organizes by language automatically
- Validates structure and content
- Generates processing reports

## 📊 Outputs

### Generated Artifacts
- `localization-json-file`: Processed files
- `localization-report.json`: Detailed report

### Report Structure
```json
{
  "timestamp": "2025-01-XX",
  "targetLanguages": ["es", "fr", "de", ...],
  "processedLanguages": [...],
  "totalFiles": 22,
  "errors": []
}
```

## 🚀 MVP Status
- [x] Project structure
- [x] MCP tool integration
- [x] GitHub Actions pipeline
- [x] Multi-language support
- [x] Automatic validation
- [x] Status reporting
- [x] Artifacts generation

## 🔮 Next Steps
- [ ] Unit tests
- [ ] Frontend interface
- [ ] API endpoints
- [ ] Database integration
- [ ] Advanced validation rules