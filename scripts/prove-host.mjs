// Read an existing protected console grant; never mint or extend one.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {HttpkClient} from '../src/httpk.mjs';
const [home,output]=process.argv.slice(2);
if(!home||!output)throw Error('Use prove-host.mjs PROTECTED_ENGINE_HOME OUTPUT');
try{
 const credential=JSON.parse(await readFile(join(home,'engine/session-console.json'),'utf8'));
 const {port}=JSON.parse(await readFile(join(home,'engine/endpoint.json'),'utf8'));
 if(!Number.isInteger(port)||port<1||port>65535)throw Error('Invalid endpoint');
 const client=new HttpkClient({endpoint:`http://127.0.0.1:${port}/v1/integrations/httpk`,token:credential.access_token,mode:'auto'});
 await client.session();const id=client.state.sessionId,mode=client.state.interactionMode;
 const negotiated=await client.negotiateHost();
 if(!negotiated.host_interface||client.state.sessionId!==id||client.state.interactionMode!==mode)throw Error('Negotiation failed');
 const proof={passed:true,mocked_hops:0,session_unchanged:true,mode_unchanged:true,credential_minted:false,model_called:false,...negotiated};
 await writeFile(output,JSON.stringify(proof,null,2)+'\n');console.log('Installed HTTPK host presentation proof passed; no authority changed.');
}catch{console.error('Installed host presentation proof failed. No grant was minted or renewed.');process.exitCode=1;}
