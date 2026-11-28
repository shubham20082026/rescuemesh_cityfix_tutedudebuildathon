'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
require('./build.cjs');
const html = fs.readFileSync(path.join(__dirname, 'dist/index.html'));
const port = Number(process.env.PORT || 3000);
http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    res.writeHead(200, {'Content-Type':'text/html; charset=utf-8'});
    res.end(html);
  } else { res.writeHead(404); res.end('Not found'); }
}).listen(port, '127.0.0.1', () => console.log('RescueMesh: http://localhost:' + port));
