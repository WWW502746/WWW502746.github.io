(() => {
  const check = (value, message) => { if (!value) throw new Error(message); };
  function boxes(data, start = 0, end = data.byteLength) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const result = [];
    for (let offset = start; offset < end;) {
      check(offset + 8 <= end, 'Truncated MP4 box');
      const rawSize = view.getUint32(offset);
      const header = rawSize === 1 ? 16 : 8;
      const size = rawSize === 1 ? Number(view.getBigUint64(offset + 8)) : rawSize || end - offset;
      check(Number.isSafeInteger(size) && size >= header && offset + size <= end, 'Invalid MP4 box size');
      const type = String.fromCharCode(...data.subarray(offset + 4, offset + 8));
      result.push({ type, offset, header, content: offset + header, end: offset + size });
      offset += size;
    }
    return result;
  }
  const child = (data, parent, type, skip = 0) => {
    const result = boxes(data, parent.content + skip, parent.end).find(box => box.type === type);
    check(result, `Missing ${type} box`);
    return result;
  };
  function config(data) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const moov = boxes(data).find(box => box.type === 'moov');
    check(moov, 'Missing moov');
    const mdia = child(data, child(data, moov, 'trak'), 'mdia');
    const mdhd = child(data, mdia, 'mdhd');
    const timescale = view.getUint32(mdhd.content + (data[mdhd.content] === 1 ? 20 : 12));
    const stsd = child(data, child(data, child(data, mdia, 'minf'), 'stbl'), 'stsd');
    const avc1 = child(data, stsd, 'avc1', 8);
    const avcC = child(data, avc1, 'avcC', 78);
    const description = data.slice(avcC.content, avcC.end);
    const codec = `avc1.${[...description.subarray(1, 4)].map(value => value.toString(16).padStart(2, '0')).join('')}`;
    const trex = child(data, child(data, moov, 'mvex'), 'trex');
    return { timescale, defaultDuration: view.getUint32(trex.content + 12), defaultSize: view.getUint32(trex.content + 16), defaultFlags: view.getUint32(trex.content + 20), decoder: { codec, codedWidth: view.getUint16(avc1.content + 24), codedHeight: view.getUint16(avc1.content + 26), description, hardwareAcceleration: 'prefer-hardware', optimizeForLatency: true } };
  }
  function samples(data, metadata, fps = 60) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const top = boxes(data);
    const moof = top.find(box => box.type === 'moof');
    const mdat = top.find(box => box.type === 'mdat');
    check(moof && mdat, 'Missing movie fragment');
    const traf = child(data, moof, 'traf');
    const tfhd = child(data, traf, 'tfhd');
    const tfdt = child(data, traf, 'tfdt');
    const flags = view.getUint32(tfhd.content) & 0xffffff;
    let cursor = tfhd.content + 8;
    let base = moof.offset;
    if (flags & 1) { base = Number(view.getBigUint64(cursor)); cursor += 8; }
    if (flags & 2) cursor += 4;
    const duration = flags & 8 ? view.getUint32(cursor) : metadata.defaultDuration;
    if (flags & 8) cursor += 4;
    const size = flags & 0x10 ? view.getUint32(cursor) : metadata.defaultSize;
    if (flags & 0x10) cursor += 4;
    const sampleFlags = flags & 0x20 ? view.getUint32(cursor) : metadata.defaultFlags;
    let decodeTime = data[tfdt.content] === 1 ? Number(view.getBigUint64(tfdt.content + 4)) : view.getUint32(tfdt.content + 4);
    let dataCursor = mdat.content;
    const result = [];
    for (const trun of boxes(data, traf.content, traf.end).filter(box => box.type === 'trun')) {
      const version = data[trun.content];
      const flags = view.getUint32(trun.content) & 0xffffff;
      const count = view.getUint32(trun.content + 4);
      cursor = trun.content + 8;
      if (flags & 1) { dataCursor = base + view.getInt32(cursor); cursor += 4; }
      const firstFlags = flags & 4 ? view.getUint32(cursor) : sampleFlags;
      if (flags & 4) cursor += 4;
      for (let index = 0; index < count; index++) {
        const sampleDuration = flags & 0x100 ? view.getUint32(cursor) : duration;
        if (flags & 0x100) cursor += 4;
        const sampleSize = flags & 0x200 ? view.getUint32(cursor) : size;
        if (flags & 0x200) cursor += 4;
        const flagsValue = flags & 0x400 ? view.getUint32(cursor) : index === 0 ? firstFlags : sampleFlags;
        if (flags & 0x400) cursor += 4;
        const composition = flags & 0x800 ? (version === 1 ? view.getInt32(cursor) : view.getUint32(cursor)) : 0;
        if (flags & 0x800) cursor += 4;
        const time = (decodeTime + composition) / metadata.timescale;
        check(sampleDuration > 0 && sampleSize > 0 && dataCursor >= mdat.content && dataCursor + sampleSize <= mdat.end, 'Invalid movie sample bounds');
        result.push({ index: Math.round(time * fps), timestamp: Math.round(time * 1000000), duration: Math.round(sampleDuration / metadata.timescale * 1000000), type: flagsValue & 0x10000 ? 'delta' : 'key', data: data.subarray(dataCursor, dataCursor + sampleSize) });
        dataCursor += sampleSize; decodeTime += sampleDuration;
      }
      check(cursor === trun.end, 'Unexpected trun fields');
    }
    check(result[0]?.type === 'key', 'A cached GOP must begin with an IDR sample');
    return result;
  }

  window.createScrollFrames = async (video, source, options = {}) => {
    let manifest, metadata, provider, decoder, canvas, snapshot, context, snapshotContext;
    let desired = 0, painted = -1, direction = 1, generation = 0, pumping = -1, activeGroup;
    let ready = false, failed = false, suspended = false, closed = false, observer, player;
    const cache = new Map();
    const parsed = new Map();
    const fps = Number(video.dataset.fps) || 60;
    const normalize = index => Number.isFinite(index) ? Math.max(0, Math.min(manifest.frames - 1, Math.round(index))) : desired;
    function target(index = options.getFrame?.()) {
      const next = normalize(index);
      if (next !== desired) direction = next > desired ? 1 : -1;
      desired = next;
      return desired;
    }
    const alive = pass => pass === generation && !failed && !closed && !suspended;
    function visibility() {
      if (canvas) canvas.style.opacity = ready && !failed && !closed && !suspended ? video.style.opacity : '0';
    }
    function releaseFrames() {
      for (const group of cache.values()) for (const frame of group.frames.values()) frame.close();
      cache.clear(); activeGroup = null;
      if (decoder && decoder.state !== 'closed') decoder.close();
      decoder = null;
      if (snapshot) snapshot.width = 0;
    }
    function fail(error) {
      if (failed || closed) return;
      failed = true; ready = false; generation++;
      releaseFrames(); parsed.clear(); observer?.disconnect();
      if (canvas) { canvas.width = 0; canvas.remove(); }
      options.onFallback?.(error);
    }
    function frameAt(index) {
      for (const group of cache.values()) if (group.frames.has(index)) return group.frames.get(index);
    }
    function groupAt(index) {
      const time = index / fps + .00000001;
      const found = manifest.fragments.findIndex(fragment => fragment.start <= time && fragment.end > time);
      return found < 0 ? manifest.fragments.length - 1 : found;
    }
    function draw() {
      const latest = target();
      const frame = frameAt(latest);
      if (!frame || failed || suspended || closed) return;
      if (painted !== latest || !ready) {
        context.drawImage(frame, 0, 0);
        painted = latest;
        canvas.dataset.frame = String(painted);
      }
      if (!ready && target() === painted) {
        ready = true; visibility(); options.onReady?.(player);
      }
    }
    function makeDecoder() {
      const pass = generation;
      snapshot.width = metadata.decoder.codedWidth;
      snapshot.height = metadata.decoder.codedHeight;
      snapshotContext = snapshot.getContext('2d', { alpha: false });
      decoder = new VideoDecoder({
        output(frame) {
          if (!alive(pass) || activeGroup?.generation !== pass) { frame.close(); return; }
          const group = activeGroup;
          const index = Math.round(frame.timestamp / 1000000 * fps);
          let independent;
          try {
            snapshotContext.drawImage(frame, 0, 0);
            independent = new VideoFrame(snapshot, { timestamp: frame.timestamp, duration: frame.duration });
          } catch (error) { frame.close(); fail(error); return; }
          frame.close();
          if (!alive(pass)) { independent.close(); return; }
          group.frames.set(index, independent);
          try { draw(); } catch (error) { fail(error); }
        },
        error(error) { if (alive(pass)) fail(error); }
      });
      decoder.configure(metadata.decoder);
    }
    function readGroup(index) {
      if (!parsed.has(index)) parsed.set(index, Promise.resolve(provider.read(manifest.fragments[index].src)).then(bytes => {
        const result = samples(new Uint8Array(bytes), metadata, fps);
        if (result.length > 12) throw new Error('Video GOP exceeds the frame-cache limit');
        return result;
      }));
      return parsed.get(index);
    }
    async function decodeGroup(index, pass) {
      if (!alive(pass)) return;
      const chunks = await readGroup(index);
      if (!alive(pass)) return;
      const center = groupAt(target());
      if (index !== center && index !== center + direction) return;
      if (cache.size >= 2) {
        const farthest = [...cache.keys()].sort((a, b) => Math.abs(b - center) - Math.abs(a - center))[0];
        for (const frame of cache.get(farthest).frames.values()) frame.close();
        cache.delete(farthest);
      }
      const group = { frames: new Map(), complete: false, generation: pass };
      cache.set(index, group); activeGroup = group;
      const ownDecoder = decoder;
      for (const chunk of chunks) ownDecoder.decode(new EncodedVideoChunk(chunk));
      let timeout;
      try {
        await Promise.race([ownDecoder.flush(), new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Video frame decode timed out')), 3000);
        })]);
      } finally { clearTimeout(timeout); }
      if (!alive(pass)) return;
      group.complete = true;
      if (activeGroup === group) activeGroup = null;
    }
    async function pump() {
      const pass = generation;
      if (!alive(pass) || pumping === pass) return;
      pumping = pass;
      try {
        while (alive(pass)) {
          const current = groupAt(target());
          if (!frameAt(desired)) { await decodeGroup(current, pass); continue; }
          draw();
          if (!alive(pass)) break;
          const ahead = current + direction;
          if (ahead < 0 || ahead >= manifest.fragments.length || cache.get(ahead)?.complete) break;
          await decodeGroup(ahead, pass);
        }
      } catch (error) { if (alive(pass)) fail(error); }
      finally { if (pumping === pass) pumping = -1; }
    }
    try {
      if (!window.VideoDecoder || !window.VideoFrame || !window.OffscreenCanvas) throw new Error('Frame decoder unavailable');
      provider = await source.getSource();
      manifest = provider.manifest;
      if (!(manifest.frames > 0) || !manifest.fragments?.length || !(fps > 0)) throw new Error('Invalid frame-cache manifest');
      metadata = config(new Uint8Array(provider.init));
      const support = await VideoDecoder.isConfigSupported(metadata.decoder);
      if (!support.supported) throw new Error('Original video configuration unsupported');
      canvas = document.createElement('canvas');
      canvas.width = metadata.decoder.codedWidth; canvas.height = metadata.decoder.codedHeight;
      canvas.className = 'transition-film';
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.pointerEvents = 'none'; canvas.style.opacity = '0';
      video.after(canvas);
      context = canvas.getContext('2d');
      snapshot = new OffscreenCanvas(canvas.width, canvas.height);
      observer = new MutationObserver(visibility);
      observer.observe(video, { attributes: true, attributeFilter: ['style'] });
      player = {
        canvas,
        ensureFrame(index) {
          if (closed || failed) return;
          target(index);
          if (suspended) return;
          try { draw(); pump(); } catch (error) { fail(error); }
        },
        get paintedFrame() { return painted; },
        get seeking() { return painted !== target(); },
        get ready() { return ready; },
        get failed() { return failed; },
        suspend() {
          if (suspended || closed || failed) return;
          suspended = true; ready = false; generation++; visibility(); releaseFrames();
        },
        resume() {
          if (closed || failed) return;
          if (!suspended) { player.ensureFrame(target()); return; }
          suspended = false; ready = false; generation++; visibility();
          try { makeDecoder(); player.ensureFrame(target()); } catch (error) { fail(error); }
        },
        close() {
          if (closed) return;
          closed = true; ready = false; generation++; releaseFrames(); parsed.clear(); observer.disconnect();
          canvas.width = 0; canvas.remove();
        }
      };
      makeDecoder(); player.ensureFrame(target());
      return player;
    } catch (error) { fail(error); return null; }
  };

})();
