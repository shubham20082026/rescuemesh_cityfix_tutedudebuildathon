'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(root, 'data.json'), 'utf8'));
if (data.status === 'ready') require('./engine.js').validateData(data);
else if (data.status !== 'missing') throw new Error('Unrecognized dataset status');
let html = fs.readFileSync(path.join(root, 'index.template.html'), 'utf8');
for (const [key, file] of [['CSS', 'styles.css'], ['ENGINE', 'engine.js'], ['APP', 'app.js']]) {
  const marker = '/*__' + key + '__*/';
  if (!html.includes(marker)) throw new Error('Missing template marker: ' + key);
  html = html.replace(marker, () => fs.readFileSync(path.join(root, file), 'utf8'));
}
html = html.replace('/*__DATA__*/', () => JSON.stringify(data).replace(/</g, '\\u003c'));
fs.mkdirSync(path.join(root, 'dist'), {recursive:true});
fs.writeFileSync(path.join(root, 'dist', 'index.html'), html);
fs.writeFileSync(path.join(root, 'RescueMesh.html'), html);
console.log('Built dist/index.html and RescueMesh.html. Dataset status:', data.status);
if (data.status !== 'ready') console.warn('No geographic dataset bundled. Generate data.json and rebuild, or import it in the app.');
