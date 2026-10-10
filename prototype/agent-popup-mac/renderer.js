// Renders the agent popup as a GUI overlay: the main agent is the big Jason on the right,
// each sub-agent is a smaller Jason stacked below it, each with a speech bubble.
// Mood follows state: running -> watching, done -> passed, nothing running -> neutral.

const stage = document.getElementById('stage');
const JASON_DIR = '../../characters/jason/line/jason-line-';

const MODEL_NAMES = {
  'claude-opus-5-5': ['Opus 5.5', 'claude'],
  'claude-sonnet-5-5': ['Sonnet 5.5', 'claude'],
  'claude-haiku-5-5': ['Haiku 5.5', 'claude'],
  'claude-fable-5-1': ['Fable 5.1', 'claude'],
};
let logoBase = '';

function modelInfo(model) {
  return MODEL_NAMES[model]
    ? { name: MODEL_NAMES[model][0], logo: MODEL_NAMES[model][1] }
    : { name: model, logo: null };
}

function elapsed(a) {
  const end = a.ended ? a.ended : Date.now() / 1000;
  return Math.max(0, Math.round(end - a.started)) + 's';
}

function jason(mood, size) {
  const wrap = document.createElement('div');
  wrap.className = `jason ${size}`;
  const img = document.createElement('img');
  img.alt = '';
  img.src = JASON_DIR + mood + '.svg';
  wrap.append(img);
  return wrap;
}

function whoLine(info, a) {
  const who = document.createElement('div');
  who.className = 'who';
  if (info.logo && logoBase) {
    const img = document.createElement('img');
    img.alt = info.name;
    img.src = logoBase + info.logo + '.svg';
    img.onerror = () => { img.replaceWith(chipEl(info.name)); };
    who.append(img);
  } else {
    who.append(chipEl(info.name));
  }
  const t = document.createElement('span');
  t.className = 'time';
  t.textContent = (a.state === 'done' ? 'เสร็จใน ' : '') + elapsed(a);
  who.append(t);
  return who;
}

function chipEl(text) {
  const c = document.createElement('span');
  c.className = 'chip';
  c.textContent = text.split(' ')[0];
  return c;
}

function bubble(text, small) {
  const b = document.createElement('div');
  b.className = small ? 'bubble small' : 'bubble';
  b.textContent = text;
  return b;
}

function mainBlock(a) {
  const info = modelInfo(a.model);
  const mood = a.state === 'done' ? 'passed' : 'watching';
  const group = document.createElement('div');
  group.className = 'group';
  const row = document.createElement('div');
  row.className = 'row';
  const text = document.createElement('div');
  text.style.display = 'flex';
  text.style.flexDirection = 'column';
  text.style.alignItems = 'flex-end';
  text.style.gap = '4px';
  text.append(bubble(a.label || info.name, false), whoLine(info, a));
  row.append(text, jason(mood, 'big'));
  group.append(row);
  return group;
}

function subRow(a) {
  const info = modelInfo(a.model);
  const mood = a.state === 'done' ? 'passed' : 'watching';
  const row = document.createElement('div');
  row.className = 'row';
  const text = document.createElement('div');
  text.style.display = 'flex';
  text.style.flexDirection = 'column';
  text.style.alignItems = 'flex-end';
  text.style.gap = '3px';
  text.append(bubble(`${info.name} · ${a.label || ''}`.trim(), true), whoLine(info, a));
  row.append(text, jason(mood, 'small'));
  return row;
}

function emptyBlock(text, mood) {
  const group = document.createElement('div');
  group.className = 'group';
  const row = document.createElement('div');
  row.className = 'row';
  row.append(bubble(text, false), jason(mood, 'big'));
  group.append(row);
  return group;
}

function render(payload) {
  if (payload.logos && payload.logos.base) logoBase = payload.logos.base;
  const nodes = [];
  if (!payload.ok) {
    nodes.push(emptyBlock('รัน server.py ก่อน', 'demanding'));
  } else {
    const agents = payload.agents || [];
    const mains = agents.filter((a) => a.kind === 'main');
    const subs = agents.filter((a) => a.kind === 'sub');
    if (!agents.length) nodes.push(emptyBlock('ว่างอยู่นะ', 'neutral'));
    for (const m of mains) nodes.push(mainBlock(m));
    if (subs.length) {
      const list = document.createElement('div');
      list.className = 'group';
      list.style.gap = '8px';
      for (const s of subs) list.append(subRow(s));
      nodes.push(list);
    }
  }
  const quit = document.createElement('button');
  quit.className = 'quit';
  quit.textContent = '×';
  quit.title = 'ปิด popup';
  quit.addEventListener('click', () => window.popup.quit());
  stage.replaceChildren(quit, ...nodes);
  window.popup.setHeight(Math.ceil(stage.getBoundingClientRect().height));
}

window.popup.onData(render);
