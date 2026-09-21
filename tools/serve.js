// Servidor estatico minimo para desarrollo. Sin dependencias.
//
//   node tools/serve.js [puerto]
//
// Existe por dos motivos: la aplicacion usa modulos ES y un Web Worker, que el
// navegador bloquea sobre file://, y porque el tipo MIME de los .js tiene que ser
// exacto o el navegador se niega a cargarlos como modulo.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2]) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.csv': 'text/csv; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  // Carpetas con index.html (p. ej. /app/ → /app/index.html).
  if (rel.endsWith('/')) rel += 'index.html';
  else {
    const bare = path.join(ROOT, rel);
    try {
      if (fs.existsSync(bare) && fs.statSync(bare).isDirectory()) rel = rel.replace(/\/?$/, '/') + 'index.html';
    } catch { /* seguir con el path pedido */ }
  }
  const target = path.join(ROOT, rel);

  // Nadie sale de la carpeta del proyecto.
  if (!target.startsWith(ROOT)) {
    res.writeHead(403).end('403');
    return;
  }
  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404: ' + rel);
      return;
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      // La MISMA politica que se sirve en produccion (ver vercel.json). Tenerla solo
      // alli significaria descubrir que rompe algo el dia del despliegue.
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; style-src-attr 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'; upgrade-insecure-requests",
      // En desarrollo nunca se cachea: un .js viejo en cache confunde muchisimo.
      'Cache-Control': 'no-store, must-revalidate',
    });
    res.end(data);
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${PORT} ya esta ocupado. Prueba: node tools/serve.js ${PORT + 1}`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Orometra en http://localhost:${PORT}`);
  console.log(`sirviendo ${ROOT}`);
  console.log('Ctrl+C para parar.');
});
