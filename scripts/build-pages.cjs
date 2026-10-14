const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const source = path.resolve(__dirname, '..');
const output = process.argv[2] ? path.resolve(process.argv[2]) : path.join(source, '_stage_pages');
assert(!fs.existsSync(output), 'Choose a new output directory; build-pages does not delete existing files.');
const manifest = JSON.parse(fs.readFileSync(path.join(source, 'assets/landing-v5/stream/stream-manifest.json'), 'utf8'));
assert.equal(manifest.version, 1);
assert(Array.isArray(manifest.videos) && manifest.videos.length > 0);
for (const video of manifest.videos) {
  assert(/^assets\/landing-v5\/[\w.-]+\.mp4$/.test(video.original), 'Invalid original video path.');
  assert(Array.isArray(video.orderedParts) && video.orderedParts.length > 0);
  for (const part of video.orderedParts) assert(/^assets\/landing-v5\/stream\/[\w.-]+\.bin$/.test(part.path), 'Invalid video part path.');
}
const excluded = new Set([
  '.git', '.github', 'scripts', '_stage_pages', 'assets/landing-v5/stream',
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

const buffer = Buffer.alloc(4 * 1024 * 1024);
const videos = [];
for (const video of manifest.videos) {
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
console.log(JSON.stringify({ output, files, bytes, videos }, null, 2));
