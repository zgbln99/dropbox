'use strict';

/**
 * Custom Node server for jrjr-drive.
 *
 * It wraps the Next.js app and additionally serves the WebDAV endpoint at
 * /dav (Next.js route handlers cannot serve WebDAV's custom HTTP methods).
 */

const { createServer } = require('http');
const { parse } = require('url');
const fs = require('fs');
const path = require('path');
const next = require('next');
const { handleWebDav } = require('./webdav');

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);
const hostname = process.env.HOSTNAME || '0.0.0.0';

// Ensure runtime data directories exist (SQLite db + cached previews).
for (const dir of ['data', 'data/previews']) {
  fs.mkdirSync(path.join(process.cwd(), dir), { recursive: true });
}

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    const url = req.url || '/';
    if (url === '/dav' || url.startsWith('/dav/') || url.startsWith('/dav?')) {
      handleWebDav(req, res, port).catch((err) => {
        console.error('[webdav]', err);
        if (!res.headersSent) res.writeHead(500);
        res.end('Internal Server Error');
      });
      return;
    }
    handle(req, res, parse(url, true));
  });

  server.listen(port, hostname, () => {
    console.log(`jrjr-drive ready on http://${hostname}:${port} (dev=${dev})`);
  });
});
