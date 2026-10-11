import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cmdShim, hookEntry, shShim } from '../install-hooks.mjs';
import { planPlayback } from '../voice.mjs';

test('hookEntry: mac/linux = marker + fixed shim path + source', () => {
  const e = hookEntry('claude', 'darwin', '/h/.waikusa/hook.sh');
  assert.equal(e.command, "WAI_HOOK=1 '/h/.waikusa/hook.sh' claude-code");
});

test('hookEntry: windows claude uses exec form, codex uses commandWindows with exit passthrough', () => {
  const c = hookEntry('claude', 'win32', 'C:\\Users\\a\\.waikusa\\hook.cmd', { ComSpec: 'C:\\Windows\\System32\\cmd.exe' });
  assert.deepEqual(c.args, ['/d', '/c', 'call', 'C:\\Users\\a\\.waikusa\\hook.cmd', 'claude-code']);
  const x = hookEntry('codex', 'win32', 'C:\\Users\\a\\.waikusa\\hook.cmd');
  assert.match(x.commandWindows, /exit \$LASTEXITCODE$/);
});

test('shims: sh execs electron-as-node, cmd forwards exit code', () => {
  assert.match(shShim('/x/electron', '/x/hook.mjs'), /ELECTRON_RUN_AS_NODE=1 exec '\/x\/electron' '\/x\/hook.mjs' "\$@"/);
  const cmd = cmdShim('C:\\x\\electron.exe', 'C:\\x\\hook.mjs', {});
  assert.match(cmd, /exit \/b %ERRORLEVEL%/);
  assert.ok(cmd.includes('\r\n'));
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


test('install CLI writes shim + entry into a project dir, replaces an old --wai-hook entry, uninstall removes it', async () => {
  const { execFileSync } = await import('node:child_process');
  const home = mkdtempSync(join(tmpdir(), 'home-')); // shim ไปอยู่ใน home ปลอม ไม่แตะ ~/.waikusa จริง
  const dir = mkdtempSync(join(tmpdir(), 'proj-'));
  const cli = join(import.meta.dirname, '..', 'install-hooks.mjs');
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  const file = join(dir, '.claude', 'settings.local.json');
  mkdirSync(join(dir, '.claude'), { recursive: true });
  writeFileSync(file, JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: "'/n' '/r/hook.mjs' claude-code --wai-hook" }] }] } }));
  execFileSync(process.execPath, [cli, 'install', dir, 'claude'], { env });
  const json = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(json.hooks.UserPromptSubmit.length, 1);
  assert.ok(existsSync(join(home, '.waikusa', process.platform === 'win32' ? 'hook.cmd' : 'hook.sh')));
  execFileSync(process.execPath, [cli, 'install', dir, 'claude'], { env }); // idempotent
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).hooks.UserPromptSubmit.length, 1);
  execFileSync(process.execPath, [cli, 'uninstall', dir, 'claude'], { env });
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).hooks, undefined);
});
