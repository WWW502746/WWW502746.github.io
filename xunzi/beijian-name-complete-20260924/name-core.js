export const styles = [
  {id: 'square', label: '方正', family: 'BeilinXiaoWei', file: 'ZCOOLXiaoWei-Regular', title: '站酷小薇体', author: 'ZCOOL XiaoWei Project Authors', repo: 'zcoolxiaowei', tags: ['端正', '克制', '清朗'], axes: {weight: .15, edge: .7, motion: -.65, order: .85, space: .35, age: .15, center: .7}},
  {id: 'weight', label: '浑厚', family: 'BeilinMa', file: 'MaShanZheng-Regular', title: '马善政毛笔楷书', author: 'Ma Shan Zheng Project Authors', repo: 'mashanzheng', tags: ['厚重', '宽博', '稳定'], axes: {weight: .85, edge: .4, motion: -.3, order: .5, space: .15, age: .5, center: .8}},
  {id: 'space', label: '疏朗', family: 'BeilinLong', file: 'LongCang-Regular', title: '龙藏体', author: 'Long Cang Project Authors', repo: 'longcang', tags: ['轻盈', '留白', '自由'], axes: {weight: -.75, edge: -.3, motion: .45, order: -.45, space: .9, age: .1, center: -.2}},
  {id: 'flow', label: '流动', family: 'BeilinZhi', file: 'ZhiMangXing-Regular', title: '志莽行书', author: 'Zhi Mang Xing Project Authors', repo: 'zhimangxing', tags: ['流动', '灵动', '舒展'], axes: {weight: -.2, edge: -.5, motion: .85, order: -.7, space: .45, age: .2, center: -.55}}
];

export const spectrum = [
  ['order', '结构', '自由', '严整'], ['weight', '笔重', '轻盈', '厚重'],
  ['motion', '节奏', '克制', '流动'], ['space', '空间', '紧密', '疏朗'],
  ['edge', '锋棱', '圆润', '方折'], ['age', '肌理', '清润', '粗粝'],
  ['center', '重心', '错落', '平稳']
];

export function hashText(text) {
  let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return hash >>> 0;
}

export function readName(value) {
  const name = value.trim();
  if (!/^[\p{Script=Han}]{1,4}$/u.test(name)) throw new Error('请输入 1 至 4 个汉字。');
  return name;
}

export function candidates(char, coverage) {
  return styles.filter(style => coverage[style.file]?.includes(char));
}

const styleGroups = {square: 0, space: 1, weight: 2, flow: 3};
const finishReadings = {
  stone: {bluestone: 0, marble: 1, granite: 2, sandstone: 3},
  ink: {black: 0, graphite: 1, cinnabar: 2, ochre: 3},
  paper: {raw: 0, antique: 0, cotton: 1, cicada: 1, coarse: 3, cracked: 3},
  technique: {light: 1, heavy: 2},
  carving: {yin: 0, yang: 2}
};

export function profileFor(choices, finish, library) {
  const axes = Object.fromEntries(spectrum.map(([key]) => [key, choices.reduce((total, id) => total + styles.find(style => style.id === id).axes[key], 0) / choices.length]));
  const groups = choices.map(id => styleGroups[id]);
  const counts = [0, 0, 0, 0];
  groups.forEach(index => counts[index]++);
  const group = groups.find(index => counts[index] === Math.max(...counts));
  const votes = [0, 0, 0, 0];
  for (const [key, readings] of Object.entries(finishReadings)) votes[readings[finish[key]]] += ['stone', 'ink'].includes(key) ? 2 : 1;
  if (finish.weathered) votes[3]++;
  const highest = Math.max(...votes);
  const reading = [finishReadings.stone[finish.stone], finishReadings.ink[finish.ink], 0, 1, 2, 3].find(index => votes[index] === highest);
  return {...library.profiles[group * 4 + reading], groupInfo: library.groups[group], axes, dominantStyle: choices[groups.indexOf(group)], reading};
}

export function validSession(value, coverage) {
  try {
    if (!value || readName(value.name) !== value.name || !['entry', 'found', 'pick', 'craft', 'result'].includes(value.view)) return false;
    const chars = [...value.name];
    if (!Number.isInteger(value.index) || value.index < 0 || value.index >= chars.length) return false;
    if (!Array.isArray(value.choices) || value.choices.length !== chars.length) return false;
    if (!value.choices.every((id, i) => id === null || candidates(chars[i], coverage).some(style => style.id === id))) return false;
    if (['craft', 'result'].includes(value.view) && value.choices.some(id => !id)) return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
    return true;
  } catch { return false; }
}
