import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
// Lightweight rendering harness: exercises actual route, filtering and search
// handlers without relying on the user's browser or simulating layout.
const nodes=new Map();
class Element {
  constructor(){this.innerHTML='';this.value='';this.textContent='';this.events={};this.attributes={};this.open=false;this.classes=new Set();this.classList={toggle:(s,force)=>{const yes=force??!this.classes.has(s);if(yes)this.classes.add(s);else this.classes.delete(s);return yes;},remove:s=>this.classes.delete(s)};}
  addEventListener(name,fn){this.events[name]=fn;}
  setAttribute(k,v){this.attributes[k]=v;}
  removeAttribute(k){delete this.attributes[k];}
  querySelector(){return null;}
  querySelectorAll(){return [];}
  focus(){}
  scrollIntoView(){}
  showModal(){this.open=true;}
  close(){this.open=false;}
}
const node=id=>{if(!nodes.has(id))nodes.set(id,new Element());return nodes.get(id);};
const listeners={};
const context={console,URLSearchParams,document:{body:new Element(),getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,v)=>listeners[k]=v},location:{hash:'#/'},matchMedia:()=>({matches:true})};
context.window=context;context.scrollTo=()=>{};context.addEventListener=(k,v)=>listeners[k]=v;
vm.createContext(context);vm.runInContext(await readFile('content.js','utf8'),context);vm.runInContext(await readFile('folders.js','utf8'),context);vm.runInContext(await readFile('markdown.js','utf8'),context);vm.runInContext(await readFile('app.js','utf8'),context);
let checks=0;
const route=hash=>{context.location.hash=hash;listeners.hashchange();checks++;return node('main').innerHTML;};
assert.match(route('#/'),/reference-hero/);assert.match(route('#/home'),/reference-hero/);assert.match(route('#/albums'),/album-grid/);
for(const section of ['knowledge','projects','interviews','resume','essays'])assert.doesNotMatch(route('#/'+section),/这一页还没有写下/);
for(const [type,items] of [['article',context.BLOG.articles],['interview',context.BLOG.interviews]])for(const item of items)assert.ok(route('#/'+type+'/'+item.id).includes(item.title));
const board=route('#/knowledge');assert.match(board,/Go 并发帖子/);assert.match(board,/读懂 Raft/);assert.match(board,/全部帖子/);assert.doesNotMatch(board,/tree-action|tree-create|inline-post/);
assert.match(route('#/knowledge?view=albums'),/album-card/);
assert.doesNotMatch(route('#/knowledge?q=Linux').split('<section class="forum-feed">')[1],/Go 并发帖子/);
const goView=route('#/knowledge/Go').split('<div class="file-pane">')[1];assert.ok(goView.includes('Go 并发帖子'));assert.ok(!goView.includes('读懂 Raft'));
assert.equal(context.BLOG.companies,undefined);for(const path of ['companies','company/tencent','project/raft-lab','project/digital-study'])assert.match(route('#/'+path),/这一页还没有写下/);
assert.doesNotMatch(route('#/'),/企业集|motion-toggle|数字书房|实验室/);
node('search-open').events.click();node('search-input').value='Raft';node('search-input').events.input();assert.match(node('search-results').innerHTML,/读懂 Raft/);
assert.match(route('#/article/missing'),/这一页还没有写下/);assert.match(route('#/knowledge/%ZZ'),/这一页还没有写下/);
context.BLOG.articles[0].title='<img src=x onerror=alert(1)>';assert.ok(route('#/article/'+context.BLOG.articles[0].id).includes('&lt;img'));assert.ok(!node('main').innerHTML.includes('<img src=x'));
assert.match(route('#/career'),/作品集合/);assert.match(route('#/essays'),/还没有帖子/);
const originalNav=context.BLOG.navigation;context.BLOG.navigation=[originalNav[0],{id:'archive',title:'归档',href:'#/archive',children:[originalNav[1],originalNav[2]]}];
assert.match(route('#/archive'),/职业合集/);assert.match(route('#/interviews'),/面试经历/);assert.match(node('nav').innerHTML,/展开归档子栏目/);context.BLOG.navigation=originalNav;
context.BLOG.folders.push({id:'nested',name:'取消与超时',collection:'knowledge',parent_id:'knowledge/Go'});
context.BLOG.articles.push({id:'nested-post',title:'嵌套帖子',folder_id:'nested',date:'2026-10-01',sections:[]});
assert.match(route('#/folder/'+encodeURIComponent('knowledge/Go')+'?view=albums'),/取消与超时/);assert.match(route('#/folder/nested'),/嵌套帖子/);assert.match(route('#/article/nested-post'),/取消与超时/);assert.match(route('#/folder/missing'),/这一页还没有写下/);
context.BLOG.articles.pop();context.BLOG.folders.pop();
const navItem=new Element(),menu=new Element();navItem.querySelector=()=>menu;navItem.contains=el=>el===menu;
context.document.querySelectorAll=selector=>selector==='#nav .nav-item'?[navItem]:[];
route('#/');navItem.events.pointerenter({pointerType:'mouse'});assert.equal(menu.open,true);navItem.events.pointerleave({pointerType:'mouse'});assert.equal(menu.open,false);
context.document.querySelectorAll=()=>[];
for(const file of ['index.html','app.js','content.js','styles.css','folders.js','admin.html','inline-writer.js','inline-writer.css','forum.css','reference-theme.css','theme.js','landscape.svg','cloud-config.js','cloud.js','markdown.js'])assert.equal(await readFile(file,'utf8'),await readFile('docs/'+file,'utf8'));
console.log('PASS: forum routes, all-post lists, album views, scoped search, nested albums, escaping, navigation and deployment parity.');
