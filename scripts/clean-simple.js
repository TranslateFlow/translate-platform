#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function cleanAllTranslations() {
  console.log('🧹 SIMPLE TRANSLATION CLEANER');
  console.log('==============================');
  
  const projectRoot = path.resolve(__dirname, '..');
  const languagesDir = path.join(projectRoot, 'languages');
  const targetLanguages = ['de', 'es', 'fr', 'fr-ca', 'ja', 'ko', 'nl', 'pt', 'zh-cn', 'zh-hk', 'it'];
  
  console.log(`📍 Cleaning from: ${languagesDir}`);
  console.log(`🎯 Target languages: ${targetLanguages.join(', ')}\n`);
  
  let totalCleaned = 0;
  let totalDirectories = 0;
  
  for (const language of targetLanguages) {
    const langDir = path.join(languagesDir, language);
    console.log(`📁 Processing: ${language}`);
    
    try {
      // Check if directory exists
      await fs.access(langDir);
      totalDirectories++;
      
      // Get all JSON files
      const files = await fs.readdir(langDir);
      const jsonFiles = files.filter(file => file.endsWith('.json'));
      
      console.log(`   📄 Found ${jsonFiles.length} JSON files: ${jsonFiles.join(', ')}`);
      
      // Clean each JSON file
      for (const file of jsonFiles) {
        const filePath = path.join(langDir, file);
        
        try {
          // Write empty object
          await fs.writeFile(filePath, '{}', 'utf8');
          console.log(`   ✅ Cleaned: ${file}`);
          totalCleaned++;
        } catch (error) {
          console.log(`   ❌ Failed to clean ${file}: ${error.message}`);
        }
      }
      
    } catch (error) {
      console.log(`   ⚠️  Directory ${language} not found - skipping`);
    }
    
    console.log(''); // Empty line
  }
  
  console.log('='.repeat(40));
  console.log('✅ CLEANING COMPLETED!');
  console.log('='.repeat(40));
  console.log(`📊 Directories processed: ${totalDirectories}`);
  console.log(`📄 Files cleaned: ${totalCleaned}`);
  console.log(`🧹 All files now contain: {}`);
  
  if (totalCleaned > 0) {
    console.log('\n🎉 Ready for fresh translations!');
  } else {
    console.log('\n⚠️  No files were cleaned. Check the paths and try again.');
  }
}

// Run with confirmation
console.log('⚠️  This will replace ALL translation files with {}');
console.log('🤔 Continue? Type "yes" to proceed:');

process.stdin.setEncoding('utf8');
process.stdin.once('readable', () => {
  const input = process.stdin.read();
  if (input) {
    const answer = input.toString().trim().toLowerCase();
    if (answer === 'yes' || answer === 'y') {
      cleanAllTranslations();
    } else {
      console.log('❌ Cancelled');
      process.exit(0);
    }
  }
});