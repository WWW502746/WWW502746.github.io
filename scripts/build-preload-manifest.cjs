const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

// Run against the assembled Pages artifact, not the release folder with unused source media.
const origin = 'https://beijian.invalid';
const resourceExtension = /\.(?:html|css|js|mjs|json|png|jpe?g|webp|svg|gif|woff2?|otf|ttf|glb|gltf|bin|mp4|m4s|webm|wasm|txt)(?:[?#].*)?$/i;
const excludedFromCache = new Set(['/preload-manifest.json', '/preload-worker.js']);

function references(text) {
  const refs = new Set();
  text = text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\*[\s\S]*?\*\//g, value => value.startsWith('/*') ? '' : value);
  text = text.replace(/\\\//g, '/').replace(/\\"/g, '"');
  for (const match of text.matchAll(/(?:src|href|data-src|data-model-src|data-stream-manifest|data-hosted-src)\s*=\s*["']([^"']+)["']/g)) refs.add(match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^\s)'"\n]+)["']?\s*\)/g)) refs.add(match[1]);
  for (const match of text.matchAll(/["'`]([^\s"'`<>]+)["'`]/g)) {
    const value = match[1];
    if (resourceExtension.test(value) && (value.includes('/') || /\.(?:js|css)(?:[?#]|$)/.test(value)) && !/[${}]/.test(value) && !/^\.[a-z\d]+(?:[?#].*)?$/i.test(value)) refs.add(value);
  }
  return [...refs];
}

function localURL(reference, from) {
  if (/^(?:data:|blob:|about:|#)/i.test(reference)) return null;
  const url = new URL(reference, origin + from);
  if (url.origin !== origin) return null;
  url.hash = '';
  return url.pathname + url.search;
}

function fileForURL(site, url) {
  let file = decodeURIComponent(new URL(url, origin).pathname).replace(/^\/+/, '');
  if (!file || file.endsWith('/')) file += 'index.html';
  const absolute = path.resolve(site, file);
  assert(absolute.startsWith(site + path.sep), `Resource escapes site directory: ${url}`);
  assert(fs.existsSync(absolute) && fs.statSync(absolute).isFile(), `Missing preload resource ${url}`);
  return { file, absolute };
}

function groupFor(file) {
  if (/^assets\/landing-(?:hd-|online-)/.test(file)) return 'films';
  if (file.startsWith('assets/landing-mobile/')) return 'mobile-films';
  if (file.startsWith('assets/models/')) return 'models';
  if (file.startsWith('_next/') || file.startsWith('models/') || file.startsWith('lab/glyph-field/')) return 'stone-field';
  if (file.startsWith('assets/name/') || /^name-/.test(file)) return 'name';
  if (file.startsWith('assets/works/') || file.startsWith('assets/archive-room/')) return 'works';
  if (file.startsWith('assets/')) return 'images-fonts';
  return 'interface';
}

function build(site, revision) {
  site = path.resolve(site);
  const metadata = new Map();
  const index = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
  const importMap = JSON.parse(index.match(/<script[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/)?.[1] || '{"imports":{}}').imports;
  const resolveImport = value => {
    if (importMap[value]) return localURL(importMap[value], '/index.html');
    const prefix = Object.keys(importMap).find(key => key.endsWith('/') && value.startsWith(key));
    return prefix ? localURL(importMap[prefix] + value.slice(prefix.length), '/index.html') : value;
  };

  function payload(mode) {
    const records = new Map();
    const queue = [];
    function add(reference, from = '/index.html') {
      const url = localURL(resolveImport(reference), from);
      if (!url) return;
      const pathname = new URL(url, origin).pathname;
      if (excludedFromCache.has(pathname)) return;
      if (mode === 'desktop' && pathname.startsWith('/assets/landing-mobile/')) return;
      if (mode === 'mobile' && (/^\/assets\/landing-(?:hd-|online-)/.test(pathname) || pathname.startsWith('/lab/glyph-field/') || pathname.startsWith('/_next/') || pathname.startsWith('/models/'))) return;
      const { file, absolute } = fileForURL(site, url);
      let record = records.get(file);
      if (!record) {
        record = { file, absolute, urls: new Set() };
        records.set(file, record);
        queue.push(record);
      }
      record.urls.add(url);
    }
    function addDirectory(relative, filter) {
      const directory = path.join(site, relative);
      assert(fs.existsSync(directory), `Missing runtime directory: ${relative}`);
      for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
        const file = relative + '/' + item.name;
        if (item.isDirectory()) addDirectory(file, filter);
        else if (filter(file)) add('/' + file);
      }
    }

    add('/index.html'); add('/');
    // These URLs are constructed at runtime; all selectable names and finishes must be ready.
    addDirectory('assets/name', file => /\.(?:png|jpe?g|webp|svg|woff2?|json|js|css|txt)$/i.test(file));
    add('/assets/models/stele/web/beilin-stele.gltf?v=public1');
    add('/home-frame-worker.js?v=hdpreload20261017');
    add('/home-frame-mp4.js?v=v5.10');
    if (mode === 'desktop') add('/lab/glyph-field/');

    for (let position = 0; position < queue.length; position++) {
      const record = queue[position];
      const { file, absolute } = record;
      const base = '/' + file;
      if (/\.(?:html|css|js|mjs)$/.test(file)) {
        const text = fs.readFileSync(absolute, 'utf8');
        const library = /^vendor\/three\//.test(file) || /^assets\/name\/craft-motion\/three\./.test(file);
        for (const ref of library ? [] : references(text)) {
          // Links to old standalone pages are navigation, not dependencies of this experience.
          if (!resourceExtension.test(ref) || /[${}]/.test(ref)) continue;
          if (file.startsWith('_next/') && !ref.startsWith('/')) continue;
          add(ref, base);
        }
        for (const match of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(|\bimportScripts\s*\()\s*['"]([^'"]+)['"]/g)) {
          if (/^[./]/.test(match[1]) || resolveImport(match[1]) !== match[1]) add(match[1], base);
        }
        // Webpack creates lazy chunk URLs by joining IDs and hashes instead of literal paths.
        if (/^_next\/static\/chunks\/webpack-/.test(file)) {
          const hashes = text.match(/\{((?:\d+:"[a-f\d]+",?)+)\}\)\[\w+\]\+"\.js"/);
          if (hashes) for (const match of hashes[1].matchAll(/(\d+):"([a-f\d]+)"/g)) add(`/_next/static/chunks/${match[1]}.${match[2]}.js`);
        }
      } else if (file.endsWith('.gltf')) {
        const model = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        for (const resource of [...(model.buffers || []), ...(model.images || [])]) {
          if (resource.uri && !resource.uri.startsWith('data:')) add(resource.uri, base);
        }
      } else if (file.endsWith('/manifest.json') && /^assets\/landing-/.test(file)) {
        const media = JSON.parse(fs.readFileSync(absolute, 'utf8'));
        const resources = media.packs?.length ? media.packs : [media.init, ...(media.fragments || [])];
        assert(resources.length > 0, `Missing movie packets: ${file}`);
        for (const resource of resources) {
          assert(resource?.src && Number.isSafeInteger(resource.bytes), `Invalid movie packet: ${file}`);
          const url = localURL(resource.src, base);
          const info = fileForURL(site, url);
          assert.equal(fs.statSync(info.absolute).size, resource.bytes, `Wrong movie packet size: ${url}`);
          add(url);
        }
      }
    }
    const files = [...records.values()].sort((a, b) => a.file.localeCompare(b.file)).map(({ file, absolute, urls }) => {
      let info = metadata.get(file);
      if (!info) {
        const data = fs.readFileSync(absolute);
        info = { bytes: data.length, sha256: crypto.createHash('sha256').update(data).digest('hex') };
        metadata.set(file, info);
      }
      const url = '/' + file;
      const aliases = [...urls].filter(value => value !== url).sort();
      return { url, ...info, group: groupFor(file), ...(aliases.length ? { aliases } : {}) };
    });
    const groups = {};
    for (const file of files) {
      groups[file.group] ||= { files: 0, bytes: 0 };
      groups[file.group].files++;
      groups[file.group].bytes += file.bytes;
    }
    return { bytes: files.reduce((sum, item) => sum + item.bytes, 0), groups, files };
  }
  const desktop = payload('desktop'), mobile = payload('mobile');
  const cacheVersion = crypto.createHash('sha256').update(JSON.stringify({ desktop: desktop.files, mobile: mobile.files })).digest('hex');
  return { version: 1, cacheVersion, revision, builtAt: new Date().toISOString(), desktop, mobile };
}

function selfTest() {
  assert.deepEqual(references('<img data-src="assets/a.webp"><link href="a.css?v=2"><script>import("./a.js?v=2")</script>'), ['assets/a.webp', 'a.css?v=2', './a.js?v=2']);
  assert(references("background: url('../images/a.webp'); importScripts('./worker.js?v=1')").includes('../images/a.webp'));
  assert.equal(localURL('../maps/a.bin', '/assets/models/one/model.gltf?v=3'), '/assets/models/maps/a.bin');
  assert.equal(localURL('https://example.org/a.js', '/index.html'), null);
  assert.equal(localURL('data:image/png,x', '/index.html'), null);
  assert.equal(localURL('a.js?v=4#x', '/name.js'), '/a.js?v=4');
  const fixture = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'beijian-preload-'));
  const write = (file, data) => { fs.mkdirSync(path.dirname(path.join(fixture, file)), { recursive: true }); fs.writeFileSync(path.join(fixture, file), data); };
  try {
    write('index.html', '<script type="importmap">{"imports":{}}</script><script src="main.js?v=2"></script><div data-model-src="assets/models/one/model.gltf"></div>');
    write('main.js', 'import("./extra.js?v=3"); const film="assets/landing-hd-test/manifest.json";');
    write('extra.js', ''); write('home-frame-worker.js', 'importScripts("./home-frame-mp4.js?v=v5.10")'); write('home-frame-mp4.js', '');
    write('assets/name/a.webp', 'name');
    write('assets/models/stele/web/beilin-stele.gltf', '{}');
    write('assets/models/one/model.gltf', JSON.stringify({ buffers: [{ uri: 'mesh.bin' }], images: [{ uri: '../../maps/stone.webp' }] }));
    write('assets/models/one/mesh.bin', 'mesh'); write('assets/maps/stone.webp', 'map');
    write('assets/landing-hd-test/manifest.json', JSON.stringify({ packs: [{ src: 'pack.bin', bytes: 4 }], fragments: [{ src: 'not-deployed.m4s' }] }));
    write('assets/landing-hd-test/pack.bin', 'pack');
    write('lab/glyph-field/index.html', '<script src="/_next/chunk.js"></script>'); write('_next/chunk.js', '');
    const manifest = build(fixture, 'self-test');
    const desktop = manifest.desktop.files;
    assert(desktop.find(item => item.url === '/main.js').aliases.includes('/main.js?v=2'));
    assert(desktop.find(item => item.url === '/extra.js').aliases.includes('/extra.js?v=3'));
    assert(desktop.some(item => item.url === '/assets/models/one/mesh.bin'));
    assert(desktop.some(item => item.url === '/assets/maps/stone.webp'));
    assert(desktop.some(item => item.url === '/assets/landing-hd-test/pack.bin'));
    assert(!manifest.mobile.files.some(item => item.group === 'stone-field' || item.group === 'films'));
    assert.equal(manifest.desktop.bytes, desktop.reduce((sum, item) => sum + item.bytes, 0));
    assert.match(manifest.cacheVersion, /^[a-f\d]{64}$/);
    assert.equal(build(fixture, 'different-build-date').cacheVersion, manifest.cacheVersion);
    write('extra.js', '// New resource contents');
    assert.notEqual(build(fixture, 'self-test').cacheVersion, manifest.cacheVersion);
    fs.unlinkSync(path.join(fixture, 'assets/models/one/mesh.bin'));
    assert.throws(() => build(fixture, 'self-test'), /Missing preload resource/);
  } finally {
    assert(path.dirname(fixture) === path.resolve(require('node:os').tmpdir()) && path.basename(fixture).startsWith('beijian-preload-'));
    fs.rmSync(fixture, { recursive: true, force: true });
  }
  console.log('preload manifest self-test passed');
}

if (require.main === module) {
  if (process.argv.includes('--self-test')) selfTest();
  else {
    assert(process.argv[2], 'Usage: node scripts/build-preload-manifest.cjs <assembled-pages-directory> [revision]');
    const site = path.resolve(process.argv[2]);
    const manifest = build(site, process.argv[3] || 'hdpreload20261017');
    fs.writeFileSync(path.join(site, 'preload-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(JSON.stringify({ output: path.join(site, 'preload-manifest.json'), revision: manifest.revision,
      desktop: { files: manifest.desktop.files.length, bytes: manifest.desktop.bytes, groups: manifest.desktop.groups },
      mobile: { files: manifest.mobile.files.length, bytes: manifest.mobile.bytes, groups: manifest.mobile.groups } }, null, 2));
  }
}
module.exports = { build, references, localURL };
