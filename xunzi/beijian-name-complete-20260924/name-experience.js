import {styles, spectrum, hashText, readName, candidates, profileFor, validSession} from './name-core.js?v=name8';
import {finishOptions, defaultFinish, normalizeFinish, materialFiles, paintRubbing, paintStone} from './name-finish.js?v=name14';

const root = document.getElementById('name-app');
const page = root.closest('[data-page]');
const key = 'beilin-name-v1';
const glyphCache = new Map();
const cleanGlyphCache = new Map();
const loadedFonts = new Set();
const today = () => new Date().toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'});
let coverage, profiles, assetsPromise, materialsPromise, materials, texture, busy = false, restored = false;
let state = {view: 'entry', name: '王子墨', index: 0, choices: [null, null, null], finish: {...defaultFinish}, date: today()};
let active = null;
let weatherPreviewFrame = 0;

const esc = value => String(value).replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char]));
const icon = name => `<i data-lucide="${name}" aria-hidden="true"></i>`;
const pad = number => String(number).padStart(2, '0');
const chars = () => [...state.name];
const compositionId = (finish = state.finish) => hashText(state.name + state.choices.join(':') + JSON.stringify(normalizeFinish(finish))).toString(16).toUpperCase().padStart(8, '0');

function persist() {
  try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* The experience also works without storage. */ }
}

function footer(step) {
  return `<footer class="name-footer"><span>${esc(state.name)}</span><ol>${['寻字', '择形', '制拓', '成拓'].map((label, i) => `<li ${step === i ? 'aria-current="step"' : ''}><span>0${i + 1}</span> ${label}</li>`).join('')}</ol><span>${step === 1 ? `${pad(state.index + 1)} / ${pad(chars().length)}` : 'BEIJIAN / NAME'}</span></footer>`;
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
      getJSON('assets/name/coverage.json'), getJSON('assets/name/profiles.json'),
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

// A single cached mask is used in both the chooser and the downloadable print.
function glyph(char, style) {
  const id = `${char}:${style.id}`;
  if (glyphCache.has(id)) return glyphCache.get(id);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 640;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  ctx.font = `470px "${style.family}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(char);
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  ctx.fillStyle = '#deddd7';
  ctx.fillText(char, 320, (640 - inkHeight) / 2 + metrics.actualBoundingBoxAscent);
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
  const ctx = canvas.getContext('2d');
  ctx.font = `470px "${style.family}"`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  const metrics = ctx.measureText(char);
  const inkHeight = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
  ctx.fillStyle = '#fff';
  ctx.fillText(char, 320, (640 - inkHeight) / 2 + metrics.actualBoundingBoxAscent);
  cleanGlyphCache.set(id, canvas);
  return canvas;
}

function render(focus = false) {
  root.innerHTML = state.view === 'entry' ? entry() : state.view === 'found' ? found() : state.view === 'pick' ? pick() : state.view === 'craft' ? craft() : result();
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

function found() {
  const missing = chars().filter(char => !candidates(char, coverage).length);
  return `<div class="name-found"><div><p class="name-kicker">NAME INDEX / 字形索引</p><h1 data-view-heading tabindex="-1">${esc(state.name)}</h1></div>
    <div class="name-found__list">${chars().map((char, index) => {
      const options = candidates(char, coverage);
      return `<div class="name-found__item"><span>${pad(index + 1)}</span><strong>${esc(char)}</strong><span>${options.length ? `${pad(options.length)} 种字形` : '尚未收录'}</span></div>`;
    }).join('')}</div>
    <p class="name-provenance">${missing.length ? `「${esc([...new Set(missing)].join('、'))}」暂无可用字形。请换一个名字，或用「王子墨」试试。` : '字形演绎 / 非原碑拓片'}</p>
    <div class="name-actions"><button data-action="entry">${icon('arrow-left')} 修改姓名</button><button class="name-primary" data-action="begin" ${missing.length ? 'disabled' : ''}>进入选择 ${icon('arrow-right')}</button></div>
    </div>${footer(0)}`;
}

function pick() {
  const char = chars()[state.index];
  const options = candidates(char, coverage);
  const chosen = options.find(style => style.id === active);
  return `<div class="name-pick"><aside class="name-pick__progress"><p class="name-kicker">择形 / ${pad(state.index + 1)}</p>
    <h1 data-view-heading tabindex="-1">${esc(char)}</h1><div class="name-letters" aria-label="姓名进度">${chars().map((letter, i) => `<button data-action="letter" data-index="${i}" aria-label="选择第 ${i + 1} 个字 ${esc(letter)}" ${i === state.index ? 'aria-current="step"' : ''}>${esc(letter)}${state.choices[i] ? '<span class="name-done"></span>' : ''}</button>`).join('')}</div>
    <button class="name-back" data-action="back">${icon('arrow-left')} 返回</button></aside>
    <div class="name-glyph-grid" role="group" aria-label="${esc(char)}的字形候选">${options.map((style, i) => `<button class="name-glyph" data-action="choose" data-style="${style.id}" aria-pressed="${active === style.id}" aria-label="${style.label}，${style.title}">
      <span class="name-glyph__image" style="--grain-position:${(hashText(char + style.id) % 80) + 10}%"><img src="${glyph(char, style).url}" alt="${esc(char)} · ${style.title}"><span class="name-glyph__check">${icon('check')}</span></span>
      <span class="name-glyph__caption"><span>${pad(i + 1)} / ${style.label}</span><small>${style.title}</small></span></button>`).join('')}</div>
    <aside class="name-pick__source"><p class="name-kicker">当前字形</p><div id="name-current-source">${chosen ? sourceSummary(chosen, char) : '<h2>尚未选择</h2><p class="name-provenance">字形演绎 / 非原碑拓片</p>'}</div>
    <div class="name-confirm"><button class="name-primary" data-action="confirm" ${chosen ? '' : 'disabled'}>确认这个字 ${icon('arrow-right')}</button><p>${state.index === chars().length - 1 ? '下一步：选择拓印材质' : `下一个：${esc(chars()[state.index + 1])}`}</p></div></aside></div>${footer(1)}`;
}

function craft() {
  const group = (key, title, note) => `<fieldset class="name-craft__group"><legend>${title}</legend><p>${note}</p><div class="name-craft__options">${finishOptions[key].map(([id, label, description]) => `<button type="button" class="name-craft__option" data-finish-key="${key}" data-finish-id="${id}" aria-pressed="${state.finish[key] === id}"><canvas width="${key === 'stone' ? 540 : 180}" height="${key === 'stone' ? 756 : 252}" aria-hidden="true"></canvas><span>${label}<small>${description}</small></span></button>`).join('')}</div></fieldset>`;
  return `<div class="name-craft"><div class="name-craft__controls"><p class="name-kicker">03 / RUBBING STUDIO</p><h1 data-view-heading tabindex="-1">制拓</h1><p class="name-craft__intro">为「${esc(state.name)}」挑选承载字形的石、墨与纸。每次选择都会改变右侧拓片，也参与最终解读。</p>
    ${group('carving', '刻法', '阴刻是墨底留白；阳刻是纸底着墨，风化会蚀出字形边缘。')}
    ${group('stone', '石材', '石面颗粒会改变墨层的细密与斑驳。')}
    ${group('technique', '拓印轻重', '轻拓与重拓决定墨层厚薄。')}
    ${group('ink', '墨色', '选择最终拓片的颜色。')}
    ${group('paper', '纸张', '纸色、纤维与旧痕各有不同。')}
    <fieldset class="name-craft__group"><legend>风化程度</legend><p>0 为无风化，100 为严重风化，字迹将逐渐斑驳模糊。</p><label class="name-craft__weather" for="name-weather"><span>残碑风化</span><output id="name-weather-value" for="name-weather">${state.finish.weathered}</output></label><input id="name-weather" class="name-craft__weather-range" type="range" min="0" max="100" step="1" value="${state.finish.weathered}" aria-label="风化程度，0 为无风化，100 为严重风化"><div class="name-craft__weather-scale" aria-hidden="true"><span>0 · 无</span><span>100 · 严重</span></div></fieldset>
    <div class="name-craft__actions"><button data-action="revise">${icon('arrow-left')} 返回择形</button><button class="name-primary" data-action="make">完成拓片 ${icon('arrow-right')}</button></div></div>
    <aside class="name-craft__preview"><canvas id="name-poster" width="900" height="1260" role="img" aria-label="${esc(state.name)}的当前拓片预览"></canvas><p>数字演绎 · 非真实碑刻拓本</p></aside></div>${footer(2)}`;
}

function posterDetails(finish = state.finish) {
  return {name: state.name, glyphs: chars().map((char, index) => cleanGlyph(char, styles.find(style => style.id === state.choices[index]))), finish,
    persona: state.view === 'result' ? profileFor(state.choices, normalizeFinish(finish), profiles) : null,
    date: state.date, id: compositionId(finish), materials};
}

function paintCraft() {
  paintPoster(root.querySelector('#name-poster'));
  root.querySelectorAll('[data-finish-key]').forEach(button => {
    if (button.dataset.finishKey === 'stone') paintStone(button.querySelector('canvas'), button.dataset.finishId, posterDetails().glyphs, materials);
    else paintRubbing(button.querySelector('canvas'), posterDetails({...defaultFinish, [button.dataset.finishKey]: button.dataset.finishId}));
  });
}

function sourceSummary(style, char) {
  return `<h2>${style.title}</h2><p class="name-provenance">开放字体 / 字形演绎</p><img class="name-source-preview" src="${glyph(char, style).url}" alt="${esc(char)}字预览"><button class="name-source-link" data-action="source" data-style="${style.id}" data-char="${esc(char)}">查看字形来源 ${icon('arrow-up-right')}</button><p class="name-tags">${style.tags.join(' · ')}</p>`;
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
  const dominantLabel = styles.find(style => style.id === persona.dominantStyle).label;
  return `<div class="name-result">
    <span class="name-result__number" aria-hidden="true">${esc(persona.name)}</span>
    <header class="name-result__hero">
      <p class="name-kicker">04 / YOUR INSCRIPTION · ${id}</p>
      <p class="name-result__owner">${esc(state.name)} 的寻字结果</p>
      <p class="name-result__family"><span>第 ${pad(persona.group + 1)} 组</span> ${esc(persona.groupInfo.name)}</p>
      <h1 data-view-heading tabindex="-1">${esc(persona.name)}</h1>
      <p class="name-result__theme">${esc(persona.groupInfo.theme)}</p>
      <span class="name-result__rule" aria-hidden="true"></span>
      <div class="name-result__trace"><p>此次所选字形 · 主导「${dominantLabel}」 <span>GLYPH COMPOSITION</span></p><ol>${chars().map((char, index) => {
        const style = styles.find(item => item.id === state.choices[index]);
        return `<li><span>${pad(index + 1)}</span><strong>${esc(char)}</strong><span>${style.label}</span></li>`;
      }).join('')}</ol></div>
    </header>
    <section class="name-result__story" aria-labelledby="name-result-about">
      <p class="name-kicker">THE CHARACTER / 人格叙事</p>
      <h2 id="name-result-about">你与这方字迹</h2>
      <p class="name-result__intro">${esc(persona.intro)}</p>
      <div class="name-result__chapters">
        <article><span>01 / 天赋所在</span><h3>适合你的舞台</h3><p>${esc(persona.strength)}</p></article>
        <article><span>02 / 向前一步</span><h3>值得练习的事</h3><p>${esc(persona.growth)}</p></article>
      </div>
    </section>
    <aside class="name-result__print"><div class="name-result__print-head"><span>PERSONAL RUBBING</span><span>${id}</span></div>
      <canvas id="name-poster" width="900" height="1260" role="img" aria-label="${esc(state.name)}的个人拓片，书写人格${esc(persona.name)}"></canvas>
      <p class="name-result__materials"><span>拓印记录</span>${[finishLabel('stone'), finishLabel('ink'), finishLabel('paper'), finishLabel('technique')].join(' / ')}</p>
      <div class="name-print-actions"><button data-action="download">${icon('download')} 保存个人拓片</button><button data-action="sources">${icon('arrow-up-right')} 查看字的来处</button></div><p class="name-message" role="status" id="name-download-message"></p>
    </aside>
    <section class="name-result__basis">
      <details class="name-spectrum" open><summary>这次选字的书写谱 ${icon('plus')}</summary><div class="name-spectrum__body">${spectrum.map((item, index) => spectrumFacet(item, index, persona.axes)).join('')}</div></details>
      <p class="name-provenance">出现最多的字形定组；并列时取先选的字形。材质选择投票决定组内类型：石材、墨色各计两票，其余各计一票；并列时依次参考石材、墨色。内容是艺术化的性格叙事，并非心理测评或真实碑刻鉴定。</p>
      <div class="name-result__revisit"><button data-action="recraft">${icon('arrow-left')} 修改拓印材质</button><button data-action="revise">${icon('arrow-left')} 重新选字</button></div>
    </section>
    <section class="name-result__atlas" aria-label="寻字十六型谱">
      <div class="name-result__atlas-head"><div><p class="name-kicker">PERSONALITY ARCHIVE / 04 × 04</p><h2>十六型谱</h2></div><p>一方字形，落在四组十六种不同的性格叙事之间。<br>当前为第 ${pad(profileNumber)} 型，共 16 型。</p></div>
      <div class="name-result__atlas-grid">${profiles.groups.map((group, groupIndex) => `<div class="name-result__atlas-row"><div class="name-result__atlas-group"><span>${pad(groupIndex + 1)} / 04</span><strong>${esc(group.name)}</strong><small>${esc(group.theme)}</small></div>${profiles.profiles.slice(groupIndex * 4, groupIndex * 4 + 4).map((item, index) => `<div class="name-result__atlas-type" ${item.name === persona.name ? 'aria-current="true"' : ''}><span>${pad(groupIndex * 4 + index + 1)}</span><strong>${esc(item.name)}</strong></div>`).join('')}</div>`).join('')}</div>
    </section>
  </div>${footer(3)}`;
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
  dialog.innerHTML = `<header><div><p class="name-kicker">TYPE / PROVENANCE</p><h2>字形来源</h2></div><button data-source-close aria-label="关闭字形来源" title="关闭">${icon('x')}</button></header><p class="name-source-notice">本次字形由开放字体与石面肌理合成，不对应真实碑刻、年代或碑面位置。</p><div class="name-source-list">${items.map(({char, style}) => `<article><img src="${glyph(char, style).url}" alt="${esc(char)}字形"><div><h3>${esc(char)} / ${style.title}</h3><p>${style.author}</p><p>SIL Open Font License 1.1</p><a href="https://github.com/google/fonts/tree/main/ofl/${style.repo}" target="_blank" rel="noopener noreferrer">字体项目 ${icon('arrow-up-right')}</a><a href="assets/name/fonts/${style.repo}-OFL.txt" target="_blank" rel="noopener noreferrer">许可原文 ${icon('arrow-up-right')}</a></div></article>`).join('')}</div>`;
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
    state = {view: 'found', name, index: 0, choices: [...name].map(() => null), finish: {...defaultFinish}, date: today()};
    active = null; persist(); render(true);
  } catch (error) {
    message.textContent = error.message.includes('汉字') ? error.message : '字库暂时无法载入，请再点一次「开始寻字」。';
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  } finally { busy = false; button.disabled = false; }
});

root.addEventListener('click', async event => {
  const finishButton = event.target.closest('[data-finish-key]');
  if (finishButton) {
    const key = finishButton.dataset.finishKey;
    state.finish[key] = finishButton.dataset.finishId;
    root.querySelectorAll(`[data-finish-key="${key}"]`).forEach(item => item.setAttribute('aria-pressed', String(item === finishButton)));
    paintPoster(root.querySelector('#name-poster'));
    persist();
    return;
  }
  const button = event.target.closest('[data-action]');
  if (!button || button.disabled) return;
  const action = button.dataset.action;
  if (action === 'entry') setView('entry');
  if (action === 'begin' || action === 'revise') {
    state.index = 0; active = state.choices[0]; setView('pick');
  }
  if (action === 'back') {
    if (state.index === 0) setView('found');
    else { state.index--; active = state.choices[state.index]; setView('pick'); }
  }
  if (action === 'letter') {
    state.index = Number(button.dataset.index); active = state.choices[state.index]; setView('pick');
  }
  if (action === 'choose') {
    active = button.dataset.style;
    root.querySelectorAll('[data-action="choose"]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    root.querySelector('#name-current-source').innerHTML = sourceSummary(styles.find(style => style.id === active), chars()[state.index]);
    root.querySelector('[data-action="confirm"]').disabled = false;
    window.lucide?.createIcons();
  }
  if (action === 'confirm' && active) {
    state.choices[state.index] = active;
    const next = state.choices.findIndex((value, i) => i > state.index && !value);
    const missing = next >= 0 ? next : state.choices.findIndex(value => !value);
    if (missing < 0) {
      button.disabled = true;
      const hint = root.querySelector('.name-confirm p');
      hint.textContent = '正在载入石材与纸张…';
      try { await loadMaterials(); setView('craft'); }
      catch { hint.textContent = '材质载入失败，请再试一次。'; button.disabled = false; }
    }
    else { state.index = missing; active = state.choices[missing]; setView('pick'); }
  }
  if (action === 'make') setView('result');
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

root.addEventListener('input', event => {
  if (event.target.id !== 'name-weather') return;
  state.finish.weathered = Math.max(0, Math.min(100, Math.round(Number(event.target.value) || 0)));
  root.querySelector('#name-weather-value').textContent = String(state.finish.weathered);
  if (!weatherPreviewFrame) weatherPreviewFrame = requestAnimationFrame(() => {
    weatherPreviewFrame = 0;
    paintPoster(root.querySelector('#name-poster'));
  });
  persist();
});

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
        if (['craft', 'result'].includes(saved.view)) await loadMaterials();
        if (validSession(saved, coverage)) { state = {...saved, finish: normalizeFinish(saved.finish)}; active = state.choices[state.index]; render(); }
      } catch { if (message) message.textContent = '字库暂时无法载入，可重新开始。'; }
      finally { busy = false; if (message?.isConnected) message.textContent = ''; }
    }
  }
}

window.addEventListener('site:page', event => {
  if (event.detail.route === 'name') enter();
  else if (dialog.open) dialog.close();
});
render();
if (page.classList.contains('page--active')) enter();
