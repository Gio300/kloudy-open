// Connect opens a choice, never claims an app has been installed or authorized.
export const CONNECT_COMMAND='npx kloudy';
export function connectDevice(nav={}) {
 const ua=nav.userAgent||'',platform=nav.userAgentData?.platform||nav.platform||'';
 if(nav.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(ua)||(/Mac/i.test(platform)&&nav.maxTouchPoints>1))return 'mobile';
 if(/Win|Mac|Linux|CrOS/i.test(platform)||/Windows NT|Macintosh|X11/i.test(ua))return 'desktop';
 return 'unknown';
}
export function connectChoices(nav={}) {
 const device=connectDevice(nav);
 const choices=[
  {name:'Cursor',url:'https://cursor.com/downloads',desktop:true},
  {name:'VS Code',url:'https://code.visualstudio.com/download',desktop:true},
  {name:'Windsurf',url:'https://windsurf.com/editor',desktop:true},
  {name:'Claude Code / Desktop',url:'https://claude.com/download',desktop:true},
  {name:'ChatGPT / Codex',url:'https://chatgpt.com/'},
  {name:'Claude',url:'https://claude.ai/'},
  {name:'Other app',url:'https://kloudy.ai/install#discover'}
 ];
 return choices.filter(item=>device!=='mobile'||!item.desktop);
}
export function installConnectPicker(doc=document,nav=navigator,{stylesheet=true}={}){
 if(doc.documentElement.dataset.connectPickerReady)return;
 doc.documentElement.dataset.connectPickerReady='true';
 if(stylesheet){const link=doc.createElement('link');link.rel='stylesheet';link.href='/install-command.css';doc.head.append(link);}
 let serial=0,active=null;
 const close=({focus=false}={})=>{if(!active)return;const {panel,button}=active;active=null;if(panel.hasAttribute('popover')&&panel.matches(':popover-open'))panel.hidePopover();panel.hidden=true;button.setAttribute('aria-expanded','false');if(focus)button.focus();};
 const position=()=>{if(!active)return;const {panel,button}=active,rect=button.getBoundingClientRect(),view=doc.defaultView;const width=panel.offsetWidth,height=panel.offsetHeight,gap=8,pad=12;panel.style.left=Math.max(pad,Math.min(rect.left+(rect.width-width)/2,view.innerWidth-width-pad))+'px';panel.style.top=Math.max(pad,Math.min(rect.bottom+gap+height<=view.innerHeight-pad?rect.bottom+gap:rect.top-height-gap,view.innerHeight-height-pad))+'px';};
 doc.addEventListener('pointerdown',event=>{if(active&&!active.panel.contains(event.target)&&!active.button.contains(event.target))close();});
 doc.defaultView?.addEventListener('resize',position);
 doc.addEventListener('scroll',event=>{if(active&&!active.panel.contains(event.target))position();},true);
 doc.addEventListener('click',async event=>{
  const button=event.target.closest('[data-copy-kloudy]');if(!button)return;
  event.preventDefault();
  let holder=button.closest('[data-install-step]');if(!holder){holder=doc.createElement('div');holder.dataset.installStep='';button.before(holder);holder.append(button);}
  let panel=holder.querySelector('[data-connect-panel]');
  if(panel&&!panel.hidden){close();return;}
  close();
  if(!panel){
   panel=doc.createElement('section');panel.dataset.connectPanel='';panel.id='connect-choice-'+(++serial);panel.setAttribute('aria-label','Choose an app');if(typeof panel.showPopover==='function')panel.setAttribute('popover','manual');
   const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');panel.append(status);
   const input=doc.createElement('input');input.readOnly=true;input.value=CONNECT_COMMAND;input.hidden=true;input.setAttribute('aria-label','Text to copy');panel.append(input);
   const links=doc.createElement('nav');links.setAttribute('aria-label','Apps');
   for(const choice of connectChoices(nav)){const a=doc.createElement('a');a.textContent=choice.name+' ↗';a.href=choice.url;a.target='_blank';a.rel='noopener noreferrer';a.dataset.connect='';links.append(a);}
   panel.append(links);holder.append(panel);button.setAttribute('aria-controls',panel.id);
  }
  button.textContent='Connect';button.setAttribute('aria-expanded','true');panel.hidden=false;
  active={panel,button};if(typeof panel.showPopover==='function')panel.showPopover();position();
  const status=panel.querySelector('[role=status]'),input=panel.querySelector('input');
  status.textContent='Choose an app. Its official page opens.';
  try{await nav.clipboard.writeText(CONNECT_COMMAND);input.hidden=true;status.textContent='Copied npx kloudy. Choose an app, then paste in its chat.';}
  catch{input.hidden=false;status.textContent='Not copied. Copy this text, then choose an app.';if(active?.panel===panel){input.focus();input.select();}}
  position();
 });
 doc.addEventListener('keydown',event=>{if(event.key==='Escape'&&active){event.preventDefault();close({focus:true});}});
}
if(typeof document!=='undefined')installConnectPicker(document,navigator,{stylesheet:false});
