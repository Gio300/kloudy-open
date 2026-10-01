#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {withConnection} from '../src/connection.mjs';
import {serveMcp} from '../src/mcp.mjs';
import {createWrapper} from '../src/wrap.mjs';
import {install} from '../src/install.mjs';
const args=process.argv.slice(2),command=args.shift()||'help';
function option(name){const index=args.indexOf('--'+name);if(index<0)return null;if(index===args.length-1||args[index+1].startsWith('--'))throw new Error('Option value required');const value=args[index+1];args.splice(index,2);return value;}
const output=value=>process.stdout.write(JSON.stringify(value,null,2)+'\n');
try{
 const connection=option('connection')||process.env.KLOUDY_CONNECTION;
 if(command==='help'||command==='--help'){
  console.log('Ask for Kloudy. One CLI, one MCP, tools appear when needed.\n\nkloudy ask "goal" --connection FILE [--candidates FILE]\nkloudy call NAME --inputs FILE --connection FILE\nkloudy status --connection FILE\nkloudy approve --revision REVISION --connection FILE\nkloudy cancel --connection FILE\nkloudy mcp --connection FILE\nkloudy install --project DIR [--ide cursor|claude|vscode] [--connection FILE]\nkloudy wrap --config FILE [--port 8796]\nkloudy login\n\nRegister with email + short 2FA through the Core account service. Existing engine connections remain usable. Hosted registration is not supplied by this client package.');
 }else if(command==='install'){output(await install({project:option('project')||process.cwd(),ide:option('ide')||'auto',connection}));}
 else if(command==='mcp'){await serveMcp(connection);}
 else if(command==='wrap'){
  const file=option('config'),port=Number(option('port')||8796);if(!file||!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid wrapper options');
  const config=JSON.parse(await readFile(file,'utf8'));const token=process.env.KLOUDY_WRAP_TOKEN;
  const server=createWrapper({...config,token});server.listen(port,'127.0.0.1',()=>process.stderr.write('Kloudy local HTTPK wrapper listening.\n'));
 }else if(command==='login'){
  output({status:'registration_unavailable',message:'Ask for Kloudy. Email + short 2FA, then a session cookie/tag or OAuth, belongs to the Core account service. No registration endpoint is published yet. No email or code was collected.',url:'https://kloudy.ai/connect'});process.exitCode=3;
 }else{
  const candidatesFile=option('candidates'),inputsFile=option('inputs'),revision=option('revision'),lane=option('lane')||'non_medical';
  if(args.some(x=>x.startsWith('--')))throw new Error('Unknown option');
  const result=await withConnection(connection,async client=>{
   if(command==='ask'){const supplied=candidatesFile?JSON.parse(await readFile(candidatesFile,'utf8')):[];return client.ask(args.join(' '),{candidates:Array.isArray(supplied)?supplied:supplied.candidates,lane});}
   if(command==='call'){if(args.length!==1||!inputsFile)throw new Error('Tool and inputs file required');return client.call(args[0],JSON.parse(await readFile(inputsFile,'utf8')));}
   if(command==='status')return client.status();
   if(['approve','cancel'].includes(command))return client.decide(command,revision);
   throw new Error('Unknown command');
  });output(result);
 }
}catch(error){output({error:error.code||'invalid_request',message:error.code?error.message:'The request could not be completed. Run kloudy help.'});process.exitCode=1;}
