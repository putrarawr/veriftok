const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const analyzeHandler = require('./api/analyze.js');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8'
};

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // Route API /api/analyze
  if (url.pathname === '/api/analyze') {
    let bodyText = '';
    req.on('data', (chunk) => { bodyText += chunk; });
    req.on('end', async () => {
      try {
        req.body = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        req.body = {};
      }

      res.status = function (code) {
        res.statusCode = code;
        return res;
      };
      res.send = function (payload) {
        if (!res.headersSent) {
          if (typeof payload === 'object') {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
          } else {
            res.end(payload);
          }
        }
      };

      try {
        await analyzeHandler(req, res);
      } catch (err) {
        console.error('API Error:', err);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ code: 'SERVER_ERROR', message: 'Terjadi kesalahan pada server.' }));
        }
      }
    });
    return;
  }

  if (url.pathname === '/api/trending' && req.method === 'GET') {
    const fs = require('fs');
    const TRENDING_FILE = require('path').join(require('os').tmpdir(), 'veriftok-trending.json');
    let data = [];
    try { data = JSON.parse(fs.readFileSync(TRENDING_FILE, 'utf8')); } catch { data = []; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
    return;
  }

  // Static files server
  let filePath = path.join(__dirname, url.pathname === '/' ? 'index.html' : url.pathname);

  if (!filePath.startsWith(__dirname)) {
    res.statusCode = 403;
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.statusCode = 200;
    res.setHeader('Content-Type', contentType);
    if (ext === '.html') {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (['.js', '.css', '.webmanifest'].includes(ext)) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    }
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`\n==================================================`);
  console.log(`  VerifTok Local Server Aktif!`);
  console.log(`--------------------------------------------------`);
  console.log(`  • Laptop / Komputer: http://localhost:${PORT}`);
  if (ips.length > 0) {
    console.log(`  • Buka di HP (Satu Wi-Fi):`);
    ips.forEach((ip) => {
      console.log(`    http://${ip}:${PORT}`);
    });
  } else {
    console.log(`  • Sambungkan HP & Laptop ke Wi-Fi yang sama untuk akses HP.`);
  }
  console.log(`==================================================\n`);
});
