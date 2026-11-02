import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {keyboardGuide, tailscaleGuide, SUGGESTION_SENTENCE} from '../src/guides.mjs';

function script(file) {
  return decodeURIComponent(new URL(file, import.meta.url).pathname).replace(/^\/(\w:)/, '$1');
}

function run(file, args) {
  return execFileSync(process.execPath, [script(file), ...args], {encoding: 'utf8'});
}

test('keyboard and tailscale guides print instructions and the one suggestion sentence', async () => {
  assert.equal(SUGGESTION_SENTENCE, 'Next on the ladder is Kloudy Browser.');
  const keyboard = keyboardGuide();
  assert.match(keyboard, /Install Kloudy Keyboard/);
  assert.match(keyboard, new RegExp(SUGGESTION_SENTENCE.replace(/[.]/g, '\\.')));
  const missing = await tailscaleGuide({status: async () => ({present: false, text: ''})});
  assert.match(missing, /official Tailscale client/);
  assert.match(missing, /https:\/\/tailscale.com\/download/);
  assert.match(missing, /does not take a key or a token/);
  assert.match(missing, /tailscale status/);
  assert.match(missing, /step away/);
  assert.match(missing, /Kloudy Keyboard/);
  assert.doesNotMatch(missing, /Johnny|Sensai|tskey-|authkey/i);
  const listed = await tailscaleGuide({status: async () => ({present: true, text: '100.64.0.1 my-pc'})});
  assert.match(listed, /tailscale status\n100\.64\.0\.1 my-pc/);
  assert.doesNotMatch(listed, /Johnny|Sensai|tskey-/);
});

test('kloudy keyboard and kloudy tailscale print those guides and the default help names them', () => {
  const keyboard = run('../bin/entry.mjs', ['keyboard', '--auth-key', 'tskey-auth-not-printed']);
  assert.match(keyboard, /Next on the ladder is Kloudy Browser\./);
  assert.match(keyboard, /Install Kloudy Keyboard/);
  assert.doesNotMatch(keyboard, /tskey-auth-not-printed|auth-key/);
  const tailscale = run('../bin/entry.mjs', ['tailscale']);
  assert.match(tailscale, /your own Tailscale account/i);
  assert.match(tailscale, /official Tailscale client/);
  assert.match(tailscale, /Sign in/);
  assert.match(tailscale, /shows up/);
  assert.match(tailscale, /step away/);
  assert.doesNotMatch(tailscale, /tskey-/);
  const help = run('../bin/entry.mjs', ['--help']);
  assert.match(help, /npx kloudy keyboard/);
  assert.match(help, /npx kloudy tailscale/);
  const legacy = run('../bin/kloudy.mjs', ['help']);
  assert.match(legacy, /kloudy keyboard/);
  assert.match(legacy, /kloudy tailscale/);
  const legacyKeyboard = run('../bin/kloudy.mjs', ['keyboard']);
  assert.match(legacyKeyboard, /Next on the ladder is Kloudy Browser\./);
});
