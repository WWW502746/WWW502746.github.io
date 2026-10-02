(() => {
  const artwork = new Map();

  function applyLettering(root = document) {
    const elements = root.matches?.('[data-lettering]') ? [root] : root.querySelectorAll('[data-lettering]');
    elements.forEach(element => {
      const text = element.dataset.lettering;
      const item = artwork.get(text);
      element.classList.remove('lettering-ready');
      element.removeAttribute('aria-label');
      element.textContent = text;
      if (!item) return;
      const {src, width, height, x, y, w, h} = item;
      element.style.setProperty('--letter-ratio', w / h);
      element.style.setProperty('--letter-sheet', `url("${src}")`);
      element.style.setProperty('--letter-size', `${width / w * 100}% ${height / h * 100}%`);
      element.style.setProperty('--letter-position', `${x / (width - w) * 100}% ${y / (height - h) * 100}%`);
      const label = document.createElement('span');
      label.className = 'lettering-text';
      label.textContent = text;
      element.replaceChildren(label);
      element.setAttribute('aria-label', text);
      element.classList.add('lettering-ready');
    });
  }

  window.applyLettering = applyLettering;
  // Populate only after the original title artwork has loaded successfully.
  window.registerLettering = async (src, regions) => {
    const image = new Image();
    image.src = src;
    let ink;
    try {
      await image.decode();
      // Convert the black ground to a live ink mask, without changing the source artwork.
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < pixels.data.length; i += 4) {
        const light = (pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2]) / 3;
        pixels.data[i + 3] *= Math.max(0, Math.min(1, (light - 32) / 200));
        pixels.data[i] = 222; pixels.data[i + 1] = 223; pixels.data[i + 2] = 214;
      }
      ctx.putImageData(pixels, 0, 0);
      ink = canvas.toDataURL('image/png');
    } catch { return; }
    regions.forEach(([text, x, y, w, h]) => artwork.set(text, {src: ink, width: image.naturalWidth, height: image.naturalHeight, x, y, w, h}));
    applyLettering();
  };
})();

window.registerLettering('assets/lettering/approved-titles.png', [
  ['碑间',85,277,197,110], ['寻字',952,646,114,66]
]);
window.registerLettering('assets/lettering/work-titles.png', [
  ['界碑',908,133,278,155], ['残响',71,547,276,143], ['巡碑',487,547,285,155],
  ['缺口',910,559,265,126], ['侧光',67,959,277,134], ['地层',488,960,275,129], ['仍在',908,955,276,145]
]);
window.registerLettering('assets/lettering/section-titles.png', [
  ['石上留痕',143,120,484,123], ['无声成章',914,114,489,145],
  ['字与石之间',112,448,545,123], ['石的另一面',872,453,562,114],
  ['一座不存在',121,781,546,122], ['的遗址',991,780,350,125]
]);
