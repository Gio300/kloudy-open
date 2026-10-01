import {readFile,writeFile,mkdir,rename,stat,copyFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {KloudyError} from './client.mjs';
const hosts={cursor:{detect:'.cursor',file:'.cursor/mcp.json',key:'mcpServers',slash:'.cursor/commands/kloudy.md'},claude:{detect:'.claude',file:'.mcp.json',key:'mcpServers',slash:'.claude/commands/kloudy.md'},vscode:{detect:'.vscode',file:'.vscode/mcp.json',key:'servers'}};
export async function install({project=process.cwd(),ide='auto',connection}){
 const root=resolve(project);if(!(await stat(root)).isDirectory())throw new KloudyError('invalid_project','Choose a project directory.');
 if(ide!=='auto'&&!hosts[ide])throw new KloudyError('unsupported_ide','Use cursor, claude, vscode or auto. Other MCP hosts can run kloudy mcp.');
 const results=[];
 for(const [name,host] of Object.entries(hosts)){
  if(ide!=='auto'&&ide!==name)continue;
  if(ide==='auto'){try{await stat(join(root,host.detect));}catch{continue;}}
  const path=join(root,host.file);let value={},old;
  try{old=await readFile(path,'utf8');value=JSON.parse(old);}catch(error){if(error.code!=='ENOENT')throw new KloudyError('config_unreadable','Existing IDE config is not plain JSON; it was left unchanged.');}
  if(!value||typeof value!=='object'||Array.isArray(value)||value[host.key]&&(typeof value[host.key]!=='object'||Array.isArray(value[host.key])))throw new KloudyError('config_unreadable','Existing IDE config was left unchanged.');
  const entry={...(name==='vscode'?{type:'stdio'}:{}),command:process.execPath,args:[fileURLToPath(new URL('../bin/kloudy.mjs',import.meta.url)),'mcp',...(connection?['--connection',resolve(connection)]:[])]};
  value[host.key]??={};
  if(value[host.key].kloudy&&JSON.stringify(value[host.key].kloudy)!==JSON.stringify(entry)){results.push({ide:name,state:'existing_kloudy_preserved',path});continue;}
  value[host.key].kloudy=entry;
  const next=JSON.stringify(value,null,2)+'\n';
  await mkdir(dirname(path),{recursive:true});
  if(old!==next){if(old!==undefined)await copyFile(path,path+'.kloudy-backup-'+randomUUID());const tmp=path+'.'+randomUUID()+'.tmp';await writeFile(tmp,next,{mode:0o600,flag:'wx'});await rename(tmp,path);}
  if(host.slash){const slash=join(root,host.slash);await mkdir(dirname(slash),{recursive:true});try{await writeFile(slash,'Ask for Kloudy. Use the kloudy MCP entry for the user’s task. Read the returned Toolbox; call only the selected tool. Exact engine approvals stay explicit. Never print service credentials. If registration or discovery is unavailable, report that dependency instead of inventing tools.\n',{flag:'wx',mode:0o600});}catch(error){if(error.code!=='EEXIST')throw error;}}
  results.push({ide:name,state:old===next?'already_installed':'installed',path});
 }
 return {product:'Kloudy',results,...(!results.length?{next:'No supported project configuration detected. Specify --ide cursor, claude or vscode, or configure your MCP host with kloudy mcp.'}:{})};
}
