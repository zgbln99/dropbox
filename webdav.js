'use strict';

/**
 * Minimal WebDAV endpoint mounted at /dav.
 *
 * Next.js App Router route handlers cannot serve non-standard HTTP methods
 * (PROPFIND, MKCOL, MOVE, ...), so WebDAV is handled here by the custom
 * server. This module is a thin protocol translator: it authenticates with
 * the admin credentials, then proxies operations to the existing Next.js
 * JSON API over loopback — keeping all Dropbox logic in one place.
 */

const crypto = require('crypto');
const { Readable } = require('stream');

const MIME = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', pdf: 'application/pdf',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
  txt: 'text/plain', json: 'application/json', zip: 'application/zip',
};

function mimeFor(name) {
  const dot = name.lastIndexOf('.');
  return (dot >= 0 && MIME[name.slice(dot + 1).toLowerCase()]) || 'application/octet-stream';
}

function xmlEscape(s) {
  return String(s).replace(/[<>&'"]/g, (c) =>
    ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]),
  );
}

function safeEqual(a, b) {
  const ab = Buffer.from(a || '');
  const bb = Buffer.from(b || '');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/** Check HTTP Basic auth against the admin credentials. */
function checkAuth(req) {
  const header = req.headers['authorization'];
  if (!header || !header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const idx = decoded.indexOf(':');
  if (idx < 0) return false;
  return (
    safeEqual(decoded.slice(0, idx), process.env.ADMIN_USER || '') &&
    safeEqual(decoded.slice(idx + 1), process.env.ADMIN_PASSWORD || '')
  );
}

function decodeSegments(p) {
  return p
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    })
    .join('/');
}

function encodeSegments(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}

/** Translate a /dav URL path into a Dropbox path ('/' for the root). */
function davToDropbox(urlPath) {
  let p = (urlPath || '/').split('?')[0];
  if (p === '/dav' || p === '/dav/') return '/';
  if (p.startsWith('/dav')) p = p.slice(4);
  p = decodeSegments(p);
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  if (!p.startsWith('/')) p = '/' + p;
  return p;
}

/** Build a WebDAV href for a Dropbox path. */
function davHref(dropboxPath, isDir) {
  let h = dropboxPath === '/' ? '/dav/' : '/dav' + encodeSegments(dropboxPath);
  if (isDir && !h.endsWith('/')) h += '/';
  return h;
}

/** Call the loopback Next.js JSON API, forwarding the admin Basic auth. */
async function apiCall(port, authHeader, method, path, body) {
  const headers = { Authorization: authHeader };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
}

function propResponse(entry) {
  const isDir = entry.tag === 'folder';
  const modified = entry.modified ? new Date(entry.modified) : new Date();
  const lastMod = modified.toUTCString();
  const created = modified.toISOString();
  const name = entry.name || entry.path.split('/').filter(Boolean).pop() || '/';
  return (
    '<D:response>' +
    `<D:href>${xmlEscape(davHref(entry.path, isDir))}</D:href>` +
    '<D:propstat><D:prop>' +
    `<D:displayname>${xmlEscape(name)}</D:displayname>` +
    `<D:resourcetype>${isDir ? '<D:collection/>' : ''}</D:resourcetype>` +
    `<D:getlastmodified>${lastMod}</D:getlastmodified>` +
    `<D:creationdate>${created}</D:creationdate>` +
    (isDir
      ? ''
      : `<D:getcontentlength>${entry.size || 0}</D:getcontentlength>` +
        `<D:getcontenttype>${mimeFor(name)}</D:getcontenttype>`) +
    '</D:prop><D:status>HTTP/1.1 200 OK</D:status></D:propstat>' +
    '</D:response>'
  );
}

function send(res, status, body, headers) {
  res.writeHead(status, headers || {});
  res.end(body || '');
}

async function handlePropfind(req, res, port, auth, dropboxPath) {
  const depth = req.headers['depth'] === undefined ? '1' : String(req.headers['depth']);

  const statRes = await apiCall(port, auth, 'POST', '/api/files/stat', { path: dropboxPath });
  if (statRes.status === 404) return send(res, 404, 'Not Found');
  if (!statRes.ok) return send(res, 502, 'Upstream error');
  const { entry } = await statRes.json();

  let xml =
    '<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">' +
    propResponse(entry);

  if (entry.tag === 'folder' && depth !== '0') {
    const listRes = await apiCall(port, auth, 'POST', '/api/files/list', { path: dropboxPath });
    if (listRes.ok) {
      const { entries } = await listRes.json();
      for (const child of entries) xml += propResponse(child);
    }
  }
  xml += '</D:multistatus>';
  send(res, 207, xml, { 'Content-Type': 'application/xml; charset=utf-8' });
}

async function handleGet(req, res, port, auth, dropboxPath, headOnly) {
  const statRes = await apiCall(port, auth, 'POST', '/api/files/stat', { path: dropboxPath });
  if (statRes.status === 404) return send(res, 404, 'Not Found');
  if (!statRes.ok) return send(res, 502, 'Upstream error');
  const { entry } = await statRes.json();
  if (entry.tag === 'folder') return send(res, 405, 'Cannot GET a collection');

  const headers = {
    'Content-Type': mimeFor(entry.name),
    'Content-Length': String(entry.size || 0),
  };
  if (headOnly) return send(res, 200, '', headers);

  // The download route redirects to a temporary Dropbox link; follow it.
  const dl = await fetch(
    `http://127.0.0.1:${port}/api/files/download?path=${encodeURIComponent(dropboxPath)}`,
    { headers: { Authorization: auth } },
  );
  if (!dl.ok || !dl.body) return send(res, 502, 'Download failed');
  res.writeHead(200, headers);
  Readable.fromWeb(dl.body).pipe(res);
}

async function handlePut(req, res, port, auth, dropboxPath) {
  // Stream the request body straight through to the upload endpoint so large
  // files are never buffered in memory. Forwarding Content-Length lets the
  // upload route pick the single-request path for small files.
  const headers = { Authorization: auth, 'Content-Type': 'application/octet-stream' };
  if (req.headers['content-length']) {
    headers['Content-Length'] = req.headers['content-length'];
  }
  const up = await fetch(
    `http://127.0.0.1:${port}/api/files/upload?path=${encodeURIComponent(dropboxPath)}`,
    { method: 'POST', headers, body: req, duplex: 'half' },
  );
  if (up.ok) return send(res, 201, 'Created');
  send(res, up.status === 413 ? 413 : 502, 'Upload failed');
}

async function handleSimple(res, upstream, okStatus) {
  if (upstream.ok) return send(res, okStatus, '');
  send(res, upstream.status === 404 ? 404 : 502, 'Operation failed');
}

/** Entry point invoked by the custom server for any /dav request. */
async function handleWebDav(req, res, port) {
  if (!checkAuth(req)) {
    return send(res, 401, 'Authentication required', {
      'WWW-Authenticate': 'Basic realm="ZGBLN DRIVE"',
    });
  }

  const auth = req.headers['authorization'];
  const method = (req.method || 'GET').toUpperCase();
  const dropboxPath = davToDropbox(req.url);

  switch (method) {
    case 'OPTIONS':
      return send(res, 200, '', {
        DAV: '1, 2',
        'MS-Author-Via': 'DAV',
        Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, PROPFIND, PROPPATCH, MKCOL, MOVE, COPY, LOCK, UNLOCK',
      });

    case 'PROPFIND':
      return handlePropfind(req, res, port, auth, dropboxPath);

    case 'PROPPATCH': {
      // Windows sets timestamps on upload; acknowledge without persisting.
      const xml =
        '<?xml version="1.0" encoding="utf-8"?>\n<D:multistatus xmlns:D="DAV:">' +
        `<D:response><D:href>${xmlEscape(davHref(dropboxPath, false))}</D:href>` +
        '<D:propstat><D:prop/><D:status>HTTP/1.1 200 OK</D:status></D:propstat>' +
        '</D:response></D:multistatus>';
      return send(res, 207, xml, { 'Content-Type': 'application/xml; charset=utf-8' });
    }

    case 'GET':
      return handleGet(req, res, port, auth, dropboxPath, false);

    case 'HEAD':
      return handleGet(req, res, port, auth, dropboxPath, true);

    case 'PUT':
      return handlePut(req, res, port, auth, dropboxPath);

    case 'DELETE':
      return handleSimple(
        res,
        await apiCall(port, auth, 'POST', '/api/files/delete', { path: dropboxPath }),
        204,
      );

    case 'MKCOL':
      return handleSimple(
        res,
        await apiCall(port, auth, 'POST', '/api/files/mkdir', { path: dropboxPath }),
        201,
      );

    case 'MOVE':
    case 'COPY': {
      const destHeader = req.headers['destination'];
      if (!destHeader) return send(res, 400, 'Missing Destination header');
      let destPath;
      try {
        destPath = davToDropbox(new URL(destHeader).pathname);
      } catch {
        destPath = davToDropbox(destHeader);
      }
      const endpoint = method === 'MOVE' ? '/api/files/move' : '/api/files/copy';
      return handleSimple(
        res,
        await apiCall(port, auth, 'POST', endpoint, { from: dropboxPath, to: destPath }),
        201,
      );
    }

    case 'LOCK': {
      // Faux locking: Windows requires a lock token to allow writes.
      const token = `opaquelocktoken:${crypto.randomUUID()}`;
      const xml =
        '<?xml version="1.0" encoding="utf-8"?>\n<D:prop xmlns:D="DAV:"><D:lockdiscovery>' +
        '<D:activelock><D:locktype><D:write/></D:locktype>' +
        '<D:lockscope><D:exclusive/></D:lockscope><D:depth>infinity</D:depth>' +
        '<D:timeout>Second-3600</D:timeout>' +
        `<D:locktoken><D:href>${token}</D:href></D:locktoken>` +
        '</D:activelock></D:lockdiscovery></D:prop>';
      return send(res, 200, xml, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Lock-Token': `<${token}>`,
      });
    }

    case 'UNLOCK':
      return send(res, 204, '');

    default:
      return send(res, 405, 'Method Not Allowed');
  }
}

module.exports = { handleWebDav };
