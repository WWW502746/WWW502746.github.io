(() => {
  window.createScrollMedia = (video, manifestUrl, fallbackUrl) => {
    if (!window.MediaSource || !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')) return null;
    const media = new MediaSource();
    const objectUrl = URL.createObjectURL(media);
    const base = new URL(manifestUrl, location.href);
    // Keep fetched GOPs for reverse seeks without downloading the whole film ahead.
    const cache = new Map();
    let fetching = 0;
    let manifest, buffer, desired = 0, running = false, initialized = false, failed = false, radius = .6, framesActive = false;
    let resolveSource, rejectSource;
    const sourceReady = new Promise((resolve, reject) => { resolveSource = resolve; rejectSource = reject; });
    sourceReady.catch(() => {});

    function fallback(event) {
      if (failed) return;
      failed = true;rejectSource(new Error("Packet source unavailable"));
      event?.stopImmediatePropagation();
      video.removeEventListener('error', fallback, true);
      video.src = fallbackUrl;
      video.load();
      URL.revokeObjectURL(objectUrl);
      for (const item of records.values()) item.reject(new DOMException("Stopped packet source", "AbortError"));
      cache.clear();records.clear();for (const packet of packets.values()) packet.controller?.abort();packets.clear();
      for (const controller of rangeRequests) controller.abort();rangeRequests.clear();
    }
    const records = new Map(), packets = new Map(), rangeRequests = new Set();
    const stats = { completed: 0, bytes: 0, packetRequests: 0, urgentRequests: 0, cancels: 0, resumes: 0, readBytes: 0, skippedBytes: 0, maxBackground: 0, cache };
    window.packetMediaStats = stats;
    let hadFrame = false, lastScroll = performance.now(), idleTimer;
    function record(src) {
      if (!records.has(src)) {
        const item = { done: false, direct: false };
        item.promise = new Promise((resolve, reject) => { item.resolve = resolve; item.reject = reject; });
        item.promise.catch(() => {});
        records.set(src, item);cache.set(src, item.promise);
      }
      return records.get(src);
    }
    function complete(src, bytes) {
      const item = record(src);
      if (failed || item.done) return;
      item.done = true;item.resolve(bytes);stats.bytes += bytes.byteLength;
      if (src !== manifest.init.src) stats.completed++;
    }
    async function readRange(response, from, length, total, consume) {
      if (!response.ok || !response.body) throw new Error('Packet unavailable');
      let position = 0, consumed = 0;
      if (response.status === 206) {
        const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
        if (!range || Number(range[1]) > from || Number(range[2]) < from + length - 1 || Number(range[3]) !== total) throw new Error('Incorrect packet range');
        position = Number(range[1]);
      } else if (response.status !== 200) throw new Error('Packet range unavailable');
      const reader = response.body.getReader(), end = from + length;
      try {
        while (position < end && !failed) {
          const chunk = await reader.read();
          if (chunk.done) break;
          stats.readBytes += chunk.value.length;
          const start = Math.max(0, from - position), stop = Math.min(chunk.value.length, end - position);
          stats.skippedBytes += Math.min(chunk.value.length, start);
          if (stop > start) { consume(chunk.value.subarray(start, stop));consumed += stop - start; }
          position += chunk.value.length;
        }
        if (!failed && consumed !== length) throw new Error('Truncated packet');
      } finally { await reader.cancel().catch(() => {});reader.releaseLock(); }
    }
    function locate(src) {
      const pack = manifest.packs.find(pack => pack.parts.some(part => part.src === src));
      return { pack, part: pack.parts.find(part => part.src === src) };
    }
    function urgent(src, background = false) {
      const item = record(src);
      if (item.done || item.direct) return;
      item.direct = true;fetching++;stats.urgentRequests++;
      const { pack, part } = locate(src), controller = new AbortController();
      rangeRequests.add(controller);
      fetch(new URL(pack.src, base), { cache: 'force-cache', mode: 'same-origin', priority: background ? 'low' : 'high', signal: controller.signal,
        headers: { Range: `bytes=${part.offset}-${part.offset + part.bytes - 1}` } })
        .then(async response => {
          const bytes = new Uint8Array(part.bytes);let filled = 0;
          await readRange(response, part.offset, part.bytes, pack.bytes, piece => { bytes.set(piece, filled);filled += piece.length; });
          complete(src, bytes.buffer);
        }).catch(() => { if (!failed) fallback(); })
        .finally(() => { fetching--;rangeRequests.delete(controller);prefetch(); });
    }
    function startPacket(pack) {
      let state = packets.get(pack.src);
      if (state?.running) return state;
      const first = pack.parts.findIndex(part => !records.get(part.src)?.done);
      if (first < 0) return state;
      const cached = pack.parts.findIndex((part, index) => index > first && records.get(part.src)?.done);
      const members = pack.parts.slice(first, cached < 0 ? pack.parts.length : cached);
      const from = members[0].offset, last = members.at(-1), end = last.offset + last.bytes;
      if (state) stats.resumes++;
      state = { running: true, received: from, controller: new AbortController() };packets.set(pack.src, state);
      stats.maxBackground = Math.max(stats.maxBackground, [...packets.values()].filter(state => state.running).length);
      fetching++;stats.packetRequests++;
      (async () => {
        const response = await fetch(new URL(pack.src, base), { cache: 'force-cache', mode: 'same-origin', priority: 'low', signal: state.controller.signal,
          headers: { Range: `bytes=${from}-${end - 1}` } });
        let index = 0, filled = 0, bytes = new Uint8Array(members[0].bytes);
        await readRange(response, from, end - from, pack.bytes, chunk => {
          let offset = 0;
          while (offset < chunk.length) {
            const part = members[index], count = Math.min(chunk.length - offset, part.bytes - filled);
            if (bytes) bytes.set(chunk.subarray(offset, offset + count), filled);
            offset += count;filled += count;state.received += count;
            if (filled === part.bytes) {
              if (bytes) complete(part.src, bytes.buffer);
              index++;filled = 0;
              const next = members[index];
              // An urgent range may have filled a future GOP since this stream began; skip it on resume.
              if (next && records.get(next.src)?.done) throw new DOMException('Cached GOP boundary', 'AbortError');
              bytes = next ? new Uint8Array(next.bytes) : null;
            }
          }
        });
      })().catch(error => { if (!failed && error.name !== 'AbortError') fallback(); })
        .finally(() => { fetching--;state.running = false;prefetch(); });
      return state;
    }
    function fetchBytes(src, background = false) {
      const item = record(src);
      if (item.done) return item.promise;
      const { pack, part } = locate(src);
      let state = packets.get(pack.src);
      if (src === manifest.init.src && !state?.running) state = startPacket(pack);
      // The currently arriving GOP can finish on the stream; distant native seeks get an exact high-priority range.
      if (src !== manifest.init.src && (!state?.running || part.offset + part.bytes - state.received > part.bytes)) urgent(src, background);
      return item.promise;
    }
    function canPrepare() {
      if (document.hidden) return false;
      const page = video.closest('[data-page]');
      if (page && !page.classList.contains('page--active')) return false;
      return hadFrame && video.style.opacity !== '0' && performance.now() - lastScroll >= 700;
    }
    function prefetch() {
      if (failed || !initialized) return;
      if (!canPrepare()) {
        for (const state of packets.values()) if (state.running && !state.controller.signal.aborted) { stats.cancels++;state.controller.abort(); }
        return;
      }
      if (fetching || [...packets.values()].some(state => state.running)) return;
      const part = manifest.fragments.find(part => part.end > desired - .2 && part.start < desired + .5 && !records.get(part.src)?.done);
      if (part) fetchBytes(part.src, true);
    }
    video.addEventListener('loadeddata', () => { hadFrame = true;prefetch(); }, { once: true });
    document.addEventListener('visibilitychange', prefetch);
    window.addEventListener('site:page', prefetch);
    window.addEventListener('scroll', () => {
      lastScroll = performance.now();clearTimeout(idleTimer);prefetch();idleTimer = setTimeout(prefetch, 700);
    }, { passive: true });
    function update(method, ...args) {
      return new Promise((resolve, reject) => {
        const clean = () => ['updateend', 'error', 'abort'].forEach(name => buffer.removeEventListener(name, done));
        function done(event) {
          clean();
          event.type === 'updateend' ? resolve() : reject(new Error(`SourceBuffer ${event.type}`));
        }
        ['updateend', 'error', 'abort'].forEach(name => buffer.addEventListener(name, done));
        try { buffer[method](...args); } catch (error) { clean(); reject(error); }
      });
    }
    function contains(fragment) {
      const epsilon = Math.min(.00001, (fragment.end - fragment.start) / 4);
      const ranges = buffer.buffered;
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= fragment.start + epsilon && ranges.end(i) >= fragment.end - epsilon) return true;
      }
      return false;
    }
    function needed() {
      const fragments = manifest.fragments;
      const native = Math.min(manifest.duration - .000001, Math.max(0, video.currentTime));
      const target = Math.min(manifest.duration - .000001, Math.max(0, desired));
      const at = time => fragments.find(fragment => fragment.start <= time && fragment.end > time) || fragments.at(-1);
      const ahead = time => fragments.slice(fragments.indexOf(at(time)), fragments.indexOf(at(time)) + 3);
      // A pending native seek needs its following GOPs before chasing a newer scroll target.
      const priority = [...ahead(native), ...ahead(target)];
      return [...new Set([...priority, ...fragments
        .filter(fragment => [native, target].some(time => fragment.end > time - radius && fragment.start < time + radius))
        .sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target))])];
    }
    async function trim(wanted) {
      const spans = [];
      for (const fragment of [...wanted].sort((a, b) => a.start - b.start)) {
        const last = spans.at(-1);
        if (last && fragment.start <= last[1] + .00001) last[1] = fragment.end;
        else spans.push([fragment.start, fragment.end]);
      }
      const gaps = [];
      let start = 0;
      for (const span of spans) { if (span[0] > start) gaps.push([start, span[0]]); start = span[1]; }
      if (start < manifest.duration) gaps.push([start, manifest.duration]);
      for (const [from, to] of gaps) {
        const ranges = buffer.buffered;
        for (let i = 0; i < ranges.length; i++) {
          if (ranges.start(i) < to && ranges.end(i) > from) {
            await update('remove', from, to);
            break;
          }
        }
      }
    }
    async function pump() {
      if (failed || running || !initialized || (framesActive && hadFrame)) return;
      running = true;
      try {
        while (!failed && (!framesActive || !hadFrame)) {
          await trim(needed());
          const fragment = needed().find(fragment => !contains(fragment));
          if (!fragment) break;
          const bytes = await fetchBytes(fragment.src);
          if (failed) break;
          if (!needed().includes(fragment)) continue;
          try { await update('appendBuffer', bytes); }
          catch (error) {
            if (error.name !== 'QuotaExceededError') throw error;
            radius = .15;
            await trim(needed());
            if (needed().includes(fragment)) await update('appendBuffer', bytes);
          }
        }
      } catch { fallback(); }
      finally { running = false; }
    }
    video.addEventListener('error', fallback, true);
    video.addEventListener('seeking', pump);
    video.addEventListener('seeked', pump);
    media.addEventListener('sourceopen', async () => {
      try {
        const response = await fetch(base, { cache: 'force-cache', mode: 'same-origin' });
        if (!response.ok) throw new Error('Video manifest unavailable');
        manifest = await response.json();
        if (!manifest.packs) manifest.packs = [manifest.init, ...manifest.fragments].map(part => ({ src: part.src, bytes: part.bytes, parts: [{ ...part, offset: 0 }] }));
        const mime = `video/mp4; codecs="${manifest.codec}"`;
        if (!MediaSource.isTypeSupported(mime) || !(manifest.duration > 0) || !manifest.fragments?.length) throw new Error('Unsupported video manifest');
        buffer = media.addSourceBuffer(mime);
        media.duration = manifest.duration;
        const init = await fetchBytes(manifest.init.src);
        await update('appendBuffer', init);
        initialized = true;
        resolveSource({ manifest, init, read(src) { return failed ? Promise.reject(new Error('Packet source unavailable')) : fetchBytes(src); } });
        pump();
        prefetch();
      } catch { fallback(); }
    }, { once: true });
    video.src = objectUrl;
    video.load();
    return {
      getSource() { return sourceReady; },
      useFrames(enabled) { framesActive = Boolean(enabled); if (!framesActive || !hadFrame) pump(); prefetch(); },
      ensure(time) { if (!failed && Number.isFinite(time)) { desired = time; if (!framesActive) pump(); prefetch(); } }
    };
  };
})();
