(() => {
  'use strict';
  const C=window.BlogCloud,F=window.Folders,D=window.BLOG,M=window.BlogMarkdown,E=M.escape;
  const labels={knowledge:'技术博客',projects:'作品集',interviews:'面试经历',essays:'随笔'};
  let author=false,remote={folders:[],posts:[]},editor=null,dirty=false,busy=false,lastHash=location.hash;
  let userId=null,draftTimer=null;
  const draftPrefix=()=> 'cai-drafts:'+userId+':';
  function backup(){
    clearTimeout(draftTimer);if(!userId||!editor||!dirty)return;
    try{localStorage.setItem(draftPrefix()+editor.id,JSON.stringify({post:editor,at:Date.now()}));const el=document.getElementById('inline-save-state');if(el)el.textContent='已备份到此设备 · 尚未发布';}
    catch{notice('此设备无法保存草稿，请保存到云端或导出 Markdown。',true);}
  }
  function removeBackup(id){try{localStorage.removeItem(draftPrefix()+id);}catch{}}
  function backups(){try{return Object.keys(localStorage).filter(k=>k.startsWith(draftPrefix())).map(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}).filter(x=>x?.post?.id&&labels[x.post.collection]).sort((a,b)=>b.at-a.at);}catch{return [];}}
  function recovery(){
    popup(`<h2>此设备的草稿</h2><div class="recovery-list">${backups().map(x=>`<div><button data-restore="${E(x.post.id)}">${E(x.post.title||'未命名帖子')}<small>${E(new Date(x.at).toLocaleString())}</small></button><button data-discard="${E(x.post.id)}">删除备份</button></div>`).join('')}</div><div class="dialog-actions"><button data-close>关闭</button></div>`);
    dialog.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{const item=backups().find(x=>x.post.id===b.dataset.restore);if(!item||!guard())return;const current=remote.posts.find(x=>x.id===item.post.id);if(item.post.version&&(!current||current.version!==item.post.version)){notice('云端版本已经变化。已将备份恢复为新帖子，原帖不会被覆盖。');item.post.id=crypto.randomUUID();delete item.post.version;item.post.published=false;}
      editor=item.post;dirty=true;dialog.close();history.replaceState(null,'','#/'+editor.collection);lastHash=location.hash;window.refreshBlog();backup();});
    dialog.querySelectorAll('[data-discard]').forEach(b=>b.onclick=()=>{if(confirm('删除这个设备上的草稿备份？')){removeBackup(b.dataset.discard);recovery();}});
  }
  const main=document.getElementById('main'),account=document.getElementById('account-button');
  const message=document.createElement('p');message.className='inline-message';message.hidden=true;message.setAttribute('role','status');main.before(message);
  const dialog=document.createElement('dialog');dialog.className='inline-dialog';document.body.append(dialog);
  function notice(text,error=false){message.hidden=!text;message.textContent=text;message.dataset.error=String(error);}
  function guard(){if(busy)return false;if(!dirty)return true;backup();return confirm('修改尚未发布，离开编辑？设备草稿会保留。');}
  function allowNavigation(){if(!guard()){history.replaceState(null,'',lastHash||'#/');return false;}editor=null;dirty=false;lastHash=location.hash;return true;}
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
    return `<option value="">不加入合集</option>`+remote.folders.filter(f=>f.collection===collection&&!blocked.has(f.id)).map(f=>`<option value="${E(f.id)}" ${f.id===value?'selected':''}>${E(F.ancestors(D,f.id).map(a=>a.name).join(' / '))}</option>`).join('');
  }
  function popup(html){dialog.innerHTML=html+`<p id="login-error" role="alert"></p>`;if(!dialog.open)dialog.showModal();dialog.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>dialog.close()));}
  function login(afterLogin=null,mode='login',email=''){
    const registering=mode==='signup';
    popup(`<form id="inline-login"><h2>${registering?'注册账号':'登录'}</h2><label>邮箱<input name="email" type="email" autocomplete="username" value="${E(email)}" required></label><label>密码<input name="password" type="password" autocomplete="${registering?'new-password':'current-password'}" ${registering?'minlength="8"':''} required></label>${registering?'<label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" required></label><p>密码至少 8 位。注册后请到邮箱完成验证。</p>':''}<div class="dialog-actions"><button class="primary" type="submit">${registering?'注册':'登录'}</button><button type="button" data-close>取消</button></div><div class="auth-links"><button type="button" data-auth-switch>${registering?'已有账号？登录':'没有账号？注册'}</button>${registering?'':'<button type="button" data-resend>重发验证邮件</button>'}</div></form>`);
    const form=dialog.querySelector('form');
    form.querySelector('[data-auth-switch]').onclick=()=>{if(!busy)login(afterLogin,registering?'login':'signup',form.elements.email.value.trim());};
    form.querySelector('[data-resend]')?.addEventListener('click',()=>{if(!form.elements.email.reportValidity())return;task(async()=>{await C.resendConfirmation(form.elements.email.value.trim());dialog.querySelector('#login-error').textContent='若该邮箱需要验证，验证邮件将会发送，请检查收件箱和垃圾邮件。';});});
    form.addEventListener('submit',e=>{e.preventDefault();if(!form.reportValidity())return;const email=form.elements.email.value.trim(),password=form.elements.password.value;
      if(registering&&password!==form.elements.confirmPassword.value){dialog.querySelector('#login-error').textContent='两次输入的密码不一致。';return;}
      task(async()=>{
        if(registering){try{const result=await C.signup(email,password);login(afterLogin,'login',email);dialog.querySelector('#login-error').textContent=result.needsConfirmation?'请检查邮箱并完成验证，再回来登录。如果已有账号，请直接登录。':'注册请求已完成，请使用邮箱和密码登录。';}finally{form.elements.password.value='';form.elements.confirmPassword.value='';}return;}
        let user;try{user=await C.login(email,password);}finally{form.elements.password.value='';}
        const loaded=await C.load(user.isAuthor===true);userId=user.id;author=user.isAuthor===true;remote=loaded;account.textContent='退出登录';dialog.close();editor=null;apply();notice('已登录。');
      }).then(()=>{if(userId&&!registering)afterLogin?.();});
    });
  }
  account.addEventListener('click',()=>{if(busy)return;if(!userId){login();return;}if(!guard())return;task(async()=>{try{await C.logout();}finally{author=false;editor=null;dirty=false;userId=null;clearTimeout(draftTimer);account.textContent='登录 / 注册';remote.posts=remote.posts.filter(p=>p.published);document.getElementById('search-results').innerHTML='';document.getElementById('search-input').value='';apply();}notice('已退出登录。');});});
  function createPost(collection,folder){if(!guard())return;dialog.close();if(!main.querySelector('.file-pane')){history.replaceState(null,'','#/'+collection);lastHash=location.hash;window.refreshBlog();}editor={id:crypto.randomUUID(),collection,folder_id:folder||null,title:'',summary:'',body:'',metadata:{},published:false};dirty=false;renderEditor();}
  function createFolder(collection,parent){
    if(!guard())return;
    popup(`<form><h2>新建合集</h2><label>名称<input name="name" maxlength="100" required></label><div class="dialog-actions"><button class="primary">创建</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const name=e.currentTarget.elements.name.value.trim();if(!name)return;task(async()=>{const [folder]=await C.createFolder({id:crypto.randomUUID(),name,collection,parent_id:parent||null});remote.folders.push(folder);dialog.close();editor=null;dirty=false;history.replaceState(null,'','#/folder/'+encodeURIComponent(folder.id));lastHash=location.hash;apply();notice('合集已创建。');});});
  }
  async function operation(action,target,name=null,parent=null){
    try{await C.request('/rest/v1/rpc/blog_file_operation',{method:'POST',auth:true,body:{action,target_id:target.id,expected_version:target.version||1,new_name:name,new_parent:parent}});}catch(e){if(e.status===404)throw Error('合集管理暂时不可用，请稍后重试。');throw e;}
  }
  function folderMenu(collection,id){
    if(!guard())return;const folder=remote.folders.find(f=>f.id===id);
    popup(`<h2>${E(folder?.name||labels[collection])}</h2><div class="folder-commands"><button data-cmd="post">新建帖子</button><button data-cmd="folder">新建合集</button>${folder?'<button data-cmd="rename">重命名</button><button data-cmd="move">移动合集</button><button class="danger" data-cmd="delete">删除空合集</button>':''}</div><div class="dialog-actions"><button data-close>关闭</button></div>`);
    dialog.querySelectorAll('[data-cmd]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.cmd;
      if(action==='post')return createPost(collection,id);
      if(action==='folder')return createFolder(collection,id);
      if(action==='delete'){
        if(remote.folders.some(f=>f.parent_id===id)||remote.posts.some(p=>p.folder_id===id)){notice('合集中还有内容，请先移动帖子和子合集。',true);return;}
        if(!confirm('确定删除空合集“'+folder.name+'”吗？'))return;
        return task(async()=>{await operation('delete_folder',folder);dialog.close();editor=null;dirty=false;history.replaceState(null,'','#/'+collection);lastHash=location.hash;await reload();notice('合集已删除。');});
      }
      popup(`<form><h2>${action==='rename'?'重命名':'移动合集'}</h2>${action==='rename'?`<label>名称<input name="name" value="${E(folder.name)}" maxlength="100" required></label>`:`<label>移入<select name="parent">${destinationOptions(collection,folder.parent_id,folder.id)}</select></label>`}<div class="dialog-actions"><button class="primary">保存</button><button type="button" data-close>取消</button></div></form>`);
      dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;task(async()=>{await operation(action==='rename'?'rename_folder':'move_folder',folder,action==='rename'?form.elements.name.value.trim():null,action==='move'?(form.elements.parent.value||null):null);dialog.close();editor=null;dirty=false;await reload();notice('合集已更新。');});});
    }));
  }
  function renderEditor(){
    const pane=main.querySelector('.file-pane');if(!pane||!editor)return;
    const post=editor;
    main.classList.add('is-writing');
    pane.innerHTML=`<section class="inline-editor"><form id="inline-post"><div class="editor-top"><div><p class="editor-path">${E(labels[post.collection])}${post.folder_id?' / '+E(F.ancestors(D,post.folder_id).map(f=>f.name).join(' / ')):''}</p><h1>${post.version?'编辑帖子':'写一篇新帖子'}</h1></div><div class="editor-bar"><button type="button" data-action="read">取消</button><button type="button" data-action="download">导出 Markdown</button></div></div><label class="title-field"><span class="sr-only">标题</span><input name="title" placeholder="输入帖子标题" value="${E(post.title)}" maxlength="200" required></label><div class="editor-options"><label>所属合集<select name="folder">${destinationOptions(post.collection,post.folder_id)}</select></label><label>摘要 · 可选<input name="summary" placeholder="一句话概括这篇帖子" value="${E(post.summary)}" maxlength="500"></label></div>${post.collection==='projects'?`<div class="editor-options project-options"><label>GitHub 地址<input name="github" type="url" pattern="https?://.*" value="${E(post.metadata.github||'')}" placeholder="https://github.com/…"></label><label>演示地址<input name="demoURL" type="url" pattern="https?://.*" value="${E(typeof post.metadata.demo==='string'?post.metadata.demo:'')}" placeholder="https://…"></label><label>技术栈<input name="tech" maxlength="500" value="${E((post.metadata.tags||[]).join('，'))}" placeholder="Go，PostgreSQL，Raft"></label></div>`:''}<div class="writing-controls"><div class="editor-bar editor-tabs"><button type="button" data-action="edit" aria-pressed="true">编辑</button><button type="button" data-action="split" aria-pressed="false">对照</button><button type="button" data-action="preview" aria-pressed="false">预览</button></div><span id="word-count">${post.body.replace(/\s/g,'').length} 字</span></div><div class="format-toolbar" aria-label="正文格式"><button type="button" data-format="heading" title="插入标题">H2</button><button type="button" data-format="bold" title="加粗选中文字"><b>B</b></button><button type="button" data-format="list">列表</button><button type="button" data-format="code">代码块</button><button type="button" data-format="link">链接</button><button type="button" data-upload-image>图片</button><input type="file" id="image-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden><span>Markdown</span></div><div class="writing-surface" data-mode="edit"><label id="inline-body-label"><span class="sr-only">正文</span><textarea name="body" placeholder="从这里开始写……" maxlength="200000" spellcheck="false">${E(post.body)}</textarea></label><div class="article-body" id="inline-preview" hidden></div></div><div class="editor-bar publish-bar"><span id="inline-save-state">${dirty?'尚未保存':post.version?(post.published?'当前为已发布版本':'当前为已保存草稿'):'尚未保存'}</span><button type="button" data-action="draft">${post.published?'撤回并保存草稿':'保存草稿'}</button><button class="primary" type="submit">${post.published?'更新发布':'发布帖子'}</button></div></form></section>`;

    const form=pane.querySelector('form');
    form.addEventListener('input',()=>{editor={...editor,title:form.elements.title.value,summary:form.elements.summary.value,body:form.elements.body.value,folder_id:form.elements.folder.value||null};if(editor.collection==='projects')editor.metadata={...editor.metadata,github:form.elements.github.value.trim(),demo:form.elements.demoURL.value.trim()|| (editor.metadata.demo===true?true:''),tags:form.elements.tech.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean)};dirty=true;clearTimeout(draftTimer);draftTimer=setTimeout(backup,600);document.getElementById('inline-save-state').textContent='尚未保存';document.getElementById('word-count').textContent=editor.body.replace(/\s/g,'').length+' 字';if(!document.getElementById('inline-preview').hidden){document.getElementById('inline-preview').innerHTML=M.render(editor.body);C.hydrateImages?.(document.getElementById('inline-preview'),true);}});
    const imageFile=form.querySelector('#image-file');
    form.querySelector('[data-upload-image]').onclick=()=>imageFile.click();
    async function insertImage(file){if(!file||busy)return;const area=form.elements.body,start=area.selectionStart,end=area.selectionEnd;await task(async()=>{notice('正在上传图片……');const path=await C.uploadImage(file,editor.id);area.setRangeText('\n!['+file.name.replace(/[\[\]\r\n]/g,'')+'](media:'+path+')\n',start,end,'end');area.dispatchEvent(new Event('input',{bubbles:true}));backup();notice('图片已插入。');});}
    imageFile.onchange=()=>{insertImage(imageFile.files[0]);imageFile.value='';};
    form.elements.body.addEventListener('paste',e=>{const file=[...(e.clipboardData?.files||[])].find(f=>f.type.startsWith('image/'));if(file){e.preventDefault();insertImage(file);}});
    form.querySelectorAll('[data-format]').forEach(button=>button.addEventListener('click',()=>{
      const area=form.elements.body,start=area.selectionStart,end=area.selectionEnd,selected=area.value.slice(start,end),kind=button.dataset.format;
      const pairs={heading:['## ','标题'],bold:['**','文字','**'],list:['- ','列表项'],code:['\n\x60\x60\x60\n','代码','\n\x60\x60\x60\n'],link:['[','链接文字','](https://example.com)']};
      const [before,fallback,after='']=pairs[kind],text=before+(selected||fallback)+after;
      area.setRangeText(text,start,end,'select');area.focus();area.dispatchEvent(new Event('input',{bubbles:true}));
    }));
    form.addEventListener('submit',e=>{e.preventDefault();save(true);});
    form.querySelectorAll('[data-action]').forEach(button=>button.addEventListener('click',()=>{
      const action=button.dataset.action;
      if(action==='draft')return save(false);
      if(['edit','preview','split'].includes(action)){document.getElementById('inline-body-label').hidden=action==='preview';const target=document.getElementById('inline-preview');target.hidden=action==='edit';target.innerHTML=M.render(editor.body);C.hydrateImages?.(target,true);form.querySelector('.writing-surface').dataset.mode=action;form.querySelector('.format-toolbar').hidden=action==='preview';for(const mode of ['edit','split','preview'])form.querySelector('[data-action='+mode+']').setAttribute('aria-pressed',String(mode===action));return;}
      if(action==='read'){if(!guard())return;dirty=false;editor=null;window.refreshBlog();return;}
      if(action==='download'){const url=URL.createObjectURL(new Blob(['# '+editor.title+'\n\n'+editor.body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(editor.title||'帖子').replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
      if(action==='delete'&&confirm('确定永久删除这篇帖子吗？'))task(async()=>{await operation('delete_post',editor);remote.posts=remote.posts.filter(p=>p.id!==editor.id);const route=editor.folder_id?'folder/'+encodeURIComponent(editor.folder_id):editor.collection;editor=null;dirty=false;history.replaceState(null,'','#/'+route);lastHash=location.hash;apply();notice('帖子已删除。');});
    }));
    function save(published){
      if(!form.reportValidity())return;
      if(editor.published&&!published&&!confirm('保存为草稿会撤回这篇公开帖子，确定吗？'))return;
      if(!editor.title.trim()){notice('请填写标题。',true);return;}
      const snapshot={id:editor.id,collection:editor.collection,folder_id:editor.folder_id,title:editor.title.trim(),summary:editor.summary,body:editor.body,metadata:editor.metadata,published};
      task(async()=>{form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=true);try{const saved=await C.save(snapshot,editor.version);clearTimeout(draftTimer);removeBackup(editor.id);const index=remote.posts.findIndex(p=>p.id===saved.id);index<0?remote.posts.push(saved):remote.posts.splice(index,1,saved);editor=null;dirty=false;history.replaceState(null,'','#/'+F.types[saved.collection]+'/'+encodeURIComponent(saved.id));lastHash=location.hash;apply();notice(published?'帖子已发布。':'草稿已保存。');}finally{form.querySelectorAll('input,textarea,select,button').forEach(el=>el.disabled=false);}});
    }
  }
  function compose(ctx){
    if(!userId){login(()=>compose(ctx));return;}if(!author){notice('当前账号已登录，发帖功能仅向作者开放。');return;}
    if(labels[ctx.collection])return createPost(ctx.collection,ctx.folder);
    popup(`<form><h2>发帖</h2><label>选择版块<select name="board">${Object.entries(labels).map(([key,name])=>`<option value="${key}">${E(name)}</option>`).join('')}</select></label><div class="dialog-actions"><button class="primary">开始写帖</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();createPost(e.currentTarget.elements.board.value,null);});
  }
  function collectPosts(collection,id){
    const candidates=remote.posts.filter(p=>p.collection===collection&&p.published);
    popup(`<form><h2>收录帖子</h2><p>勾选要放入这个合集的帖子。取消勾选会移出本合集。</p><div class="album-picker">${candidates.map(p=>`<label><input type="checkbox" name="posts" value="${E(p.id)}" ${p.folder_id===id?'checked':''}>${E(p.title)}</label>`).join('')||'<p>还没有已发布帖子</p>'}</div><div class="dialog-actions"><button class="primary">保存</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const selected=new Set([...e.currentTarget.querySelectorAll('input:checked')].map(x=>x.value));task(async()=>{
      let count=0;
      try{for(const p of candidates){const folder=selected.has(p.id)?id:p.folder_id===id?null:p.folder_id;if(folder===p.folder_id)continue;const saved=await C.save({id:p.id,collection:p.collection,folder_id:folder,title:p.title,summary:p.summary,body:p.body,metadata:p.metadata,published:p.published},p.version);remote.posts.splice(remote.posts.findIndex(x=>x.id===p.id),1,saved);count++;}}
      catch(e){dialog.close();apply();throw Error(`已更新 ${count} 篇帖子，其余未完成：${e.message}`);}
      dialog.close();apply();notice('合集内容已更新。');
    });});
  }
  function addToAlbum(post){
    popup(`<form><h2>加入合集</h2><label>选择合集<select name="album">${destinationOptions(post.collection,post.folder_id)}</select></label><div class="dialog-actions"><button class="primary">保存</button><button type="button" data-close>取消</button></div></form>`);
    dialog.querySelector('form').addEventListener('submit',e=>{e.preventDefault();const folder=e.currentTarget.elements.album.value||null;task(async()=>{const saved=await C.save({id:post.id,collection:post.collection,folder_id:folder,title:post.title,summary:post.summary,body:post.body,metadata:post.metadata,published:post.published},post.version);remote.posts.splice(remote.posts.findIndex(x=>x.id===post.id),1,saved);dialog.close();apply();notice(folder?'已加入合集。':'已移出合集。');});});
  }
  function mount(){
    C.hydrateImages?.(main,author);
    const ctx=context(),pane=main.querySelector('.file-pane');
    main.querySelectorAll('[data-compose]').forEach(button=>button.onclick=()=>compose(ctx));
    main.querySelectorAll('[data-new-album]').forEach(button=>button.onclick=()=>createFolder(ctx.collection,ctx.folder));
    if(editor){renderEditor();return;}
    if(!author||!pane)return;
    if(backups().length){const button=document.createElement('button');button.className='device-drafts';button.textContent='恢复设备草稿（'+backups().length+'）';button.onclick=recovery;pane.prepend(button);}
    if(ctx.post){
      const controls=document.createElement('div');controls.className='post-owner-actions';controls.innerHTML='<button type="button" data-edit-post>编辑</button><button type="button" data-collect-post>加入合集</button><details><summary>更多</summary><button type="button" data-delete-post>删除帖子</button></details>';
      controls.querySelector('[data-edit-post]').onclick=()=>{editor={...ctx.post};dirty=false;renderEditor();};
      controls.querySelector('[data-collect-post]').onclick=()=>addToAlbum(ctx.post);
      controls.querySelector('[data-delete-post]').onclick=()=>{if(!confirm('确定永久删除这篇帖子吗？'))return;task(async()=>{await operation('delete_post',ctx.post);remote.posts=remote.posts.filter(p=>p.id!==ctx.post.id);history.replaceState(null,'','#/'+ctx.collection);lastHash=location.hash;apply();notice('帖子已删除。');});};
      pane.querySelector('.article')?.prepend(controls);
    }else if(ctx.folder){
      const controls=document.createElement('div');controls.className='album-owner-actions';controls.innerHTML='<button type="button" data-collect>收录帖子</button><button type="button" data-manage>管理合集</button>';
      controls.querySelector('[data-collect]').onclick=()=>collectPosts(ctx.collection,ctx.folder);
      controls.querySelector('[data-manage]').onclick=()=>folderMenu(ctx.collection,ctx.folder);
      pane.querySelector('.board-head')?.after(controls);
    }
  }
  document.getElementById('global-compose')?.addEventListener('click',()=>compose(context()));
  window.InlineWriter={mount,allowNavigation,isAuthor:()=>author};
  addEventListener('beforeunload',e=>{backup();if(dirty||busy){e.preventDefault();e.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)backup();});
  const authReturn=new URLSearchParams(location.hash.slice(1));
  if(authReturn.has('access_token')||authReturn.has('error_description')){const failed=authReturn.has('error_description');history.replaceState(null,'',location.pathname+location.search+'#/');lastHash=location.hash;login();dialog.querySelector('#login-error').textContent=failed?'验证链接已失效，请重发验证邮件。':'请使用邮箱和密码登录。';}
  // No stale static content is shown after switching to the cloud source.
  if(window.CLOUD_CONFIG.enabled){for(const key of Object.values(F.keys))D[key]=[];D.folders=[];D.categories=['全部'];window.refreshBlog();notice('正在载入帖子……');task(async()=>{await reload();notice('');});}
})();
