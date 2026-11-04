const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('public/game.html', 'utf8');
for (const [, code] of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(code);
if (!html.includes('id="launchGameBtn"') || !html.includes('window.snakeSite')) throw new Error('Game entry point missing');
fs.mkdirSync('build', {recursive:true});
fs.copyFileSync('public/game.html','build/index.html');
fs.copyFileSync('public/favicon.svg','build/favicon.svg');
console.log('Static game build validated: index.html, favicon.svg');
