"""Domain-authenticated MCP Registry release. Credentials never enter argv or logs.

Uses the official publisher's signed-timestamp DNS protocol directly so the
Ed25519 seed can remain DPAPI-encrypted in Keys Boi, instead of a CLI flag.
Reference: modelcontextprotocol/registry cmd/publisher/auth/common.go.
"""
import argparse
import base64
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import quote
import requests
import win32crypt
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, PublicFormat, NoEncryption

ROOT = Path(__file__).resolve().parents[1]
PROOF = ROOT / 'proof/2026-10-06-registry'
KEYS = Path(os.environ['USERPROFILE']) / 'Documents/keys_boi'
KEY = KEYS / 'kloudy_mcp_registry_ed25519.dpapi'
REG = 'https://registry.modelcontextprotocol.io/v0.1'
AWS = 'C:/Program Files/Amazon/AWSCLIV2/aws.exe'
ZONE = 'Z01286102DDP4OK69117H'

def save(name, value):
    PROOF.mkdir(parents=True, exist_ok=True)
    (PROOF / name).write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')

def key(create=False):
    if not KEY.exists():
        if not create:
            raise RuntimeError('Registry signing key has not been prepared')
        k = Ed25519PrivateKey.generate()
        seed = k.private_bytes(Encoding.Raw, PrivateFormat.Raw, NoEncryption())
        KEY.write_bytes(win32crypt.CryptProtectData(seed, 'Kloudy MCP Registry Ed25519', None, None, None, 0))
        del seed
    seed = win32crypt.CryptUnprotectData(KEY.read_bytes(), None, None, None, 0)[1]
    k = Ed25519PrivateKey.from_private_bytes(seed)
    del seed
    return k

def record(k):
    return 'v=MCPv1; k=ed25519; p=' + base64.b64encode(k.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()

def aws(*args):
    p = subprocess.run([AWS, *args, '--profile', 'swoosh', '--output', 'json'], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError('AWS operation failed: ' + args[0] + '/' + args[1])
    return json.loads(p.stdout)

def prepare():
    txt = record(key(True))
    sets = aws('route53', 'list-resource-record-sets', '--hosted-zone-id', ZONE)['ResourceRecordSets']
    old = next((x for x in sets if x['Name'] == 'kloudy.ai.' and x['Type'] == 'TXT'), None)
    values = [x for x in (old or {}).get('ResourceRecords', []) if 'v=MCPv1;' not in x['Value']]
    values.append({'Value': json.dumps(txt)})
    desired = {'Name': 'kloudy.ai.', 'Type': 'TXT', 'TTL': (old or {}).get('TTL', 300), 'ResourceRecords': values}
    if old == desired:
        change = {'status': 'unchanged'}
    else:
        with tempfile.TemporaryDirectory(prefix='kloudy-dns-') as d:
            p = Path(d) / 'change.json'
            p.write_text(json.dumps({'Comment': 'Kloudy MCP Registry domain ownership', 'Changes': [{'Action': 'UPSERT', 'ResourceRecordSet': desired}]}))
            change = aws('route53', 'change-resource-record-sets', '--hosted-zone-id', ZONE, '--change-batch', 'file://' + str(p))['ChangeInfo']
    save('dns.json', {'domain': 'kloudy.ai', 'txt': txt, 'change': change, 'otherTxtRecordsPreserved': len(values)-1, 'privateKeyStorage': 'Keys Boi, Windows DPAPI CurrentUser'})
    print(json.dumps({'dnsPrepared': True, 'txt': txt, 'change': change}))

def public_dns(k):
    r = requests.get('https://dns.google/resolve', params={'name': 'kloudy.ai', 'type': 'TXT'}, timeout=30)
    r.raise_for_status()
    answers = r.json().get('Answer', [])
    verified = any(record(k) == x.get('data', '').strip('"') for x in answers)
    save('dns-public.json', {'verified': verified, 'resolver': r.url, 'answers': [x for x in answers if 'v=MCPv1;' in x.get('data', '')]})
    if not verified:
        raise RuntimeError('Public DNS has not confirmed the registry key')

def dns_auth(k):
    public_dns(k)
    stamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    r = requests.post(REG + '/auth/dns', json={'domain': 'kloudy.ai', 'timestamp': stamp, 'signed_timestamp': k.sign(stamp.encode()).hex()}, timeout=30)
    if r.status_code != 200:
        raise RuntimeError('Registry DNS authentication HTTP ' + str(r.status_code))
    return r.json()['registry_token']

def publish():
    server = json.loads((ROOT / 'server.json').read_text())
    npm = requests.get('https://registry.npmjs.org/kloudy/' + server['version'], timeout=30)
    if npm.status_code != 200 or npm.json().get('mcpName') != server['name']:
        raise RuntimeError('Publish the matching npm package and mcpName first')
    token = dns_auth(key())
    r = requests.post(REG + '/publish', json=server, headers={'Authorization': 'Bearer ' + token}, timeout=60)
    del token
    if r.status_code not in (200, 201):
        save('publish-error.json', {'http': r.status_code, 'error': r.json()})
        raise RuntimeError('Registry publish HTTP ' + str(r.status_code) + '; inspect sanitized validation result')
    save('publish.json', {'http': r.status_code, 'result': r.json()})
    print(json.dumps({'published': server['name'], 'version': server['version'], 'http': r.status_code}))

def retire():
    p = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
    if p.returncode:
        raise RuntimeError('Existing GitHub authorization unavailable')
    r = requests.post(REG + '/auth/github-at', json={'github_token': p.stdout.strip()}, timeout=30)
    p = None
    if r.status_code != 200:
        raise RuntimeError('Old namespace authentication HTTP ' + str(r.status_code))
    token = r.json()['registry_token']
    r = requests.patch(REG + '/servers/' + quote('io.github.Gio300/kloudy', safe='') + '/status', json={'status': 'deleted', 'statusMessage': 'Moved to ai.kloudy/kloudy. Same Kloudy endpoint: https://kloudy.ai/mcp'}, headers={'Authorization': 'Bearer ' + token}, timeout=30)
    del token
    save('old-status-update.json', {'http': r.status_code, 'result': r.json() if r.content else None})
    if r.status_code not in (200, 204):
        raise RuntimeError('Old listing status HTTP ' + str(r.status_code))
    print('Old registry name retired from default listings')

def verify():
    results = {}
    for name in ['ai.kloudy/kloudy', 'io.github.Gio300/kloudy']:
        for suffix in ['versions/latest', 'versions?include_deleted=true']:
            url = REG + '/servers/' + quote(name, safe='') + '/' + suffix
            r = requests.get(url, timeout=30)
            results[name + '/' + suffix] = {'http': r.status_code, 'body': r.json()}
    save('registry-verification.json', results)
    print(json.dumps({name: {'http': v['http'], 'metadata': v['body'].get('_meta')} for name, v in results.items()}))

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['prepare-dns', 'publish', 'retire-old', 'verify'])
    action = parser.parse_args().action
    try:
        {'prepare-dns': prepare, 'publish': publish, 'retire-old': retire, 'verify': verify}[action]()
    except Exception as error:
        # Never dump request/response headers, process output, keys or tracebacks.
        print(str(error) if isinstance(error, RuntimeError) else type(error).__name__)
        raise SystemExit(1)
