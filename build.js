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

// ---- installable version for hosting outside Claude: dist-pwa/ ----
const VERSION = '3.0.0-' + Date.now().toString(36);
const pwaHead = [
  '<link rel="manifest" href="manifest.webmanifest">',
  '<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)">',
  '<meta name="theme-color" content="#171b22" media="(prefers-color-scheme: dark)">',
  '<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">',
  '<link rel="apple-touch-icon" href="apple-touch-icon.png">',
  '<meta name="mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-title" content="Songgiggin">'
].join('\n');
const pwaBoot = `<script>
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
}
// Ask the browser not to clear the songs when the phone runs low on space.
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
</script>`;
const pwaHtml = html.replace('<title>Songgiggin</title>', () => '<title>Songgiggin</title>\n' + pwaHead)
  .replace('</body>', () => pwaBoot + '\n</body>');
const pdir = path.join(__dirname, 'dist-pwa');
fs.rmSync(pdir, { recursive: true, force: true });
fs.mkdirSync(pdir, { recursive: true });
fs.writeFileSync(path.join(pdir, 'index.html'), pwaHtml);
fs.writeFileSync(path.join(pdir, 'sw.js'), fs.readFileSync(path.join(__dirname, 'pwa', 'sw.js'), 'utf8').replace('/*@VERSION@*/', VERSION));
['manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'].forEach(f =>
  fs.copyFileSync(path.join(__dirname, 'pwa', f), path.join(pdir, f)));
console.log('built dist-pwa/ (' + VERSION + ')');
