const $=id=>document.getElementById(id),endpoint='https://kloudy.ai/mcp';
$('cursor').href='cursor://anysphere.cursor-deeplink/mcp/install?name=kloudy&config='+encodeURIComponent(btoa(JSON.stringify({url:endpoint})));
$('vscode').href='vscode:mcp/install?'+encodeURIComponent(JSON.stringify({name:'kloudy',type:'http',url:endpoint}));
let timer,run=0;
function clients(login){$('signin').hidden=true;$('clients').hidden=false;$('identity').textContent=login?`Signed in as ${login}. Public discovery is free.`:'Free public discovery needs no API key.';$('clients').scrollIntoView({behavior:'smooth',block:'start'});}
async function api(path,method='POST'){const r=await fetch('/api/auth/editor/'+path,{method,credentials:'same-origin',headers:{'content-type':'application/json'},...(method==='POST'?{body:'{}'}:{})});const value=await r.json();if(!r.ok&&!('available' in value))throw Error('Sign-in could not finish. Try again.');return value;}
async function poll(current,interval){clearTimeout(timer);timer=setTimeout(async()=>{if(run!==current)return;try{const s=await api('poll');if(run!==current)return;if(s.authenticated){$('status').textContent='Signed in. Choose your editor.';clients(s.login);$('add-editor').disabled=false;}else poll(current,s.interval||5);}catch{$('status').textContent='Sign-in expired or was cancelled. You can try again or use free public discovery below.';clients();$('add-editor').disabled=false;}},Math.max(5,interval)*1000);}
$('add-editor').addEventListener('click',async()=>{
 if(location.hostname!=='kloudy.ai'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1'){location.href='https://kloudy.ai/install';return;}
 const current=++run;clearTimeout(timer);$('add-editor').disabled=true;$('status').textContent='Checking sign-in…';
 try{const s=await api('session','GET');if(s.authenticated){clients(s.login);$('status').textContent='Choose your editor.';$('add-editor').disabled=false;return;}if(!s.available){$('status').textContent='GitHub sign-in is not connected yet. You can install free public discovery without an account.';clients();$('add-editor').disabled=false;return;}
 const d=await api('start');if(!d.userCode)throw Error();$('user-code').textContent=d.userCode;$('verify').href=d.verificationUri;$('signin').hidden=false;$('clients').hidden=true;$('status').textContent='Use the one-time code on GitHub. This page will continue automatically.';poll(current,d.interval);
 }catch{$('status').textContent='Sign-in is unavailable. Free public discovery is still available.';clients();$('add-editor').disabled=false;}
});
$('cancel-signin').addEventListener('click',()=>{run++;clearTimeout(timer);void api('logout').catch(()=>{});$('add-editor').disabled=false;$('status').textContent='Sign-in cancelled. No editor configuration was changed.';clients();});
for(const id of ['cursor','vscode'])$(id).addEventListener('click',()=>{$('client-status').textContent=`Finish the installation prompt in ${id==='cursor'?'Cursor':'VS Code'}. Your browser cannot verify that the editor installed it.`;});
for(const button of document.querySelectorAll('[data-client]'))button.addEventListener('click',()=>{$('terminal-help').hidden=false;$('client-status').textContent=`Install for ${button.dataset.client} from your terminal.`;});
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText('npx kloudy');$('copy').textContent='Copied';}catch{$('client-status').textContent='Select and copy npx kloudy above.';}});
window.addEventListener('pagehide',()=>{run++;clearTimeout(timer);});
