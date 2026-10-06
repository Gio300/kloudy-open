import {App} from '@modelcontextprotocol/ext-apps';
import {SamplePreferences,samplePreferencesMarkup,conversionCardMarkup} from '../src/sample-cards.mjs';
const app=new App({name:'Kloudy Sample card',version:'1.0.0'},{},{autoResize:true});
const root=document.querySelector('#sample-root');let flow=new SamplePreferences(),surface='ide',kind='preferences',connected=false,busy=false;
function render(notice=''){if(kind==='conversion')root.innerHTML=conversionCardMarkup();else if(kind==='preferences')root.innerHTML=samplePreferencesMarkup(flow,{surface,notice});else {root.replaceChildren();const section=document.createElement('section');section.className='sample-card';const title=document.createElement('h1');title.textContent='Kloudy Sample card';const link=document.createElement('a');link.className='sample-primary';link.href=kind==='analytics'?'https://kloudy.ai/bots':'https://kloudy.ai/?view=wallet';link.textContent=kind==='analytics'?'Open my bot activity':'Open my wallet';const note=document.createElement('p');note.textContent='Your account owns these records. Opening this card never makes a payment.';section.append(title,link,note);root.append(section);}}
const baseRender=render;render=function(notice=''){baseRender(notice);const save=root.querySelector('[data-sample-save]');if(save)save.textContent='Use in this conversation';};
render();
app.ontoolresult=({structuredContent:s})=>{if(s?.version!=='kloudy.sample/1')return;kind=['preferences','conversion','analytics','wallet'].includes(s.kind)?s.kind:'preferences';surface=['site','ide','chatbot'].includes(s.surface)?s.surface:'ide';render();};
root.addEventListener('click',async event=>{
 const target=event.target.closest('button,a');if(!target||busy)return;
 if(target.tagName==='A'){if(connected){event.preventDefault();try{await app.openLink({url:target.href});}catch{render('Open https://kloudy.ai/samples to continue.');}}return;}
 if(target.hasAttribute('data-sample-choice')){flow.choose(target.dataset.sampleChoice);render();root.querySelector('h1')?.focus();}
 else if(target.hasAttribute('data-sample-back')){flow.back();render();}
 else if(target.hasAttribute('data-sample-later')){root.textContent='You can ask for your Kloudy Sample card anytime.';}
 else if(target.hasAttribute('data-sample-save')){busy=true;target.disabled=true;try{
  if(!connected)throw Error('Open Kloudy to save these preferences.');
  const result=await app.updateModelContext({content:[{type:'text',text:JSON.stringify({type:'kloudy.sample.preferences',version:1,preferences:flow.value,authority:'presentation-only',spendingAuthorized:false,accountSaved:false})}]});
  if(result?.isError)throw Error('Your host could not receive these preferences.');
  render('Shared with this assistant for this conversation. No tools or payments authorized. Account-wide saving is on Kloudy.');
 }catch(error){render(error.message);}finally{busy=false;const a=document.createElement('a');a.href='https://kloudy.ai/samples?frontdoor='+surface+'#preferences='+encodeURIComponent(JSON.stringify(flow.value));a.className='sample-primary';a.textContent='Save on my Kloudy account';root.querySelector('section')?.append(a);}}
});
app.onerror=()=>{connected=false;};
if(window.parent!==window)app.connect().then(()=>{connected=true;}).catch(()=>{});
