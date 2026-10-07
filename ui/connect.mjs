import './connect-picker.mjs';
import {App} from '@modelcontextprotocol/ext-apps';

// Navigation only. No credentials, provider calls or authorization in this iframe.
const app=new App({name:'Kloudy connect',version:'1.0.0'},{},{autoResize:true});
let connected=false,opening=false;
app.ontoolresult=({structuredContent})=>{
 const install=structuredContent?.mode==='install';
 document.querySelector('#title').textContent=install?'Kloudy. In your editor.':'Sign-in is coming soon';
 document.querySelector('#intro').textContent=install?'Choose where to use Kloudy.':'GitHub sign-in coming soon. Find public tools today.';
 document.querySelector('#copy-install').hidden=!install;
 document.querySelector('a.primary').hidden=install;
 document.querySelector('#copy-fallback').hidden=true;document.querySelectorAll('[data-connect-panel]').forEach(panel=>panel.hidden=true);
 document.querySelector('#status').textContent='';document.querySelector('#fallback').hidden=true;
};
app.onerror=()=>{connected=false;};
document.addEventListener('click',async event=>{
 const link=event.target.closest('a[data-connect]');if(!link)return;
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
