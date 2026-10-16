import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

const root = await realpath(fileURLToPath(new URL('.', import.meta.url)));
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.gltf': 'model/gltf+json', '.glb': 'model/gltf-binary', '.bin': 'application/octet-stream',
};

function insideRoot(file) {
  const path = relative(root, file);
  return path !== '..' && !path.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) && !isAbsolute(path);
}

function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = Number(match[1]);
  const last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  if (!match[1]) return last > 0 ? { start: Math.max(0, size - last), end: size - 1 } : null;
  const end = match[2] ? Math.min(last, size - 1) : size - 1;
  return first < size && first <= end ? { start: first, end } : null;
}

const server = createServer(async (request, response) => {
  response.setHeader('Server', 'beijian-site-v5');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD', 'Content-Length': 0 });
    response.end();
    return;
  }
  try {
    const route = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    if (/[\\\0:]/.test(route)) throw new Error('Invalid path');
    let file = resolve(root, route.replace(/^\/+/, ''));
    if (!insideRoot(file)) throw new Error('Outside root');
    let info = await stat(file);
    if (info.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file);
    }
    file = await realpath(file);
    if (!insideRoot(file) || !info.isFile()) throw new Error('Not a file');
    const headers = {
      'Content-Type': mime[extname(file).toLowerCase()] || 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'Content-Length': info.size,
    };
    let range;
    if (request.headers.range !== undefined) {
      range = byteRange(request.headers.range, info.size);
      if (!range) {
        response.writeHead(416, { ...headers, 'Content-Range': `bytes */${info.size}`, 'Content-Length': 0 });
        response.end();
        return;
      }
      headers['Content-Range'] = `bytes ${range.start}-${range.end}/${info.size}`;
      headers['Content-Length'] = range.end - range.start + 1;
    }
    response.writeHead(range ? 206 : 200, headers);
    if (request.method === 'HEAD') response.end();
    else await pipeline(createReadStream(file, range), response);
  } catch {
    if (response.headersSent) response.destroy();
    else {
      response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Content-Length': 9 });
      response.end(request.method === 'HEAD' ? undefined : 'Not found');
    }
  }
});

if (process.argv.includes('--check')) {
  const { strict: assert } = await import('node:assert');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/server.mjs`;
  try {
    const whole = await fetch(url);
    const bytes = Buffer.from(await whole.arrayBuffer());
    assert.equal(whole.status, 200);
    assert.equal(whole.headers.get('server'), 'beijian-site-v5');
    assert.equal(whole.headers.get('accept-ranges'), 'bytes');
    const head = await fetch(url, { method: 'HEAD' });
    assert.equal(Number(head.headers.get('content-length')), bytes.length);
    assert.equal((await head.arrayBuffer()).byteLength, 0);
    for (const [range, start, end] of [['bytes=0-9', 0, 9], ['bytes=10-', 10, bytes.length - 1], ['bytes=-7', bytes.length - 7, bytes.length - 1], ['bytes=0-999999', 0, bytes.length - 1]]) {
      const result = await fetch(url, { headers: { Range: range } });
      assert.equal(result.status, 206);
      assert.equal(result.headers.get('content-range'), `bytes ${start}-${end}/${bytes.length}`);
      assert.deepEqual(Buffer.from(await result.arrayBuffer()), bytes.subarray(start, end + 1));
    }
    for (const range of ['bytes=-0', 'bytes=9-2', `bytes=${bytes.length}-`, 'bytes=0-1,3-4', 'invalid']) {
      const result = await fetch(url, { headers: { Range: range } });
      assert.equal(result.status, 416);
      assert.equal(result.headers.get('content-range'), `bytes */${bytes.length}`);
      assert.equal((await result.arrayBuffer()).byteLength, 0);
    }
    assert.equal((await fetch(new URL('/%2e%2e%5cserver.mjs', url))).status, 404);
    assert.equal((await fetch(new URL('/missing-file', url))).status, 404);
    assert.equal((await fetch(url, { method: 'POST' })).status, 405);
    console.log('Preview checks passed: GET, HEAD, ranges, invalid ranges, paths, and methods.');
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
} else {
  const port = Number(process.env.PORT || 4173);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  server.listen(port, '127.0.0.1', () => console.log(`碑间 V6 预览：http://127.0.0.1:${port}/`));
}
