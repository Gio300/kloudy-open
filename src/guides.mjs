import {execFile} from 'node:child_process';
import {existsSync} from 'node:fs';

/**
 * Same words as the keyboard local copy in LadderChip.SENTENCE.
 * Mini on feat/bbe-mini-offline at 7c9e1a1 does not store a fixed sentence.
 */
export const SUGGESTION_SENTENCE = 'Next on the ladder is Kloudy Browser.';

export function keyboardGuide() {
  return [
    'Kloudy Keyboard is the keyboard on the phone.',
    'Install Kloudy Keyboard, turn it on in the phone settings, and choose it when a field is focused.',
    SUGGESTION_SENTENCE,
  ].join('\n');
}

/** One plain line for each Kloudy system, then the ladder sentence, then the keyboard. */
export function familyGuide() {
  return [
    'Kloudy Keyboard is the keyboard on the phone.',
    'Kloudy Browser is the browser on this phone.',
    'Kloudy Link is a presence message for which systems are here.',
    'Black Box Mini is the router that holds the connection list.',
    'The Black Box Engine is the session under the other doors.',
    'BotBoozle is the cloud door for heavier bots.',
    SUGGESTION_SENTENCE,
    'Install Kloudy Keyboard next.',
  ].join('\n');
}

export async function tailscaleGuide({status = officialStatus} = {}) {
  const check = await status();
  const lines = [
    'Use your own Tailscale account with the official Tailscale client.',
    'Install Tailscale from the official site, https://tailscale.com/download.',
    'Sign in with that client. This command does not take a key or a token.',
    'Confirm this device shows up.',
  ];
  if (check.present) {
    lines.push('tailscale status');
    if (check.text.trim()) lines.push(check.text.trim());
    else lines.push('tailscale status did not list a device. Open the official client and confirm this device is signed in.');
  } else {
    lines.push('The tailscale command is not installed yet. After you install the official client, run tailscale status.');
  }
  lines.push('Then step away. Kloudy does not keep a Tailscale session.');
  lines.push('Open Kloudy Keyboard on the phone.');
  return lines.join('\n');
}

function binary() {
  if (process.platform === 'win32') {
    const installed = 'C:\\Program Files\\Tailscale\\tailscale.exe';
    if (existsSync(installed)) return installed;
  }
  return 'tailscale';
}

function childEnv() {
  const env = {...process.env};
  for (const name of Object.keys(env)) {
    if (/(auth.?key|api.?key|token|secret|password)/i.test(name)) delete env[name];
  }
  return env;
}

function redact(text) {
  return String(text)
    .replace(/tskey-[A-Za-z0-9-]+/g, '[redacted]')
    .replace(/\b(authkey|api[_-]?key|token)\b\s*[:=]\s*\S+/gi, '$1=[redacted]');
}

function officialStatus() {
  return new Promise(resolve => {
    execFile(binary(), ['status'], {timeout: 8000, windowsHide: true, encoding: 'utf8', env: childEnv()}, (error, stdout) => {
      if (error?.code === 'ENOENT') {
        resolve({present: false, text: ''});
        return;
      }
      resolve({present: true, text: redact(stdout || '')});
    });
  });
}
