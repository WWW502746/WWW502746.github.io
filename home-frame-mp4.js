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
  globalThis.ScrollFrameMP4 = { config, samples };
})();
