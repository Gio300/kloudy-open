#!/bin/sh
set -eu
# Isolated Linux runtime, home and npm cache. Never reads the owner's editor configs.
task_dir=$(mktemp -d /tmp/kloudy-npm-proof-XXXXXX)
cd "$task_dir"
curl -fsSL https://nodejs.org/dist/latest-v22.x/SHASUMS256.txt -o SHASUMS256.txt
node_archive=$(awk '/ node-v22\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/ {print $2}' SHASUMS256.txt)
test -n "$node_archive"
curl -fsSL "https://nodejs.org/dist/latest-v22.x/$node_archive" -o "$node_archive"
awk '/ node-v22\.[0-9]+\.[0-9]+-linux-x64.tar.xz$/' SHASUMS256.txt | sha256sum -c -
tar -xf "$node_archive"
export PATH="$task_dir/${node_archive%.tar.xz}/bin:/usr/local/bin:/usr/bin:/bin"
export HOME="$task_dir/home"
export npm_config_cache="$task_dir/npm-cache"
export CODEX_HOME="$HOME/.codex"
unset KLOUDY_MCP_TOKEN KLOUDY_CONNECTION NODE_AUTH_TOKEN NPM_TOKEN
mkdir -p "$HOME"
npm install --prefix "$task_dir/runtime" --ignore-scripts kloudy@0.4.0 --registry=https://registry.npmjs.org > install.log 2>&1
export KLOUDY_TEST_ENTRY="$task_dir/runtime/node_modules/kloudy/bin/entry.mjs"
npx --yes kloudy@0.4.0 --version > npx-version.log
cat npx-version.log
npx --yes kloudy > empty-home.log
node "$KLOUDY_TEST_ENTRY" find github MCP tools > question.json
export KLOUDY_PROOF_DEST="$1"
python3 - <<'PY'
import os, pathlib, pty, select, subprocess, json, time, re
home=pathlib.Path(os.environ['HOME'])
paths={
'Cursor':('.cursor/mcp.json','mcpServers'),
'VS Code':('.config/Code/User/mcp.json','servers'),
'Claude Desktop':('.config/Claude/claude_desktop_config.json','mcpServers'),
'Claude Code':('.claude.json','mcpServers'),
'Windsurf':('.codeium/windsurf/mcp_config.json','mcpServers'),
'Codex':('.codex/config.toml','mcp_servers')}
for name,(path,key) in paths.items():
 p=home/path;p.parent.mkdir(parents=True,exist_ok=True)
 p.write_text('[mcp_servers.existing]\nurl="https://example.com/mcp"\n' if name=='Codex' else json.dumps({key:{'existing':{'command':'do-not-change'}}}))
pid,fd=pty.fork()
if pid==0:os.execvp('npx',['npx','--yes','kloudy'])
out=b'';answered=0;deadline=time.time()+60
while time.time()<deadline:
 if select.select([fd],[],[],1)[0]:
  try:part=os.read(fd,65536)
  except OSError:break
  if not part:break
  out+=part
  while out.count(b'[y/N]')>answered:
   os.write(fd,b'y\n');answered+=1
finished,status=os.waitpid(pid,0)
assert os.waitstatus_to_exitcode(status)==0
assert answered==6,answered
text=re.sub(r'\x1b\[[0-?]*[ -/]*[@-~]','',out.decode())
assert text.count(': configured')==6,text
for name,(path,key) in paths.items():
 text_file=(home/path).read_text()
 assert 'existing' in text_file and 'kloudy' in text_file
 if name!='Codex':assert json.loads(text_file)[key]['existing']['command']=='do-not-change'
proof={'environment':'isolated Linux Node runtime, empty HOME and fresh npm cache inside existing WSL; not a new VM','node':subprocess.check_output(['node','--version'],text=True).strip(),'package':'kloudy@0.4.0','source':'public npm registry: kloudy@0.4.0', 'npx_version':pathlib.Path('npx-version.log').read_text().strip(), 'npm_install_output':pathlib.Path('install.log').read_text(),'empty_home_output':pathlib.Path('empty-home.log').read_text(),'fixture_install_output':text,'fixture_clients_configured':list(paths),'real_desktop_clients_modified':[],'question':json.loads(pathlib.Path('question.json').read_text()),'exit_code':0}
pathlib.Path(os.environ['KLOUDY_PROOF_DEST']).write_text(json.dumps(proof,indent=2))
print(json.dumps({'exit_code':0,'fixture_clients':list(paths),'node':proof['node'],'real_desktop_clients_modified':[]}))
PY
