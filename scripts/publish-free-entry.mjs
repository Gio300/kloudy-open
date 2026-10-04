// Public static installer only. Uses free GitHub Pages; no workflow or engine hosting.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const api=(path,body)=>JSON.parse(execFileSync('gh',['api',path,...(body?['--method','POST','--input','-']:[])],{input:body?JSON.stringify(body):undefined,encoding:'utf8'}));
const repo='repos/Gio300/kloudy-open',source=new URL('../../kloudy/packages/browser/',import.meta.url);
let html=await readFile(new URL('editor-install.html',source),'utf8');
html=html.replace('href="/"','href="https://kloudy.ai/"').replaceAll('href="/app-icon.svg"','href="./app-icon.svg"').replaceAll('href="/editor-install.css"','href="./editor-install.css"').replaceAll('src="/editor-install.mjs"','src="./editor-install.mjs"').replaceAll('src="/brand/kloudy-app-icon.svg"','src="./app-icon.svg"');
const files={'index.html':html,'editor-install.css':await readFile(new URL('editor-install.css',source),'utf8'),'editor-install.mjs':await readFile(new URL('editor-install.mjs',source),'utf8'),'app-icon.svg':await readFile(new URL('../../kloudy/brand/kloudy-app-icon.svg',import.meta.url),'utf8'),'.nojekyll':'','LICENSE.txt':'Kloudy website assets. Copyright TensorVerse. All rights reserved. The kloudy npm client package has its own Apache-2.0 license.\n'};
const tree=api(repo+'/git/trees',{tree:Object.entries(files).map(([path,content])=>({path,mode:'100644',type:'blob',content}))});
let parent;try{parent=api(repo+'/git/ref/heads/gh-pages').object.sha;}catch{}
const commit=api(repo+'/git/commits',{message:'Publish free Kloudy editor install page',tree:tree.sha,parents:parent?[parent]:[]});
if(parent)execFileSync('gh',['api',repo+'/git/refs/heads/gh-pages','--method','PATCH','--input','-'],{input:JSON.stringify({sha:commit.sha,force:false}),encoding:'utf8'});
else api(repo+'/git/refs',{ref:'refs/heads/gh-pages',sha:commit.sha});
let pages;try{pages=api(repo+'/pages');}catch{try{pages=api(repo+'/pages',{build_type:'legacy',source:{branch:'gh-pages',path:'/'}});}catch(error){if(String(error.stdout).includes('already enabled'))pages=api(repo+'/pages');else throw error;}}
console.log(JSON.stringify({url:pages.html_url,status:pages.status,commit:commit.sha,hosting:'GitHub Pages public repository',engineHosted:false}));
