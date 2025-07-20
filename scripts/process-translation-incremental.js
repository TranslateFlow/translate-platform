#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IncrementalTranslationProcessor {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.languagesDir = path.join(this.projectRoot, 'languages');
    this.baseLanguage = 'en-US';
    this.targetLanguages = ['de', 'es', 'fr', 'fr-ca', 'ja', 'ko', 'nl', 'pt', 'zh-cn', 'zh-hk', 'it'];
    this.backupDir = path.join(this.projectRoot, '.translation-backup');
    
    // Verify auth
    this.hasOAuth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    this.hasAPIKey = !!process.env.ANTHROPIC_API_KEY;
    
    if (!this.hasOAuth && !this.hasAPIKey) {
      throw new Error('❌ You need CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
    }
    
    console.log('🔄 INCREMENTAL TRANSLATOR');
    console.log('========================');
    console.log(`📂 Base: ${this.baseLanguage} → Target: ${this.targetLanguages.join(', ')}`);
    console.log(`🔐 Auth: ${this.hasAPIKey ? 'API Key' : 'OAuth Token'}`);
    console.log('⚡ Mode: Incremental updates only\n');
  }

  async translateIncremental() {
    try {
      console.log('1️⃣ Reading current base files...');
      const currentFiles = await this.readBaseFiles();
      
      console.log('2️⃣ Loading previous state...');
      const previousFiles = await this.loadPreviousState();
      
      console.log('3️⃣ Detecting changes...');
      const changes = this.detectChanges(previousFiles, currentFiles);
      
      if (changes.hasChanges) {
        console.log('4️⃣ Loading existing translations...');
        const existingTranslations = await this.loadExistingTranslations();
        
        console.log('5️⃣ Translating only changes...');
        const newTranslations = await this.translateChanges(changes);
        
        console.log('6️⃣ Merging with existing translations...');
        const mergedTranslations = this.mergeTranslations(existingTranslations, newTranslations, changes);
        
        console.log('7️⃣ Saving updated translations...');
        await this.saveTranslations(mergedTranslations);
        
        console.log('8️⃣ Saving current state for future comparisons...');
        await this.saveCurrentState(currentFiles);
        
        console.log('\n✅ Incremental update completed!');
        this.showUpdateSummary(changes);
      } else {
        console.log('\n✅ No changes detected - nothing to translate!');
      }
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  }

  async readBaseFiles() {
    const baseDir = path.join(this.languagesDir, this.baseLanguage);
    const sourceFiles = {};
    
    try {
      const files = await fs.readdir(baseDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const filePath = path.join(baseDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        sourceFiles[file] = JSON.parse(content);
        console.log(`📄 Read: ${file}`);
      }
      
      return sourceFiles;
    } catch (error) {
      throw new Error(`Error reading base files: ${error.message}`);
    }
  }

  async loadPreviousState() {
    const stateFile = path.join(this.backupDir, 'previous-state.json');
    
    try {
      await fs.access(stateFile);
      const content = await fs.readFile(stateFile, 'utf8');
      console.log(`📋 Loaded previous state from backup`);
      return JSON.parse(content);
    } catch (error) {
      console.log(`📋 No previous state found - will do full translation`);
      return {};
    }
  }

  detectChanges(previousFiles, currentFiles) {
    const changes = {
      hasChanges: false,
      newFiles: [],
      modifiedFiles: [],
      newKeys: {},
      modifiedKeys: {},
      deletedKeys: {}
    };

    // Check for new files
    for (const fileName of Object.keys(currentFiles)) {
      if (!previousFiles[fileName]) {
        changes.newFiles.push(fileName);
        changes.hasChanges = true;
        console.log(`🆕 New file: ${fileName}`);
      }
    }

    // Check for changes in existing files
    for (const [fileName, currentContent] of Object.entries(currentFiles)) {
      if (previousFiles[fileName]) {
        const fileChanges = this.detectFileChanges(previousFiles[fileName], currentContent, fileName);
        if (fileChanges.hasChanges) {
          changes.modifiedFiles.push(fileName);
          changes.newKeys[fileName] = fileChanges.newKeys;
          changes.modifiedKeys[fileName] = fileChanges.modifiedKeys;
          changes.deletedKeys[fileName] = fileChanges.deletedKeys;
          changes.hasChanges = true;
        }
      }
    }

    return changes;
  }

  detectFileChanges(previousContent, currentContent, fileName) {
    const changes = {
      hasChanges: false,
      newKeys: [],
      modifiedKeys: [],
      deletedKeys: []
    };

    const previousFlat = this.flattenObject(previousContent);
    const currentFlat = this.flattenObject(currentContent);

    // Check for new keys
    for (const [key, value] of Object.entries(currentFlat)) {
      if (!previousFlat.hasOwnProperty(key)) {
        changes.newKeys.push({ key, value });
        changes.hasChanges = true;
        console.log(`  🆕 New key in ${fileName}: ${key} = "${value}"`);
      } else if (previousFlat[key] !== value) {
        changes.modifiedKeys.push({ key, oldValue: previousFlat[key], newValue: value });
        changes.hasChanges = true;
        console.log(`  🔄 Modified in ${fileName}: ${key}`);
        console.log(`      Old: "${previousFlat[key]}"`);
        console.log(`      New: "${value}"`);
      }
    }

    // Check for deleted keys
    for (const key of Object.keys(previousFlat)) {
      if (!currentFlat.hasOwnProperty(key)) {
        changes.deletedKeys.push(key);
        changes.hasChanges = true;
        console.log(`  🗑️  Deleted in ${fileName}: ${key}`);
      }
    }

    return changes;
  }

  flattenObject(obj, prefix = '') {
    const result = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        Object.assign(result, this.flattenObject(value, newKey));
      } else {
        result[newKey] = value;
      }
    }
    
    return result;
  }

  unflattenObject(flatObj) {
    const result = {};
    
    for (const [key, value] of Object.entries(flatObj)) {
      const keys = key.split('.');
      let current = result;
      
      for (let i = 0; i < keys.length - 1; i++) {
        if (!current[keys[i]]) {
          current[keys[i]] = {};
        }
        current = current[keys[i]];
      }
      
      current[keys[keys.length - 1]] = value;
    }
    
    return result;
  }

  async loadExistingTranslations() {
    const existingTranslations = {};
    
    for (const language of this.targetLanguages) {
      existingTranslations[language] = {};
      const langDir = path.join(this.languagesDir, language);
      
      try {
        await fs.access(langDir);
        const files = await fs.readdir(langDir);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        
        for (const file of jsonFiles) {
          try {
            const filePath = path.join(langDir, file);
            const content = await fs.readFile(filePath, 'utf8');
            const parsed = JSON.parse(content);
            
            // Only load if not empty
            if (Object.keys(parsed).length > 0) {
              existingTranslations[language][file] = parsed;
              console.log(`📖 Loaded existing: ${language}/${file}`);
            }
          } catch (error) {
            console.log(`⚠️  Could not load ${language}/${file}: ${error.message}`);
          }
        }
      } catch (error) {
        console.log(`📁 Directory ${language} not found - will create`);
      }
    }
    
    return existingTranslations;
  }

  async translateChanges(changes) {
    if (!changes.hasChanges) {
      return {};
    }

    // Build content to translate (only new/modified content)
    const contentToTranslate = {};

    // Add new files completely
    const currentFiles = await this.readBaseFiles();
    for (const fileName of changes.newFiles) {
      contentToTranslate[fileName] = currentFiles[fileName];
    }

    // Add only new/modified keys from existing files
    for (const fileName of changes.modifiedFiles) {
      if (!contentToTranslate[fileName]) {
        contentToTranslate[fileName] = {};
      }

      // Add new keys
      if (changes.newKeys[fileName]) {
        for (const { key, value } of changes.newKeys[fileName]) {
          this.setNestedValue(contentToTranslate[fileName], key, value);
        }
      }

      // Add modified keys
      if (changes.modifiedKeys[fileName]) {
        for (const { key, newValue } of changes.modifiedKeys[fileName]) {
          this.setNestedValue(contentToTranslate[fileName], key, newValue);
        }
      }
    }

    if (Object.keys(contentToTranslate).length === 0) {
      return {};
    }

    console.log(`📝 Translating changes only:`);
    for (const [fileName, content] of Object.entries(contentToTranslate)) {
      const keyCount = Object.keys(this.flattenObject(content)).length;
      console.log(`   ${fileName}: ${keyCount} keys`);
    }

    return await this.callClaude(contentToTranslate);
  }

  setNestedValue(obj, key, value) {
    const keys = key.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        current[keys[i]] = {};
      }
      current = current[keys[i]];
    }
    
    current[keys[keys.length - 1]] = value;
  }

  mergeTranslations(existingTranslations, newTranslations, changes) {
    const mergedTranslations = JSON.parse(JSON.stringify(existingTranslations)); // Deep clone

    for (const language of this.targetLanguages) {
      if (!mergedTranslations[language]) {
        mergedTranslations[language] = {};
      }

      if (newTranslations[language]) {
        for (const [fileName, newContent] of Object.entries(newTranslations[language])) {
          if (!mergedTranslations[language][fileName]) {
            // New file - add completely
            mergedTranslations[language][fileName] = newContent;
            console.log(`✅ ${language}/${fileName} - new file added`);
          } else {
            // Merge with existing file
            mergedTranslations[language][fileName] = this.deepMerge(
              mergedTranslations[language][fileName],
              newContent
            );
            console.log(`✅ ${language}/${fileName} - merged changes`);
          }
        }
      }

      // Handle deleted keys
      for (const fileName of changes.modifiedFiles || []) {
        if (changes.deletedKeys[fileName] && mergedTranslations[language][fileName]) {
          for (const deletedKey of changes.deletedKeys[fileName]) {
            this.deleteNestedKey(mergedTranslations[language][fileName], deletedKey);
            console.log(`🗑️  ${language}/${fileName} - deleted: ${deletedKey}`);
          }
        }
      }
    }

    return mergedTranslations;
  }

  deepMerge(target, source) {
    const result = { ...target };
    
    for (const [key, value] of Object.entries(source)) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        if (typeof result[key] === 'object' && result[key] !== null) {
          result[key] = this.deepMerge(result[key], value);
        } else {
          result[key] = value;
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }

  deleteNestedKey(obj, key) {
    const keys = key.split('.');
    let current = obj;
    
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) {
        return; // Key doesn't exist
      }
      current = current[keys[i]];
    }
    
    delete current[keys[keys.length - 1]];
  }

  async callClaude(contentToTranslate) {
    const prompt = this.buildIncrementalPrompt(contentToTranslate);
    console.log(`📝 Prompt: ${prompt.length} characters`);
    
    try {
      if (this.hasAPIKey) {
        return await this.callAnthropicAPI(prompt);
      } else {
        return await this.callClaudeOAuth(prompt);
      }
    } catch (error) {
      throw new Error(`Error calling Claude: ${error.message}`);
    }
  }

  buildIncrementalPrompt(contentToTranslate) {
    const languageTemplate = this.targetLanguages.map(lang => 
      `  "${lang}": {\n    ${Object.keys(contentToTranslate).map(f => `"${f}": {...}`).join(',\n    ')}\n  }`
    ).join(',\n');

    return `You are translating ONLY NEW OR MODIFIED content for a software application. This is an incremental update - translate only the provided content.

CONTEXT: These are test/demo files for a software application. The word "fake" means "demo/test/sample" - NOT "false/fraudulent".

CRITICAL RULES:
1. PRESERVE exact JSON structure and formatting
2. ONLY translate string values, NEVER translate JSON keys
3. Use natural, contextually appropriate translations
4. Maintain consistency with existing translations
5. Keep placeholders intact ({{variable}}, %s, etc.)

SPECIFIC CONTEXT:
- "Fake" = Demo/Test/Sample (NOT false/fraudulent)
- "ACD" = Keep as "ACD" (application name)
- Use professional software interface language
- Ensure translations sound natural to native speakers

CONTENT TO TRANSLATE (incremental update):
${JSON.stringify(contentToTranslate, null, 2)}

RESPOND ONLY WITH VALID JSON:
{
${languageTemplate}
}

Translate ALL provided content for each target language: ${this.targetLanguages.join(', ')}`;
  }

  async callAnthropicAPI(prompt) {
    console.log('🏢 Using Anthropic API...');
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 8000,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`API Error: ${response.status} - ${error.error?.message}`);
    }
    
    const data = await response.json();
    console.log(`💰 Tokens: ${data.usage?.input_tokens}/${data.usage?.output_tokens}`);
    
    const content = data.content[0].text;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonContent = jsonMatch ? jsonMatch[0] : content;
    
    return JSON.parse(jsonContent);
  }

  async callClaudeOAuth(prompt) {
    console.log('🔐 Using OAuth Token...');
    
    const response = await fetch('https://claude.ai/api/chat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CLAUDE_CODE_OAUTH_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: prompt,
        model: 'claude-3-5-sonnet'
      })
    });
    
    if (!response.ok) {
      throw new Error(`OAuth Error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    const content = data.response || data.message || data.content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const jsonContent = jsonMatch ? jsonMatch[0] : content;
    
    return JSON.parse(jsonContent);
  }

  async saveTranslations(translations) {
    console.log('💾 Saving merged translations...');
    
    let totalFiles = 0;
    
    for (const [language, files] of Object.entries(translations)) {
      if (!this.targetLanguages.includes(language)) continue;
      
      const langDir = path.join(this.languagesDir, language);
      await fs.mkdir(langDir, { recursive: true });
      
      for (const [fileName, content] of Object.entries(files)) {
        const filePath = path.join(langDir, fileName);
        await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');
        console.log(`✅ ${language}/${fileName}`);
        totalFiles++;
      }
    }
    
    console.log(`📦 Total: ${totalFiles} files saved`);
  }

  async saveCurrentState(currentFiles) {
    await fs.mkdir(this.backupDir, { recursive: true });
    const stateFile = path.join(this.backupDir, 'previous-state.json');
    await fs.writeFile(stateFile, JSON.stringify(currentFiles, null, 2), 'utf8');
    console.log(`💾 Saved current state for future comparisons`);
  }

  showUpdateSummary(changes) {
    console.log('\n📊 INCREMENTAL UPDATE SUMMARY:');
    console.log('==============================');
    console.log(`🆕 New files: ${changes.newFiles.length}`);
    console.log(`🔄 Modified files: ${changes.modifiedFiles.length}`);
    
    if (changes.newFiles.length > 0) {
      console.log(`   New: ${changes.newFiles.join(', ')}`);
    }
    
    let totalNewKeys = 0;
    let totalModifiedKeys = 0;
    for (const fileName of changes.modifiedFiles) {
      const newKeys = changes.newKeys[fileName]?.length || 0;
      const modifiedKeys = changes.modifiedKeys[fileName]?.length || 0;
      totalNewKeys += newKeys;
      totalModifiedKeys += modifiedKeys;
      console.log(`   ${fileName}: +${newKeys} new, ~${modifiedKeys} modified`);
    }
    
    console.log(`\n🎯 Total changes translated: ${totalNewKeys + totalModifiedKeys} keys`);
    console.log(`💡 Existing translations preserved!`);
    console.log('\n🎉 Incremental update complete!');
  }
}

// Execute
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🔄 INCREMENTAL TRANSLATION PROCESSOR');
  console.log('===================================\n');
  
  const processor = new IncrementalTranslationProcessor();
  processor.translateIncremental();
}

export default IncrementalTranslationProcessor;