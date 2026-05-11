const fs = require('fs');

function extractRoutes(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const routes = [];

  const prefixRe = /prefix\\(['""""]([^'""""]+)['""""]\\s*,/g;
  let m;
  while ((m = prefixRe.exec(content)) !== null) {
    routes.push({ type: 'prefix', pattern: m[1] });
  }

  const exactRe = /exact\\(['""""]([^'""""]+)['""""]\\s*,/g;
  while ((m = exactRe.exec(content)) !== null) {
    routes.push({ type: 'exact', pattern: m[1] });
  }

  return routes;
}

function findConflicts(routes) {
  const conflicts = [];
  for (let i = 0; i < routes.length; i++) {
    for (let j = i + 1; j < routes.length; j++) {
      const a = routes[i];
      const b = routes[j];

      if (a.type === 'prefix' && b.type === 'prefix') {
        if (a.pattern.startsWith(b.pattern) || b.pattern.startsWith(a.pattern)) {
          conflicts.push(a.pattern + ' vs ' + b.pattern);
        }
      } else if (a.type === 'exact' && b.type === 'prefix') {
        if (a.pattern.startsWith(b.pattern)) {
          conflicts.push('exact:' + a.pattern + ' vs prefix:' + b.pattern);
        }
      } else if (a.type === 'prefix' && b.type === 'exact') {
        if (b.pattern.startsWith(a.pattern)) {
          conflicts.push('prefix:' + a.pattern + ' vs exact:' + b.pattern);
        }
      } else if (a.type === 'exact' && b.type === 'exact' && a.pattern === b.pattern) {
        conflicts.push('duplicate exact: ' + a.pattern);
      }
    }
  }
  return conflicts;
}

const files = [
  'C:/Users/steve/Documents/real-gangsta-bot/src/app/discord/routers/buttons.js',
  'C:/Users/steve/Documents/real-gangsta-bot/src/app/discord/routers/selects.js',
  'C:/Users/steve/Documents/real-gangsta-bot/src/app/discord/routers/modals.js',
];

for (const file of files) {
  const routes = extractRoutes(file);
  const conflicts = findConflicts(routes);
  console.log('\\n=== ' + file.split('/').pop() + ' ===');
  if (conflicts.length) {
    for (const c of conflicts) {
      console.log('CONFLICT: ' + c);
    }
  } else {
    console.log('No conflicts found');
  }
}
