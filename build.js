// Inlines style and scripts into one self-contained dist/index.html
const fs = require('fs');
const path = require('path');
const src = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const DARK = [
  '--bg: #0f1216', '--surface: #171b22', '--ink: #eceef2', '--muted: #98a2b0', '--line: #2b323d',
  '--accent: #f4ae3d', '--accent-ink: #1b1203', '--danger: #ff8478', '--ok: #62d391', 'color-scheme: dark'
].join('; ') + ';';

const style = src('style.css').split('/*@DARK@*/').join(DARK);
const html = src('index.template.html')
  .replace('/*@STYLE@*/', () => style)
  .replace('/*@CORE@*/', () => src('core.js'))
  .replace('/*@APP@*/', () => src('app.js'));

fs.mkdirSync(path.join(__dirname, 'dist'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'dist', 'index.html'), html);
console.log('built dist/index.html', (html.length / 1024).toFixed(1) + ' KiB');
