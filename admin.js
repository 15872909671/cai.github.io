(() => {
  'use strict';
  const $=id=>document.getElementById(id),C=window.BlogCloud,M=window.BlogMarkdown;
  let data={folders:[],posts:[]},current=null,dirty=false,busy=false;
  function status(message,error=false){$('status').textContent=message;$('status').dataset.error=String(error);}
  function guard(){return !dirty||confirm('当前修改尚未保存，确定放弃这些修改吗？');}
  async function task(action){if(busy)return;busy=true;document.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=true);try{await action();}catch(e){status(e.name==='TimeoutError'?'请求超时，内容仍在编辑器中。请重试。':e.message,true);}finally{busy=false;document.querySelectorAll('button,input,select,textarea').forEach(el=>el.disabled=false);}}
  function folderOptions(){
    const select=$('folder'),previous=select.value;select.innerHTML='<option value="">栏目根目录</option>';
    const walk=(parent,depth,seen=new Set())=>{for(const f of data.folders.filter(f=>f.collection===$('collection').value&&(f.parent_id||'')===parent)){if(seen.has(f.id))continue;const option=document.createElement('option');option.value=f.id;option.textContent='　'.repeat(depth)+f.name;select.append(option);walk(f.id,depth+1,new Set([...seen,f.id]));}};
    walk('',0);select.value=[...select.options].some(o=>o.value===previous)?previous:'';
  }
  function files(){
    const list=$('post-list');list.replaceChildren();
    const posts=data.posts.filter(p=>p.collection===$('collection').value&&(p.folder_id||'')===$('folder').value).sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
    for(const post of posts){const button=document.createElement('button');button.className='writer-post';button.setAttribute('aria-current',String(current?.id===post.id));button.textContent=post.title;const state=document.createElement('span');state.textContent=post.published?'已发布':'草稿';button.append(state);button.addEventListener('click',()=>{if(guard())open(post);});list.append(button);}
    if(!posts.length)list.textContent='这个文件夹还没有帖子。';
  }
  function preview(show){$('body').hidden=show;$('body-label').hidden=show;$('preview').hidden=!show;$('edit-tab').setAttribute('aria-pressed',String(!show));$('preview-tab').setAttribute('aria-pressed',String(show));if(show)$('preview').innerHTML=M.render($('body').value);}
  function open(post=null){current=post;dirty=false;$('title').value=post?.title||'';$('summary').value=post?.summary||'';$('body').value=post?.body||'';$('post-state').textContent=post?(post.published?'已发布':'草稿'):'新帖子';$('draft').textContent=post?.published?'撤回并保存草稿':'保存草稿';$('publish').textContent=post?.published?'更新发布':'发布帖子';preview(false);files();}
  async function refresh(){data=await C.load(true);folderOptions();files();}
  $('login').addEventListener('submit',event=>{event.preventDefault();task(async()=>{status('正在登录……');try{await C.login($('email').value.trim(),$('password').value);}finally{$('password').value='';}await refresh();$('login').hidden=true;$('workspace').hidden=false;$('logout').hidden=false;open();status('已登录。');});});
  $('logout').addEventListener('click',()=>{if(!guard())return;task(async()=>{try{await C.logout();}finally{dirty=false;current=null;data={folders:[],posts:[]};$('post-form').reset();$('post-list').replaceChildren();$('preview').replaceChildren();$('workspace').hidden=true;$('login').hidden=false;$('logout').hidden=true;}status('已退出登录。');});});
  let previousCollection=$('collection').value,previousFolder='';
  $('collection').addEventListener('change',()=>{if(!guard()){$('collection').value=previousCollection;return;}previousCollection=$('collection').value;$('folder').value='';folderOptions();previousFolder='';open();});
  $('folder').addEventListener('change',()=>{if(!guard()){$('folder').value=previousFolder;return;}previousFolder=$('folder').value;open();});
  $('new-post').addEventListener('click',()=>{if(guard()){open();$('title').focus();}});
  $('post-form').addEventListener('input',()=>{dirty=true;$('post-state').textContent='尚未保存';});
  $('edit-tab').addEventListener('click',()=>preview(false));$('preview-tab').addEventListener('click',()=>preview(true));
  async function save(published){
    if(!$('post-form').reportValidity())return;
    if(current?.published&&!published&&!confirm('撤回后访客将无法阅读这篇帖子，确定保存为草稿吗？'))return;
    const post={id:current?.id||crypto.randomUUID(),collection:$('collection').value,folder_id:$('folder').value||null,title:$('title').value.trim(),summary:$('summary').value.trim(),body:$('body').value,metadata:current?.metadata||{},published};
    if(!post.title){status('请填写标题。',true);return;}
    await task(async()=>{const saved=await C.save(post,current?.version);const i=data.posts.findIndex(p=>p.id===saved.id);i<0?data.posts.push(saved):data.posts.splice(i,1,saved);open(saved);status(published?(window.CLOUD_CONFIG.enabled?'已发布。':'已保存到数据库并标记发布；网站在线读取尚待启用。'):'草稿已保存。');});
  }
  $('post-form').addEventListener('submit',e=>{e.preventDefault();save(true);});$('draft').addEventListener('click',()=>save(false));
  $('new-folder').addEventListener('click',()=>{if(!guard())return;$('folder-name').value='';$('folder-dialog').showModal();});
  $('folder-cancel').addEventListener('click',()=>$('folder-dialog').close());
  $('folder-form').addEventListener('submit',e=>{e.preventDefault();const name=$('folder-name').value.trim();if(!name)return;task(async()=>{const result=await C.createFolder({id:crypto.randomUUID(),name,collection:$('collection').value,parent_id:$('folder').value||null});data.folders.push(result[0]);folderOptions();$('folder').value=result[0].id;previousFolder=result[0].id;open();$('folder-dialog').close();status('文件夹已创建。');});});
  $('download').addEventListener('click',()=>{const content='# '+$('title').value+'\n\n'+$('body').value;const url=URL.createObjectURL(new Blob([content],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=($('title').value||'帖子').replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
})();
