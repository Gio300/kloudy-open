"""Publish the reviewed tarball with NPM_TOKEN; never print or persist its value."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

root = Path(__file__).resolve().parents[1]
proof = root / 'proof/2026-10-06-registry'
proof.mkdir(parents=True, exist_ok=True)
cache = root / '.cache/registry-release'
cache.mkdir(parents=True, exist_ok=True)
npm = shutil.which('npm.cmd') or shutil.which('npm')
token_file = Path(os.environ['USERPROFILE']) / 'Documents/keys_boi/npm_kloudy_publish_token_2026-10-04.txt'
env = dict(os.environ)
env['NPM_TOKEN'] = token_file.read_text().strip()
if not env['NPM_TOKEN'] or any(c.isspace() for c in env['NPM_TOKEN']):
    raise SystemExit('Invalid token file format; value not shown')
with tempfile.TemporaryDirectory(prefix='kloudy-npm-') as d:
    config = Path(d) / 'npmrc'
    config.write_text('//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n')
    env['NPM_CONFIG_USERCONFIG'] = str(config)
    packed = subprocess.run([npm, 'pack', '--ignore-scripts', '--json', '--pack-destination', str(cache)], cwd=root, env=env, capture_output=True, text=True)
    if packed.returncode:
        raise SystemExit('npm pack failed; credential output suppressed')
    pack = json.loads(packed.stdout)[0]
    bad = [x['path'] for x in pack['files'] if not (x['path'].startswith(('src/', 'bin/', 'schemas/')) or x['path'] in ['README.md', 'package.json', 'LICENSE', 'MCP-DEFAULT.md'])]
    if bad:
        raise SystemExit('Unexpected package content; stopped')
    (proof / 'npm-pack.json').write_text(json.dumps(pack, indent=2)+'\n')
    result = subprocess.run([npm, 'publish', str(cache / pack['filename']), '--access', 'public', '--ignore-scripts', '--json'], cwd=root, env=env, capture_output=True, text=True)
    # JSON publish output contains public package metadata only; sanitize even if
    # a future npm version unexpectedly includes the credential in diagnostics.
    output = result.stdout.replace(env['NPM_TOKEN'], '[redacted]')
    (proof / 'npm-publish.json').write_text(json.dumps({'exitCode': result.returncode, 'output': output}, indent=2)+'\n')
    print(json.dumps({'version': pack['version'], 'files': len(pack['files']), 'integrity': pack['integrity'], 'publishExitCode': result.returncode}))
    del env['NPM_TOKEN']
    raise SystemExit(result.returncode)
