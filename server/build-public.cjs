const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'dist', 'standalone');
const CLIENT_SCRIPTS = new Set(['iletisim.js', 'privacy-manager.js', 'yardim.js']);
const ASSET_TYPES = new Set(['.css', '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.woff', '.woff2']);

// Never use the repository itself as a document root: it contains API source/config.
function buildPublic() {
  fs.rmSync(PUBLIC, { recursive: true, force: true });
  fs.mkdirSync(PUBLIC, { recursive: true });
  let count = 0;
  function copyFile(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
    count++;
  }
  function copyAssets(directory) {
    const source = path.join(ROOT, directory);
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const relative = path.join(directory, entry.name);
      if (entry.isDirectory()) copyAssets(relative);
      else if (entry.isFile() && ASSET_TYPES.has(path.extname(entry.name))) {
        copyFile(path.join(ROOT, relative), path.join(PUBLIC, relative));
      }
    }
  }
  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isFile() || entry.name.startsWith('.')) continue;
    if (['.html', '.css'].includes(path.extname(entry.name)) || CLIENT_SCRIPTS.has(entry.name)) {
      copyFile(path.join(ROOT, entry.name), path.join(PUBLIC, entry.name));
    }
  }
  for (const directory of ['images', 'css']) copyAssets(directory);
  if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) throw new Error('Homepage missing.');
  return { directory: PUBLIC, count };
}

if (require.main === module) {
  const { count } = buildPublic();
  console.log(`Prepared ${count} public files in dist/standalone.`);
}
module.exports = { buildPublic, PUBLIC };
