const fs = require('fs');
const path = require('path');
const saidasDir = 'C:/Users/steve/Documents/real-gangsta-bot/src/saidas';
const files = fs.readdirSync(saidasDir).filter(f => f.endsWith('.js'));
for (const file of files) {
  const content = fs.readFileSync(path.join(saidasDir, file), 'utf8');
  const requires = content.match(/require\(['""""]([^'""""]+)['""""]\)/g) || [];
  for (const req of requires) {
    const m = req.match(/require\(['""""]([^'""""]+)['""""]\)/);
    if (!m) continue;
    const modPath = m[1];
    if (modPath.startsWith('.') && !modPath.endsWith('.json')) {
      const resolved = path.resolve(saidasDir, modPath);
      const exists = fs.existsSync(resolved) || fs.existsSync(resolved + '.js') || fs.existsSync(resolved + '.json');
      if (!exists) {
        console.log(file + ': ' + modPath + ' -> MISSING');
      }
    }
  }
}
