/* Independent desktop experiment. Original AVC samples go directly to the
   decoder and its frames go directly to the transferred canvas. */
importScripts('./home-frame-mp4.js?v=v5.10');

(() => {
  const CACHE_LIMIT = 3; // A callback's incoming frame is the fourth owned frame.
  const DECODE_LIMIT = 3;
  const AHEAD = 2;
  const RESTART_INTERVAL = 8;
  const TIMESTAMP_STRIDE = 20000000;
  let canvas, context, manifest, metadata, fps = 60;
  let initialized = false, suspended = false, closed = false, failed = false;
  let desired = 0, serial = 0, direction = 1, generation = 0, requestSequence = 0;
  let painted = -1, paintedSerial = -1, job = null, decoder = null, restartTimer = null;
  const frames = new Map();
  const compressed = new Map();
  const outputTags = new Map();
  const counters = {
    decoded: 0, drawn: 0, reads: 0, resets: 0, discarded: 0,
    staleResponses: 0, maxFrames: 0, maxDecodePending: 0,
    maxRetainedBytes: 0, lastDrawMs: 0,
    decoderConstructs: 0, decoderResets: 0, decoderConfigures: 0, decoderCloses: 0
  };
  const emit = value => self.postMessage(value);
  const isActive = pass => initialized && !suspended && !closed && !failed && pass === generation;
  const stats = () => ({
    ...counters,
    liveFrames: frames.size,
    retainedBytes: [...frames.values()].reduce((sum, entry) => sum + entry.bytes, 0),
    generation,
    decodePending: job?.pending.size || 0,
    compressedGroups: compressed.size,
    desiredFrame: desired,
    paintedFrame: painted,
    suspended
  });
  function closeEntry(index) {
    const entry = frames.get(index);
    if (!entry) return;
    entry.frame.close();
    frames.delete(index);
  }
  function invalidate(dispose = false) {
    generation++;
    paintedSerial = -1;
    const previous = job;
    job = null;
    if (restartTimer) clearTimeout(restartTimer);
    restartTimer = null;
    if (previous?.requestId) emit({ type: 'cancelRead', requestId: previous.requestId });
    if (previous?.timeout) clearTimeout(previous.timeout);
    if (previous?.progressTimeout) clearTimeout(previous.progressTimeout);
    for (const index of frames.keys()) closeEntry(index);
    outputTags.clear();
    if (decoder && decoder.state !== 'closed') {
      if (dispose) {
        decoder.close();
        decoder = null;
        counters.decoderCloses++;
      } else if (decoder.state === 'configured') {
        decoder.reset();
        counters.decoderResets++;
      }
    }
  }
  function fail(error) {
    if (closed || failed) return;
    failed = true;
    invalidate(true);
    compressed.clear();
    emit({ type: 'error', message: error?.message || String(error), stats: stats() });
  }
  function groupAt(index) {
    const time = index / fps + 1e-8;
    const found = manifest.fragments.findIndex(part => part.start <= time && part.end > time);
    return found < 0 ? manifest.fragments.length - 1 : found;
  }
  function normalize(index) {
    if (!Number.isFinite(index)) return desired;
    return Math.max(0, Math.min((manifest?.frames || 1) - 1, Math.round(index)));
  }
  function emitDrawn() {
    paintedSerial = serial;
    emit({ type: 'drawn', frame: painted, serial, stats: stats() });
  }
  function drawLatest() {
    if (suspended || closed || failed || !initialized) return;
    const entry = frames.get(desired);
    if (!entry) {
      if (painted === desired && paintedSerial !== serial) emitDrawn();
      return;
    }
    if (painted !== desired) {
      const start = performance.now();
      context.drawImage(entry.frame, 0, 0);
      counters.lastDrawMs = performance.now() - start;
      counters.drawn++;
      painted = desired;
    }
    if (paintedSerial !== serial) emitDrawn();
  }
  function evictFrame() {
    // Retain the target and its nearest neighbours, preferring our direction.
    const index = [...frames.keys()].sort((a, b) => {
      const distance = Math.abs(b - desired) - Math.abs(a - desired);
      return distance || direction * (a - b);
    })[0];
    closeEntry(index);
  }
  function retain(frame, index) {
    counters.maxFrames = Math.max(counters.maxFrames, frames.size + 1);
    if (frames.has(index)) closeEntry(index);
    while (frames.size >= CACHE_LIMIT) evictFrame();
    let bytes = 0;
    try { bytes = frame.allocationSize(); } catch (_) { /* GPU allocation is opaque. */ }
    frames.set(index, { frame, bytes });
    counters.maxRetainedBytes = Math.max(counters.maxRetainedBytes,
      [...frames.values()].reduce((sum, entry) => sum + entry.bytes, 0));
  }
  function output(frame) {
    const tag = outputTags.get(frame.timestamp);
    if (!tag) { frame.close(); counters.discarded++; return; }
    outputTags.delete(frame.timestamp);
    const ownJob = tag.job;
    if (!isActive(ownJob.generation) || job !== ownJob) {
      frame.close();
      counters.discarded++;
      return;
    }
    const index = tag.index;
    ownJob.pending.delete(index);
    if (ownJob.progressTimeout) clearTimeout(ownJob.progressTimeout);
    ownJob.progressTimeout = null;
    counters.decoded++;
    ownJob.highestOutput = Math.max(ownJob.highestOutput, index);
    if (groupAt(index) !== ownJob.group) {
      frame.close();
      fail(new Error('Decoder returned a frame outside its requested GOP'));
      return;
    }
    try {
      retain(frame, index);
      drawLatest();
      pump(ownJob);
    } catch (error) { fail(error); }
  }
  function finish(ownJob) {
    if (ownJob.flushing || ownJob.finished || !isActive(ownJob.generation)) return;
    ownJob.flushing = true;
    if (ownJob.progressTimeout) clearTimeout(ownJob.progressTimeout);
    ownJob.progressTimeout = null;
    ownJob.timeout = setTimeout(() => {
      if (job === ownJob && isActive(ownJob.generation)) fail(new Error('Original frame decode timed out'));
    }, 3000);
    ownJob.decoder.flush().then(() => {
      clearTimeout(ownJob.timeout);
      ownJob.timeout = null;
      if (!isActive(ownJob.generation) || job !== ownJob) return;
      ownJob.finished = true;
      ownJob.flushing = false;
      drawLatest();
    }).catch(error => {
      clearTimeout(ownJob.timeout);
      if (isActive(ownJob.generation) && job === ownJob) fail(error);
    });
  }
  function pump(ownJob = job) {
    if (!ownJob || job !== ownJob || !isActive(ownJob.generation)
      || !ownJob.decoder || ownJob.flushing || ownJob.finished) return;
    if (groupAt(desired) !== ownJob.group) { chooseJob(); return; }
    const targetPosition = ownJob.samples.findIndex(sample => sample.index === desired);
    if (targetPosition < 0) { fail(new Error('Requested frame is absent from its GOP')); return; }
    const until = Math.min(ownJob.samples.length - 1, targetPosition + AHEAD);
    while (ownJob.next <= until && ownJob.pending.size < DECODE_LIMIT) {
      const sample = ownJob.samples[ownJob.next++];
      ownJob.pending.add(sample.index);
      counters.maxDecodePending = Math.max(counters.maxDecodePending, ownJob.pending.size);
      // Timestamp metadata identifies a generation without touching AVC bytes.
      // A reset's already-queued callback can never be mistaken for a new job.
      const timestamp = ownJob.timestampBase + sample.timestamp;
      outputTags.set(timestamp, { job: ownJob, index: sample.index });
      ownJob.decoder.decode(new EncodedVideoChunk({ ...sample, timestamp }));
    }
    // Flushing midway requires the next chunk to be a keyframe. Finish a GOP
    // only once every chunk has been submitted; forward targets can otherwise
    // continue with its delta samples without re-decoding the keyframe.
    if (ownJob.next === ownJob.samples.length) finish(ownJob);
    else if (ownJob.pending.size && !ownJob.progressTimeout) {
      // Some supported configurations can buffer outputs internally. Targets
      // do not reset this deadline; only an actual decoder output counts.
      ownJob.progressTimeout = setTimeout(() => {
        if (job === ownJob && isActive(ownJob.generation)) fail(new Error('Original decoder produced no frames'));
      }, 3000);
    }
  }
  function configure(ownJob, samples) {
    if (job !== ownJob || !isActive(ownJob.generation)) return;
    ownJob.samples = samples;
    if (!decoder || decoder.state === 'closed') {
      decoder = new VideoDecoder({ output, error: fail });
      counters.decoderConstructs++;
    }
    if (decoder.state !== 'configured') {
      decoder.configure(metadata.decoder);
      counters.decoderConfigures++;
    }
    ownJob.decoder = decoder;
    pump(ownJob);
  }
  function chooseJob() {
    if (!initialized || suspended || closed || failed) return;
    drawLatest();
    const group = groupAt(desired);
    if (job?.group === group) {
      // Already queued frames can satisfy a newer target. A backwards cache
      // miss needs its keyframe; tiny backwards steps use the three held frames.
      if (frames.has(desired) || desired >= job.highestOutput) {
        pump();
        return;
      }
    }
    // Coalesce only cache misses needing a keyframe. Continuous targets do not
    // move the deadline, so stopping always gets a chance to decode its frame.
    if (!restartTimer) restartTimer = setTimeout(() => {
      restartTimer = null;
      try { startLatestJob(); } catch (error) { fail(error); }
    }, RESTART_INTERVAL);
  }
  function startLatestJob() {
    if (!initialized || suspended || closed || failed) return;
    const group = groupAt(desired);
    if (job?.group === group && (frames.has(desired) || desired >= job.highestOutput)) {
      pump();
      return;
    }
    invalidate();
    counters.resets++;
    const ownJob = {
      group, generation, samples: null, decoder: null, next: 0,
      timestampBase: generation * TIMESTAMP_STRIDE,
      highestOutput: -1, pending: new Set(), requestId: null,
      flushing: false, finished: false, timeout: null, progressTimeout: null
    };
    job = ownJob;
    if (compressed.has(group)) {
      configure(ownJob, compressed.get(group));
      return;
    }
    ownJob.requestId = ++requestSequence;
    counters.reads++;
    emit({ type: 'read', requestId: ownJob.requestId, group, src: manifest.fragments[group].src });
  }
  function data(message) {
    const ownJob = job;
    if (!ownJob || message.requestId !== ownJob.requestId || message.group !== ownJob.group
      || !isActive(ownJob.generation)) { counters.staleResponses++; return; }
    ownJob.requestId = null;
    if (message.error) { fail(new Error(message.error)); return; }
    if (!(message.bytes instanceof ArrayBuffer)) { fail(new Error('Missing original GOP bytes')); return; }
    const samples = ScrollFrameMP4.samples(new Uint8Array(message.bytes), metadata, fps);
    if (!samples.length || samples.length > 12) throw new Error('Unexpected original GOP length');
    compressed.set(ownJob.group, samples);
    while (compressed.size > 3) {
      const farthest = [...compressed.keys()]
        .sort((a, b) => Math.abs(b - ownJob.group) - Math.abs(a - ownJob.group))[0];
      compressed.delete(farthest);
    }
    configure(ownJob, samples);
  }
  async function init(message) {
    if (initialized || canvas) throw new Error('Frame worker is already initialized');
    if (!self.VideoDecoder || !self.EncodedVideoChunk) throw new Error('Worker frame decoding is unavailable');
    manifest = message.manifest;
    fps = Number(message.fps) || 60;
    if (!(manifest?.frames > 0) || !manifest.fragments?.length || !(fps > 0)) throw new Error('Invalid original frame manifest');
    metadata = ScrollFrameMP4.config(new Uint8Array(message.init));
    const support = await VideoDecoder.isConfigSupported(metadata.decoder);
    if (closed || failed) return;
    if (!support.supported) throw new Error('Original video codec is unsupported');
    canvas = message.canvas;
    canvas.width = metadata.decoder.codedWidth;
    canvas.height = metadata.decoder.codedHeight;
    context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) throw new Error('Worker canvas drawing is unavailable');
    initialized = true;
    desired = normalize(desired);
    emit({ type: 'ready', width: canvas.width, height: canvas.height });
    chooseJob();
  }
  async function capture(requestId) {
    // Verification only: never read pixels in the animation/performance path.
    const capturedFrame = painted;
    try {
      if (!context || closed || failed) throw new Error('Worker canvas is unavailable');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const digest = await crypto.subtle.digest('SHA-256', pixels);
      const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
      emit({ type: 'captured', requestId, frame: capturedFrame, hash });
    } catch (error) { emit({ type: 'captured', requestId, frame: capturedFrame, error: error.message }); }
  }
  self.onmessage = event => {
    const message = event.data;
    if (closed) return;
    try {
      switch (message.type) {
        case 'init': init(message).catch(fail); break;
        case 'target': {
          if (Number.isFinite(message.serial) && message.serial < serial) break;
          const next = initialized ? normalize(message.frame) : Math.max(0, Math.round(Number(message.frame) || 0));
          if (next !== desired) direction = next > desired ? 1 : -1;
          desired = next;
          serial = Number.isFinite(message.serial) ? message.serial : serial + 1;
          chooseJob();
          break;
        }
        case 'data': data(message); break;
        case 'suspend':
          if (!suspended) { suspended = true; invalidate(true); }
          compressed.clear();
          emit({ type: 'suspended', stats: stats() });
          break;
        case 'resume': suspended = false; chooseJob(); break;
        case 'capture': capture(message.requestId); break;
        case 'close':
          closed = true;
          invalidate(true);
          compressed.clear();
          if (canvas) canvas.width = 0;
          emit({ type: 'closed', stats: stats() });
          self.close();
          break;
      }
    } catch (error) { fail(error); }
  };
})();
