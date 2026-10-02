// Anonymous read-only smoke test against the deployed application and real API.
import {JSDOM} from './.test-runtime/node_modules/jsdom/lib/api.js';
import assert from 'node:assert/strict';
const base='https://knaios.github.io/cai.github.io/';
const html=await (await fetch(base+'?check=community')).text();
assert.match(html,/community-app\.js/);
const dom=new JSDOM(html,{url:base,runScripts:'outside-only'}),w=dom.window,d=w.document;
w.fetch=fetch;w.AbortSignal=AbortSignal;w.AbortController=AbortController;w.structuredClone=structuredClone;w.scrollTo=()=>{};w.matchMedia=()=>({matches:false});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
async function ready(){const deadline=Date.now()+30000;while(d.querySelector('#main').hasAttribute('aria-busy')){if(Date.now()>deadline)throw Error('Render timeout');await new Promise(r=>setTimeout(r,50));}assert.equal(d.querySelector('[data-retry]'),null,d.querySelector('main').textContent);}
async function go(hash){w.location.hash=hash;await new Promise(r=>setTimeout(r,10));await ready();}
try{
 for(const script of d.querySelectorAll('script[src]')){const url=new URL(script.getAttribute('src'),base);const response=await fetch(url);assert.equal(response.status,200,url.href);w.eval(await response.text());}
 await ready();assert.ok(d.querySelector('.community-feed'));const cards=d.querySelectorAll('.community-post');assert.ok(cards.length<=20);
 const baseline=await w.CommunityAPI.feed({page_number:1});assert.equal(cards.length,baseline.items.length);
 let author;
 if(cards.length){const post=cards[0].querySelector('a[href^="#/post/"]').getAttribute('href');author=cards[0].querySelector('.user-link').getAttribute('href');await go(post);assert.ok(d.querySelector('.article-body'));assert.ok(d.querySelector('[data-comment-login]'));assert.equal(d.querySelector('[data-edit]'),null);}
 else{assert.ok(d.querySelector('.feed-empty'));const profile=await w.CommunityAPI.profile('430ef651-e7f9-4979-96e1-67e6bca2814d','user_id');assert.ok(profile);author='#/u/'+encodeURIComponent(profile.username);console.log('NOTE: live API has no public posts; live reading checks skipped. Reading remains covered by the local UI test.');}
 await go(author+'?board=knowledge');assert.ok(d.querySelector('.author-file-tree'));assert.equal(d.querySelector('[data-folder-create]'),null);assert.equal(d.querySelector('#nav .mega-tab[href="#/tools"]')!==null,true);
 await go('#/guestbook');assert.ok(d.querySelector('[data-comment-login]'));assert.equal(d.querySelector('#comment-form'),null);
 await go('#/tools');assert.ok(d.querySelector('.community-feed'));await go('#/photos');assert.ok(d.querySelector('.community-feed'));
 console.log('PASS: deployed scripts + real Supabase match public feed, render author file tree, guestbook, tools and photos without anonymous editing.');
}finally{dom.window.close();}
