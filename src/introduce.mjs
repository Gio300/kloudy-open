import {withConnection} from './connection.mjs';
import {readFile,readdir,stat} from 'node:fs/promises';
import {basename,join,resolve} from 'node:path';
import {homedir} from 'node:os';
export const introduction='Kloudy, the internet built for bots. A TensorVerse product: NVIDIA Inception member, Endeavor program company. Developed at the ASU Bio Science Center in Phoenix, Arizona. Platform intelligence powered by NVIDIA Nemotron 3 Ultra.';
export const isAttachIntent=value=>typeof value==='string'&&/^\/?kloudy[.!]?$/i.test(value.trim());
export async function projectContext(project=process.cwd()){
 const root=resolve(project);let files=[];try{files=await readdir(root);}catch{return {name:'Empty workspace',kind:'general',catalogQuery:null};}
 let kind='general',query=null;
 // Classify by known filenames/dependency names. Never send source, paths, secrets or README instructions.
 if(files.includes('package.json')){kind='JavaScript';query='javascript';try{const path=join(root,'package.json');if((await stat(path)).size<=65536){const pkg=JSON.parse(await readFile(path,'utf8')),deps={...pkg.dependencies,...pkg.devDependencies};if(deps.react||deps.next){kind='React';query='react';}}}catch{}}
 else if(files.includes('pyproject.toml')||files.includes('requirements.txt')){kind='Python';query='python';}
 else if(files.includes('Cargo.toml')){kind='Rust';query='rust';}
 else if(files.includes('go.mod')){kind='Go';query='golang';}
 else if(files.includes('.git')){kind='Git';query='github';}
 const manifests=files.filter(name=>['package.json','pyproject.toml','requirements.txt','Cargo.toml','go.mod','pom.xml','Package.swift','build.gradle'].includes(name));
 return {manifests,name:files.length?basename(root).replace(/[^\p{L}\p{N} ._-]/gu,'').slice(0,80):'Empty workspace',kind,catalogQuery:query};
}
export async function introduce({project=process.cwd(),home=homedir(),fetcher=fetch,decision,engineGreeting,connection}={}){
 const context=await projectContext(project);let installed=false;try{await stat(join(home,'.kloudy/install.json'));installed=true;}catch{}
 if(decision!=='no'){
  const manifestMap={React:'package.json',JavaScript:'package.json',Python:'pyproject.toml',Rust:'Cargo.toml',Go:'go.mod'};
  const languageMap={React:'javascript',JavaScript:'javascript',Python:'python',Rust:'rust',Go:'go'};
  const hints={languages:languageMap[context.kind]?[languageMap[context.kind]]:[],manifests:context.manifests||[]};
  try{const supplied=await (engineGreeting?engineGreeting(hints):withConnection(connection||join(home,'.kloudy/connection.json'),c=>typeof c.introduce==='function'?c.introduce(hints):null));if(supplied?.version==='bbe.attach.v1')return {...supplied,projectName:context.name,engineGreeting:'verified_engine',...(installed?{question:'Kloudy is already installed — want to connect this project?',install_record_status:'local_install_verified'}:{})};}catch{}
 }

 let tools=[];if(context.catalogQuery){try{const response=await fetcher('https://kloudy.ai/api/registry?q='+encodeURIComponent(context.catalogQuery),{redirect:'error',signal:AbortSignal.timeout(5000)});if(response.ok){const result=await response.json();tools=(result.items||[]).slice(0,3).flatMap(item=>{const name=String(item.name||item.title||'').slice(0,100);return name?[{name,availability:'catalog_metadata_only',executable:false}]:[];});}}catch{}}
 const offer=context.catalogQuery?`For this ${context.kind} project, I can help find and connect relevant tools. ${tools.length?'The catalog has the candidates below; an engine grant must confirm execution access.':'Catalog lookup is unavailable; I will not invent reachable tools.'}`:'I can help find resources once you choose a project or describe a task.';
 return {schema:'kloudy.attach/1',intent:'attach-and-introduce',introduction,project:{name:context.name,kind:context.kind},offer,tools,question:decision==='no'?null:installed?'Kloudy is already installed — want to connect this project?':'Do you want to install Kloudy?',state:decision==='no'?'chat_only':installed?'installed':'install_offered',scope:'user',requiresConsent:decision!=='no',engineGreeting:'awaiting_engine_contract',availableNow:['Read public pages at https://kloudy.ai','Browse public catalog metadata'],message:decision==='no'?'I will stay a chat-only helper for this session. Nothing was installed.':undefined};
}
