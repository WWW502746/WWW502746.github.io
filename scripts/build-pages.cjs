const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const source = path.resolve(__dirname, '..');
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(source, '_stage_pages');
assert(!fs.existsSync(output), 'Choose a new output directory; build-pages does not delete existing files.');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'assets/landing-v5/stream/stream-manifest.json'), 'utf8'));
const streamedStone = /data-stream-manifest="assets\/landing-v5\/mse\/stone\/manifest\.json(?:\?[^\"]*)?"/.test(fs.readFileSync(path.join(source, 'index.html'), 'utf8'));
const originalStream = streamedStone ? JSON.parse(fs.readFileSync(path.join(source, 'assets/landing-v5/mse/stone/manifest.json'), 'utf8')) : null;
assert.equal(manifest.version, 1);
assert(Array.isArray(manifest.videos) && manifest.videos.length > 0);
for (const video of manifest.videos) {
  assert(/^assets\/landing-v5\/[\w.-]+\.mp4$/.test(video.original), 'Invalid original video path.');
  assert(Array.isArray(video.orderedParts) && video.orderedParts.length > 0);
  for (const part of video.orderedParts) assert(/^assets\/landing-v5\/stream\/[\w.-]+\.bin$/.test(part.path), 'Invalid video part path.');
}
const excluded = new Set([
  '.git', '.github', 'scripts', '_stage_pages', 'assets/landing-v5/stream',
  ...(streamedStone ? ['assets/landing-v5/mse/stone'] : []),
  path.relative(source, output).split(path.sep).join('/'),
  ...manifest.videos.map(video => video.original),
]);
let files = 0, bytes = 0;
function copySite(relative = '') {
  fs.mkdirSync(path.join(output, relative), { recursive: true });
  for (const entry of fs.readdirSync(path.join(source, relative), { withFileTypes: true })) {
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (excluded.has(name) || entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) copySite(name);
    else if (entry.isFile()) {
      fs.copyFileSync(path.join(source, name), path.join(output, name));
      files++;
      bytes += fs.statSync(path.join(output, name)).size;
    }
  }
}
copySite();
if (streamedStone) {
  const folder = 'assets/landing-v5/mse/stone';
  fs.mkdirSync(path.join(output, folder), { recursive: true });
  const stream = { ...originalStream, version: 2, packs: [] };
  const readPart = part => {
    assert(/^(?:init\.mp4|\d{3}\.m4s)$/.test(part.src), 'Invalid streamed video part path.');
    const data = fs.readFileSync(path.join(source, folder, part.src));
    assert.equal(data.length, part.bytes);
    assert.equal(crypto.createHash('sha256').update(data).digest('hex'), part.sha256, 'Streamed video part changed.');
    return data;
  };
  for (let start = 0; start < stream.fragments.length; start += 15) {
    const pack = { src: 'pack-' + (stream.packs.length + 1) + '.bin', bytes: 0, parts: [] };
    const hash = crypto.createHash('sha256');
    const target = fs.openSync(path.join(output, folder, pack.src), 'w');
    try {
      for (const part of [...(start === 0 ? [stream.init] : []), ...stream.fragments.slice(start, start + 15)]) {
        const data = readPart(part);
        pack.parts.push({ ...part, offset: pack.bytes });
        fs.writeFileSync(target, data); hash.update(data); pack.bytes += data.length;
      }
    } finally { fs.closeSync(target); }
    pack.sha256 = hash.digest('hex');
    stream.packs.push(pack); files++; bytes += pack.bytes;
  }
  const data = JSON.stringify(stream, null, 2) + '\n';
  fs.writeFileSync(path.join(output, folder, 'manifest.json'), data);
  files++; bytes += Buffer.byteLength(data);
}

const buffer = Buffer.alloc(4 * 1024 * 1024);
const videos = [];
for (const video of manifest.videos) {
  if (streamedStone && video.id === 'stone') continue;
  const destination = path.join(output, video.original);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const target = fs.openSync(destination, 'w');
  try {
    for (const part of video.orderedParts) {
      const original = path.join(source, part.path);
      assert(fs.lstatSync(original).isFile(), `Not a regular video part: ${part.path}`);
      assert.equal(fs.statSync(original).size, part.size, `Wrong part size: ${part.path}`);
      const input = fs.openSync(original, 'r');
      const hash = crypto.createHash('sha256');
      try {
        for (let read; (read = fs.readSync(input, buffer, 0, buffer.length)) > 0;) {
          const chunk = buffer.subarray(0, read);
          hash.update(chunk);
          fs.writeFileSync(target, chunk);
        }
      } finally {
        fs.closeSync(input);
      }
      assert.equal(hash.digest('hex'), part.sha256, `Wrong part hash: ${part.path}`);
    }
  } finally {
    fs.closeSync(target);
  }
  assert.equal(fs.statSync(destination).size, video.size, `Wrong video size: ${video.original}`);
  const input = fs.openSync(destination, 'r');
  const hash = crypto.createHash('sha256');
  try {
    for (let read; (read = fs.readSync(input, buffer, 0, buffer.length)) > 0;) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(input);
  }
  const sha256 = hash.digest('hex');
  assert.equal(sha256, video.originalSha256, `Wrong reconstructed video hash: ${video.original}`);
  files++;
  bytes += video.size;
  videos.push({ file: video.original, bytes: video.size, sha256 });
}
assert(bytes < 1_000_000_000, 'Pages artifact exceeds 1 GB.');
const indexFile = path.join(output, 'index.html');
const html = fs.readFileSync(indexFile, 'utf8');
let hostedHtml = html;
for (const video of manifest.videos) {
  if (streamedStone && video.id === 'stone') continue;
  const releaseUrl = `https://github.com/WWW502746/WWW502746.github.io/releases/download/v5-media-20261012/${path.posix.basename(video.original)}`;
  hostedHtml = hostedHtml.replace(`data-hosted-src="${releaseUrl}"`, `data-hosted-src="${video.original}"`);
  assert(hostedHtml.includes(`data-hosted-src="${video.original}"`), 'Missing same-origin video source.');
}
fs.writeFileSync(indexFile, hostedHtml);
bytes += Buffer.byteLength(hostedHtml) - Buffer.byteLength(html);
console.log(JSON.stringify({ output, files, bytes, videos }, null, 2));
