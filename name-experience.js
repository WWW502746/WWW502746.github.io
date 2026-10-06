import {styles, spectrum, hashText, readName, candidates, profileFor, validSession} from './name-core.js?v=v4';
import {finishOptions, defaultFinish, normalizeFinish, materialFiles, paintRubbing} from './name-finish.js?v=v4';

const root = document.getElementById('name-app');
const page = root.closest('[data-page]');
const key = 'beilin-name-v4';
const glyphCache = new Map();
const cleanGlyphCache = new Map();
const loadedFonts = new Set();
const today = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'});
let coverage, profiles, assetsPromise, materialsPromise, materials, texture, busy = false, restored = false;
let state = {view: 'entry', name: '王子墨', index: 0, choices: [null, null, null], finish: {...defaultFinish}, date: today()};
let active = null;

const esc = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const pad = number => String(number).padStart(2, '0');
const chars = () => [...state.name];
const compositionId = (finish = state.finish) => hashText(state.name + state.choices.join(':') + JSON.stringify(normalizeFinish(finish))).toString(16).toUpperCase().padStart(8, '0');

function persist() {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* The experience also works without storage. */ }
}

function footer(step) {
  return `<footer class="name-footer"><span>${esc(state.name)}</span><ol>${['寻字', '择形', '确认', '制拓', '成拓'].map((label, i) => `<li ${step === i ? 'aria-current="step"' : ''}><span>0${i + 1}</span> ${label}</li>`).join('')}</ol><span>${step === 1 ? `${pad(state.index + 1)} / ${pad(chars().length)}` : 'BEIJIAN / NAME'}</span></footer>`;
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('字库暂时无法载入，请重试。');
  return response.json();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图像暂时无法载入，请重试。'));
    image.src = src;
  });
}

async function assets() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([
      getJSON('assets/name/coverage.json?v=v4'), getJSON('assets/name/profiles.json?v=v4'),
      loadImage('assets/surface-02.png'),
      ...styles.map(async style => {
        if (loadedFonts.has(style.id)) return;
        const font = new FontFace(style.family, `url(assets/name/fonts/${style.file}.woff2)`);
        await font.load();
        document.fonts.add(font);
        loadedFonts.add(style.id);
      })
    ]).then(([map, library, image]) => {
      coverage = map; profiles = library; texture = image;
    }).catch(error => { assetsPromise = null; throw error; });
  }
  return assetsPromise;
}

async function loadMaterials() {
  if (!materialsPromise) materialsPromise = Promise.all(materialFiles.map(async key => [key, await loadImage(`assets/name/materials/${key}.webp`)]))
    .then(entries => { materials = Object.fromEntries(entries); })
    .catch(error => { materialsPromise = null; throw error; });
  return materialsPromise;
}

// Paper choices use solid ink; stone and result specimens retain their surface grain.
function glyph(char, style, tone = 'stone') {
  const id = `${char}:${style.id}:${tone}`;
  if (glyphCache.has(id)) return glyphCache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 640;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.font = `470px "${style.family}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(char);
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  ctx.fillStyle = tone === 'ink' ? '#11120f' : '#eee8da';
  ctx.fillText(char, 320 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2, (640 - inkHeight) / 2 + metrics.actualBoundingBoxAscent);
  if (tone === 'stone') {
    const surface = document.createElement('canvas');
    surface.width = surface.height = 640;
    const grain = surface.getContext('2d', {willReadFrequently: true});
    const seed = hashText(id);
    const side = Math.min(texture.width, texture.height) * .56;
    grain.drawImage(texture, (seed % 997) / 997 * (texture.width - side), ((seed >>> 8) % 991) / 991 * (texture.height - side), side, side, 0, 0, 640, 640);
    const rough = grain.getImageData(0, 0, 640, 640).data;
    const pixels = ctx.getImageData(0, 0, 640, 640);
    let random = seed;
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      const light = (rough[i] + rough[i + 1] + rough[i + 2]) / 765;
      pixels.data[i + 3] *= (random / 4294967296 < .04 ? .1 : .6 + light * .4);
    }
    ctx.putImageData(pixels, 0, 0);
  }
  const result = {canvas, url: canvas.toDataURL('image/png')};
  if (glyphCache.size >= 40) glyphCache.delete(glyphCache.keys().next().value);
  glyphCache.set(id, result);
  return result;
}

function cleanGlyph(char, style) {
  const id = `${char}:${style.id}`;
  if (cleanGlyphCache.has(id)) return cleanGlyphCache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 640;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.font = `470px "${style.family}"`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(char);
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  ctx.fillStyle = '#fff';
  ctx.fillText(char, 320 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2, (640 - inkHeight) / 2 + metrics.actualBoundingBoxAscent);
  cleanGlyphCache.set(id, canvas);
  return canvas;
}

function render(focus = false) {
  if (page.classList.contains('page--active')) document.body.dataset.view = state.view;
  root.innerHTML = state.view === 'entry' ? entry() : state.view === 'review' ? review() : state.view === 'pick' ? pick() : state.view === 'craft' ? craft() : result();
  window.lucide?.createIcons();
  window.applyLettering?.(root);
  if (state.view === 'craft') paintCraft();
  if (state.view === 'result') paintPoster(root.querySelector('#name-poster'));
  if (focus && page.classList.contains('page--active')) {
    window.scrollTo({top: 0, behavior: 'instant'});
    root.querySelector('[data-view-heading]')?.focus({preventScroll: true});
  }
}

function setView(view) {
  state.view = view;
  persist();
  render(true);
}

function entry() {
  return `<div class="name-entry">
    <img class="name-entry__image" src="assets/name/entry-stone.png" alt="纸张从黑色石面轻轻揭起，王字在侧光下显现" loading="lazy">
    <div class="name-entry__copy"><p class="name-kicker">字形索引</p>
    <h1 data-view-heading data-lettering="寻字" tabindex="-1">寻字</h1><p class="name-entry__line">在碑间找到你的字</p>
    <form id="name-form" novalidate><label for="name-input">姓名</label><div class="name-input-row">
    <input id="name-input" name="name" aria-describedby="name-message" autocomplete="off" spellcheck="false" value="${esc(state.name)}" placeholder="你的名字">
    <button type="submit">开始寻字 ${icon('arrow-right')}</button></div>
    <p class="name-message" id="name-message" role="status"></p></form>
    <p class="name-provenance">字形演绎 / 非原碑拓片</p></div>
    ${footer(0)}</div><div class="name-entry-tail"><h2>字的来处</h2><p>一笔有形，一字有性。</p><img src="assets/name/entry-stone.png" alt="拓片与石面的细节" loading="lazy"></div>`;
}

function review() {
  return `<div class="experiment-review"><header class="review-heading"><p class="name-kicker">字形确认</p><h1 data-view-heading tabindex="-1">${esc(state.name)}</h1><p>这就是你选的字。</p></header>
    <div class="stone-gallery" style="--count:${chars().length}">${chars().map((char, index) => {
        const options = candidates(char, coverage);
        const selected = styles.find(style => style.id === state.choices[index]);
        const stone = ['a', 'b', 'c', 'b'][index];
        return `<button class="stone-specimen stone-specimen--${stone}" data-action="letter" data-index="${index}" aria-label="重新选择第${index + 1}个字：${esc(char)}"><span class="stone-object"><img class="stone-specimen__stone" src="assets/name/scene/stone-${stone}.png" alt="" draggable="false"><img class="stone-specimen__glyph" src="${glyph(char, selected).url}" alt="${esc(char)}" draggable="false"></span><span class="stone-caption"><span>${pad(index + 1)} / 字形 ${pad(options.indexOf(selected) + 1)}</span><span class="stone-edit">重新选择 ${icon('arrow-up-right')}</span></span></button>`;
      }).join('')}</div>
    <div class="scene-actions"><button data-action="revise">${icon('arrow-left')} 返回择形</button><p class="review-message" role="status"></p><button class="name-primary" data-action="craft">确认字形，开始制拓 ${icon('arrow-right')}</button></div>
    </div>${footer(2)}`;
}

function pick() {
  const char = chars()[state.index];
  const options = candidates(char, coverage);
  const chosen = options.find(style => style.id === active);
  return `<div class="experiment-pick"><header class="pick-heading"><div><h1 data-view-heading tabindex="-1">择形</h1><p>选一个你喜欢的字</p></div><div class="pick-progress"><div class="name-letters" aria-label="姓名进度">${chars().map((letter, i) => `<button data-action="letter" data-index="${i}" aria-label="选择第 ${i + 1} 个字 ${esc(letter)}" ${i === state.index ? 'aria-current="step"' : ''}>${esc(letter)}${state.choices[i] ? '<span class="name-done"></span>' : ''}</button>`).join('')}</div><span>${pad(state.index + 1)} / ${pad(chars().length)}</span></div></header>
    <div class="paper-gallery" role="group" aria-label="${esc(char)}的字形候选">${options.map((style, i) => `<button class="paper-choice" data-action="choose" data-style="${style.id}" aria-pressed="${active === style.id}" aria-label="${esc(char)}，第${i + 1}种字形"><span class="paper-sheet"><img src="${glyph(char, style, 'ink').url}" alt="" draggable="false"></span><span class="paper-number"><i aria-hidden="true"></i>${pad(i + 1)}</span></button>`).join('')}</div>
    <div class="scene-actions"><button data-action="back">${icon('arrow-left')} 返回</button><div class="name-confirm"><p role="status"></p><button class="name-primary" data-action="confirm" ${chosen ? '' : 'disabled'}>选好了 ${icon('arrow-right')}</button></div></div></div>${footer(1)}`;
}

function craft() {
  const short = {black:'乌金',graphite:'石墨',cinnabar:'朱砂',ochre:'赭石',raw:'生宣',cotton:'棉麻',antique:'仿古',cicada:'蝉翼',coarse:'粗麻',cracked:'裂纹'};
  const group = (key, title) => `<fieldset class="material-group material-group--${key}"><legend>${title}</legend><div class="material-options">${finishOptions[key].map(([id,label]) => `<button class="material-option" data-finish-key="${key}" data-finish-id="${id}" aria-label="${label}" aria-pressed="${state.finish[key] === id}">${key === 'carving' ? `<i class="carving-sample carving-sample--${id}" aria-hidden="true">字</i>` : ['stone','paper'].includes(key) ? `<img src="assets/name/materials/${key}-${id}.webp" alt="" draggable="false">` : key === 'ink' ? `<i class="ink-swatch ink-swatch--${id}" aria-hidden="true"></i>` : ''}<span>${short[id] || label}</span></button>`).join('')}</div></fieldset>`;
  const slider = (key, label, left, right) => `<div class="finish-range"><div class="finish-range__labels"><span>${left}</span><output for="finish-${key}">${Math.round(state.finish[key] * 100)}%</output><span>${right}</span></div><input id="finish-${key}" type="range" min="0" max="100" step="1" value="${Math.round(state.finish[key] * 100)}" data-finish-range="${key}" aria-label="${label}" style="--value:${state.finish[key] * 100}%"></div>`;
  return `<div class="experiment-craft"><div class="craft-controls"><header><h1 data-view-heading tabindex="-1">制拓</h1><p>${esc(state.name)}</p></header>${group('carving','刻法')}${group('stone','石材')}${group('ink','墨色')}${group('paper','纸张')}<fieldset class="material-group material-group--pressure"><legend>拓印</legend><div class="pressure-controls"><div class="pressure-presets">${finishOptions.technique.map(([id,label]) => `<button data-finish-key="technique" data-finish-id="${id}" aria-pressed="${state.finish.pressure === (id === 'light' ? 0 : 1)}">${label}</button>`).join('')}</div>${slider('pressure','拓印轻重','轻','重')}</div></fieldset><fieldset class="material-group material-group--weather"><legend>风化</legend>${slider('weather','风化程度','完整','残拓')}</fieldset></div>
    <aside class="craft-preview"><div class="poster-paper"><canvas id="name-poster" width="900" height="1260" role="img" aria-label="${esc(state.name)}的当前拓片预览"></canvas></div><p>数字拓片 <span>· 非真实碑刻拓本</span></p></aside>
    <div class="scene-actions"><button data-action="review">${icon('arrow-left')} 返回确认</button><button class="name-primary" data-action="make">完成拓片 ${icon('arrow-right')}</button></div></div>${footer(3)}`;
}

function posterDetails(finish = state.finish) {
  return {name: state.name, glyphs: chars().map((char, index) => cleanGlyph(char, styles.find(style => style.id === state.choices[index]))), finish,
    persona: state.view === 'result' ? profileFor(state.choices, normalizeFinish(finish), profiles) : null,
    date: state.date, id: compositionId(finish), materials};
}

function paintCraft() {
  paintPoster(root.querySelector('#name-poster'));
}

function spectrumFacet([axis, title, left, right], index, axes) {
  const value = axes[axis];
  const balanced = Math.abs(value) < .18;
  const leaningLeft = value < 0;
  const label = balanced ? '均衡' : leaningLeft ? left : right;
  const note = balanced ? `${left}与${right}接近` : `${Math.abs(value) < .5 ? '略偏' : '明显偏向'} · 另一端是${leaningLeft ? right : left}`;
  return `<div class="name-spectrum__facet"><span class="name-spectrum__facet-head"><i>${pad(index + 1)}</i>${title}</span><strong>${label}</strong><small>${note}</small></div>`;
}

function result() {
  const finish = normalizeFinish(state.finish);
  const persona = profileFor(state.choices, finish, profiles);
  const id = compositionId(finish);
  const profileNumber = profiles.profiles.findIndex(item => item.name === persona.name) + 1;
  const finishLabel = key => finishOptions[key].find(([value]) => value === finish[key])[1];
  return `<div class="name-result">
    <span class="name-result__number" aria-hidden="true">${esc(persona.name)}</span>
    <header class="name-result__hero">
      <p class="name-kicker">05 / YOUR INSCRIPTION · ${id}</p>
      <p class="name-result__owner">${esc(state.name)} 的寻字结果</p>
      <p class="name-result__family"><span>第 ${pad(persona.group + 1)} 组</span> ${esc(persona.groupInfo.name)}</p>
      <h1 data-view-heading tabindex="-1">${esc(persona.name)}</h1>
      <p class="name-result__theme">${esc(persona.groupInfo.theme)}</p>
      <span class="name-result__rule" aria-hidden="true"></span>
      <div class="name-result__trace"><p>此次所选字形 <span>GLYPH COMPOSITION</span></p><ol>${chars().map((char, index) => {
        const style = styles.find(item => item.id === state.choices[index]);
        return `<li><span>${pad(index + 1)}</span><img src="${glyph(char, style).url}" alt="${esc(char)}"></li>`;
      }).join('')}</ol></div>
    </header>
    <aside class="name-result__print"><div class="name-result__print-head"><span>PERSONAL RUBBING</span><span>${id}</span></div>
      <canvas id="name-poster" width="900" height="1260" role="img" aria-label="${esc(state.name)}的个人拓片，书写人格${esc(persona.name)}"></canvas>
      <p class="name-result__materials"><span>拓印记录</span>${[finishLabel('stone'), finishLabel('ink'), finishLabel('paper'), finishLabel('technique')].join(' / ')}</p>
      <div class="name-print-actions"><button data-action="download">${icon('download')} 保存个人拓片</button><button data-action="sources">${icon('arrow-up-right')} 查看字的来处</button></div><p class="name-message" role="status" id="name-download-message"></p>
    </aside>
    <section class="name-result__story" aria-labelledby="name-result-about">
      <p class="name-kicker">THE CHARACTER / 人格叙事</p>
      <h2 id="name-result-about">${esc(persona.name)}</h2>
      <p class="name-result__intro">${esc(persona.intro)}</p>
      <div class="name-result__chapters">
        <article><span>01 / 天赋所在</span><h3>适合你的舞台</h3><p>${esc(persona.strength)}</p></article>
        <article><span>02 / 向前一步</span><h3>值得练习的事</h3><p>${esc(persona.growth)}</p></article>
      </div>
    </section>
    <figure class="name-result__art">
      <img src="assets/name/personas/${pad(profileNumber)}.webp" width="1086" height="1448" alt="${esc(persona.name)}的水墨人物画，题有对应的小诗" loading="lazy" decoding="async">
      <figcaption><span>性格人物画</span><span>${pad(profileNumber)} / 16</span></figcaption>
    </figure>
    <section class="name-result__basis">
      <details class="name-spectrum" open><summary>这次选字的书写谱 ${icon('plus')}</summary><div class="name-spectrum__body">${spectrum.map((item, index) => spectrumFacet(item, index, persona.axes)).join('')}</div></details>
      <p class="name-provenance">书写谱呈现所选字形的视觉特征，人物解读由字形与拓印材质共同形成。这是一份艺术化叙事。</p>
      <div class="name-result__revisit"><button data-action="recraft">${icon('arrow-left')} 修改拓印材质</button><button data-action="revise">${icon('arrow-left')} 重新选字</button></div>
    </section>
    <section class="name-result__atlas" aria-label="寻字十六型谱">
      <div class="name-result__atlas-head"><div><p class="name-kicker">PERSONALITY ARCHIVE / 04 × 04</p><h2>十六型谱</h2></div><p>一方字形，落在四组十六种不同的性格叙事之间。<br>当前为第 ${pad(profileNumber)} 型，共 16 型。</p></div>
      <div class="name-result__atlas-grid">${profiles.groups.map((group, groupIndex) => `<div class="name-result__atlas-row"><div class="name-result__atlas-group"><span>${pad(groupIndex + 1)} / 04</span><strong>${esc(group.name)}</strong><small>${esc(group.theme)}</small></div>${profiles.profiles.slice(groupIndex * 4, groupIndex * 4 + 4).map((item, index) => `<div class="name-result__atlas-type" ${item.name === persona.name ? 'aria-current="true"' : ''}><span>${pad(groupIndex * 4 + index + 1)}</span><strong>${esc(item.name)}</strong></div>`).join('')}</div>`).join('')}</div>
    </section>
  </div>${footer(4)}`;
}

function paintPoster(canvas) {
  paintRubbing(canvas, posterDetails());
}

function exportPoster() {
  const canvas = document.createElement('canvas');
  canvas.width = 2000; canvas.height = 2800;
  paintPoster(canvas);
  return canvas;
}

root.exportPoster = exportPoster;

const dialog = document.createElement('dialog');
dialog.className = 'name-source-dialog';
dialog.setAttribute('aria-label', '字形来源');
document.body.appendChild(dialog);
dialog.addEventListener('click', event => {
  if (event.target.closest('[data-source-close]') || event.target === dialog) dialog.close();
});
dialog.addEventListener('close', () => document.body.classList.remove('is-name-dialog'));

function openSources(items) {
  dialog.innerHTML = `<header><div><p class="name-kicker">TYPE / PROVENANCE</p><h2>字形来源</h2></div><button data-source-close aria-label="关闭字形来源" title="关闭">${icon('x')}</button></header><p class="name-source-notice">本次字形由开放字体与石面肌理合成，不对应真实碑刻、年代或碑面位置。</p><div class="name-source-list">${items.map(({char, style}) => `<article><img src="${glyph(char, style).url}" alt="${esc(char)}字形"><div><h3>${esc(char)} / ${style.title}</h3><p>${style.author}</p><p>${style.license || 'SIL Open Font License 1.1'}</p><a href="${style.sourceUrl || `https://github.com/google/fonts/tree/main/ofl/${style.repo}`}" target="_blank" rel="noopener noreferrer">字体项目 ${icon('arrow-up-right')}</a><a href="assets/name/fonts/${style.licenseFile || `${style.repo}-OFL.txt`}" target="_blank" rel="noopener noreferrer">许可原文 ${icon('arrow-up-right')}</a></div></article>`).join('')}</div>`;
  window.lucide?.createIcons();
  dialog.showModal();
  document.body.classList.add('is-name-dialog');
}

root.addEventListener('submit', async event => {
  if (event.target.id !== 'name-form') return;
  event.preventDefault();
  if (busy) return;
  const input = root.querySelector('#name-input');
  const message = root.querySelector('#name-message');
  const button = event.target.querySelector('button');
  try {
    const name = readName(input.value);
    input.removeAttribute('aria-invalid');
    busy = true; button.disabled = true; message.textContent = '字形载入中…';
    await assets();
    const missing = [...new Set([...name].filter(char => !candidates(char, coverage).length))];
    if (missing.length) throw new Error(`「${missing.join('、')}」尚未收录，请修改姓名。`);
    state = {view: 'pick', name, index: 0, choices: [...name].map(() => null), finish: {...defaultFinish}, date: today()};
    active = null; persist(); render(true);
  } catch (error) {
    message.textContent = /汉字|尚未收录/.test(error.message) ? error.message : '字库暂时无法载入，请再点一次「开始寻字」。';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  } finally { busy = false; button.disabled = false; }
});

root.addEventListener('click', async event => {
  const finishButton = event.target.closest('[data-finish-key]');
  if (finishButton) {
    const key = finishButton.dataset.finishKey;
    state.finish[key] = finishButton.dataset.finishId;
    if (key === 'technique') {
      state.finish.pressure = state.finish.technique === 'light' ? 0 : 1;
      const slider = root.querySelector('#finish-pressure');
      slider.value = state.finish.pressure * 100;
      syncRange(slider);
    }
    root.querySelectorAll(`[data-finish-key="${key}"]`).forEach(item => item.setAttribute('aria-pressed', String(item === finishButton)));
    paintPoster(root.querySelector('#name-poster'));
    persist();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'entry') setView('entry');
  if (action === 'revise') {
    state.index = 0; active = state.choices[state.index]; setView('pick');
  }
  if (action === 'back') {
    if (state.index === 0) setView('entry');
    else { state.index--; active = state.choices[state.index]; setView('pick'); }
  }
  if (action === 'letter') {
    state.index = Number(button.dataset.index); active = state.choices[state.index]; setView('pick');
  }
  if (action === 'choose') {
    active = button.dataset.style;
    root.querySelectorAll('[data-action="choose"]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    root.querySelector('[data-action="confirm"]').disabled = false;
    window.lucide?.createIcons();
  }
  if (action === 'confirm' && active) {
    state.choices[state.index] = active;
    const next = state.choices.findIndex((value, i) => i > state.index && !value);
    const missing = next >= 0 ? next : state.choices.findIndex(value => !value);
    if (missing < 0) setView('review');
    else { state.index = missing; active = state.choices[missing]; setView('pick'); }
  }
  if (action === 'review') setView('review');
  if (action === 'craft') {
    button.disabled = true;
    const hint = root.querySelector('.review-message');
    hint.textContent = '正在载入石材与纸张…';
    try { await loadMaterials(); setView('craft'); }
    catch { hint.textContent = '材质载入失败，请再试一次。'; button.disabled = false; }
  }
  if (action === 'make') setView('result');
  if (action === 'restart') setView('entry');
  if (action === 'recraft') setView('craft');
  if (action === 'source') openSources([{char: button.dataset.char, style: styles.find(style => style.id === button.dataset.style)}]);
  if (action === 'sources') openSources(chars().map((char, index) => ({char, style: styles.find(style => style.id === state.choices[index])})));
  if (action === 'download') {
    const message = root.querySelector('#name-download-message');
    button.disabled = true;
    try {
      const canvas = exportPoster();
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Empty image');
      const file = new File([blob], `碑间-${state.name}.png`, {type: 'image/png'});
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({files: [file]})) {
        try { await navigator.share({files: [file], title: `${state.name}的个人拓片`}); }
        catch (error) { if (error.name !== 'AbortError') throw error; }
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = file.name;
        document.body.appendChild(link); link.click(); link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
        message.textContent = '个人拓片已生成。';
      }
    } catch { message.textContent = '暂时无法保存，请重试。'; }
    finally { button.disabled = false; }
  }
});

function syncRange(input) {
  input.style.setProperty('--value', `${input.value}%`);
  root.querySelector(`output[for="${input.id}"]`).textContent = `${input.value}%`;
}

let paintFrame = 0;
root.addEventListener('input', event => {
  const input = event.target.closest('[data-finish-range]');
  if (!input) return;
  state.finish[input.dataset.finishRange] = Number(input.value) / 100;
  state.finish = normalizeFinish(state.finish);
  syncRange(input);
  root.querySelectorAll('[data-finish-key="technique"]').forEach(button => button.setAttribute('aria-pressed', String(state.finish.pressure === (button.dataset.finishId === 'light' ? 0 : 1))));
  persist();
  cancelAnimationFrame(paintFrame);
  paintFrame = requestAnimationFrame(() => {
    if (state.view === 'craft') paintCraft();
  });
});

// Retain the work gallery lift and tilt, with no light sweep or hover glow.
root.addEventListener('pointermove', event => {
  const card = event.target.closest('.stone-specimen');
  if (!card || !matchMedia('(pointer: fine)').matches || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const rect = card.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
  card.style.setProperty('--rx', `${(.5 - y) * 9}deg`);
  card.style.setProperty('--ry', `${(x - .5) * 11}deg`);
});
function resetStone(event) {
  const card = event.target.closest('.stone-specimen');
  if (card && !card.contains(event.relatedTarget)) {
    for (const key of ['--rx', '--ry']) card.style.removeProperty(key);
  }
}
root.addEventListener('pointerout', resetStone);
root.addEventListener('focusout', resetStone);

async function enter() {
  if (!restored) {
    restored = true;
    let saved;
    try { saved = JSON.parse(sessionStorage.getItem(key)); } catch { /* Ignore unavailable or damaged local state. */ }
    if (saved && saved.view !== 'entry') {
      const message = root.querySelector('#name-message');
      if (message) message.textContent = '恢复字形中…';
      try {
        busy = true; await assets();
        if (saved.view === 'found') saved.view = saved.choices?.every(Boolean) ? 'review' : 'pick';
        if (['craft', 'result'].includes(saved.view)) await loadMaterials();
        if (validSession(saved, coverage)) { state = {...saved, finish: normalizeFinish(saved.finish)}; active = state.choices[state.index]; render(); }
      } catch { if (message) message.textContent = '字库暂时无法载入，可重新开始。'; }
      finally { busy = false; if (message?.isConnected) message.textContent = ''; }
    }
  }
}

window.addEventListener('site:page', event => {
  if (event.detail.route === 'name') { document.body.dataset.view = state.view; enter(); }
  else { delete document.body.dataset.view; if (dialog.open) dialog.close(); }
});
render();
if (page.classList.contains('page--active')) enter();
