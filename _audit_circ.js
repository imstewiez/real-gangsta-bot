const fs = require('fs');
const path = require('path');

function findRequires(filePath, visited, chain) {
  if (visited.has(filePath)) {
    if (chain.includes(filePath)) {
      const cycle = chain.slice(chain.indexOf(filePath)).concat(filePath);
      console.log('CIRCULAR: ' + cycle.map(p => path.basename(p)).join(' -> '));
    }
    return;
  }
  visited.add(filePath);
  chain.push(filePath);

  const content = fs.readFileSync(filePath, 'utf8');
  const dir = path.dirname(filePath);
  const reqRe = /require\\(['""""]([^'""""]+)['""""]\\)/g;
  let m;
  while ((m = reqRe.exec(content)) !== null) {
    const modPath = m[1];
    if (modPath.startsWith('.')) {
      const resolved = path.resolve(dir, modPath);
      const exts = ['', '.js', '.json'];
      let realPath = null;
      for (const ext of exts) {
        if (fs.existsSync(resolved + ext)) {
          realPath = resolved + ext;
          break;
        }
        if (
          fs.existsSync(resolved) &&
          fs.statSync(resolved).isDirectory() &&
          fs.existsSync(path.join(resolved, 'index.js'))
        ) {
          realPath = path.join(resolved, 'index.js');
          break;
        }
      }
      if (realPath && realPath.includes('/saidas/')) {
        findRequires(realPath, new Set(visited), [...chain]);
      }
    }
  }
}

const saidasDir = 'C:/Users/steve/Documents/real-gangsta-bot/src/saidas';
const files = fs.readdirSync(saidasDir).filter(f => f.endsWith('.js'));
for (const file of files) {
  findRequires(path.join(saidasDir, file), new Set(), []);
}
