import {JSDOM} from './.test-runtime/node_modules/jsdom/lib/api.js';
import {readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const html=await readFile('index.html','utf8');
const dom=new JSDOM(html,{url:'https://knaios.github.io/cai.github.io/#/knowledge',runScripts:'outside-only'});
const w=dom.window,d=w.document;
w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.matchMedia=()=>({matches:true});
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};w.confirm=()=>true;
for(const file of ['content.js','folders.js','markdown.js','app.js'])w.eval(await readFile(file,'utf8'));
const remote={folders:[{id:'go',collection:'knowledge',name:'Go',parent_id:null,version:1}],posts:[{id:'first',collection:'knowledge',folder_id:'go',title:'Public post',summary:'',body:'## Body',metadata:{},published:true,version:1,created_at:'2026-10-01',updated_at:'2026-10-01'},{id:'draft',collection:'knowledge',folder_id:'go',title:'Private draft',summary:'',body:'SECRET',metadata:{},published:false,version:1,created_at:'2026-10-01',updated_at:'2026-10-01'}]};
w.CLOUD_CONFIG={enabled:true};
// Exercise the production data mapper with a mocked transport only.
w.eval(await readFile('cloud.js','utf8'));const apply=w.BlogCloud.apply;
let logged=false,lastSave=null,lastFolder=null;
w.BlogCloud={apply,login:async()=>{logged=true;return {id:"test-author",isAuthor:true};},logout:async()=>{logged=false;},load:async auth=>structuredClone({...remote,posts:remote.posts.filter(p=>auth||p.published)}),save:async(post,version)=>{lastSave={post,version};const saved={...post,version:(version||0)+1,created_at:'2026-10-01',updated_at:'2026-10-01'};const i=remote.posts.findIndex(p=>p.id===post.id);i<0?remote.posts.push(saved):remote.posts.splice(i,1,saved);return saved;},createFolder:async folder=>{lastFolder=folder;remote.folders.push({...folder,version:1});return [{...folder,version:1}];},request:async()=>null};
w.eval(await readFile('inline-writer.js','utf8'));
const tick=()=>new Promise(r=>setTimeout(r,15));await tick();
assert.equal(d.querySelector('#inline-post'),null);assert.ok(!d.getElementById('main').textContent.includes('Private draft'));assert.match(d.querySelector('.forum-feed').textContent,/Public post/);
d.getElementById('account-button').click();let form=d.querySelector('#inline-login');form.elements.email.value='writer@example.test';form.elements.password.value='test-only';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();
assert.equal(logged,true);assert.equal(d.querySelector('#inline-post'),null);assert.ok(!d.querySelector('.forum-feed').textContent.includes('Private draft'));
w.location.hash='#/article/first';await tick();assert.equal(d.querySelector('#inline-post'),null);assert.ok(d.querySelector('.article-body'));d.querySelector('[data-edit-post]').click();form=d.querySelector('#inline-post');assert.ok(form);assert.equal(form.elements.title.value,'Public post');
assert.match(d.querySelector('.toc').textContent,/Body/);
form.querySelector('[data-action=split]').click();assert.equal(d.querySelector('.writing-surface').dataset.mode,'split');assert.equal(d.getElementById('inline-preview').hidden,false);
form.elements.body.value='Preview **live**';form.elements.body.dispatchEvent(new w.Event('input',{bubbles:true}));assert.match(d.getElementById('inline-preview').innerHTML,/<strong>live<\/strong>/);
form.elements.body.setSelectionRange(0,7);form.querySelector('[data-format=bold]').click();assert.match(form.elements.body.value,/^\*\*Preview\*\*/);assert.equal(d.getElementById('inline-save-state').textContent,'尚未保存');
form.querySelector('[data-action=preview]').click();assert.equal(d.getElementById('inline-body-label').hidden,true);
form.querySelector('[data-action=edit]').click();assert.equal(d.getElementById('inline-body-label').hidden,false);
if(process.env.CAI_EDITOR_PREVIEW){form.elements.title.value='Go 并发：从取消信号开始';form.elements.body.value='## 写在前面\n\n为每个后台任务明确退出条件。\n\n## 实践要点\n\n- 使用 Context 传递取消信号\n- 明确等待任务退出的位置';form.elements.body.dispatchEvent(new w.Event('input',{bubbles:true}));form.querySelector('[data-action=split]').click();form.elements.title.setAttribute('value',form.elements.title.value);form.elements.body.textContent=form.elements.body.value;const snapshot=d.documentElement.outerHTML.replace(/<script[\s\S]*?<\/script>/g,'').replaceAll('href="./','href="../');await writeFile('.test-runtime/editor-preview.html','<!doctype html>'+snapshot);form.elements.title.value='Public post';}
form.elements.body.value='Edited **body**';form.elements.body.dispatchEvent(new w.Event('input',{bubbles:true}));
w.confirm=()=>false;w.location.hash='#/essays';await tick();assert.equal(w.location.hash,'#/article/first');assert.equal(d.querySelector('#inline-post').elements.body.value,'Edited **body**');
w.confirm=()=>true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(lastSave.post.body,'Edited **body**');assert.equal(lastSave.version,1);assert.equal(d.querySelector('#inline-post'),null);assert.match(d.querySelector('.article-body').innerHTML,/<strong>body<\/strong>/);
// Editing is always explicit; cancel restores the persisted content.
d.querySelector('[data-edit-post]').click();form=d.querySelector('#inline-post');form.elements.title.value='Uncommitted';form.elements.title.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-action=read]').click();assert.match(d.querySelector('.article h1').textContent,/Public post/);
w.location.hash='#/knowledge?view=albums';await tick();assert.match(d.querySelector('.album-grid').textContent,/Go/);d.querySelector('[data-new-album]').click();form=d.querySelector('.inline-dialog form');form.elements.name.value='Learning series';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(lastFolder.parent_id,null);assert.match(w.location.hash,/#\/folder\//);
// Collect an existing post without editing its body or creating a duplicate.
d.querySelector('[data-collect]').click();form=d.querySelector('.inline-dialog form');form.querySelector('input[value="first"]').checked=true;form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(lastSave.post.folder_id,lastFolder.id);assert.match(d.querySelector('.forum-feed').textContent,/Public post/);
d.querySelector('[data-compose]').click();form=d.querySelector('#inline-post');form.elements.title.value='New draft';form.elements.title.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-action=draft]').click();await tick();assert.equal(lastSave.post.folder_id,lastFolder.id);assert.equal(lastSave.post.published,false);assert.equal(d.querySelector('#inline-post'),null);
w.location.hash='#/knowledge';await tick();assert.ok(!d.querySelector('.forum-feed').textContent.includes('New draft'));
w.location.hash='#/knowledge?view=drafts';await tick();assert.match(d.querySelector('.forum-feed').textContent,/New draft/);assert.match(d.querySelector('.forum-feed').textContent,/Private draft/);
d.getElementById('search-results').innerHTML='SECRET';d.getElementById('account-button').click();await tick();assert.equal(logged,false);assert.equal(d.querySelector('[data-edit-post]'),null);assert.ok(!d.getElementById('main').textContent.includes('New draft'));assert.equal(d.getElementById('search-results').innerHTML,'');
// Guest compose resumes after login without unexpectedly editing an existing post.
d.querySelector('[data-compose]').click();form=d.querySelector('#inline-login');assert.ok(form);form.elements.email.value='writer@example.test';form.elements.password.value='test-only';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.ok(d.querySelector('#inline-post'));assert.equal(d.querySelector('#inline-post').elements.title.value,'');
// Device backup survives leaving the editor and is recovered explicitly.
form=d.querySelector('#inline-post');form.elements.title.value='Recover me';form.elements.body.value='UNPUBLISHED';form.elements.body.dispatchEvent(new w.Event('input',{bubbles:true}));
await new Promise(r=>setTimeout(r,650));assert.match(d.querySelector('#inline-save-state').textContent,/已备份到此设备/);
const backupKey=Object.keys(w.localStorage).find(k=>k.startsWith('cai-drafts:test-author:')&&w.localStorage.getItem(k).includes('Recover me'));assert.ok(backupKey);
form.querySelector('[data-action=read]').click();d.querySelector('.device-drafts').click();d.querySelector('[data-restore="'+JSON.parse(w.localStorage.getItem(backupKey)).post.id+'"]').click();
form=d.querySelector('#inline-post');assert.equal(form.elements.body.value,'UNPUBLISHED');form.querySelector('[data-action=draft]').click();await tick();assert.equal(w.localStorage.getItem(backupKey),null);
// Project fields retain unrelated metadata and become real reading links.
w.location.hash='#/projects';await tick();d.querySelector('[data-compose]').click();form=d.querySelector('#inline-post');
form.elements.title.value='Project';form.elements.github.value='https://github.com/example/project';form.elements.demoURL.value='https://example.com';form.elements.tech.value='Go，SQL';form.elements.tech.dispatchEvent(new w.Event('input',{bubbles:true}));
form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(lastSave.post.metadata.github,'https://github.com/example/project');assert.deepEqual(Array.from(lastSave.post.metadata.tags),['Go','SQL']);assert.ok(d.querySelector('.hero-actions a[href="https://example.com"]'));
// Signed-in author editing a stale backup gets a new post, never an overwrite.
const old={...remote.posts.find(x=>x.id==='first'),body:'Stale recovered',version:1};w.localStorage.setItem('cai-drafts:test-author:first',JSON.stringify({post:old,at:Date.now()}));w.refreshBlog();d.querySelector('.device-drafts').click();d.querySelector('[data-restore="first"]').click();form=d.querySelector('#inline-post');form.querySelector('[data-action=draft]').click();await tick();assert.notEqual(lastSave.post.id,'first');assert.equal(lastSave.version,undefined);
// Ordinary accounts can log in, but never see owner controls or drafts.
d.getElementById('account-button').click();await tick();w.BlogCloud.login=async()=>({id:'reader',isAuthor:false});w.BlogCloud.signup=async()=>({needsConfirmation:true});
d.getElementById('account-button').click();d.querySelector('[data-auth-switch]').click();form=d.querySelector('#inline-login');form.elements.email.value='reader@example.test';form.elements.password.value='test-pass';form.elements.confirmPassword.value='mismatch';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));assert.match(d.querySelector('#login-error').textContent,/不一致/);
form.elements.confirmPassword.value='test-pass';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(d.querySelector('#login-error').textContent,/检查邮箱/);form=d.querySelector('#inline-login');assert.equal(form.elements.email.value,'reader@example.test');form.elements.password.value='test-pass';form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(d.getElementById('account-button').textContent,'退出登录');assert.equal(w.InlineWriter.isAuthor(),false);assert.equal(d.querySelector('[data-edit-post]'),null);assert.equal(d.querySelector('.device-drafts'),null);
w.location.hash='#/knowledge';await tick();d.querySelector('[data-compose]').click();assert.equal(d.querySelector('#inline-post'),null);assert.match(d.querySelector('.inline-message').textContent,/仅向作者开放/);
dom.window.close();console.log('PASS: reading-first login, explicit edit, cancel, publish-to-read, album creation and curation, draft isolation, logout and guest compose.');
