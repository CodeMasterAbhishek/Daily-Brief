import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const PUBLIC_REAL_DIR = fs.existsSync(PUBLIC_DIR) ? fs.realpathSync(PUBLIC_DIR) : PUBLIC_DIR;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
};

function isInsidePublicDir(targetPath, rootDir = PUBLIC_DIR) {
  return targetPath === rootDir || targetPath.startsWith(rootDir + path.sep);
}

function sendError(res, statusCode, message, extraHeaders = {}) {
  if (res.headersSent) {
    res.end();
    return;
  }
  const body = `${message}\n`;
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : body);
}

/**
 * Resolve a request URL pathname safely inside `PUBLIC_DIR`.
 * Returns `{ status, filePath, stat }` or `{ status, error }`.
 */
export async function resolvePublicAsset(requestUrl) {
  const rawPath = (requestUrl || '/').split('?')[0].split('#')[0];

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    return { status: 400, error: 'Bad Request' };
  }

  if (decodedPath.includes('\0')) {
    return { status: 400, error: 'Bad Request' };
  }

  const normalizedSlashes = decodedPath.replace(/\\/g, '/');
  const relativePath = normalizedSlashes.replace(/^\/+/, '');
  const resolved = path.resolve(PUBLIC_DIR, relativePath);

  if (!isInsidePublicDir(resolved, PUBLIC_DIR)) {
    return { status: 403, error: 'Forbidden' };
  }

  let candidate = resolved;
  let stat;
  try {
    stat = await fsp.stat(candidate);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
      return { status: 404, error: 'Not Found' };
    }
    throw err;
  }

  if (stat.isDirectory()) {
    candidate = path.join(candidate, 'index.html');
    if (!isInsidePublicDir(candidate, PUBLIC_DIR)) {
      return { status: 403, error: 'Forbidden' };
    }
    try {
      stat = await fsp.stat(candidate);
    } catch (err) {
      if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR')) {
        return { status: 404, error: 'Not Found' };
      }
      throw err;
    }
  }

  if (!stat.isFile()) {
    return { status: 404, error: 'Not Found' };
  }

  const realTarget = await fsp.realpath(candidate);
  if (!isInsidePublicDir(realTarget, PUBLIC_REAL_DIR)) {
    return { status: 403, error: 'Forbidden' };
  }

  return { status: 200, filePath: realTarget, stat };
}

/**
 * Create a local HTTP static file server rooted at `PUBLIC_DIR`.
 */
export function createStaticServer() {
  return http.createServer(async (req, res) => {
    const method = req.method || 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      sendError(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
      return;
    }

    let resolved;
    try {
      resolved = await resolvePublicAsset(req.url);
    } catch {
      sendError(res, 500, 'Internal Server Error');
      return;
    }

    if (resolved.status !== 200) {
      sendError(res, resolved.status, resolved.error);
      return;
    }

    const ext = path.extname(resolved.filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    const headers = {
      'Content-Type': contentType,
      'Content-Length': resolved.stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };

    if (method === 'HEAD') {
      res.writeHead(200, headers);
      res.end();
      return;
    }

    const stream = fs.createReadStream(resolved.filePath);
    stream.on('open', () => {
      if (!res.headersSent) {
        res.writeHead(200, headers);
      }
    });
    stream.on('error', () => {
      if (!res.headersSent) {
        sendError(res, 500, 'Internal Server Error');
      } else {
        res.destroy();
      }
    });
    res.on('close', () => {
      if (!stream.destroyed) {
        stream.destroy();
      }
    });
    stream.pipe(res);
  });
}

function getListenConfig() {
  const host = process.env.HOST || '127.0.0.1';
  const rawPort = process.env.PORT;
  const parsedPort = rawPort === undefined || rawPort === '' ? 3000 : Number(rawPort);
  const port = Number.isInteger(parsedPort) && parsedPort >= 0 && parsedPort <= 65535 ? parsedPort : 3000;
  return { host, port };
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  (process.platform === 'win32'
    ? path.resolve(process.argv[1]).toLowerCase() === __filename.toLowerCase()
    : path.resolve(process.argv[1]) === __filename);

if (isEntrypoint) {
  const { host, port } = getListenConfig();
  const server = createStaticServer();

  server.on('error', (err) => {
    console.error(`Failed to start server on ${host}:${port}:`, err.message);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    const addr = server.address();
    const actualPort = addr && typeof addr === 'object' ? addr.port : port;
    console.log(`Serving public/ at http://${host}:${actualPort}`);
  });

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
