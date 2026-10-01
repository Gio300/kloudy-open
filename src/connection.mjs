import {readFile,writeFile,rename,mkdir,rmdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {KloudyClient,KloudyError,httpTransport} from './client.mjs';

export async function withConnection(file,work){
  if(!file)throw new KloudyError('registration_required','Ask for Kloudy. Email + short 2FA registration requires the Core account service. An existing scoped engine connection can be supplied with --connection.');
  let c;try{c=JSON.parse(await readFile(file,'utf8'));}catch{throw new KloudyError('connection_unavailable','The scoped connection file is unavailable.');}
  const transport=httpTransport({origin:c.origin,token:c.access_token});
  const stateFile=resolve(dirname(file),'kloudy-open-session.json'),lock=stateFile+'.lock';
  try{await mkdir(lock,{mode:0o700});}catch{throw new KloudyError('connection_busy','Another Kloudy client owns this session. Retry after it exits; stale lock recovery is documented.');}
  try{
    const owner=createHash('sha256').update(c.origin+'\n'+(c.client_id||c.access_token)).digest('hex');
    let state={owner};try{const saved=JSON.parse(await readFile(stateFile,'utf8'));if(saved.owner===owner)state=saved;}catch(error){if(error.code!=='ENOENT')throw new KloudyError('invalid_state','Saved session could not be read.');}
    const save=async value=>{const temp=stateFile+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});await rename(temp,stateFile);};
    return await work(new KloudyClient({transport,state,save}));
  }finally{await rmdir(lock);}
}
