const fs = require('fs');
const content = fs.readFileSync('C:/Users/steve/Documents/real-gangsta-bot/src/saidas/saidaEngine.js', 'utf8');
const mojibakeChars = [
  '\u00c3',
  '\u00c2',
  '\u00a3',
  '\u00a7',
  '\u00b5',
  '\u2018',
  '\u2019',
  '\u201c',
  '\u201d',
  '\u2014',
  '\u2013',
];
for (const ch of mojibakeChars) {
  if (content.includes(ch)) {
    const idx = content.indexOf(ch);
    console.log(
      'Found ' +
        ch.charCodeAt(0) +
        ' at ' +
        idx +
        ': ' +
        JSON.stringify(content.substring(Math.max(0, idx - 10), idx + 10))
    );
  }
}
