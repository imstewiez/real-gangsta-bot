const fs = require('fs');
const path = require('path');

function checkFile(baseDir, relPath) {
  const resolved = path.resolve(baseDir, relPath);
  if (fs.existsSync(resolved) || fs.existsSync(resolved + '.js') || fs.existsSync(resolved + '.json')) return true;
  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory() && fs.existsSync(path.join(resolved, 'index.js')))
    return true;
  return false;
}

const routerDir = 'C:/Users/steve/Documents/real-gangsta-bot/src/app/discord/routers';
const baseDir = 'C:/Users/steve/Documents/real-gangsta-bot/src';

const files = ['buttons.js', 'selects.js', 'modals.js', 'userSelects.js'];
for (const file of files) {
  const content = fs.readFileSync(path.join(routerDir, file), 'utf8');
  const re = /require\(['\"]([^'\"]+)['\"]\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const modPath = m[1];
    if (modPath.startsWith('.')) {
      const resolved = path.resolve(routerDir, modPath);
      const exists = fs.existsSync(resolved) || fs.existsSync(resolved + '.js') || fs.existsSync(resolved + '.json');
      if (!exists) {
        console.log(file + ': MISSING ' + modPath);
      }
    }
  }
}
