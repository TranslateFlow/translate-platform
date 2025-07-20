#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanAllTranslations() {
  console.log('🧹 FORCE CLEAN - NO CONFIRMATION');
  console.log('=================================');
  
  const projectRoot = path.resolve(__dirname, '..');
  const languagesDir = path.join(projectRoot, 'languages');
  const targetLanguages = ['de', 'es', 'fr', 'fr-ca', 'ja', 'ko', 'nl', 'pt', 'zh-cn', 'zh-hk', 'it'];
  
  let totalCleaned = 0;
  
  for (const language of targetLanguages) {
    const langDir = path.join(languagesDir, language);
    
    try {
      await fs.access(langDir);
      const files = await fs.readdir(langDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      for (const file of jsonFiles) {
        const filePath = path.join(langDir, file);
        await fs.writeFile(filePath, '{}', 'utf8');
        console.log(`✅ ${language}/${file} -> {}`);
        totalCleaned++;
      }
    } catch (error) {
      // Directory doesn't exist, skip
    }
  }
  
  console.log(`\n🎉 Cleaned ${totalCleaned} files!`);
}

cleanAllTranslations();