const fs = require('fs');
const path = require('path');

console.log('Building translation exports...');

// Generate individual exports for each language/file combination
const languagesDir = path.join(__dirname, 'languages');
if (!fs.existsSync(languagesDir)) {
    console.error('Languages directory not found');
    process.exit(1);
}

const languages = fs.readdirSync(languagesDir).filter(item =>
    fs.statSync(path.join(languagesDir, item)).isDirectory()
);

let exports = '\n// Auto-generated exports\n';
let typeExports = '\n// Auto-generated type exports\n';

languages.forEach(lang => {
    const langDir = path.join(languagesDir, lang);
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));

    files.forEach(file => {
        const basename = path.basename(file, '.json');
        const exportName = `${lang.replace('-', '_')}_${basename.replace('-', '_')}`;

        exports += `exports.${exportName} = require('./languages/${lang}/${file}');\n`;
        typeExports += `export declare const ${exportName}: any;\n`;
    });
});

// Append to index.js
fs.appendFileSync('index.js', exports);
fs.appendFileSync('index.d.ts', typeExports);

console.log('Build complete!');
