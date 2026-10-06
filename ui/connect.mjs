import {App} from '@modelcontextprotocol/ext-apps';

// Navigation only. No credentials, provider calls or authorization in this iframe.
const app=new App({name:'Kloudy connect',version:'1.0.0'},{},{autoResize:true});
let connected=false,opening=false;
app.ontoolresult=({structuredContent})=>{
 const install=structuredContent?.mode==='install';
 document.querySelector('#title').textContent=install?'Where do you want Kloudy?':'Connect Kloudy';
 document.querySelector('#intro').textContent=install?'Choose your editor or sign in.':'Find tools. Build with your existing front door.';
 document.querySelector('#status').textContent='';document.querySelector('#fallback').hidden=true;
};
app.onerror=()=>{connected=false;};
for(const link of document.querySelectorAll('a[data-connect]'))link.addEventListener('click',async event=>{
 if(!connected)return; // Ordinary HTTPS links work in clients without a bridge.
 event.preventDefault();
 if(opening)return;opening=true;
 const status=document.querySelector('#status');status.textContent='Opening setup…';
 const fallback=document.querySelector('#fallback');fallback.hidden=true;
 let failed=false;
 try{
  const result=await app.openLink({url:link.href});
  failed=!!result.isError;
  status.textContent=result.isError?'Could not open setup. Use the link below.':'Continue in the page that opened.';
 }catch{failed=true;status.textContent='Could not open setup. Use the link below.';}
 finally{opening=false;}
 if(failed){fallback.href=link.href;fallback.textContent=link.textContent;fallback.hidden=false;}
});
if(window.parent!==window)app.connect().then(()=>{connected=true;}).catch(()=>{connected=false;});
