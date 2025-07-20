#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class IntelligentTranslationProcessorClaude {
  constructor() {
    this.projectRoot = path.resolve(__dirname, '..');
    this.languagesDir = path.join(this.projectRoot, 'languages');
    this.baseLanguage = 'en-US';
    // FIXED: Removed duplicate 'de' and added all languages properly
    this.targetLanguages = ['de', 'es', 'fr', 'fr-ca', 'ja', 'ko', 'nl', 'pt', 'zh-cn', 'zh-hk', 'it'];
    
    // Verify that we have at least one auth method
    this.hasOAuth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    this.hasAPIKey = !!process.env.ANTHROPIC_API_KEY;
    
    if (!this.hasOAuth && !this.hasAPIKey) {
      throw new Error('❌ You need CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
    }
    
    console.log('🎯 Translator - Demo Mode');
    console.log(`📂 Base: ${this.baseLanguage} → Target: ${this.targetLanguages.join(', ')}`);
    console.log(`🔐 Auth: ${this.hasAPIKey ? 'API Key' : 'OAuth Token'}`);
    console.log('⚡ Mode: Direct without MCP\n');
  }

  async translateFiles() {
    try {
      console.log('1️⃣ Reading base files...');
      const sourceFiles = await this.readBaseFiles();
      
      console.log('\n2️⃣ Sending to Claude for translation...');
      const translations = await this.callClaude(sourceFiles);
      
      console.log('\n3️⃣ Saving translations...');
      await this.saveTranslations(translations);
      
      console.log('\n✅ Demo completed successfully!');
      this.showSummary();
      
    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error('Stack trace:', error.stack);
      process.exit(1);
    }
  }

  async readBaseFiles() {
    const baseDir = path.join(this.languagesDir, this.baseLanguage);
    
    try {
      const files = await fs.readdir(baseDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      if (jsonFiles.length === 0) {
        throw new Error(`No JSON files found in ${baseDir}`);
      }
      
      const sourceFiles = {};
      for (const file of jsonFiles) {
        const filePath = path.join(baseDir, file);
        const content = await fs.readFile(filePath, 'utf8');
        sourceFiles[file] = JSON.parse(content);
        console.log(`📄 Read: ${file}`);
      }
      
      console.log(`📊 Total: ${Object.keys(sourceFiles).length} files`);
      return sourceFiles;
      
    } catch (error) {
      throw new Error(`Error reading base files: ${error.message}`);
    }
  }

  async callClaude(sourceFiles) {
    console.log('🤖 Calling Claude...');
    
    const prompt = this.buildPrompt(sourceFiles);
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

  buildPrompt(sourceFiles) {
    // FIXED: Generate the template for all target languages dynamically
    const languageTemplate = this.targetLanguages.map(lang => 
      `  "${lang}": {\n    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(',\n    ')}\n  }`
    ).join(',\n');

    return `You are a professional translator. Translate these JSON localization files from English to the specified target languages: ${this.targetLanguages.join(', ')}.

CRITICAL TRANSLATION RULES:
1. PRESERVE the exact JSON structure and formatting
2. ONLY translate string values (text content)
3. NEVER translate JSON keys, property names
4. Use natural, contextually appropriate translations for each target language
5. Maintain consistency in terminology across all files
6. Keep placeholders, variables, and special formatting intact (e.g., {{variable}}, %s, etc.)

FILES TO TRANSLATE:
${JSON.stringify(sourceFiles, null, 2)}

RESPOND ONLY WITH VALID JSON IN THIS EXACT FORMAT:
{
${languageTemplate}
}

Make sure to translate ALL string values in the JSON files for each target language. The response must be valid JSON that can be parsed.`;
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
    
    // FIXED: Better JSON extraction
    let jsonContent;
    try {
      // Try to find JSON block
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      jsonContent = jsonMatch ? jsonMatch[0] : content;
      
      // Parse and validate the JSON
      const parsed = JSON.parse(jsonContent);
      
      // Validate that we have all expected languages
      const expectedLanguages = this.targetLanguages;
      const receivedLanguages = Object.keys(parsed);
      
      for (const lang of expectedLanguages) {
        if (!parsed[lang]) {
          throw new Error(`Missing translation for language: ${lang}`);
        }
      }
      
      console.log(`✅ Received translations for: ${receivedLanguages.join(', ')}`);
      return parsed;
      
    } catch (parseError) {
      console.error('❌ Failed to parse Claude response as JSON');
      console.error('Raw response:', content);
      throw new Error(`JSON Parse Error: ${parseError.message}`);
    }
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
    
    // FIXED: Better JSON extraction for OAuth response
    let jsonContent;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      jsonContent = jsonMatch ? jsonMatch[0] : content;
      
      const parsed = JSON.parse(jsonContent);
      
      // Validate languages
      const expectedLanguages = this.targetLanguages;
      for (const lang of expectedLanguages) {
        if (!parsed[lang]) {
          throw new Error(`Missing translation for language: ${lang}`);
        }
      }
      
      return parsed;
      
    } catch (parseError) {
      console.error('❌ Failed to parse OAuth response as JSON');
      console.error('Raw response:', content);
      throw new Error(`JSON Parse Error: ${parseError.message}`);
    }
  }

  async saveTranslations(translations) {
    console.log('💾 Saving translations...');
    
    let totalFiles = 0;
    
    // FIXED: Validate that we have all expected languages before saving
    for (const language of this.targetLanguages) {
      if (!translations[language]) {
        throw new Error(`Missing translations for language: ${language}`);
      }
    }
    
    for (const [language, files] of Object.entries(translations)) {
      // Skip if not in our target languages
      if (!this.targetLanguages.includes(language)) {
        console.log(`⚠️  Skipping unexpected language: ${language}`);
        continue;
      }
      
      const langDir = path.join(this.languagesDir, language);
      
      // Create directory
      await fs.mkdir(langDir, { recursive: true });
      console.log(`📁 Directory: languages/${language}/`);
      
      // Save files
      for (const [fileName, content] of Object.entries(files)) {
        const filePath = path.join(langDir, fileName);
        await fs.writeFile(filePath, JSON.stringify(content, null, 2), 'utf8');
        console.log(`✅ ${language}/${fileName}`);
        totalFiles++;
      }
    }
    
    console.log(`📦 Total: ${totalFiles} files saved`);
  }

  showSummary() {
    console.log('\n📊 DEMO SUMMARY:');
    console.log('======================');
    console.log(`✅ Method: ${this.hasAPIKey ? 'Anthropic API' : 'OAuth Token'}`);
    console.log(`🌍 Languages: ${this.targetLanguages.length} languages processed`);
    console.log(`📄 Files: ${this.targetLanguages.length * 2} files generated`);
    console.log(`⚡ Simplicity: No MCP, direct to Claude`);
    console.log(`🎯 Perfect for demos and quick tests`);
    console.log('\n🎉 Demo ready to present!');
  }
}

// Execute
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('🎯 SIMPLE CLAUDE TRANSLATOR - DEMO MODE (FIXED VERSION)');
  console.log('======================================\n');
  
  const translator = new IntelligentTranslationProcessorClaude();
  translator.translateFiles();
}

export default IntelligentTranslationProcessorClaude;