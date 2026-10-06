import {connectHTML} from './connect-ui.mjs';

export const CONNECT_URI='ui://widget/kloudy-connect-v1.html';
export const connectResource={uri:CONNECT_URI,name:'Kloudy setup',description:'Sign in or choose a Kloudy front door. Navigation only.',mimeType:'text/html;profile=mcp-app'};
export const connectTool={
 name:'kloudy_connect_card',
 description:'Show the Kloudy sign-in and connection card when the user asks to connect, sign in, install, or mentions npx kloudy. After kloudy returns kind account or connect, call this render tool once with the returned mode. Opening setup never completes authorization. Text-only hosts should show the returned Markdown links.',
 annotations:{readOnlyHint:true,destructiveHint:false,idempotentHint:true,openWorldHint:false},
 inputSchema:{type:'object',properties:{mode:{type:'string',enum:['signin','install']}},required:['mode'],additionalProperties:false},
 _meta:{ui:{resourceUri:CONNECT_URI},'openai/outputTemplate':CONNECT_URI,'openai/toolInvocation/invoking':'Opening Kloudy setup…','openai/toolInvocation/invoked':'Kloudy setup choices'}
};
export function connectArguments(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&['signin','install'].includes(value.mode);}
export function connectResult(mode){
 const install=mode==='install';
 const message=install?'Choose where to connect Kloudy. Opening setup is not a finished connection.':'Kloudy finds MCP tools and SDKs for your task. Sign in or keep using free discovery.';
 const actions=install?[
  {label:'Add to an IDE',url:'https://kloudy.ai/install#clients'},
  {label:'Connect to Muse',url:'https://kloudy.ai/install#muse'},
  {label:'Sign in',url:'https://kloudy.ai/install'}
 ]:[{label:'Sign in to Kloudy',url:'https://kloudy.ai/install'},{label:'Add to an IDE',url:'https://kloudy.ai/install#clients'}];
 return {content:[{type:'text',text:message+'\n\n'+actions.map(a=>`[${a.label}](${a.url})`).join('\n')}],structuredContent:{tier:'public',kind:install?'connect':'account',mode,items:[],message,actions,model_calls:0,executed:false}};
}
export function connectContents(){return {contents:[{uri:CONNECT_URI,mimeType:connectResource.mimeType,text:connectHTML,_meta:{
 ui:{prefersBorder:true,domain:'https://kloudy.ai',csp:{connectDomains:[],resourceDomains:[]}},
 'openai/widgetDescription':'Kloudy sign-in and setup choices. No account is created and no tool is authorized by opening a link.',
 'openai/widgetPrefersBorder':true,'openai/widgetDomain':'https://kloudy.ai',
 'openai/widgetCSP':{connect_domains:[],resource_domains:[],redirect_domains:['https://kloudy.ai','https://cursor.com','https://insiders.vscode.dev']}
 }}]};}
// Public UI metadata still requires credential validation when called with a credential.
export function connectMessage(method,params={}){
 if(!params||typeof params!=='object'||Array.isArray(params))return false;
 if(['resources/list','resources/templates/list'].includes(method))return Object.keys(params).length===0;
 if(method==='resources/read')return Object.keys(params).length===1&&params.uri===CONNECT_URI;
 return method==='tools/call'&&Object.keys(params).length===2&&params.name==='kloudy_connect_card'&&connectArguments(params.arguments);
}
