export const finishOptions = {
  stone: [
    ['bluestone', '青石', '细密石花 · 温润古朴'],
    ['marble', '汉白玉', '洁净细晶 · 柔和留痕'],
    ['granite', '花岗岩', '粗颗粒 · 坚硬雄浑'],
    ['sandstone', '砂岩', '多孔斑驳 · 风化感']
  ],
  technique: [
    ['light', '轻拓', '薄墨轻扑 · 纸色透出'],
    ['heavy', '重拓', '浓墨反复 · 墨面饱满']
  ],
  ink: [
    ['black', '松烟乌金', '哑光深黑'],
    ['cinnabar', '朱砂矿物', '沉稳朱红'],
    ['ochre', '赭石古墨', '暖茶褐色'],
    ['graphite', '石墨淡墨', '通透浅灰']
  ],
  paper: [
    ['raw', '生宣纸', '细腻米白'],
    ['cotton', '棉麻手工纸', '蓬松麻纹'],
    ['antique', '仿古籍宣纸', '旧纸书卷气'],
    ['cicada', '蝉翼宣纸', '薄透轻盈'],
    ['coarse', '粗麻纸', '粗长纤维'],
    ['cracked', '裂纹宣纸', '旧纸龟裂纹']
  ],
  carving: [
    ['yin', '阴刻', '凹字留白 · 墨底显字'],
    ['yang', '阳刻', '凸字着墨 · 纸底显字']
  ]
};

export const defaultFinish = {stone: 'bluestone', technique: 'heavy', ink: 'black', paper: 'raw', carving: 'yin', weathered: 0};

export function normalizeFinish(value = {}) {
  return Object.fromEntries(Object.entries(defaultFinish).map(([key, fallback]) => [key,
    key === 'weathered' ? Math.max(0, Math.min(100, Math.round(value?.[key] === true ? 100 : Number(value?.[key]) || 0))) : finishOptions[key].some(([id]) => id === value?.[key]) ? value[key] : fallback
  ]));
}

export const materialFiles = [
  ...finishOptions.stone.map(([id]) => `stone-${id}`),
  ...finishOptions.paper.map(([id]) => `paper-${id}`),
  'stone-weathered'
];

const inkColors = {black: [22, 24, 23], cinnabar: [137, 50, 43], ochre: [116, 77, 55], graphite: [87, 94, 95]};
const stoneMeans = {bluestone: 87, marble: 233, granite: 135, sandstone: 171};
const paperMeans = {raw: 242, cotton: 226, antique: 226, cicada: 239, coarse: 186, cracked: 219};
const stoneInfluence = {bluestone: .1, marble: .045, granite: .17, sandstone: .22};
const paperInfluence = {raw: .08, cotton: .17, antique: .12, cicada: .07, coarse: .22, cracked: .14};
const absorbency = {raw: 1, cotton: 1.05, antique: .96, cicada: .78, coarse: 1.08, cracked: .93};
const inkStrength = {black: 1, cinnabar: .95, ochre: .91, graphite: .8};

function cover(ctx, image, x, y, width, height) {
  const sourceRatio = image.width / image.height;
  const targetRatio = width / height;
  const sw = sourceRatio > targetRatio ? image.height * targetRatio : image.width;
  const sh = sourceRatio > targetRatio ? image.height : image.width / targetRatio;
  ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, width, height);
}

function pixels(image, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  cover(ctx, image, 0, 0, width, height);
  return ctx.getImageData(0, 0, width, height).data;
}

function tint(glyph, color) {
  const canvas = document.createElement('canvas');
  canvas.width = glyph.width; canvas.height = glyph.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(glyph, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

function paintResultSeal(ctx, label, scale) {
  const seal = document.createElement('canvas');
  seal.width = Math.round(128 * scale);
  seal.height = Math.round(168 * scale);
  const ink = seal.getContext('2d');
  ink.scale(scale, scale);
  ink.fillStyle = '#a2352b';
  const outline = Array.from({length: 80}, (_, index) => {
    const angle = index * Math.PI * 2 / 80;
    const wobble = 1 + Math.sin(angle * 5 + 1.2) * .008 + Math.sin(angle * 11 + 2.4) * .005 + Math.sin(angle * 23) * .003;
    return {x: 64 + Math.cos(angle) * 58 * wobble, y: 84 + Math.sin(angle) * 78 * wobble};
  });
  ink.beginPath();
  ink.moveTo((outline[0].x + outline.at(-1).x) / 2, (outline[0].y + outline.at(-1).y) / 2);
  outline.forEach((point, index) => {
    const next = outline[(index + 1) % outline.length];
    ink.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
  });
  ink.closePath();
  ink.fill();
  ink.globalCompositeOperation = 'destination-out';
  ink.lineWidth = 2.2;
  ink.beginPath();
  ink.ellipse(64, 84, 52, 72, 0, 0, Math.PI * 2);
  ink.stroke();
  ink.fillStyle = '#000';
  ink.font = '44px "BeilinXiaoWei","KaiTi",serif';
  ink.textAlign = 'center';
  ink.textBaseline = 'middle';
  const letters = [...label];
  letters.forEach((char, index) => {
    const y = 84 + (index - (letters.length - 1) / 2) * 51;
    ink.fillText(char, 64, y);
    ink.lineWidth = 1.4;
    ink.strokeText(char, 64, y);
  });
  const print = ink.getImageData(0, 0, seal.width, seal.height);
  const paper = ctx.getImageData(Math.round(690 * scale), Math.round(1069 * scale), seal.width, seal.height).data;
  const seed = [...label].reduce((value, char) => Math.imul(value ^ char.codePointAt(0), 16777619), 2166136261) >>> 0;
  for (let i = 0; i < print.data.length; i += 4) {
    if (!print.data[i + 3]) continue;
    const pixel = i / 4, x = pixel % seal.width, y = Math.floor(pixel / seal.width);
    const noise = (Math.imul((x + seed) ^ Math.imul(y + 1, 374761393), 668265263) >>> 0) / 4294967296;
    const fiber = (paper[i] * .27 + paper[i + 1] * .59 + paper[i + 2] * .14) / 255;
    const wave = Math.sin(x * .085 + y * .035) * Math.sin(y * .12 - x * .04) * .11;
    const edge = Math.hypot((x / scale - 64) / 58, (y / scale - 84) / 78);
    const transfer = (.58 + fiber * .23 + wave + (noise - .5) * .13) * (edge > .95 ? .65 + noise * .35 : 1);
    print.data[i + 3] *= noise < .025 ? transfer * .22 : transfer;
  }
  ink.putImageData(print, 0, 0);
  ctx.drawImage(seal, 690, 1069, 128, 168);
}

export function paintStone(canvas, stone, glyphs, materials) {
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  cover(ctx, materials[`stone-${stone}`], 0, 0, canvas.width, canvas.height);
  const scale = canvas.width / 900;
  const side = Math.min(canvas.width * .88, canvas.height * .84 / glyphs.length);
  const top = (canvas.height - side * glyphs.length) / 2;
  const dark = stone === 'marble' ? '#77746d' : stone === 'sandstone' ? '#4e3b2d' : '#172020';
  glyphs.forEach((glyph, index) => {
    const x = (canvas.width - side) / 2, y = top + side * index;
    ctx.globalAlpha = .3;
    ctx.drawImage(tint(glyph, '#f1f0e9'), x + 3 * scale, y + 4 * scale, side, side);
    ctx.globalAlpha = stone === 'marble' ? .54 : .72;
    ctx.drawImage(tint(glyph, dark), x - 2 * scale, y - 2 * scale, side, side);
    ctx.globalAlpha = 1;
  });
  const light = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  light.addColorStop(0, 'rgba(255,255,255,.16)');
  light.addColorStop(.48, 'rgba(255,255,255,0)');
  light.addColorStop(1, 'rgba(0,0,0,.19)');
  ctx.fillStyle = light; ctx.fillRect(0, 0, canvas.width, canvas.height);
}

export function paintRubbing(canvas, {name, glyphs, finish: rawFinish, persona, date, id, materials}) {
  const finish = normalizeFinish(rawFinish);
  const scale = canvas.width / 900;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  cover(ctx, materials[`paper-${finish.paper}`], 0, 0, 900, 1260);

  const px = 78, py = 139, pw = 744, ph = 923;
  const width = Math.round(pw * scale), height = Math.round(ph * scale);
  const stone = pixels(materials[`stone-${finish.stone}`], width, height);
  const paper = pixels(materials[`paper-${finish.paper}`], width, height);
  const weathering = finish.weathered / 100;
  const wear = weathering ? pixels(materials['stone-weathered'], width, height) : null;
  const panel = document.createElement('canvas');
  panel.width = width; panel.height = height;
  const pctx = panel.getContext('2d');
  const image = pctx.createImageData(width, height);
  const ink = inkColors[finish.ink];
  const pressure = (finish.technique === 'light' ? .51 : .96) * absorbency[finish.paper] * inkStrength[finish.ink];
  const mask = document.createElement('canvas');
  mask.width = width; mask.height = height;
  const mctx = mask.getContext('2d');
  const glyphSide = Math.min(354, 859 / glyphs.length);
  const start = py + (ph - glyphSide * glyphs.length) / 2;
  glyphs.forEach((glyph, index) => {
    const gx = 450 - glyphSide * .63, gy = start + glyphSide * index - glyphSide * .13;
    mctx.drawImage(glyph, (gx - px) * scale, (gy - py) * scale, glyphSide * 1.26 * scale, glyphSide * 1.26 * scale);
  });
  const glyphMask = mctx.getImageData(0, 0, width, height).data;
  const edgeRadius = Math.max(1, Math.round(9 * scale));
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    const stoneTone = ((stone[i] * .27 + stone[i + 1] * .59 + stone[i + 2] * .14) - stoneMeans[finish.stone]) / 75;
    const paperTone = ((paper[i] * .27 + paper[i + 1] * .59 + paper[i + 2] * .14) - paperMeans[finish.paper]) / 75;
    const edge = Math.min(x, y, width - 1 - x, height - 1 - y) / (10 * scale);
    let alpha = (pressure + stoneTone * stoneInfluence[finish.stone] - paperTone * paperInfluence[finish.paper]) * Math.min(1, Math.max(0, edge));
    if (wear) {
      const tone = wear[i] * .27 + wear[i + 1] * .59 + wear[i + 2] * .14;
      const roughness = Math.pow(Math.max(0, Math.min(1, (tone - 65) / 175)), .55);
      alpha *= 1 - weathering * (.42 + roughness * .58);
      if (finish.carving === 'yang' && glyphMask[i + 3]) {
        const edge = Math.max(0, 1 - Math.min(glyphMask[i + 3 - edgeRadius * 4] ?? 0, glyphMask[i + 3 + edgeRadius * 4] ?? 0, glyphMask[i + 3 - edgeRadius * width * 4] ?? 0, glyphMask[i + 3 + edgeRadius * width * 4] ?? 0) / 255);
        alpha *= 1 - weathering * edge * (.52 + roughness * .48);
      }
    }
    const shade = stoneTone * 7 + paperTone * 3;
    image.data[i] = ink[0] + shade;
    image.data[i + 1] = ink[1] + shade;
    image.data[i + 2] = ink[2] + shade;
    image.data[i + 3] = Math.max(0, Math.min(1, alpha)) * 255;
  }
  pctx.putImageData(image, 0, 0);
  pctx.globalCompositeOperation = finish.carving === 'yin' ? 'destination-out' : 'destination-in';
  pctx.drawImage(mask, 0, 0);
  pctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(panel, px, py, pw, ph);

  ctx.fillStyle = '#514c45'; ctx.font = '18px sans-serif';
  ctx.fillText('BEIJIAN / NAME ARCHIVE', 78, 77);
  ctx.fillText(id, 78, 104);
  ctx.font = '22px "SimSun", serif';
  ctx.fillText(`${name} / ${date}`, 78, 1156);
  ctx.font = '16px sans-serif';
  ctx.fillText('字形与拓印工艺的数字演绎 · 非原碑拓片', 78, 1191);
  if (persona?.name) paintResultSeal(ctx, persona.name, scale);
  ctx.save();
  ctx.strokeStyle = '#9d4132'; ctx.lineWidth = 3;
  ctx.strokeRect(596, 1151, 78, 78);
  ctx.fillStyle = '#9d4132'; ctx.font = '30px "SimSun", serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('碑', 635, 1172); ctx.fillText('间', 635, 1207);
  ctx.restore();
}
