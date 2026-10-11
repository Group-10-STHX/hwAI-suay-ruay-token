// Inline voice/lines.json + personas.json into recorder.template.html -> recorder.html (works from file://)
// usage: node voice/build-recorder.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f) => JSON.parse(readFileSync(join(here, f), 'utf8'));
const data = { personas: read('personas.json').personas, lines: read('lines.json').lines };
for (const l of data.lines) {
  if (!/^[a-z0-9_-]+$/.test(l.id) || !/^[a-z0-9_-]+$/.test(l.persona)) throw new Error(`unsafe id: ${l.id}`);
}
// keep the JSON from closing the script tag
const json = JSON.stringify(data).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const tpl = readFileSync(join(here, 'recorder.template.html'), 'utf8');
if (!tpl.includes('/*__VOICE_DATA__*/null')) throw new Error('placeholder missing in template');
writeFileSync(join(here, 'recorder.html'), tpl.replace('/*__VOICE_DATA__*/null', () => json));
console.log(`recorder.html built: ${data.lines.length} lines, ${data.personas.length} personas`);
