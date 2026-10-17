(() => {
  const required = matchMedia('(min-width:801px) and (pointer:fine)').matches;
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  const api = window.sitePreload = {required, state: required ? 'loading' : 'disabled', ready, start};
  if (!required) { resolveReady(); return; }
  document.documentElement.classList.add('is-preparing');
  document.body.classList.add('has-full-preload');
  const boot = document.querySelector('.boot');
  boot.removeAttribute('aria-hidden');
  boot.setAttribute('aria-label', '展览加载进度');
  boot.innerHTML = '<div class="preparation"><img class="preparation__mark" src="assets/landing-v5/beijian-original.svg" alt="碑间" width="197" height="110"><p class="preparation__eyebrow">STONE / PAPER / SPACE</p><h1>让石与纸，先抵达。</h1><p class="preparation__status" role="status" aria-live="polite">正在整理展览内容</p><div class="preparation__progress" role="progressbar" aria-label="加载进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="preparation__numbers"><strong>0<span>%</span></strong><small>准备中</small></div><p class="preparation__note">影片、作品与字形准备完成后，开启体验。<br>首次载入可能需要一些时间。</p><button class="preparation__enter" type="button" hidden>进入碑间 <span aria-hidden="true">↗</span></button><button class="preparation__retry" type="button" hidden>重试加载</button></div><p class="preparation__footer">BEIJIAN · A DIGITAL EXHIBITION</p>';
  const bar = boot.querySelector('[role="progressbar"]'), fill = bar.querySelector('i');
  const number = boot.querySelector('.preparation__numbers strong'), detail = boot.querySelector('.preparation__numbers small');
  const status = boot.querySelector('.preparation__status'), enter = boot.querySelector('.preparation__enter'), retry = boot.querySelector('.preparation__retry');
  const main = document.querySelector('main'), header = document.querySelector('.site-header');
  main.inert = header.inert = true;
  let running = false, manifest, cache, completed = 0, doneFiles = 0, lastPercent = 0, lastDetail = '';
  const inflight = new Map();
  const megabytes = value => (value / 1000000).toFixed(1);
  function paint(final = false) {
    const total = manifest?.desktop.bytes || 1;
    const received = completed + [...inflight.values()].reduce((sum, bytes) => sum + bytes, 0);
    const percent = final ? 100 : Math.min(97, Math.floor(received / total * 97));
    if (percent !== lastPercent || final) {
      lastPercent = percent; bar.setAttribute('aria-valuenow', String(percent));
      fill.style.transform = `scaleX(${percent / 100})`; number.innerHTML = `${percent}<span>%</span>`;
    }
    const label = manifest ? `${megabytes(Math.min(received, total))} / ${megabytes(total)} MB` : '准备中';
    if (label !== lastDetail) { lastDetail = label; detail.textContent = label; }
  }
  async function controlWorker() {
    if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('当前浏览器无法完整保存展览内容，请使用新版浏览器。');
    await navigator.serviceWorker.register('preload-worker.js', {scope: './', updateViaCache: 'none'});
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('离线准备服务尚未就绪，请重试。')), 15000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, {once: true});
    });
  }
  async function storeAsset(file) {
    const url = new URL(file.url, location.href).href;
    const existing = await cache.match(url);
    if (new URL(url).origin !== location.origin) throw new Error('展览资源地址异常，请重试。');
    if (existing) {
      for (const alias of file.aliases || []) await cache.put(new URL(alias, location.href).href, existing.clone());
      completed += file.bytes; doneFiles++; paint(); return;
    }
    let received = 0;
    let timer;
    inflight.set(url, 0);
    try {
      const controller = new AbortController();
      timer = setTimeout(() => controller.abort(), 45000);
      const response = await fetch(url, {cache: 'reload', headers: {'X-Beijian-Preload': '1'}, signal: controller.signal});
      if (!response.ok || response.status !== 200 || !response.body) throw new Error('有部分内容暂未载入，请重试。');
      let cacheError;
      const saved = cache.put(url, response.clone()).catch(error => { cacheError = error; });
      const reader = response.body.getReader();
      try {
        while (true) {
          const {done, value} = await reader.read();
          if (done) break;
          received += value.length; inflight.set(url, Math.min(received, file.bytes)); paint();
          clearTimeout(timer); timer = setTimeout(() => controller.abort(), 45000);
        }
      } finally { clearTimeout(timer); reader.releaseLock(); }
      await saved;
      if (cacheError) throw cacheError;
      if (received !== file.bytes) { await cache.delete(url); throw new Error('内容校验未通过，请重试加载。'); }
      for (const alias of file.aliases || []) await cache.put(new URL(alias, location.href).href, (await cache.match(url)).clone());
      completed += file.bytes; doneFiles++;
    } finally { clearTimeout(timer); inflight.delete(url); paint(); }
  }
  async function useCache(name) {
    const channel = new MessageChannel();
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('内容已下载，正在连接播放服务，请重试。')), 15000);
      channel.port1.onmessage = event => { if (event.data?.ready) { clearTimeout(timer); channel.port1.close(); resolve(); } };
      navigator.serviceWorker.controller.postMessage({type: 'beijian-use-cache', name}, [channel.port2]);
    });
  }
  async function start() {
    if (running || api.state === 'ready' || api.state === 'entered') return;
    running = true; api.state = 'loading'; retry.hidden = enter.hidden = true;
    completed = 0; doneFiles = 0; inflight.clear(); status.textContent = '正在载入影片、作品与字形';
    try {
      await controlWorker();
      const response = await fetch('preload-manifest.json', {cache: 'no-store', headers: {'X-Beijian-Preload': '1'}});
      if (!response.ok) throw new Error('展览清单暂未载入，请重试。');
      manifest = await response.json();
      if (!/^[a-f\d]{64}$/.test(manifest.cacheVersion) || !manifest.desktop?.files?.length) throw new Error('展览清单暂不可用，请重试。');
      const name = 'beijian-ready-' + manifest.cacheVersion;
      for (const key of await caches.keys()) if (key.startsWith('beijian-ready-') && key !== name) await caches.delete(key);
      cache = await caches.open(name);
      const queue = [...manifest.desktop.files];
      let downloadError;
      async function consume() {
        while (queue.length && !downloadError) {
          const file = queue.shift();
          try { await storeAsset(file); } catch (error) { downloadError = error; throw error; }
        }
      }
      const results = await Promise.allSettled([consume(), consume()]);
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      if (doneFiles !== manifest.desktop.files.length) throw new Error('还有内容未准备完成，请重试。');
      await useCache(name);
      api.state = 'warming'; status.textContent = '下载完成，正在准备影片与展品';
      await document.fonts.ready;
      await window.homeFilm?.prepare?.();
      await window.prepareExhibition?.();
      api.state = 'ready'; status.textContent = '已准备就绪'; paint(true); enter.hidden = false;
      boot.querySelector('.preparation__note').textContent = '所有内容已准备好，开启这次观看。';
      resolveReady(); window.dispatchEvent(new CustomEvent('site:ready'));
    } catch (error) {
      api.state = 'error'; status.textContent = error.name === 'QuotaExceededError' ? '设备可用空间不足，请释放空间后重试。' : (['AbortError', 'TypeError'].includes(error.name) ? '网络暂时中断，请重试加载。' : error.message || '有部分内容暂未载入，请重试。');
      retry.hidden = false;
    } finally { running = false; }
  }
  retry.onclick = () => location.reload();
  enter.onclick = () => {
    if (api.state !== 'ready') return;
    api.state = 'entered'; main.inert = header.inert = false;
    document.documentElement.classList.remove('is-preparing'); boot.classList.add('is-gone');
    window.dispatchEvent(new CustomEvent('site:entered'));
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true}); else start();
})();
