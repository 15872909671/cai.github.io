(() => {
  'use strict';
  const C=window.BlogCloud,F=window.Folders,D=window.BLOG,M=window.BlogMarkdown,E=M.escape;
  const labels={knowledge:'技术博客',projects:'作品集合',interviews:'面试经历',essays:'随笔'};
  let author=false,remote={folders:[],posts:[]},editor=null,dirty=false,busy=false,lastHash=location.hash,reading=false;
  const main=document.getElementById('main'),account=document.getElementById('account-button');
  const message=document.createElement('p');message.className='inline-message';message.hidden=true;message.setAttribute('role','status');main.before(message);
  const dialog=document.createElement('dialog');dialog.className='inline-dialog';document.body.append(dialog);
  function notice(text,error=false){message.hidden=!text;message.textContent=text;message.dataset.error=String(error);}
  function guard(){return !busy&&(!dirty||confirm('尚有未保存的修改，确定放弃吗？'));}
  function allowNavigation(){if(!guard()){history.replaceState(null,'',lastHash||'#/');return false;}editor=null;dirty=false;reading=false;lastHash=location.hash;return true;}
  async function task(action){if(busy)return;busy=true;main.inert=true;dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=true);try{await action();}catch(e){notice(e.name==='TimeoutError'?'请求超时，编辑内容仍保留，请重试。':e.message,true);if(dialog.open){const error=dialog.querySelector('#login-error');if(error)error.textContent=e.message;}}finally{busy=false;main.inert=false;dialog.querySelectorAll('input,select,button').forEach(el=>el.disabled=false);}}
  function apply(){C.apply(D,remote,author);window.refreshBlog();}
  async function reload(){remote=await C.load(author);apply();}
  function context(){
    let p;try{p=(location.hash.slice(1).split('?')[0]||'/').split('/').filter(Boolean).map(decodeURIComponent);}catch{return {};}
    const [page,id]=p;
    if(page==='folder'){const folder=remote.folders.find(f=>f.id===id);return {collection:folder?.collection,folder:folder?.id||null};}
    const post=remote.posts.find(p=>F.types[p.collection]===page&&p.id===id);
    if(post)return {collection:post.collection,folder:post.folder_id,post};
    return {collection:page,folder:page==='knowledge'&&id?remote.folders.find(f=>f.collection===page&&f.name===id&&!f.parent_id)?.id:null};
  }
  function destinationOptions(collection,value,excluded=null){
    const blocked=new Set(excluded?[excluded]:[]);let changed=true;
    while(changed){changed=false;for(const f of remote.folders)if(blocked.has(f.parent_id)&&!blocked.has(f.id)){blocked.add(f.id);changed=true;}}
    return `<option value="">${E(labels[collection])} /</option>`+remote.folders.filter(f=>f.collection===collection&&!blocked.has(f.id)).map(f=>`<option value="${E(f.id)}" ${f.id===value?'selected':''}>${E(F.ancestors(D,f.id).map(a=>a.name).join(' / '))}</option>`).join('');
  }
  function popup(html){dialog.innerHTML=html+`<p id="login-error" role="alert"></p>`;if(!dialog.open)dialog.showModal();dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));}
  function login(){
    popup(`<form id="inline-login"><h2>登录</h2><label>邮箱<input name="email" type="email" autocomplete="username" required></label><label>密码<input name="password" type="password" autocomplete="current-password" required></label><div class="dialog-actions"><button class="primary" type="submit">登录</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;task(async()=>{try{await C.login(form.elements.email.value.trim(),form.elements.password.value);}finally{form.elements.password.value='';}const loaded=await C.load(true);author=true;remote=loaded;account.textContent='退出登录';dialog.close();editor=null;apply();notice('已登录，可在文件树中直接新建和编辑。');});});
  }
  account.addEventListener('click',()=>{if(busy)return;if(!author){login();return;}if(!guard())return;task(async()=>{try{await C.logout();}finally{author=false;editor=null;dirty=false;reading=false;account.textContent='登录';remote.posts=remote.posts.filter(p=>p.published);document.getElementById('search-results').innerHTML='';document.getElementById('search-input').value='';apply();}notice('已退出登录。');});});
  function createPost(collection,folder){if(!guard())return;dialog.close();editor={id:crypto.randomUUID(),collection,folder_id:folder||null,title:'',summary:'',body:'',metadata:{},published:false};dirty=false;reading=false;renderEditor();}
  function createFolder(collection,parent){
    if(!guard())return;
    popup(`<form><h2>新建文件夹</h2><label>名称<input name="name" maxlength="100" required></label><div class="dialog-actions"><button class="primary">创建</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const name=e.currentTarget.elements.name.value.trim();if(!name)return;task(async()=>{const [folder]=await C.createFolder({id:crypto.randomUUID(),name,collection,parent_id:parent||null});remote.folders.push(folder);dialog.close();editor=null;dirty=false;history.replaceState(null,'','#/folder/'+encodeURIComponent(folder.id));lastHash=location.hash;apply();notice('文件夹已创建。');});});
  }
  async function operation(action,target,name=null,parent=null){
    try{await C.request('/rest/v1/rpc/blog_file_operation',{method:'POST',auth:true,body:{action,target_id:target.id,expected_version:target.version||1,new_name:name,new_parent:parent}});}catch(e){if(e.status===404)throw Error('请先在 Supabase 运行 file-operations.sql，以启用重命名、移动和删除。');throw e;}
  }
  function folderMenu(collection,id){
    if(!guard())return;const folder=remote.folders.find(f=>f.id===id);
    popup(`<h2>${E(folder?.name||labels[collection])}</h2><div class="folder-commands"><button data-cmd="post">新建帖子</button><button data-cmd="folder">新建文件夹</button>${folder?'<button data-cmd="rename">重命名</button><button data-cmd="move">移动文件夹</button><button class="danger" data-cmd="delete">删除空文件夹</button>':''}</div><div class="dialog-actions"><button data-close>关闭</button></div>`);
    dialog.querySelectorAll('[data-cmd]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.cmd;
      if(action==='post')return createPost(collection,id);
      if(action==='folder')return createFolder(collection,id);
      if(action==='delete'){
        if(remote.folders.some(f=>f.parent_id===id)||remote.posts.some(p=>p.folder_id===id)){notice('文件夹中还有内容，请先移动帖子和子文件夹。',true);return;}
        if(!confirm('确定删除空文件夹“'+folder.name+'”吗？'))return;
        return task(async()=>{await operation('delete_folder',folder);dialog.close();editor=null;dirty=false;history.replaceState(null,'','#/'+collection);lastHash=location.hash;await reload();notice('文件夹已删除。');});
      }
      popup(`<form><h2>${action==='rename'?'重命名':'移动文件夹'}</h2>${action==='rename'?`<label>名称<input name="name" value="${E(folder.name)}" maxlength="100" required></label>`:`<label>移入<select name="parent">${destinationOptions(collection,folder.parent_id,folder.id)}</select></label>`}<div class="dialog-actions"><button class="primary">保存</button><button type="button" data-close>取消</button></div></form>`);
      dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;task(async()=>{await operation(action==='rename'?'rename_folder':'move_folder',folder,action==='rename'?form.elements.name.value.trim():null,action==='move'?(form.elements.parent.value||null):null);dialog.close();editor=null;dirty=false;await reload();notice('文件夹已更新。');});});
    }));
  }
  function renderEditor(){
    const pane=main.querySelector('.file-pane');if(!pane||!editor)return;
    const post=editor;
    pane.innerHTML=`<section class="inline-editor"><p class="editor-path">${E(labels[post.collection])} / ${E(F.ancestors(D,post.folder_id).map(f=>f.name).join(' / '))}</p><form id="inline-post"><div class="editor-bar"><span>${post.version?(post.published?'已发布':'草稿'):'新帖子'}</span><button type="button" data-action="read">阅读</button><button type="button" data-action="download">下载</button>${post.version?'<button type="button" data-action="delete">删除帖子</button>':''}</div><label>标题<input name="title" value="${E(post.title)}" maxlength="200" required></label><div class="editor-options"><label>所在文件夹<select name="folder">${destinationOptions(post.collection,post.folder_id)}</select></label><label>摘要（可不填）<input name="summary" value="${E(post.summary)}" maxlength="500"></label></div><div class="editor-bar editor-tabs"><button type="button" data-action="edit" aria-pressed="true">编辑</button><button type="button" data-action="preview" aria-pressed="false">预览</button></div><label id="inline-body-label">正文<textarea name="body" maxlength="200000" spellcheck="false">${E(post.body)}</textarea></label><div class="article-body" id="inline-preview" hidden></div><div class="editor-bar"><span id="inline-save-state">${dirty?'尚未保存':''}</span><button type="button" data-action="draft">${post.published?'撤回并保存草稿':'保存草稿'}</button><button class="primary" type="submit">${post.published?'更新发布':'发布帖子'}</button></div></form></section>`;
    const form=pane.querySelector('form');
    form.addEventListener('input',()=>{editor={...editor,title:form.elements.title.value,summary:form.elements.summary.value,body:form.elements.body.value,folder_id:form.elements.folder.value||null};dirty=true;document.getElementById('inline-save-state').textContent='尚未保存';});
    form.addEventListener('submit',e=>{e.preventDefault();save(true);});
    form.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.action;
      if(action==='draft')return save(false);
      if(action==='edit'||action==='preview'){const preview=action==='preview';document.getElementById('inline-body-label').hidden=preview;const target=document.getElementById('inline-preview');target.hidden=!preview;target.innerHTML=M.render(editor.body);form.querySelector('[data-action=edit]').setAttribute('aria-pressed',String(!preview));form.querySelector('[data-action=preview]').setAttribute('aria-pressed',String(preview));return;}
      if(action==='read'){if(!guard())return;dirty=false;editor=null;reading=true;window.refreshBlog();return;}
      if(action==='download'){const url=URL.createObjectURL(new Blob(['# '+editor.title+'\n\n'+editor.body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(editor.title||'帖子').replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      if(action==='delete'&&confirm('确定永久删除这篇帖子吗？'))task(async()=>{await operation('delete_post',editor);remote.posts=remote.posts.filter(p=>p.id!==editor.id);const route=editor.folder_id?'folder/'+encodeURIComponent(editor.folder_id):editor.collection;editor=null;dirty=false;history.replaceState(null,'','#/'+route);lastHash=location.hash;apply();notice('帖子已删除。');});
    }));
    function save(published){
      if(!form.reportValidity())return;
      if(editor.published&&!published&&!confirm('保存为草稿会撤回这篇公开帖子，确定吗？'))return;
      if(!editor.title.trim()){notice('请填写标题。',true);return;}
      const snapshot={id:editor.id,collection:editor.collection,folder_id:editor.folder_id,title:editor.title.trim(),summary:editor.summary,body:editor.body,metadata:editor.metadata,published};
      task(async()=>{form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);try{const saved=await C.save(snapshot,editor.version);const index=remote.posts.findIndex(p=>p.id===saved.id);index<0?remote.posts.push(saved):remote.posts.splice(index,1,saved);editor=saved;dirty=false;history.replaceState(null,'','#/'+F.types[saved.collection]+'/'+encodeURIComponent(saved.id));lastHash=location.hash;apply();notice(published?'帖子已发布。':'草稿已保存。');}finally{form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}});
    }
  }
  function mount(){
    if(!author)return;
    const ctx=context(),tree=main.querySelector('.file-tree');
    if(tree){
      if(labels[ctx.collection]){const controls=document.createElement('div');controls.className='tree-create';controls.innerHTML='<button type="button">＋ 帖子</button><button type="button">＋ 文件夹</button>';const buttons=controls.querySelectorAll('button');buttons[0].onclick=()=>createPost(ctx.collection,ctx.folder);buttons[1].onclick=()=>createFolder(ctx.collection,ctx.folder);tree.querySelector('.tree-toolbar').after(controls);}
      tree.querySelectorAll('[data-tree-key]').forEach(el=>{const id=el.dataset.treeKey,folder=remote.folders.find(f=>f.id===id),collection=folder?.collection||(labels[id]?id:null);if(!collection)return;const button=document.createElement('button');button.type='button';button.className='tree-action';button.textContent='⋯';button.setAttribute('aria-label','操作'+(folder?.name||labels[collection]));button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();folderMenu(collection,folder?.id||null);});el.querySelector('summary').append(button);});
    }
    if(ctx.post&&!editor&&!reading)editor={...ctx.post};
    if(editor)renderEditor();
    else if(ctx.post&&reading){const edit=document.createElement('button');edit.className='account-button';edit.textContent='编辑帖子';edit.onclick=()=>{reading=false;editor={...ctx.post};renderEditor();};main.querySelector('.file-pane').prepend(edit);}
  }
  window.InlineWriter={mount,allowNavigation};
  addEventListener('beforeunload',e=>{if(dirty||busy){e.preventDefault();e.returnValue='';}});
  // No stale static content is shown after switching to the cloud source.
  if(window.CLOUD_CONFIG.enabled){for(const key of Object.values(F.keys))D[key]=[];D.folders=[];D.categories=['全部'];window.refreshBlog();notice('正在载入帖子……');task(async()=>{await reload();notice('');});}
})();
