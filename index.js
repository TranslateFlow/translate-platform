const fs = require('fs');
const path = require('path');

/**
 * Load translation file for a specific language
 * @param {string} language - Language code (e.g., 'en-US', 'es-ES')
 * @param {string} filename - Filename without extension (e.g., 'fake-acd-1')
 * @returns {object|null} Translation object or null if not found
 */
function loadTranslation(language, filename) {
    const filePath = path.join(__dirname, 'languages', language, `${filename}.json`);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null;
}

/**
 * Get all available languages
 * @returns {string[]} Array of language codes
 */
function getAvailableLanguages() {
    const languagesDir = path.join(__dirname, 'languages');
    if (fs.existsSync(languagesDir)) {
        return fs.readdirSync(languagesDir).filter(item =>
            fs.statSync(path.join(languagesDir, item)).isDirectory()
        );
    }
    return [];
}

/**
 * Get all translation files for a specific language
 * @param {string} language - Language code
 * @returns {string[]} Array of available translation files
 */
function getTranslationFiles(language) {
    const langDir = path.join(__dirname, 'languages', language);
    if (fs.existsSync(langDir)) {
        return fs.readdirSync(langDir)
            .filter(file => file.endsWith('.json'))
            .map(file => path.basename(file, '.json'));
    }
    return [];
}

module.exports = {
    loadTranslation,
    getAvailableLanguages,
    getTranslationFiles
};
