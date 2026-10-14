(() => {
  window.createScrollMedia = (video, manifestUrl, fallbackUrl) => {
    if (!window.MediaSource || !MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"')) return null;
    const media = new MediaSource();
    const objectUrl = URL.createObjectURL(media);
    const base = new URL(manifestUrl, location.href);
    const cache = new Map();
    let manifest, buffer, desired = 0, running = false, initialized = false, failed = false, radius = .6;

    function fallback(event) {
      if (failed) return;
      failed = true;
      event?.stopImmediatePropagation();
      video.removeEventListener('error', fallback, true);
      video.src = fallbackUrl;
      video.load();
      URL.revokeObjectURL(objectUrl);
      cache.clear();
    }
    function fetchBytes(src) {
      if (!cache.has(src)) {
        const url = new URL(src, base);
        cache.set(src, fetch(url, { cache: 'force-cache', mode: 'same-origin' }).then(response => {
          if (!response.ok) throw new Error(`Video fragment: ${response.status}`);
          return response.arrayBuffer();
        }));
        // The HTTP cache retains older fragments without retaining the entire film in JS memory.
        if (cache.size > 12) cache.delete(cache.keys().next().value);
      }
      return cache.get(src);
    }
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
      const priority = [at(native), at(target)];
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
      if (failed || running || !initialized) return;
      running = true;
      try {
        while (!failed) {
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
        const mime = `video/mp4; codecs="${manifest.codec}"`;
        if (!MediaSource.isTypeSupported(mime) || !(manifest.duration > 0) || !manifest.fragments?.length) throw new Error('Unsupported video manifest');
        buffer = media.addSourceBuffer(mime);
        media.duration = manifest.duration;
        await update('appendBuffer', await fetchBytes(manifest.init.src));
        initialized = true;
        pump();
      } catch { fallback(); }
    }, { once: true });
    video.src = objectUrl;
    video.load();
    return { ensure(time) { if (!failed && Number.isFinite(time)) { desired = time; pump(); } } };
  };
})();
