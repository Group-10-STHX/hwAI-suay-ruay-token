import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHookCommand, findOnPath, isOurCommand, pickRuntime, quotePath } from '../install-hooks.mjs';
import { planPlayback } from '../voice.mjs';

test('quotePath: posix uses single quotes and escapes quotes', () => {
  assert.equal(quotePath('/a b/node', 'darwin'), "'/a b/node'");
  assert.equal(quotePath("/o'x/node", 'linux'), "'/o'\\''x/node'");
});

test('quotePath: win32 uses double quotes and forward slashes', () => {
  assert.equal(quotePath('C:\\Program Files\\nodejs\\node.exe', 'win32'), '"C:/Program Files/nodejs/node.exe"');
});

test('buildHookCommand: no env prefix, marker is a trailing argument', () => {
  const win = buildHookCommand({ platform: 'win32', runtime: 'C:\\n\\node.exe', hookPath: 'C:\\a b\\hook.mjs', source: 'codex' });
  assert.equal(win, '"C:/n/node.exe" "C:/a b/hook.mjs" codex --wai-hook');
  const mac = buildHookCommand({ platform: 'darwin', runtime: '/usr/bin/node', hookPath: '/a b/hook.mjs', source: 'claude-code' });
  assert.equal(mac, "'/usr/bin/node' '/a b/hook.mjs' claude-code --wai-hook");
  assert.ok(!/ELECTRON_RUN_AS_NODE|WAI_HOOK=1/.test(win + mac));
});

test('pickRuntime: node on PATH wins, else Electron + wrapper', () => {
  const electron = '/Applications/Electron.app/Contents/MacOS/Electron';
  const a = pickRuntime({ execPath: electron, which: () => '/usr/local/bin/node', hookPath: '/h/hook.mjs', wrapperPath: '/h/hook-run.cjs' });
  assert.deepEqual(a, { runtime: '/usr/local/bin/node', script: '/h/hook.mjs', kind: 'node' });
  const b = pickRuntime({ execPath: electron, which: () => null, hookPath: '/h/hook.mjs', wrapperPath: '/h/hook-run.cjs' });
  assert.deepEqual(b, { runtime: electron, script: '/h/hook-run.cjs', kind: 'electron' });
  const c = pickRuntime({ execPath: 'C:\\x\\node.exe', which: () => null });
  assert.equal(c.kind, 'node');
});

test('isOurCommand recognises old and new marker forms but not others', () => {
  assert.ok(isOurCommand("WAI_HOOK=1 ELECTRON_RUN_AS_NODE=1 '/e' '/x/hook.mjs' claude-code"));
  assert.ok(isOurCommand('"node" "/y/hook.mjs" codex --wai-hook'));
  assert.ok(!isOurCommand('echo hello'));
  assert.ok(!isOurCommand(undefined));
});

test('findOnPath: honours win32 extensions and PATH order', () => {
  const dir = mkdtempSync(join(tmpdir(), 'path-'));
  writeFileSync(join(dir, 'tool'), '');
  assert.equal(findOnPath('tool', { platform: 'linux', env: { PATH: dir } }), join(dir, 'tool'));
  assert.equal(findOnPath('missing', { platform: 'linux', env: { PATH: dir } }), null);
  const seen = [];
  findOnPath('node', { platform: 'win32', env: { PATH: 'C:\\a;C:\\b' }, exists: (f) => (seen.push(f), false) });
  assert.deepEqual(seen, ['C:\\a\\node.exe', 'C:\\b\\node.exe']);
});

test('planPlayback darwin: afplay and say', () => {
  assert.deepEqual(planPlayback({ kind: 'file', path: '/t/a.mp3' }, { platform: 'darwin' }), { cmd: 'afplay', args: ['/t/a.mp3'] });
  const say = planPlayback({ kind: 'say', text: '--bad', rate: 180 }, { platform: 'darwin' });
  assert.equal(say.cmd, 'say');
  assert.deepEqual(say.args, ['-v', 'Kanya', '-r', '180', 'bad']);
});

test('planPlayback win32: PowerShell with path/text in env, never in the script', () => {
  const evil = `C:\\x\\a'; calc; '.mp3`;
  const f = planPlayback({ kind: 'file', path: evil }, { platform: 'win32' });
  assert.equal(f.cmd, 'powershell.exe');
  assert.equal(f.env.WAI_PLAY_FILE, evil);
  assert.ok(!f.args.some((a) => a.includes('calc')));
  const s = planPlayback({ kind: 'say', text: 'สวัสดี"; rm -rf', rate: 170 }, { platform: 'win32' });
  assert.equal(s.env.WAI_SPEAK_TEXT, 'สวัสดี"; rm -rf');
  assert.ok(!s.args.join(' ').includes('rm -rf'));
  assert.ok(s.args.join(' ').includes('System.Speech'));
});

test('planPlayback linux: first available player, say is silent', () => {
  const only = (n) => (name) => name === n;
  assert.deepEqual(planPlayback({ kind: 'file', path: '/a.mp3' }, { platform: 'linux', has: only('mpg123') }), { cmd: 'mpg123', args: ['-q', '/a.mp3'] });
  assert.equal(planPlayback({ kind: 'file', path: '/a.mp3' }, { platform: 'linux', has: () => false }), null);
  assert.equal(planPlayback({ kind: 'say', text: 'x' }, { platform: 'linux', has: () => true }), null);
});

test('install CLI writes cross-platform command into a project dir and uninstall removes it', async () => {
  const { execFileSync } = await import('node:child_process');
  const dir = mkdtempSync(join(tmpdir(), 'proj-'));
  const cli = join(import.meta.dirname, '..', 'install-hooks.mjs');
  execFileSync(process.execPath, [cli, 'install', dir, 'claude']);
  const file = join(dir, '.claude', 'settings.local.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const cmd = json.hooks.UserPromptSubmit[0].hooks[0].command;
  assert.match(cmd, /--wai-hook$/);
  assert.ok(!cmd.startsWith('WAI_HOOK'));
  execFileSync(process.execPath, [cli, 'install', dir, 'claude']); // idempotent
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).hooks.UserPromptSubmit.length, 1);
  execFileSync(process.execPath, [cli, 'uninstall', dir, 'claude']);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).hooks, undefined);
});
