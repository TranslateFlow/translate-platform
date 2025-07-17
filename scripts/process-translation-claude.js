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
    this.targetLanguages = ['es', 'fr'];
    
    // Verify that we have at least one auth method
    this.hasOAuth = !!process.env.CLAUDE_CODE_OAUTH_TOKEN;
    this.hasAPIKey = !!process.env.ANTHROPIC_API_KEY;
    
    if (!this.hasOAuth && !this.hasAPIKey) {
      throw new Error('❌ You need CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY');
    }
    
    console.log('🎯 Simple Claude Translator - Demo Mode');
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
    return `Translate these JSON files from English to: ${this.targetLanguages.join(', ')}.

IMPORTANT RULES:
1. Keep the EXACT JSON structure
2. Only translate text values (strings)
3. DO NOT translate JSON keys
4. Use natural translations

FILES:
${JSON.stringify(sourceFiles, null, 2)}

RESPOND ONLY WITH JSON IN THIS FORMAT:
{
  "es": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  },
  "fr": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  },
  "de": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  },
  "pt": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  },
  "ja": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  },
  "ko": {
    ${Object.keys(sourceFiles).map(f => `"${f}": {...}`).join(', ')}
  }
}`;
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
    console.log('💾 Saving translations...');
    
    let totalFiles = 0;
    
    for (const [language, files] of Object.entries(translations)) {
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
  console.log('🎯 SIMPLE CLAUDE TRANSLATOR - DEMO MODE');
  console.log('======================================\n');
  
  const translator = new IntelligentTranslationProcessorClaude();
  translator.translateFiles();
}

export default IntelligentTranslationProcessorClaude;