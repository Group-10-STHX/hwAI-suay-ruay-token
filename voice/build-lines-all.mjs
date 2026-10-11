// Flatten every phrase the AI says into voice/lines.all.json (used by the voice backoffice /admin/voice).
// usage: node voice/build-lines-all.mjs
// Sources: app/renderer/src/states/copy.ts (SPEECH, SPEECH_HINT, REASON_TEXT), voice/lines.json,
//          voice/lines.extra.json (lines + defaults), voice/personas.json
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const COPY_TS = join(here, '..', 'app', 'renderer', 'src', 'states', 'copy.ts');
const OUT = join(here, 'lines.all.json');
const readJson = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));

export const stripTags = (t) => String(t).replace(/\[[^\]]*\]/g, ' ').replace(/\s{2,}/g, ' ').trim();

// pulls `export const NAME ...= { KEY: 'text', ... }` out of copy.ts
export function parseCopyObject(src, name) {
  const m = src.match(new RegExp(`export const ${name}\\b[^=]*=\\s*\\{([\\s\\S]*?)\\n\\}`));
  if (!m) throw new Error(`copy.ts: ${name} not found`);
  const out = [];
  const re = /^\s*([A-Z_]+):\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")\s*,?\s*$/gm;
  let k;
  while ((k = re.exec(m[1]))) out.push([k[1], (k[2] ?? k[3]).replace(/\\(.)/g, '$1')]);
  if (!out.length) throw new Error(`copy.ts: ${name} is empty`);
  return out;
}

export function buildEntries({ copySrc, lines, extra, personas }) {
  const entries = [];
  for (const [state, text] of parseCopyObject(copySrc, 'SPEECH'))
    entries.push({ id: `copy-speech-${state}`, text, plainText: stripTags(text), kind: 'speech', state });
  for (const [state, text] of parseCopyObject(copySrc, 'SPEECH_HINT'))
    entries.push({ id: `copy-hint-${state}`, text, plainText: stripTags(text), kind: 'hint', state });
  for (const [reason, text] of parseCopyObject(copySrc, 'REASON_TEXT'))
    entries.push({ id: `copy-reason-${reason}`, text, plainText: stripTags(text), kind: 'reason', reason });
  const persona = (l, kind) => {
    const e = { id: l.id, text: l.text, plainText: stripTags(l.text), kind, state: l.state, persona: l.persona, recorder: l.recorder };
    if (l.emotion) e.emotion = l.emotion;
    return e;
  };
  for (const l of lines) entries.push(persona(l, 'persona-line'));
  for (const l of extra.lines || []) entries.push(persona(l, 'extra'));
  for (const [state, text] of Object.entries(extra.defaults || {}))
    entries.push({ id: `default-${state}`, text, plainText: stripTags(text), kind: 'extra', state });

  const personaIds = new Set(personas.map((p) => p.id));
  const seen = new Set();
  const firstByKey = new Map();
  let rr = 0;
  for (const e of entries) {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(e.id)) throw new Error(`unsafe id: ${e.id}`);
    if (seen.has(e.id)) throw new Error(`duplicate id: ${e.id}`);
    seen.add(e.id);
    if (e.persona && !personaIds.has(e.persona)) throw new Error(`unknown persona: ${e.persona}`);
    // unassigned phrases are spread over the 4 recorders so every teammate gets a share
    if (!(e.recorder >= 1 && e.recorder <= 4)) e.recorder = (rr++ % 4) + 1;
    // same words, same voice folder -> record once, daemon copies the file to every alias
    const key = `${e.persona || '_app'}\n${e.plainText}`;
    if (firstByKey.has(key)) e.dupOf = firstByKey.get(key);
    else firstByKey.set(key, e.id);
  }
  return entries;
}

export function build() {
  const entries = buildEntries({
    copySrc: readFileSync(COPY_TS, 'utf8'),
    lines: readJson('lines.json').lines,
    extra: readJson('lines.extra.json'),
    personas: readJson('personas.json').personas,
  });
  writeFileSync(OUT, JSON.stringify({ generatedFrom: ['app/renderer/src/states/copy.ts', 'voice/lines.json', 'voice/lines.extra.json'], entries }, null, 1) + '\n');
  return entries;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const entries = build();
  const by = {};
  for (const e of entries) by[e.kind] = (by[e.kind] || 0) + 1;
  console.log(`lines.all.json: ${entries.length} entries`, by, `(${entries.filter((e) => e.dupOf).length} aliases)`);
}
