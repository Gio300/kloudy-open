import {App} from '@modelcontextprotocol/ext-apps';
import {SamplePreferences,samplePreferencesMarkup} from '../src/sample-cards.mjs';
const app=new App({name:'Tool preferences card',version:'1.0.0'},{},{autoResize:true});
const root=document.querySelector('#sample-root');let flow=new SamplePreferences(),surface='chatbot',connected=false,busy=false;
function render(notice=''){
 root.innerHTML=samplePreferencesMarkup(flow,{surface,notice});
 root.querySelector('section').setAttribute('aria-label','Tool preferences card');
 root.querySelector('header span:not(.sample-orb)').textContent='Tool preferences card';
 const save=root.querySelector('[data-sample-save]');if(save)save.textContent='Use in this conversation';
}
render();
app.ontoolresult=({structuredContent:s})=>{if(s?.version!=='kloudy.sample/1'||s.kind!=='preferences')return;surface=['site','ide','chatbot'].includes(s.surface)?s.surface:'chatbot';render();};
root.addEventListener('click',async event=>{
 const target=event.target.closest('button,a');if(!target||busy)return;
 if(target.tagName==='A'){if(connected){event.preventDefault();try{await app.openLink({url:target.href});}catch{render('Open Kloudy to save your choices.');}}return;}
 if(target.hasAttribute('data-sample-choice')){flow.choose(target.dataset.sampleChoice);render();root.querySelector('h1')?.focus();}
 else if(target.hasAttribute('data-sample-back')){flow.back();render();}
 else if(target.hasAttribute('data-sample-later')){root.textContent='You can choose your tool preferences later.';}
 else if(target.hasAttribute('data-sample-save')){busy=true;target.disabled=true;try{
  if(!connected)throw Error('Open Kloudy to save your choices.');
  const result=await app.updateModelContext({content:[{type:'text',text:JSON.stringify({type:'kloudy.sample.preferences',version:1,preferences:flow.value,authority:'presentation-only',spendingAuthorized:false,accountSaved:false})}]});
  if(result?.isError)throw Error('Your choices could not be shared. Try again.');
  render('Choices shared for this conversation. No tools were connected.');
 }catch{render('Your choices could not be shared here. Try again or save them on Kloudy.');}finally{busy=false;const a=document.createElement('a');a.href='https://kloudy.ai/samples?frontdoor='+surface+'#preferences='+encodeURIComponent(JSON.stringify(flow.value));a.className='sample-primary';a.textContent='Save on my Kloudy account';root.querySelector('section')?.append(a);}}
});
app.onerror=()=>{connected=false;};
if(window.parent!==window)app.connect().then(()=>{connected=true;}).catch(()=>{});
