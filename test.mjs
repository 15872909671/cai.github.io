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
const context={console,URLSearchParams,document:{getElementById:node,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:(k,v)=>listeners[k]=v},location:{hash:'#/'},matchMedia:()=>({matches:true})};
context.window=context;context.scrollTo=()=>{};context.addEventListener=(k,v)=>listeners[k]=v;
vm.createContext(context);vm.runInContext(await readFile('content.js','utf8'),context);vm.runInContext(await readFile('folders.js','utf8'),context);vm.runInContext(await readFile('markdown.js','utf8'),context);vm.runInContext(await readFile('app.js','utf8'),context);
let checks=0;
const route=hash=>{context.location.hash=hash;listeners.hashchange();checks++;return node('main').innerHTML;};
assert.match(route('#/'),/三个集合/);
for(const section of ['knowledge','projects','interviews','resume'])assert.doesNotMatch(route('#/'+section),/这一页还没有写下/);
for(const [type,items] of [['article',context.BLOG.articles],['project',context.BLOG.projects],['interview',context.BLOG.interviews]])for(const item of items)assert.ok(route('#/'+type+'/'+item.id).includes(item.title));
assert.match(route('#/project/raft-lab'),/这一页还没有写下/);assert.match(route('#/projects'),/这个文件夹还没有帖子/);assert.ok(!route('#/').includes('实验室'));assert.ok(!route('#/').includes('数字书房'));assert.match(route('#/project/digital-study'),/这一页还没有写下/);
const goView=route('#/knowledge/Go');const goPane=goView.split('<div class="file-pane">')[1];assert.ok(goPane.includes('Go 并发帖子'));assert.ok(!goPane.includes('读懂 Raft'));assert.match(goView,/data-tree-key="knowledge\/Go" open/);assert.doesNotMatch(goView,/技术研究、阅读与排障/);const reading=route('#/article/go-cancellation');assert.match(reading,/aria-label="文件树"/);assert.match(reading,/tree-file selected[^>]*href="#\/article\/go-cancellation" aria-current="page"/);assert.match(route('#/knowledge'),/folder-list-row/);
assert.equal(context.BLOG.companies,undefined);
for(const path of ['companies','company/tencent','team/example'])assert.match(route('#/'+path),/这一页还没有写下/);
assert.doesNotMatch(route('#/'),/企业集|motion-toggle/);
route('#/interviews');node('filter-role').value='Go 后端';node('filter-role').events.change();assert.match(node('interview-list').innerHTML,/从问题到改进计划/);assert.doesNotMatch(node('interview-list').innerHTML,/外部面经整理/);node('filter-company').value='待归档';node('filter-company').events.change();assert.match(node('interview-list').innerHTML,/还没有匹配/);checks+=3;
node('search-open').events.click();assert.equal(node('search-dialog').open,true);node('search-input').value='Raft';node('search-input').events.input();assert.match(node('search-results').innerHTML,/读懂 Raft/);assert.doesNotMatch(node('search-results').innerHTML,/实验室/);node('search-input').value='zz-no-results-zz';node('search-input').events.input();assert.match(node('search-results').innerHTML,/没有找到/);checks+=3;
assert.match(route('#/article/missing'),/这一页还没有写下/);assert.match(route('#/knowledge/%ZZ'),/这一页还没有写下/);
context.BLOG.articles[0].title='<img src=x onerror=alert(1)>';assert.ok(route('#/article/'+context.BLOG.articles[0].id).includes('&lt;img'));assert.ok(!node('main').innerHTML.includes('<img src=x'));checks++;
// Folder controls collapse and expand real rendered branches without navigating.
const folders=['knowledge','knowledge/Go'].map(key=>{const el=new Element();el.dataset={treeKey:key};el.open=true;el.isConnected=true;return el;});
node('main').querySelectorAll=selector=>selector==='[data-tree-key]'?folders:[];
route('#/knowledge');node('tree-collapse').events.click();assert.ok(folders.every(f=>!f.open));
assert.match(route('#/knowledge/Go'),/data-tree-key="knowledge\/Go" ><summary>/);
node('tree-expand').events.click();assert.ok(folders.every(f=>f.open));
assert.match(route('#/knowledge/Go'),/data-tree-key="knowledge\/Go" open/);
node('main').querySelectorAll=()=>[];
checks+=4;
// Nested navigation remains addressable when top-level sections become children.
assert.match(route('#/career'),/作品集合/);assert.match(node('main').innerHTML,/面试经历/);
assert.match(route('#/essays'),/这个文件夹还没有帖子/);
assert.match(node('nav').innerHTML,/href="#\/"[^>]*>首页/);
assert.match(node('nav').innerHTML,/href="#\/career"/);
context.BLOG.essays.push({id:'test-essay',title:'随笔测试',summary:'测试正文',date:'2026-10-01',sections:[]});
assert.match(route('#/essay/test-essay'),/随笔测试/);
node('search-open').events.click();node('search-input').value='随笔测试';node('search-input').events.input();assert.match(node('search-results').innerHTML,/#\/essay\/test-essay/);
context.BLOG.essays.pop();
const originalNav=context.BLOG.navigation;
context.BLOG.navigation=[originalNav[0],{id:'archive',title:'归档',href:'#/archive',children:[originalNav[1],originalNav[2]]}];
assert.match(route('#/archive'),/职业合集/);assert.match(route('#/interviews'),/面试经历/);assert.match(node('nav').innerHTML,/展开归档子栏目/);
context.BLOG.navigation=originalNav;
checks+=6;
// A collection's tree never leaks unrelated navigation branches.
const tree=hash=>route(hash).split('<aside class="file-tree"')[1]?.split('</aside>')[0]||'';
assert.doesNotMatch(tree('#/knowledge'),/职业合集|作品集合|面试经历|随笔/);
assert.doesNotMatch(tree('#/interviews'),/技术博客|Go 并发|随笔/);
context.BLOG.folders.push({id:'nested',name:'取消与超时',collection:'knowledge',parent_id:'knowledge/Go'});
context.BLOG.articles.push({id:'nested-post',title:'嵌套帖子',folder_id:'nested',date:'2026-10-01',sections:[]});
assert.match(route('#/folder/'+encodeURIComponent('knowledge/Go')),/取消与超时/);
assert.match(route('#/folder/nested'),/嵌套帖子/);
assert.match(route('#/article/nested-post'),/取消与超时/);
assert.doesNotMatch(tree('#/essays'),/嵌套帖子/);
assert.match(route('#/folder/missing'),/这一页还没有写下/);
context.BLOG.articles.pop();context.BLOG.folders.pop();
// Hover keeps click/touch and keyboard interaction available via native details.
const navItem=new Element(),menu=new Element();navItem.querySelector=()=>menu;navItem.contains=el=>el===menu;
context.document.querySelectorAll=selector=>selector==='#nav .nav-item'?[navItem]:[];
route('#/');navItem.events.pointerenter({pointerType:'mouse'});assert.equal(menu.open,true);
navItem.events.pointerleave({pointerType:'mouse'});assert.equal(menu.open,false);
navItem.events.pointerenter({pointerType:'touch'});assert.equal(menu.open,false);
navItem.events.pointerenter({pointerType:'mouse'});navItem.events.focusout({relatedTarget:null});assert.equal(menu.open,false);
context.document.querySelectorAll=()=>[];
checks+=11;
// The two deployment sources must remain identical.
for(const file of ['index.html','app.js','content.js','styles.css','folders.js','admin.html','inline-writer.js','inline-writer.css','cloud-config.js','cloud.js','markdown.js'])assert.equal(await readFile(file,'utf8'),await readFile('docs/'+file,'utf8'));checks+=4;
console.log(`PASS: ${checks} route / interaction / escaping / deployment checks. Visual layout is not tested by this harness.`);
