import test from 'node:test';import assert from 'node:assert/strict';
import {chooserResponse,pendingChooserResponse,CHOOSER_URL} from '../src/chooser-link.mjs';
const original={content:[{type:'text',text:'Vite, Astro, Next.js'}],structuredContent:{choiceSetId:'visual-aabbcc',selectedOptionId:'astro-publishing',executed:false,authorizesSpending:false},_meta:{ui:{resourceUri:'ui://widget/kloudy-visual-setup-v1.html'},other:'retained'}};
test('same result retains supported card metadata and a visible HTTPS link; goal never enters URL',()=>{
 const result=chooserResponse(original,{apps:true,goal:'Private project request'});
 assert.equal(result._meta.ui.resourceUri,original._meta.ui.resourceUri);assert.equal(result._meta.other,'retained');
 assert.match(result.content.at(-1).text,/Website chooser: https:\/\/kloudy.ai/);assert.equal(result.structuredContent.chooser.request,'Private project request');
 const url=new URL(result.structuredContent.chooser.url);assert.equal(url.origin,'https://kloudy.ai');assert.equal(url.search,'');assert.equal(url.href.includes('Private'),false);
 assert.equal(result.structuredContent.chooser.accountBindingVerified,false);assert.equal(result.structuredContent.chooser.linkIsAuthorization,false);
 assert.deepEqual(original.content,[{type:'text',text:'Vite, Astro, Next.js'}]);
});
test('text-only hosts still receive link and pending lookup preserves exact selection',()=>{
 const result=chooserResponse(original,{apps:false});assert.match(result.content.at(-1).text,/HTTPS link/);
 assert.deepEqual(pendingChooserResponse(result),result);assert.equal(pendingChooserResponse(null).structuredContent.chooser.url,CHOOSER_URL);
});
test('invalid locator fields cannot insert credentials or arbitrary URLs',()=>{
 const result=chooserResponse({...original,structuredContent:{choiceSetId:'bearer bad',selectedOptionId:'https://other.example/token'}});
 assert.equal(result.structuredContent.chooser.url,CHOOSER_URL);
});
