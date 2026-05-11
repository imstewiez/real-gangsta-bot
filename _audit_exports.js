const fs = require('fs');

function getExports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/module\.exports\s*=\s*\{([^}]+)\}/s);
  if (!match) return [];
  return match[1]
    .split(',')
    .map(s => s.trim().split(':')[0].trim())
    .filter(Boolean);
}

function getImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = [];
  const re = /require\(['""""]([^'""""]+)['""""]\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function getDestructuredImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const results = [];
  const re = /const\s*\{([^}]+)\}\s*=\s*require\(['""""]([^'""""]+)['""""]\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const names = m[1]
      .split(',')
      .map(s => s.trim().split(':')[0].trim())
      .filter(Boolean);
    results.push({ source: m[2], names });
  }
  return results;
}

const saidasDir = 'C:/Users/steve/Documents/real-gangsta-bot/src/saidas';
const routersDir = 'C:/Users/steve/Documents/real-gangsta-bot/src/app/discord/routers';

const saidaHandlersExports = getExports(saidasDir + '/saidaHandlers.js');
const saidaSessionExports = getExports(saidasDir + '/saidaSession.js');
const saidaIndividualExports = getExports(saidasDir + '/saidaIndividualResult.js');
const saidaWizardExports = getExports(saidasDir + '/saidaSettlementWizard.js');
const saidaStatsExports = getExports(saidasDir + '/saidaStatsHandlers.js');

const routerFiles = ['buttons.js', 'selects.js', 'modals.js', 'userSelects.js'];

for (const rf of routerFiles) {
  const content = fs.readFileSync(routersDir + '/' + rf, 'utf8');

  // Check destructured imports from saidas
  const destructured = getDestructuredImports(routersDir + '/' + rf);
  for (const imp of destructured) {
    if (imp.source.includes('saidas/saidaHandlers')) {
      for (const name of imp.names) {
        if (!saidaHandlersExports.includes(name)) {
          console.log(rf + ': IMPORT NOT EXPORTED by saidaHandlers: ' + name);
        }
      }
    }
    if (imp.source.includes('saidas/saidaSession')) {
      for (const name of imp.names) {
        if (!saidaSessionExports.includes(name)) {
          console.log(rf + ': IMPORT NOT EXPORTED by saidaSession: ' + name);
        }
      }
    }
    if (imp.source.includes('saidas/saidaIndividualResult')) {
      for (const name of imp.names) {
        if (!saidaIndividualExports.includes(name)) {
          console.log(rf + ': IMPORT NOT EXPORTED by saidaIndividualResult: ' + name);
        }
      }
    }
    if (imp.source.includes('saidas/saidaSettlementWizard')) {
      for (const name of imp.names) {
        if (!saidaWizardExports.includes(name)) {
          console.log(rf + ': IMPORT NOT EXPORTED by saidaSettlementWizard: ' + name);
        }
      }
    }
    if (imp.source.includes('saidas/saidaStatsHandlers')) {
      for (const name of imp.names) {
        if (!saidaStatsExports.includes(name)) {
          console.log(rf + ': IMPORT NOT EXPORTED by saidaStatsHandlers: ' + name);
        }
      }
    }
  }

  // Check whole-module imports with property access (e.g., saidaSession.handleX)
  const wholeImports = content.matchAll(/const\s+(\w+)\s+=\s+require\(['""""]([^'""""]*saidas[^'""""]+)['""""]\)/g);
  for (const m of wholeImports) {
    const varName = m[1];
    const source = m[2];
    const propAccess = content.matchAll(new RegExp(varName + '\\.(\\w+)', 'g'));
    let exportsList = [];
    if (source.includes('saidaHandlers')) exportsList = saidaHandlersExports;
    else if (source.includes('saidaSession')) exportsList = saidaSessionExports;
    else if (source.includes('saidaIndividual')) exportsList = saidaIndividualExports;
    else if (source.includes('saidaSettlementWizard')) exportsList = saidaWizardExports;
    else if (source.includes('saidaStatsHandlers')) exportsList = saidaStatsExports;

    const seen = new Set();
    for (const pm of propAccess) {
      const prop = pm[1];
      if (seen.has(prop)) continue;
      seen.add(prop);
      if (exportsList.length && !exportsList.includes(prop)) {
        console.log(rf + ': PROPERTY ACCESS NOT EXPORTED by ' + path.basename(source) + ': ' + varName + '.' + prop);
      }
    }
  }
}
