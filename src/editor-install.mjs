import {readFile,writeFile,mkdir,rename,lstat,unlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {parse as toml} from 'smol-toml';
import {parse,modify,applyEdits} from 'jsonc-parser';
export const REMOTE='https://kloudy.ai/mcp';
export function editorPaths({home=homedir(),platform=process.platform,appData=process.env.APPDATA,xdg=process.env.XDG_CONFIG_HOME,codexHome=process.env.CODEX_HOME}={}){
 const config=platform==='win32'?(appData||join(home,'AppData/Roaming')):platform==='darwin'?join(home,'Library/Application Support'):(xdg||join(home,'.config'));
 return [
  {id:'cursor',name:'Cursor',file:join(home,'.cursor/mcp.json'),key:'mcpServers'},
  {id:'vscode',name:'VS Code',file:join(config,'Code/User/mcp.json'),key:'servers',jsonc:true},
  {id:'claude-desktop',name:'Claude Desktop',file:join(config,'Claude/claude_desktop_config.json'),key:'mcpServers',stdio:true},
  {id:'claude-code',name:'Claude Code',file:join(home,'.claude.json'),detect:join(home,'.claude'),key:'mcpServers'},
  {id:'windsurf',name:'Windsurf',file:join(home,'.codeium/windsurf/mcp_config.json'),key:'mcpServers'},
  {id:'codex',name:'Codex',file:join(codexHome||join(home,'.codex'),'config.toml'),key:'mcp_servers',toml:true}
 ];
}
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
async function read(path){try{return await readFile(path,'utf8');}catch(e){if(e.code==='ENOENT')return undefined;throw Error('Configuration could not be read; unchanged.');}}
async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
async function safePath(path){for(let p=path;;p=dirname(p)){try{const s=await lstat(p);if(s.isSymbolicLink())throw Error('Symbolic link configuration needs manual installation.');if(p===path&&(!s.isFile()||s.nlink>1))throw Error('Configuration is not a regular private file.');}catch(e){if(e.code!=='ENOENT')throw e;}if(dirname(p)===p)break;}}
export function editorEntry(host,key){
 if(key!==undefined&&(typeof key!=='string'||!/^\S{20,512}$/.test(key)))throw Error('Invalid Kloudy key; not written.');
 if(host.stdio)return {command:'npx',args:['-y','kloudy','mcp'],...(key?{env:{KLOUDY_MCP_TOKEN:key}}:{})};
 const headers=key?{Authorization:'Bearer '+key}:undefined;
 if(host.toml)return {url:REMOTE,...(headers?{http_headers:headers}:{})};
 return {...(['vscode','claude-code'].includes(host.id)?{type:'http'}:{}),[host.id==='windsurf'?'serverUrl':'url']:REMOTE,...(headers?{headers}:{})};
}
export async function installEditors({confirm=async()=>false,hosts=editorPaths(),key,onResult=()=>{}}={}){
 const results=[];
 for(const host of hosts){
  let state;
  try{
   if(!await exists(host.file)&&!await exists(host.detect||dirname(host.file)))continue;
   await safePath(host.file);const old=await read(host.file);let value,errors=[];
   try{value=old===undefined?{}:host.toml?toml(old):parse(old,errors,{allowTrailingComma:!!host.jsonc,disallowComments:!host.jsonc});}catch{throw Error('Configuration cannot be parsed; unchanged.');}
   if(errors.length||!record(value)||value[host.key]!==undefined&&!record(value[host.key]))throw Error('Configuration cannot be parsed; unchanged.');
   if(Object.hasOwn(value[host.key]||{},'kloudy'))state='existing_kloudy_preserved';
   else if(!await confirm({client:host.name,path:host.file,authenticated:!!key}))state='declined';
   else{
    const entry=editorEntry(host,key);let next;
    if(host.toml){next=(old||'')+'\n[mcp_servers.kloudy]\nurl = '+JSON.stringify(REMOTE)+'\n'+(key?'http_headers = { Authorization = '+JSON.stringify('Bearer '+key)+' }\n':'');toml(next);}
    else next=applyEdits(old||'{}',modify(old||'{}',[host.key,'kloudy'],entry,{formattingOptions:{insertSpaces:true,tabSize:2,eol:old?.includes('\r\n')?'\r\n':'\n'}}))+'\n';
    await safePath(host.file);if(await read(host.file)!==old)throw Error('Configuration changed during approval; unchanged. Run again.');
    await mkdir(dirname(host.file),{recursive:true});
    const lock=host.file+'.kloudy-lock';await writeFile(lock,'',{flag:'wx',mode:0o600});
    let temp;
    try{
     if(await read(host.file)!==old)throw Error('Configuration changed; unchanged.');
     if(old!==undefined)await writeFile(host.file+'.kloudy-backup-'+randomUUID(),old,{flag:'wx',mode:0o600});
     temp=host.file+'.kloudy-'+randomUUID()+'.tmp';await writeFile(temp,next,{flag:'wx',mode:0o600});
     if(await read(host.file)!==old)throw Error('Configuration changed; unchanged.');
     await rename(temp,host.file);temp=null;state='configured';
    }finally{if(temp)await unlink(temp).catch(()=>{});await unlink(lock).catch(()=>{});}
   }
  }catch{state='unchanged_error';}
  const result={client:host.name,path:host.file,state};results.push(result);onResult(result);
 }
 return results;
}
