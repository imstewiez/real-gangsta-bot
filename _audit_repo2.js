const fs = require('fs');

function getRepoMethods(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const methods = [];
  const re = /async\s+function\s+(\w+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    methods.push(m[1]);
  }
  return methods;
}

const repoPath = 'C:/Users/steve/Documents/real-gangsta-bot/src/repositories/saida.js';
const repoMethods = getRepoMethods(repoPath);

const servicePath = 'C:/Users/steve/Documents/real-gangsta-bot/src/saidas/saidaService.js';
const content = fs.readFileSync(servicePath, 'utf8');
const calls = content.matchAll(/this\.saidaRepo\.(\w+)/g);
const seen = new Set();
for (const m of calls) {
  const method = m[1];
  if (seen.has(method)) continue;
  seen.add(method);
  if (!repoMethods.includes(method)) {
    console.log('saidaService.js: this.saidaRepo.' + method + ' -> NOT FOUND in repository');
  }
}
