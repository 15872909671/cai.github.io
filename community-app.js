(() => {
  'use strict';
  const C=window.BlogCloud,A=window.CommunityAPI,Auth=window.CommunityAuth,M=window.BlogMarkdown,E=M.escape;
  const main=document.getElementById('main'),nav=document.getElementById('nav'),account=document.getElementById('account-button');
  const boards={knowledge:'技术博客',projects:'作品集',interviews:'面试经历',tools:'工具',photos:'相册',essays:'随笔'};
  const siteOwner='430ef651-e7f9-4979-96e1-67e6bca2814d';
  let authorNavProfile=null,mine=null,epoch=0,editing=null,dirty=false,working=false,backupTimer=null,lastHash=location.hash,searchEpoch=0;
  const isGlobalRoute=hash=>/^#\/(?:$|(?:home|posts|knowledge|projects|interviews|essays|tools|photos|guestbook|career)(?:[?]|$))/.test(hash);
  let returnToGlobal='#/';
  try{const saved=sessionStorage.getItem('cai:return-to-global');if(saved&&isGlobalRoute(saved))returnToGlobal=saved;}catch{}
  function rememberGlobal(hash){if(!isGlobalRoute(hash))return;returnToGlobal=hash;try{sessionStorage.setItem('cai:return-to-global',hash);}catch{}}
  rememberGlobal(location.hash||'#/');
  const modal=document.createElement('dialog');modal.className='inline-dialog';document.body.append(modal);
  const enc=encodeURIComponent,who=()=>C.currentUser()?.id;
  const safe=u=>/^https?:\/\//i.test(u||'')?E(u):'';
  const displayName=p=>p?.display_name||((p?.user_id===siteOwner||p?.owner_id===siteOwner||p?.username==='u_'+siteOwner.replaceAll('-',''))?'KNAIOS':/^u_[a-f0-9]{20,32}$/.test(p?.username||'')?'作者':p?.username)||'作者';
  const avatar=p=>`<span class="user-avatar" aria-hidden="true">${E(displayName(p).slice(0,1))}</span>`;
  const userLink=p=>p?`<a class="user-link" href="#/u/${enc(p.username)}" title="查看作者空间"><span class="user-avatar" aria-hidden="true">${E(displayName(p).slice(0,1))}</span><span>${E(displayName(p))}</span></a>`:'<span>作者</span>';
  const date=t=>new Date(t).toLocaleDateString('zh-CN');
  const spaceURL=(p,params={})=>'#/u/'+enc(p.username)+(Object.keys(params).length?'?'+new URLSearchParams(Object.entries(params).filter(([,v])=>v!==null&&v!==undefined&&v!=='')): '');
  const postURL=id=>'#/post/'+enc(id);
  function route(){const [path,query='']=location.hash.slice(2).split('?');return {parts:(path||'').split('/').map(x=>{try{return decodeURIComponent(x);}catch{return '';}}),query:new URLSearchParams(query)};}
  function show(title,html,sidebar=''){main.classList.remove('is-writing','is-reading','is-documents');document.body.classList.remove('is-home');document.title=title+' · CAI';main.innerHTML=`<div class="container community-container">${sidebar?`<div class="community-layout"><aside class="community-sidebar"><button class="sidebar-toggle" type="button" aria-expanded="false" aria-controls="sidebar-content">目录与作者</button><div id="sidebar-content" class="sidebar-content">${sidebar}</div></aside><div class="file-pane">${html}</div></div>`:html}</div>`;const toggle=main.querySelector('.sidebar-toggle');if(toggle)toggle.onclick=()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.closest('aside').classList.toggle('expanded',open);};}
  function errorPage(error){show('无法加载',`<section class="empty"><h1>暂时无法加载</h1><p>${E(error.message||'请稍后重试')}</p><button data-retry>重新加载</button></section>`);main.querySelector('[data-retry]').onclick=render;}
  function toast(text,error=false){Auth.notice(text,error);}
  function confirmDelete(message){return new Promise(resolve=>{
    const dialog=document.createElement('dialog');dialog.className='inline-dialog delete-confirm';dialog.setAttribute('aria-labelledby','delete-confirm-title');dialog.setAttribute('aria-describedby','delete-confirm-message');
    dialog.innerHTML=`<h2 id="delete-confirm-title">确认删除</h2><p id="delete-confirm-message">${E(message)}</p><div class="dialog-actions"><button type="button" data-cancel autofocus>取消</button><button type="button" data-confirm-delete>删除</button></div>`;
    let settled=false;const finish=value=>{if(settled)return;settled=true;dialog.close();dialog.remove();resolve(value);};
    dialog.querySelector('[data-cancel]').onclick=()=>finish(false);dialog.querySelector('[data-confirm-delete]').onclick=()=>finish(true);dialog.oncancel=e=>{e.preventDefault();finish(false);};dialog.onclose=()=>finish(false);
    document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-cancel]').focus();
  });}
  function popup(html){modal.innerHTML=html+'<p class="dialog-error" role="alert"></p>';if(!modal.open)modal.showModal();modal.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>modal.close());}
  async function job(action,scope=main){if(working)return;working=true;const controls=[...scope.querySelectorAll('button,input,textarea,select')].map(el=>[el,el.disabled]);controls.forEach(([el])=>el.disabled=true);scope.setAttribute('aria-busy','true');try{return await action();}catch(e){if(modal.open)modal.querySelector('.dialog-error').textContent=e.message;else toast(e.name==='TimeoutError'?'请求超时，内容仍保留，请重试。':e.message,true);}finally{working=false;scope.removeAttribute('aria-busy');controls.forEach(([el,disabled])=>{if(el.isConnected)el.disabled=disabled;});}}
  function requireLogin(next){if(!who()){Auth.open(next);return false;}return true;}
  function profileCard(p,owner=false){return `<section class="space-card">${avatar(p)}<h2>${E(displayName(p))}</h2>${p.bio?`<p class="space-bio">${E(p.bio)}</p>`:''}${safe(p.website)?`<a href="${safe(p.website)}" target="_blank" rel="noopener noreferrer">个人链接 ↗</a>`:''}<a href="${spaceURL(p)}">${owner?'我的空间':'作者空间'}</a><a href="${spaceURL(p,{view:'guestbook'})}">给作者留言</a>${owner?'<a href="#/settings">个人资料</a>':''}</section>`;}
  function breadcrumbs(p,board,folders=[],folder=null,last=''){
    const trail=[],seen=new Set();let current=folders.find(f=>f.id===folder);
    while(current&&!seen.has(current.id)){seen.add(current.id);trail.unshift(current);current=folders.find(f=>f.id===current.parent_id);}
    return `<nav class="community-breadcrumb" aria-label="当前位置"><a href="${spaceURL(p)}">${p.user_id===who()?'我的空间':E(displayName(p))}</a><span aria-hidden="true">/</span><a href="${spaceURL(p,{board})}">${E(boards[board])}</a>${trail.map(f=>`<span aria-hidden="true">/</span><a href="${spaceURL(p,{board,folder:f.id})}">${E(f.name)}</a>`).join('')}${last?`<span aria-hidden="true">/</span><span aria-current="page">${E(last)}</span>`:''}</nav>`;
  }
  function folderTree(folders,titles,p,board){
    const activePost=route().parts[0]==='post'?route().parts[1]:null,activeFolder=route().query.get('folder')||titles.find(t=>t.id===activePost)?.folder_id;
    const expanded=new Set();let cursor=folders.find(f=>f.id===activeFolder);while(cursor&&!expanded.has(cursor.id)){expanded.add(cursor.id);cursor=folders.find(f=>f.id===cursor.parent_id);}
    const seen=new Set();const branch=(parent=null)=>{
      const fs=folders.filter(f=>f.collection===board&&f.parent_id===parent&&!seen.has(f.id));
      return `<ul>${fs.map(f=>{seen.add(f.id);return `<li><details ${expanded.has(f.id)?'open':''}><summary><a href="${spaceURL(p,{board,folder:f.id})}" ${f.id===activeFolder?'aria-current="location"':''}>▤ ${E(f.name)}</a></summary>${branch(f.id)}</details></li>`;}).join('')}${titles.filter(t=>t.folder_id===parent).map(t=>`<li><a href="${postURL(t.id)}" ${t.id===activePost?'aria-current="page"':''}>▧ ${E(t.title)}${t.published?'':' · 草稿'}</a></li>`).join('')}</ul>`;
    };return `<nav class="space-tree" aria-label="当前栏目文件树"><h3>${E(boards[board])}</h3>${branch()}</nav>`;
  }
  const navSpecs=[['home','主页','⌂'],['space','空间','▱'],['posts','论坛','▤'],['tools','工具','⚒']];
  function navigation(profile=null,folders=[],currentBoard=null){
    const href=k=>k==='home'?'#/':'#/'+k;
    authorNavProfile=profile;
    if(!profile)nav.innerHTML=`<div class="mega-tabs">${navSpecs.map(([key,label,icon])=>`<a class="mega-tab" href="${href(key)}"><span aria-hidden="true">${icon}</span>${label}</a>`).join('')}</div>`;
    nav.classList.toggle('author-nav',!!profile);
    if(profile){
      const view=route().query.get('view'),active=view==='guestbook'?'guestbook':view==='moments'||currentBoard==='moments'?'moments':'blog';
      nav.innerHTML=`<div class="mega-tabs"><div class="space-heading"><button class="space-back" type="button" aria-label="返回全站栏目" title="返回全站栏目">←</button><a class="space-identity" href="${spaceURL(profile)}">${avatar(profile)}<span>${E(displayName(profile))}的空间</span></a></div>${[['blog','博客',{}],['moments','动态',{view:'moments'}],['guestbook','留言',{view:'guestbook'}]].map(([key,label,params])=>`<a class="mega-tab" href="${spaceURL(profile,params)}" ${key===active?'aria-current="page"':''}>${label}</a>`).join('')}</div>`;
    }
    nav.querySelector('.space-back')?.addEventListener('click',()=>{location.hash=returnToGlobal;});
    const state=route(),section=currentBoard||state.query.get('board')||state.parts[0],activeKey=state.parts[0]==='u'||section==='space'?'space':['photos','tools','moments'].includes(section)?section:['','home'].includes(section)?'home':['knowledge','projects','interviews','essays','posts','guestbook','post'].includes(section)?'posts':null;nav.querySelectorAll('.mega-tab').forEach((a,i)=>{if(!profile&&navSpecs[i][0]===activeKey)a.setAttribute('aria-current','page');});
    const closeNav=()=>{nav.classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');};
    nav.onclick=e=>{if(e.target.closest('a'))closeNav();};nav.onkeydown=e=>{if(e.key==='Escape')closeNav();};
    document.getElementById('menu-toggle').onclick=()=>{const open=nav.classList.toggle('open');document.getElementById('menu-toggle').setAttribute('aria-expanded',String(open));};

  }
  function postCard(p){const author=p.author||{username:p.username,display_name:p.display_name};return `<article class="community-post"><div class="post-byline">${userLink(author)}<span>${date(p.created_at)} · ${E(boards[p.collection])}${p.published?'':' · 草稿'}</span></div><a href="${postURL(p.id)}">${p.collection==='photos'&&/^[\w-]+\/[\w.-]+$/.test(p.metadata?.cover||'')?`<img class="gallery-cover" data-media="${E(p.metadata.cover)}" alt="${E(p.title)}" loading="lazy">`:''}<h2>${E(p.title)}</h2>${p.summary?`<p>${E(p.summary)}</p>`:''}</a>${p.collection==='tools'&&safe(p.metadata?.url)?`<a class="tool-launch" href="${safe(p.metadata.url)}" target="_blank" rel="noopener noreferrer">打开工具 ↗</a>`:''}${p.metadata?.demo===true?'<small>示例模板</small>':''}</article>`;}
  function pager(total,page,params,base){const n=Math.max(1,Math.ceil(total/20));const link=x=>base+'?'+new URLSearchParams({...params,page:x});return n>1?`<nav class="forum-pagination" aria-label="分页">${page>1?`<a href="${link(page-1)}">上一页</a>`:''}<span>${page} / ${n}</span>${page<n?`<a href="${link(page+1)}">下一页</a>`:''}</nav>`:'';}
  async function listing(query,profile=null,board=null,ticket){
    const page=Math.max(1,Number(query.get('page'))||1),folder=query.get('folder'),drafts=query.get('view')==='drafts',search=(query.get('q')||'').trim(),owner=profile?.user_id===who();
    if(drafts&&!owner)throw Error('草稿仅作者本人可见。');
    const [data,folders,titles]=await Promise.all([
      A.feed({who:profile?.user_id||null,board,folder,search,drafts,page_number:page}),
      profile?A.folders(profile.user_id):[],profile&&board?A.titles(profile.user_id,board):[]
    ]);if(ticket!==epoch)return;
    const selected=folder?folders.find(f=>f.id===folder):null;if(folder&&!selected)throw Error('合集不存在或不可访问。');
    const title=drafts?'我的草稿':selected?.name||(profile?(board?boards[board]:displayName(profile)):board?boards[board]:'全部帖子');
    const base=profile?'#/u/'+enc(profile.username):board?'#/'+board:'#/posts';
    const params=Object.fromEntries(query);delete params.page;
    const tabs=profile?`<nav class="board-tabs"><a href="${spaceURL(profile)}" ${!board&&!drafts?'aria-current="page"':''}>全部</a>${Object.entries(boards).map(([key,name])=>`<a href="${spaceURL(profile,{board:key})}" ${key===board&&!drafts?'aria-current="page"':''}>${name}</a>`).join('')}${owner?`<a href="${spaceURL(profile,{board,view:'drafts'})}" ${drafts?'aria-current="page"':''}>草稿</a>`:''}</nav>`:'';
    const children=profile&&board?folders.filter(f=>f.collection===board&&f.parent_id===(folder||null)):[];
    show(title,`${profile&&board?breadcrumbs(profile,board,folders,folder,drafts?'草稿':''):''}<header class="board-head"><div><h1>${E(title)}</h1><p>${data.total} 篇帖子</p></div><div class="community-actions"><button class="forum-primary" data-write>写帖子</button>${owner&&board?'<button data-folder-create>新建合集</button>':''}${owner&&selected?'<button data-folder-manage>管理文件夹</button>':''}</div></header>${tabs}${children.length?`<div class="folder-chips">${children.map(f=>`<a href="${spaceURL(profile,{board,folder:f.id})}">▤ ${E(f.name)}</a>`).join('')}</div>`:''}<form class="board-search" id="scoped-search"><label class="sr-only" for="board-query">搜索帖子</label><input id="board-query" name="q" value="${E(search)}" placeholder="搜索当前范围的帖子"><button>搜索</button></form><section class="community-feed">${data.items.map(postCard).join('')||`<div class="feed-empty"><span aria-hidden="true">${search?'⌕':'▤'}</span><h2>${search?'没有找到相关帖子':drafts?'还没有草稿':'这里还没有帖子'}</h2><p>${search?'试试更短的关键词，或清除搜索条件。':owner?'点击「写帖子」，保存草稿或发布到这个空间。':'作者发布后，帖子会显示在这里。'}</p>${search?`<a href="${base+'?'+new URLSearchParams({...params,q:'',page:1})}">清除搜索</a>`:''}</div>`}</section>${pager(data.total,page,params,base)}`,profile?profileCard(profile,owner)+(board?folderTree(folders,titles,profile,board):''):'');
    navigation(profile,folders);
    C.hydrateImages(main,!!who());
    main.querySelector('[data-write]').onclick=()=>writeNew(board||'knowledge',owner?folder:null);
    main.querySelector('#scoped-search').onsubmit=e=>{e.preventDefault();location.hash=base+'?'+new URLSearchParams({...params,q:e.currentTarget.elements.q.value,page:1});};
    main.querySelector('[data-folder-create]')?.addEventListener('click',()=>folderCreate(board,folder));
    main.querySelector('[data-folder-manage]')?.addEventListener('click',()=>folderManage(selected,folders));
  }
  const treeOpen=new Map();
  function documentTree(profile,folders,titles,selectedFolder=null,selectedPost=null,search='',drafts=false){
    const owner=profile.user_id===who(),open=treeOpen.get(profile.user_id)||new Set(),phrase=search.toLocaleLowerCase(),keep=new Set();
    const mark=id=>{const seen=new Set();let f=folders.find(x=>x.id===id);while(f&&!seen.has(f.id)){seen.add(f.id);keep.add(f.id);f=folders.find(x=>x.id===f.parent_id);}};
    const matches=titles.filter(p=>(!drafts||!p.published)&&(!phrase||p.title.toLocaleLowerCase().includes(phrase)));
    if(phrase||drafts){matches.forEach(p=>mark(p.folder_id));folders.filter(f=>phrase&&f.name.toLocaleLowerCase().includes(phrase)).forEach(f=>mark(f.id));}
    const active=new Set();let cursor=folders.find(f=>f.id===(selectedFolder||titles.find(p=>p.id===selectedPost)?.folder_id));while(cursor&&!active.has(cursor.id)){active.add(cursor.id);cursor=folders.find(f=>f.id===cursor.parent_id);}
    const seen=new Set(),branch=(parent=null)=>`<ul>${folders.filter(f=>f.parent_id===parent&&!seen.has(f.id)&&(!(phrase||drafts)||keep.has(f.id))).map(f=>{seen.add(f.id);return `<li class="directory-node"><details data-tree-folder="${E(f.id)}" ${open.has(f.id)||active.has(f.id)||phrase||drafts?'open':''}><summary><span class="file-icon" aria-hidden="true">▤</span><a href="${spaceURL(profile,{folder:f.id})}" ${f.id===selectedFolder?'aria-current="location"':''}>${E(f.name)}</a>${owner?`<button type="button" class="tree-more" data-folder-menu="${E(f.id)}" aria-label="管理文件夹 ${E(f.name)}">⋯</button>`:''}</summary>${branch(f.id)}</details></li>`;}).join('')}${matches.filter(p=>(p.folder_id||null)===parent).map(p=>`<li class="post-node"><a href="${postURL(p.id)}" ${p.id===selectedPost?'aria-current="page"':''}><span class="file-icon" aria-hidden="true">▧</span><span class="file-name">${E(p.title)}</span>${!p.published?'<span class="file-kind">草稿</span>':''}</a>${owner?`<button type="button" class="tree-more" data-post-menu="${E(p.id)}" aria-label="管理帖子 ${E(p.title)}">⋯</button>`:''}</li>`).join('')}</ul>`;
    return `<section class="document-tree"><header class="tree-heading"><a href="${spaceURL(profile)}">文件</a>${owner?'<div><button type="button" data-tree-new-post title="新建帖子" aria-label="新建帖子">＋</button><button type="button" data-tree-new-folder title="新建文件夹" aria-label="新建文件夹">▤＋</button></div>':''}</header><form id="scoped-search" class="tree-search"><label class="sr-only" for="tree-query">搜索文件与文件夹</label><input id="tree-query" name="q" value="${E(search)}" placeholder="搜索文件"><button aria-label="搜索">⌕</button></form><div class="tree-view-tools"><button data-expand>展开全部</button><button data-collapse>收起全部</button>${owner?`<a href="${spaceURL(profile,drafts?{}:{view:'drafts'})}">${drafts?'全部文件':'草稿'}</a>`:''}</div><nav class="author-file-tree space-tree" aria-label="作者文件树">${branch()}</nav></section>`;
  }
  function bindDocumentTree(profile,folders,titles,folderId=null){
    main.classList.add('is-documents');
    const root=main.querySelector('.document-tree');if(!root)return;
    const folder=folders.find(f=>f.id===folderId),board=folder?.collection||'knowledge';
    root.querySelector('#scoped-search').onsubmit=e=>{e.preventDefault();location.hash=spaceURL(profile,{q:e.currentTarget.elements.q.value});};
    root.querySelector('[data-expand]').onclick=()=>root.querySelectorAll('details').forEach(d=>d.open=true);
    root.querySelector('[data-collapse]').onclick=()=>root.querySelectorAll('details').forEach(d=>d.open=false);
    root.querySelectorAll('details[data-tree-folder]').forEach(d=>d.addEventListener('toggle',()=>{const open=treeOpen.get(profile.user_id)||new Set();d.open?open.add(d.dataset.treeFolder):open.delete(d.dataset.treeFolder);treeOpen.set(profile.user_id,open);}));
    root.querySelector('[data-tree-new-post]')?.addEventListener('click',()=>writeNew(board,folderId));
    root.querySelector('[data-tree-new-folder]')?.addEventListener('click',()=>folderCreate(board,folderId));
    if(profile.user_id!==who())return;
    const sidebar=root.closest('aside');
    const actions=(target)=>{
      const summary=target.closest('summary'),row=target.closest('.post-node');
      const f=summary?folders.find(x=>x.id===summary.closest('details').dataset.treeFolder):null;
      const p=row?titles.find(x=>x.id===row.querySelector('[data-post-menu]')?.dataset.postMenu):null;
      const parent=f?.id||null,collection=f?.collection||'knowledge';
      if(p)return [
        ['编辑',()=>{location.hash='#/edit/'+enc(p.id);}],
        ['重命名',()=>renameTreeItem(row.querySelector('a'),p,false)],
        ['移动',()=>job(async()=>{const latest=await A.post(p.id);movePost(latest,folders.filter(f=>f.collection===latest.collection));},main)],
        ['删除',async()=>{if(!await confirmDelete('永久删除“'+p.title+'”及其评论？'))return;job(async()=>{const latest=await A.post(p.id);await A.rpc('blog_file_operation',{action:'delete_post',target_id:p.id,expected_version:latest.version},true);location.hash=spaceURL(profile,p.folder_id?{folder:p.folder_id}:{});await render();},main);},'danger']
      ];
      return [['新建文件',()=>writeNew(collection,parent)],['新建文件夹',()=>folderCreate(collection,parent)],...(f?[
        ['重命名',()=>renameTreeItem(summary.querySelector('a'),f,true)],
        ['移动',()=>folderManage(f,folders)],
        ['删除',()=>deleteFolder(f,main),'danger']
      ]:[])];
    };
    const openMenu=(event,target,x,y)=>{event.preventDefault();event.stopPropagation();if(dirty){toast("请先保存正在编辑的内容，再管理文件。");return;}openTreeMenu(actions(target),x,y,target);};
    sidebar.addEventListener('contextmenu',e=>{if(e.target.closest('input,textarea'))return;openMenu(e,e.target,e.clientX,e.clientY);});
    root.querySelectorAll('[data-folder-menu],[data-post-menu]').forEach(button=>button.onclick=e=>{const r=button.getBoundingClientRect();openMenu(e,button,r.left,r.bottom);});
    sidebar.addEventListener('keydown',e=>{if(e.key==='ContextMenu'||(e.shiftKey&&e.key==='F10')){const r=e.target.getBoundingClientRect();openMenu(e,e.target,r.left,r.bottom);}});

  }
  let closeTreeMenu=()=>{};
  function openTreeMenu(items,x,y,origin){
    closeTreeMenu();const menu=document.createElement('div'),events=new AbortController();
    menu.className='tree-context-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','文件操作');
    menu.innerHTML=items.map(([label,,kind],i)=>`<button type="button" role="menuitem" data-action="${i}" class="${kind||''}">${E(label)}</button>`).join('');
    document.body.append(menu);const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
    const close=(restore=false)=>{events.abort();menu.remove();if(restore&&origin.isConnected)origin.focus();closeTreeMenu=()=>{};};closeTreeMenu=close;
    menu.querySelectorAll('button').forEach(b=>b.onclick=()=>{const action=items[Number(b.dataset.action)][1];close();action();});
    menu.onkeydown=e=>{const buttons=[...menu.querySelectorAll('button')],i=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End','Escape','Tab'].includes(e.key)){e.preventDefault();if(e.key==='Escape'||e.key==='Tab')return close(true);buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length].focus();}};
    document.addEventListener('pointerdown',e=>{if(!menu.contains(e.target))close();},{signal:events.signal});
    window.addEventListener('resize',()=>close(),{signal:events.signal});window.addEventListener('scroll',()=>close(),{signal:events.signal,capture:true});window.addEventListener('hashchange',()=>close(),{signal:events.signal});
    menu.querySelector('button').focus();
  }
  function renameTreeItem(label,item,isFolder){
    const old=isFolder?item.name:item.title,input=document.createElement('input');input.className='tree-rename';input.value=old;input.maxLength=isFolder?100:200;input.setAttribute('aria-label',isFolder?'文件夹名称':'文件名称');
    label.hidden=true;label.after(input);input.focus();input.select();let done=false;
    const cancel=()=>{if(done)return;done=true;input.remove();label.hidden=false;};
    input.onclick=e=>e.stopPropagation();input.onkeydown=e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();cancel();}if(e.key==='Enter'){e.preventDefault();const name=input.value.trim();if(!name){input.setCustomValidity('名称不能为空');input.reportValidity();return;}if(name===old)return cancel();done=true;input.disabled=true;job(async()=>{try{if(isFolder)await A.rpc('blog_file_operation',{action:'rename_folder',target_id:item.id,expected_version:item.version,new_name:name},true);else {const latest=await A.post(item.id);await C.save({id:item.id,title:name},latest.version);}await render();toast('已重命名。');}finally{input.remove();label.hidden=false;}},main);}};input.onblur=cancel;
  }
  async function authorFiles(query,profile,ticket){
    const owner=profile.user_id===who(),folderId=query.get('folder'),drafts=query.get('view')==='drafts',search=(query.get('q')||'').trim();
    if(drafts&&!owner)throw Error('草稿仅作者本人可见。');
    const [folders,titles]=await Promise.all([A.folders(profile.user_id),A.titles(profile.user_id)]);if(ticket!==epoch)return;
    const selected=folders.find(f=>f.id===folderId);if(folderId&&!selected)throw Error('文件夹不存在或不可访问。');
    const title=selected?.name||'全部文件',rows=[...folders.filter(f=>(f.parent_id||null)===(folderId||null)).map(f=>({name:f.name,url:spaceURL(profile,{folder:f.id}),type:'文件夹',icon:'▤'})),...titles.filter(p=>(p.folder_id||null)===(folderId||null)&&(!drafts||!p.published)).map(p=>({name:p.title,url:postURL(p.id),type:p.published?'帖子':'草稿',icon:'▧'}))];
    show(title,`<section class="document-directory"><header class="author-files-head"><h1>${E(title)}</h1><div class="community-actions">${owner?'<button class="forum-primary" data-write>新建帖子</button><button data-folder-create>新建文件夹</button>':''}${owner&&selected?'<button data-folder-manage>管理文件夹</button>':''}</div></header>${rows.length?`<div class="document-rows">${rows.map(x=>`<a href="${x.url}"><span>${x.icon}</span><strong>${E(x.name)}</strong><small>${x.type}</small></a>`).join('')}</div>`:'<div class="document-empty">从左侧选择文件，或新建一篇帖子。</div>'}</section>`,documentTree(profile,folders,titles,folderId,null,search,drafts));
    navigation(profile);bindDocumentTree(profile,folders,titles,folderId);
    main.querySelector('[data-write]')?.addEventListener('click',()=>writeNew(selected?.collection||'knowledge',folderId));
    main.querySelector('[data-folder-create]')?.addEventListener('click',()=>folderCreate(selected?.collection||'knowledge',folderId));
    main.querySelector('[data-folder-manage]')?.addEventListener('click',()=>folderManage(selected,folders));
  }
  async function momentPage(query,ticket,profile=null){
    const page=Math.max(1,Number(query.get('page'))||1),data=await A.moments(page,profile?.user_id);if(ticket!==epoch)return;
    show('动态',`<section class="moments-page"><header class="board-head"><h1>动态</h1></header>${who()&&(!profile||profile.user_id===who())?'<form id="moment-form" class="moment-compose"><label class="sr-only" for="moment-body">动态内容</label><textarea id="moment-body" name="body" maxlength="1000" required placeholder="分享此刻的想法…"></textarea><div class="community-actions"><span id="moment-count">0 / 1000</span><button class="forum-primary">发布动态</button></div></form>':(!profile?'<div class="moment-compose"><button data-moment-login>登录后写动态</button></div>':'')}<div class="moments-feed">${data.items.map(p=>`<article class="moment-card"><div class="post-byline">${userLink(p.author)}<span>${date(p.created_at)}</span></div><p class="moment-body">${E(p.body)}</p><a class="moment-comments" href="${postURL(p.id)}">查看 / 评论</a></article>`).join('')||'<div class="feed-empty"><h2>还没有动态</h2></div>'}</div><nav class="forum-pagination" aria-label="分页">${page>1?`<a href="${profile?spaceURL(profile,{view:'moments',page:page-1}):'#/moments?page='+(page-1)}">上一页</a>`:''}${data.more?`<a href="${profile?spaceURL(profile,{view:'moments',page:page+1}):'#/moments?page='+(page+1)}">下一页</a>`:''}</nav></section>`);navigation(profile);
    main.querySelector('[data-moment-login]')?.addEventListener('click',()=>Auth.open());
    const form=main.querySelector('#moment-form');if(form){form.elements.body.oninput=()=>{main.querySelector('#moment-count').textContent=form.elements.body.value.length+' / 1000';};form.onsubmit=e=>{e.preventDefault();const body=form.elements.body.value.trim();if(!body||body.length>1000)return;job(async()=>{const folders=await A.folders(who(),'essays');const folder=folders.find(f=>f.id==='default:'+who()+':essays');await C.save({id:crypto.randomUUID(),owner_id:who(),collection:'essays',folder_id:folder?.id||null,title:body.split('\n')[0].slice(0,60),summary:body.slice(0,160),body,metadata:{kind:'moment'},published:true});if(page!==1)location.hash=profile?spaceURL(profile,{view:'moments'}):'#/moments';else await render();toast('动态已发布。');},form);};}
  }
  async function article(id,ticket){
    const p=await A.post(id);if(ticket!==epoch)return;if(!p)throw Error('帖子不存在，或尚未公开。');
    const owner=p.owner_id===who();
    const [folders,titles]=await Promise.all([A.folders(p.owner_id),A.titles(p.owner_id)]);if(ticket!==epoch)return;
    const meta=p.metadata||{};
    show(p.title,`${breadcrumbs(p.author,p.collection,folders,p.folder_id,'帖子')}<article class="article community-article">${owner?'<div class="post-owner-actions"><button data-edit>编辑</button><button data-move>移动到文件夹</button><button data-delete class="danger">删除帖子</button></div>':''}<div class="post-byline">${userLink(p.author)}<span>${date(p.created_at)} · 约 ${Math.max(1,Math.ceil(p.body.replace(/\s/g,'').length/400))} 分钟${p.published?'':' · 草稿'}</span></div><h1>${E(p.title)}</h1>${p.summary?`<p class="lead">${E(p.summary)}</p>`:''}<div class="entry-meta">${(meta.tags||[]).map(t=>`<span class="tag">${E(t)}</span>`).join('')}</div>${meta.demo===true?'<p class="notice">示例模板，不代表真实经历。</p>':''}<div class="hero-actions">${[['github','GitHub'],['demo','演示'],['url','打开工具']].map(([key,label])=>safe(meta[key])?`<a class="button secondary" href="${safe(meta[key])}" target="_blank" rel="noopener noreferrer">${label} ↗</a>`:'').join('')}</div><div class="article-body">${M.render(p.body)}</div></article><section id="comments" class="comments-section"></section>`,documentTree(p.author,folders,titles,p.folder_id,p.id));
    bindDocumentTree(p.author,folders,titles,p.folder_id);main.classList.add('is-reading');navigation(p.author,folders,p.metadata?.kind==='moment'?'moments':p.collection);
    const headings=[...main.querySelectorAll('.article-body h2,.article-body h3,.article-body h4')];if(headings.length){const toc=document.createElement('nav');toc.className='toc';toc.innerHTML='<h3>本文目录</h3>'+headings.map((h,i)=>{h.id='heading-'+i;return `<button data-heading="${i}">${E(h.textContent)}</button>`;}).join('');main.querySelector('.file-pane').append(toc);toc.querySelectorAll('button').forEach(b=>b.onclick=()=>headings[Number(b.dataset.heading)].scrollIntoView({behavior:'smooth'}));}
    C.hydrateImages(main,!!who());
    main.querySelectorAll('.article-body img').forEach(img=>img.onclick=()=>{if(!img.src)return;const viewer=document.createElement('dialog');viewer.className='image-viewer';const copy=img.cloneNode();copy.removeAttribute('loading');const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>viewer.close();viewer.append(copy,close);document.body.append(viewer);viewer.addEventListener('close',()=>viewer.remove());viewer.showModal();});
    main.querySelector('[data-edit]')?.addEventListener('click',()=>{location.hash='#/edit/'+enc(id);});
    main.querySelector('[data-move]')?.addEventListener('click',()=>movePost(p,folders.filter(f=>f.collection===p.collection)));
    main.querySelector('[data-delete]')?.addEventListener('click',async()=>{if(await confirmDelete('永久删除这篇帖子及其评论？'))job(async()=>{await A.rpc('blog_file_operation',{action:'delete_post',target_id:p.id,expected_version:p.version},true);location.hash=spaceURL(p.author);toast('帖子已删除。');});});
    if(p.published)await comments({postId:p.id,ownerId:p.owner_id},main.querySelector('#comments'),ticket);
    else main.querySelector('#comments').innerHTML='<p>草稿发布后开放评论。</p>';
  }
  async function comments(ctx,root,ticket,page=1){
    const data=await A.commentPage({...ctx,page});if(ticket!==epoch||!root.isConnected)return;
    const canComment=!!who(),canModerate=ctx.ownerId===who()||(!ctx.postId&&!ctx.spaceId&&window.CommunityApp.user?.isAuthor);
    root.innerHTML=`<h2>${ctx.postId?'评论':'留言'}</h2>${canComment?'<form id="comment-form"><p id="reply-to" hidden></p><label class="sr-only" for="comment-body">评论内容</label><textarea id="comment-body" name="body" maxlength="3000" required placeholder="写下你的想法……"></textarea><div class="community-actions"><button class="forum-primary">发表</button><button type="button" data-cancel-reply hidden>取消回复</button></div></form>':'<p><button data-comment-login>登录后发表评论</button></p>'}<div class="comment-list">${data.items.map(c=>`<article class="comment" data-comment="${c.id}"><div class="post-byline">${userLink(c.author)}<span>${date(c.created_at)}</span></div>${c.parent_id?'<small class="reply-context">回复评论</small>':''}<p class="comment-body">${E(c.body)}</p><div class="comment-actions">${!c.deleted&&canComment?`<button data-reply="${c.id}">回复</button>`:''}${!c.deleted&&(c.author_id===who()||canModerate)?`<button data-delete-comment="${c.id}">删除</button>`:''}</div></article>`).join('')||'<p class="quiet-empty">还没有评论</p>'}</div><nav class="forum-pagination">${page>1?'<button data-comments-prev>上一页</button>':''}${data.more?'<button data-comments-next>下一页</button>':''}</nav>`;
    let reply=null;const form=root.querySelector('form');
    root.querySelector('[data-comment-login]')?.addEventListener('click',()=>Auth.open());
    root.querySelectorAll('[data-reply]').forEach(b=>b.onclick=()=>{reply=b.dataset.reply;const original=data.items.find(c=>c.id===reply);form.querySelector('#reply-to').hidden=false;form.querySelector('#reply-to').textContent='回复 '+displayName(original.author)+'：'+original.body.slice(0,80);form.querySelector('[data-cancel-reply]').hidden=false;form.elements.body.focus();});
    form?.querySelector('[data-cancel-reply]').addEventListener('click',()=>{reply=null;form.querySelector('#reply-to').hidden=true;form.querySelector('[data-cancel-reply]').hidden=true;});
    if(form)form.onsubmit=e=>{e.preventDefault();const body=form.elements.body.value.trim();if(!body)return;job(async()=>{await A.comment({body,post_id:ctx.postId||null,space_id:ctx.spaceId||null,parent_id:reply});form.elements.body.value='';reply=null;toast('已发表。');await comments(ctx,root,ticket,1);},root);};
    root.querySelectorAll('[data-delete-comment]').forEach(b=>b.onclick=async()=>{if(await confirmDelete('删除这条评论？'))job(async()=>{await A.rpc('blog_delete_comment',{target:b.dataset.deleteComment},true);await comments(ctx,root,ticket,page);},root);});
    root.querySelector('[data-comments-prev]')?.addEventListener('click',()=>comments(ctx,root,ticket,page-1).catch(e=>toast(e.message,true)));
    root.querySelector('[data-comments-next]')?.addEventListener('click',()=>comments(ctx,root,ticket,page+1).catch(e=>toast(e.message,true)));
  }
  function folderOptions(folders,value=null,exclude=null){const blocked=new Set(exclude?[exclude]:[]);let changed=true;while(changed){changed=false;for(const f of folders)if(blocked.has(f.parent_id)&&!blocked.has(f.id)){blocked.add(f.id);changed=true;}}
    const path=f=>{let names=[f.name],current=f;const seen=new Set([f.id]);while(current.parent_id){current=folders.find(x=>x.id===current.parent_id);if(!current||seen.has(current.id))break;seen.add(current.id);names.unshift(current.name);}return names.join(' / ');};
    return '<option value="">栏目根目录</option>'+folders.filter(f=>!blocked.has(f.id)).map(f=>`<option value="${E(f.id)}" ${f.id===value?'selected':''}>${E(path(f))}</option>`).join('');
  }
  function folderCreate(board,parent){popup(`<form><h2>新建文件夹</h2><label>名称<input name="name" maxlength="100" required></label>${board?'':`<label>内容类型<select name="collection">${Object.entries(boards).map(([id,label])=>`<option value="${id}">${E(label)}</option>`).join('')}</select></label>`}<div class="dialog-actions"><button class="primary">创建</button><button type="button" data-close>取消</button></div></form>`);modal.querySelector('form').onsubmit=e=>{e.preventDefault();const name=e.currentTarget.elements.name.value.trim(),collection=board||e.currentTarget.elements.collection.value;if(!name)return;job(async()=>{const [folder]=await C.createFolder({id:crypto.randomUUID(),owner_id:who(),collection,parent_id:parent||null,name});modal.close();location.hash=spaceURL(mine,{folder:folder.id});toast('文件夹已创建。');},modal);};}
  function folderManage(folder,folders){popup(`<form><h2>管理文件夹</h2><label>名称<input name="name" value="${E(folder.name)}" maxlength="100" required></label><label>移入<select name="parent">${folderOptions(folders.filter(f=>f.collection===folder.collection),folder.parent_id,folder.id)}</select></label><div class="dialog-actions"><button class="primary">保存</button><button type="button" data-delete-folder>删除文件夹</button><button type="button" data-close>取消</button></div></form>`);
    modal.querySelector('form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget,name=f.elements.name.value.trim(),parent=f.elements.parent.value||null;if(!name)return;job(async()=>{let version=folder.version;if(parent!==folder.parent_id){await A.rpc('blog_file_operation',{action:'move_folder',target_id:folder.id,expected_version:version,new_parent:parent},true);version++;folder={...folder,parent_id:parent,version};}if(name!==folder.name){await A.rpc('blog_file_operation',{action:'rename_folder',target_id:folder.id,expected_version:version,new_name:name},true);}modal.close();await render();toast('合集已更新。');},modal);};
    modal.querySelector('[data-delete-folder]').onclick=()=>deleteFolder(folder,modal);
  }
  function deleteFolder(folder,scope){return job(async()=>{
      const latest=await A.folders(who()),root=latest.find(f=>f.id===folder.id);if(!root)throw Error('文件夹已不存在，请刷新。');
      const ids=new Set([root.id]),ordered=[root];for(let i=0;i<ordered.length;i++)for(const f of latest)if(f.parent_id===ordered[i].id&&!ids.has(f.id)){ids.add(f.id);ordered.push(f);}
      const posts=(await A.titles(who())).filter(p=>ids.has(p.folder_id));
      if(!await confirmDelete('永久删除“'+root.name+'”及其中 '+posts.length+' 篇帖子、'+(ordered.length-1)+' 个子文件夹？此操作不能撤销。'))return;
      let removed=0;try{
        for(const title of posts){const p=await A.post(title.id);if(!p)continue;if(!ids.has(p.folder_id))throw Error('帖子已被移动，请刷新后重试。');await A.rpc('blog_file_operation',{action:'delete_post',target_id:p.id,expected_version:p.version},true);removed++;}
        for(const f of ordered.reverse()){await A.rpc('blog_file_operation',{action:'delete_folder',target_id:f.id,expected_version:f.version},true);removed++;}
      }catch(error){throw Error((removed?'已删除 '+removed+' 项，其余内容保留。':'')+error.message);}
      modal.close();location.hash=spaceURL(mine,root.parent_id?{folder:root.parent_id}:{});await render();toast('文件夹已删除。');
    },scope);
  }

  function movePost(post,folders){popup(`<form><h2>移动帖子</h2><label>所在文件夹<select name="folder">${folderOptions(folders,post.folder_id)}</select></label><div class="dialog-actions"><button class="primary">保存</button><button type="button" data-close>取消</button></div></form>`);modal.querySelector('form').onsubmit=e=>{e.preventDefault();const folder=e.currentTarget.elements.folder.value||null;job(async()=>{await C.save({id:post.id,folder_id:folder},post.version);modal.close();await render();toast('帖子已移动。');},modal);};}

  const draftPrefix=()=> 'cai-drafts:'+who()+':';
  function backup(){clearTimeout(backupTimer);if(!editing||!dirty||!who())return;try{localStorage.setItem(draftPrefix()+editing.id,JSON.stringify({post:editing,at:Date.now()}));const state=main.querySelector('#save-state');if(state)state.textContent='已备份到此设备 · 尚未发布';}catch{toast('设备草稿保存失败，请保存云端草稿或导出。',true);}}
  function backups(){try{return Object.keys(localStorage).filter(k=>k.startsWith(draftPrefix())).map(k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}}).filter(x=>x?.post&&boards[x.post.collection]).sort((a,b)=>b.at-a.at);}catch{return [];}}
  function removeBackup(id){try{localStorage.removeItem(draftPrefix()+id);}catch{}}
  function writeNew(board='knowledge',folder=null){if(!requireLogin(()=>writeNew(board,folder)))return;location.hash='#/write?'+new URLSearchParams({board,...(folder?{folder}:{})});}
  async function editor(id,query,ticket,recovered=null){
    if(!requireLogin(()=>render())){show('写帖子','<p>登录后可在自己的空间写帖子。</p>');return;}
    if(!mine)mine=await A.ownProfile();
    let post=recovered||(id?await A.post(id):{id:crypto.randomUUID(),owner_id:who(),collection:boards[query.get('board')]?query.get('board'):'knowledge',folder_id:query.get('folder')||null,title:'',summary:'',body:'',metadata:{},published:false});
    if(!post||post.owner_id&&post.owner_id!==who())throw Error('你只能编辑自己的帖子。');post={...post,owner_id:who()};
    const [allFolders,treeTitles]=await Promise.all([A.folders(who()),A.titles(who())]);const folders=allFolders.filter(f=>f.collection===post.collection);if(ticket!==epoch)return;if(post.folder_id&&!folders.some(f=>f.id===post.folder_id))post.folder_id=null;
    editing=structuredClone(post);dirty=!!recovered;
    const meta=post.metadata||{},project=post.collection==='projects',tool=post.collection==='tools';
    show(post.version?'编辑帖子':'写帖子',`<section class="inline-editor"><form id="community-editor"><div class="editor-top"><h1>${post.version?'编辑帖子':'写帖子'}</h1><div class="community-actions"><button type="button" data-cancel>返回浏览</button><button type="button" data-import>导入 Markdown</button><input type="file" id="markdown-upload" accept=".md,.markdown,text/markdown" hidden><button type="button" data-export>导出 Markdown</button></div></div><p class="editor-path">${E(boards[post.collection])} / ${E(folders.find(f=>f.id===post.folder_id)?.name||'栏目根目录')}</p><label class="title-field"><span class="sr-only">标题</span><input placeholder="给帖子起一个标题" name="title" value="${E(post.title)}" maxlength="200" required></label><details class="editor-metadata"><summary>发布设置<span>文件夹、摘要与标签</span></summary><div class="editor-options"><label>所在文件夹<select name="folder">${folderOptions(folders,post.folder_id)}</select></label><label>摘要<input name="summary" value="${E(post.summary)}" maxlength="500"></label></div><label>标签<input name="tags" value="${E((meta.tags||[]).join('，'))}" maxlength="500" placeholder="用逗号分隔"></label></details>${project?`<div class="editor-options"><label>GitHub 地址<input name="github" type="url" pattern="https?://.*" value="${E(meta.github||'')}"></label><label>演示地址<input name="demoURL" type="url" pattern="https?://.*" value="${E(typeof meta.demo==='string'?meta.demo:'')}"></label></div>`:''}${tool?`<label>工具链接<input name="toolURL" type="url" pattern="https?://.*" value="${E(meta.url||'')}" required></label>`:''}<div class="writing-controls"><div class="editor-tabs"><button type="button" data-mode="edit" aria-pressed="true">编辑</button><button type="button" data-mode="split">对照</button><button type="button" data-mode="preview">预览</button></div><span id="word-count">${post.body.length} 字</span></div><div class="format-toolbar"><button type="button" data-format="heading">H2</button><button type="button" data-format="bold">加粗</button><button type="button" data-format="list">列表</button><button type="button" data-format="code">代码</button><button type="button" data-image>上传图片</button><input type="file" id="image-upload" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></div>${post.collection==='photos'?'<p class="field-help">上传图片并配上说明，发布后会出现在相册栏目。</p>':''}<div class="writing-surface" data-mode="edit"><label id="editor-body-label"><span class="sr-only">正文</span><textarea name="body" placeholder="从这里开始写作，支持 Markdown 和粘贴图片…" maxlength="200000" spellcheck="false">${E(post.body)}</textarea></label><div id="editor-preview" class="article-body" hidden></div></div><div class="publish-bar"><span id="save-state">${recovered?'已恢复设备草稿':'尚未修改'}</span><button type="button" data-draft>${post.published?'撤回为草稿':'保存草稿'}</button><button class="primary" type="submit">${post.published?'更新发布':'发布'}</button></div></form></section>`,documentTree(mine,allFolders,treeTitles,post.folder_id,post.id));
    bindDocumentTree(mine,allFolders,treeTitles,post.folder_id);main.classList.add('is-writing');navigation(mine,folders,post.collection);
    const form=main.querySelector('#community-editor'),area=form.elements.body,preview=main.querySelector('#editor-preview');
    form.addEventListener('invalid',e=>{const group=e.target.closest('details');if(group)group.open=true;},true);
    const sync=()=>{editing={...editing,title:form.elements.title.value,summary:form.elements.summary.value,body:area.value,folder_id:form.elements.folder.value||null,metadata:{...editing.metadata,tags:form.elements.tags.value.split(/[,，]/).map(x=>x.trim()).filter(Boolean)}};if(project){editing.metadata.github=form.elements.github.value.trim();editing.metadata.demo=form.elements.demoURL.value.trim()||(meta.demo===true?true:'');}if(tool)editing.metadata.url=form.elements.toolURL.value.trim();editing.metadata.cover=editing.body.match(/!\[[^\]]*\]\(media:([\w-]+\/[\w.-]+)\)/)?.[1]||'';dirty=true;main.querySelector('#word-count').textContent=area.value.replace(/\s/g,'').length+' 字';main.querySelector('#save-state').textContent='正在备份…';clearTimeout(backupTimer);backupTimer=setTimeout(backup,600);if(!preview.hidden){preview.innerHTML=M.render(editing.body);C.hydrateImages(preview,true);}};
    form.addEventListener('input',sync);
    form.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{const mode=b.dataset.mode;form.querySelector('.writing-surface').dataset.mode=mode;main.querySelector('#editor-body-label').hidden=mode==='preview';preview.hidden=mode==='edit';preview.innerHTML=M.render(editing.body);C.hydrateImages(preview,true);form.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));});
    form.querySelectorAll('[data-format]').forEach(b=>b.onclick=()=>{const selected=area.value.slice(area.selectionStart,area.selectionEnd),formats={heading:'## '+(selected||'标题'),bold:'**'+(selected||'文字')+'**',list:'- '+(selected||'列表项'),code:'\n```\n'+(selected||'代码')+'\n```\n'};area.setRangeText(formats[b.dataset.format],area.selectionStart,area.selectionEnd,'select');area.focus();sync();});
    const upload=async files=>{if(!files.length)return;await job(async()=>{for(const file of files){const path=await A.upload(file);area.setRangeText('\n!['+file.name.replace(/[\[\]\r\n]/g,'')+'](media:'+path+')\n',area.selectionStart,area.selectionEnd,'end');sync();backup();}toast('图片已压缩并插入。');},form);};
    form.querySelector('[data-image]').onclick=()=>form.querySelector('#image-upload').click();form.querySelector('#image-upload').onchange=e=>{const files=[...e.target.files];e.target.value='';upload(files);};area.onpaste=e=>{const files=[...(e.clipboardData?.files||[])].filter(f=>f.type.startsWith('image/'));if(files.length){e.preventDefault();upload(files);}};
    const save=published=>{form.querySelectorAll('details').forEach(el=>{if(el.querySelector(':invalid'))el.open=true;});if(!form.reportValidity())return;sync();if(!editing.title.trim()){toast('请填写标题。',true);return;}if(editing.published&&!published&&!confirm('撤回公开帖子并保存为草稿？'))return;job(async()=>{const payload={id:editing.id,owner_id:who(),collection:editing.collection,folder_id:editing.folder_id,title:editing.title.trim(),summary:editing.summary,body:editing.body,metadata:editing.metadata,published};const saved=await C.save(payload,editing.version);removeBackup(editing.id);clearTimeout(backupTimer);editing=null;dirty=false;location.hash=postURL(saved.id);toast(published?'帖子已发布。':'草稿已保存。');},form);};
    form.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();save(!!post.published);}});
    form.onsubmit=e=>{e.preventDefault();save(true);};form.querySelector('[data-draft]').onclick=()=>save(false);
    form.querySelector('[data-cancel]').onclick=()=>{location.hash=post.version?postURL(post.id):spaceURL(mine,{board:post.collection});};
    form.querySelector('[data-import]').onclick=()=>form.querySelector('#markdown-upload').click();
    form.querySelector('#markdown-upload').onchange=e=>{const file=e.target.files[0];e.target.value='';if(!file)return;job(async()=>{const imported=await M.readFile(file);if((area.value.trim()||form.elements.title.value.trim())&&!confirm('用导入的 Markdown 替换当前标题和正文？'))return;form.elements.title.value=imported.title;area.value=imported.body;sync();backup();toast('已导入，可预览后保存或发布。');},form);};
    form.querySelector('[data-export]').onclick=()=>{sync();const url=URL.createObjectURL(new Blob(['# '+editing.title+'\n\n'+editing.body],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=(editing.title||'帖子').replace(/[<>:"/\\|?*]/g,'_')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  }
  async function settings(ticket){
    if(!requireLogin(()=>render())){show('个人资料','<p>请先登录。</p>');return;}
    const [profile,usage,media]=await Promise.all([A.ownProfile(),A.usage(),A.media()]);if(ticket!==epoch)return;mine=profile;
    const mb=n=>n<1048576?(n/1024).toFixed(1)+' KB':(n/1048576).toFixed(2)+' MB',drafts=backups();
    show('个人资料',`<section class="profile-page"><header class="profile-page-head"><h1>个人资料</h1><a href="${spaceURL(profile)}">查看我的空间 ↗</a></header><form id="profile-form" class="settings-form profile-sheet"><div class="profile-identity">${avatar(profile)}<div><strong>${E(displayName(profile))}</strong><span>你的公开资料</span></div></div><label>昵称<input name="display_name" autocomplete="nickname" value="${E(displayName(profile))}" minlength="2" maxlength="30" required><small class="field-help">显示在空间、帖子和评论中。</small></label><label>个人介绍<textarea name="bio" maxlength="500">${E(profile.bio)}</textarea></label><label>个人链接<input name="website" type="url" pattern="https?://.*" value="${E(profile.website)}"></label><div class="profile-save"><button class="forum-primary">保存修改</button></div></form><details class="profile-management"><summary>空间管理<span>用量、设备草稿与图片</span></summary><section class="usage-panel"><h2>空间用量</h2><p>帖子 ${usage.posts} / ${usage.postLimit}</p><p>文字 ${mb(usage.textBytes)} / ${mb(usage.textLimit)}</p><p>图片 ${mb(usage.imageBytes)} / ${mb(usage.imageLimit)}</p></section><section><h2>设备草稿</h2>${drafts.map(d=>`<div class="draft-row"><span>${E(d.post.title||'未命名帖子')} · ${date(d.at)}</span><button data-restore="${E(d.post.id)}">恢复</button><button data-drop-backup="${E(d.post.id)}">删除备份</button></div>`).join('')||'<p class="quiet-empty">没有设备草稿</p>'}</section><section><h2>图片管理</h2><p class="field-help">正文引用的图片不能删除。未上传成功的占用也可在此清理。</p><div class="media-grid">${media.map(m=>`<div><img data-media="${E(m.path)}" alt="已上传图片" loading="lazy"><small>${mb(m.bytes)}</small><button data-remove-image="${E(m.path)}">删除</button></div>`).join('')}</div></section></details></section>`);navigation();
    C.hydrateImages(main,true);
    main.querySelector('#profile-form').onsubmit=e=>{e.preventDefault();const f=e.currentTarget;job(async()=>{const name=f.elements.display_name.value.trim();if(name.length<2||name.length>30)throw Error('昵称需要 2–30 个字符。');await A.saveProfile({display_name:name,bio:f.elements.bio.value.trim(),website:f.elements.website.value.trim()});mine=await A.ownProfile();refreshAccount();await render();toast('个人资料已更新。');},f);};
    main.querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>job(async()=>{let p=drafts.find(d=>d.post.id===b.dataset.restore).post;const current=p.version?await A.post(p.id):null;if(p.version&&(!current||current.version!==p.version)){p={...p,id:crypto.randomUUID(),version:undefined,published:false};toast('云端版本已变化，备份将恢复为新帖子。');}history.replaceState(null,'','#/write?board='+enc(p.collection));lastHash=location.hash;await editor(null,new URLSearchParams(),++epoch,p);}));
    main.querySelectorAll('[data-drop-backup]').forEach(b=>b.onclick=async()=>{if(await confirmDelete('删除这份设备备份？')){removeBackup(b.dataset.dropBackup);render();}});
    main.querySelectorAll('[data-remove-image]').forEach(b=>b.onclick=async()=>{if(await confirmDelete('删除这张未被帖子引用的图片？'))job(async()=>{await A.removeImage(b.dataset.removeImage);await render();toast('图片占用已清理。');});});
  }
  async function render(){
    const ticket=++epoch;main.setAttribute('aria-busy','true');const {parts:[page,id],query}=route();
    const authorRoute=['u','post','article','project','interview','essay','write','edit','folder','space','moments'].includes(page);
    if(!authorRoute)navigation();
    else if(page==='u'&&authorNavProfile?.username===id)navigation(authorNavProfile);

    try{
      if(['post','article','project','interview','essay'].includes(page))await article(id,ticket);
      else if(page==='u'){
        const profile=await A.profile(id);if(ticket!==epoch)return;if(!profile)throw Error('作者空间不存在。');
        if(query.get('view')==='guestbook'){show('作者留言',`<h1>给 ${E(displayName(profile))} 留言</h1><section id="comments" class="comments-section"></section>`,profileCard(profile,profile.user_id===who()));navigation(profile);await comments({spaceId:profile.user_id,ownerId:profile.user_id},main.querySelector('#comments'),ticket);}
        else if(query.get('view')==='moments')await momentPage(query,ticket,profile);
        else await authorFiles(query,profile,ticket);
      }else if(page==='write'||page==='edit')await editor(page==='edit'?id:null,query,ticket);
      else if(page==='space'||page==='moments'){
        if(who()){const profile=mine||await A.ownProfile();if(ticket!==epoch)return;location.replace(spaceURL(profile,page==='moments'?{view:'moments'}:{}));}
        else{show('我的空间','<section class="feed-empty"><h1>我的空间</h1><button class="forum-primary" data-space-login>登录后进入空间</button></section>');main.querySelector('[data-space-login]').onclick=()=>Auth.open();Auth.open();}
      }
      else if(page==='settings')await settings(ticket);
      else if(page==='guestbook'){show('留言','<h1>留言</h1><section id="comments" class="comments-section"></section>');await comments({},main.querySelector('#comments'),ticket);}
      else if(page==='folder'){
        const rows=await C.request('/rest/v1/blog_folders?select=*&id=eq.'+enc(id)+'&limit=1',{auth:!!who()});if(!rows[0])throw Error('合集不存在或不可访问。');const profile=await A.profile(rows[0].owner_id,'user_id');if(ticket!==epoch)return;location.replace(spaceURL(profile,{board:rows[0].collection,folder:id}));
      }else if(page==='albums'){location.replace('#/photos');}else if(page==='resume'){const profile=await A.profile(siteOwner,'user_id');if(!profile)throw Error('作者资料尚未配置。');if(ticket!==epoch)return;show('关于作者',`<h1>${E(displayName(profile))}</h1><p>${E(profile.bio)}</p><a href="${spaceURL(profile,{board:'projects'})}">作品集</a>`,profileCard(profile));}
      else if(page==='career'){show('职业合集','<h1>职业合集</h1><div class="folder-chips"><a href="#/projects">作品集</a><a href="#/interviews">面试经历</a></div>');}
      else if(!page||page==='home'){
        main.classList.remove('is-writing','is-reading','is-documents');document.body.classList.add('is-home');document.title='主页 · CAI';
        main.innerHTML='<div class="home-art" role="img" aria-label="山峦风景画"></div>';
      }else if(page==='posts'||boards[page])await listing(query,null,boards[page]?page:null,ticket);
      else throw Error('页面不存在。');
    }catch(e){if(ticket===epoch)errorPage(e);}finally{if(ticket===epoch)main.removeAttribute('aria-busy');}
  }
  window.CommunityApp={user:null,render,
    async signedIn(user){this.user=user;mine=await A.ownProfile();await A.initializeSpace();refreshAccount();await render();},
    async signedOut(){this.user=null;mine=null;editing=null;dirty=false;clearTimeout(backupTimer);refreshAccount();document.getElementById('search-results').innerHTML='';await render();}
  };
  const accountWrap=document.createElement('div');accountWrap.className='account-dropdown';account.before(accountWrap);accountWrap.append(account);
  const accountPanel=document.createElement('div');accountPanel.id='account-popover';accountPanel.className='account-popover';accountPanel.hidden=true;accountPanel.setAttribute('aria-label','账号操作');accountWrap.append(accountPanel);account.setAttribute('aria-controls',accountPanel.id);account.setAttribute('aria-expanded','false');
  function setAccountOpen(open){accountPanel.hidden=!open;account.setAttribute('aria-expanded',String(open));}
  function refreshAccount(){
    account.innerHTML=who()?avatar(mine):'<span class="user-avatar" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0 1 16 0v3"/></svg></span>';
    account.setAttribute('aria-label',who()?displayName(mine)+'的账号菜单':'访客账号菜单');account.removeAttribute('title');
    accountPanel.innerHTML='<button type="button" data-account-profile>个人资料</button><button type="button" data-account-space>我的空间</button><button type="button" data-account-auth>'+ (who()?'登出':'登录')+'</button>';setAccountOpen(false);
    const visit=target=>{setAccountOpen(false);if(who())location.hash=target;else Auth.open(()=>{location.hash=target;});};
    accountPanel.querySelector('[data-account-profile]').onclick=()=>visit('#/settings');accountPanel.querySelector('[data-account-space]').onclick=()=>visit('#/space');
    accountPanel.querySelector('[data-account-auth]').onclick=()=>{if(working||Auth.isBusy())return;setAccountOpen(false);if(!who()){Auth.open();return;}if(dirty&&!confirm('编辑内容尚未发布，备份后退出？'))return;backup();job(async()=>{await Auth.logout();},accountWrap);};
  }
  account.onclick=()=>setAccountOpen(accountPanel.hidden);
  accountWrap.onpointerenter=e=>{if(e.pointerType==='mouse')setAccountOpen(true);};accountWrap.onpointerleave=e=>{if(e.pointerType==='mouse')setAccountOpen(false);};
  accountWrap.onfocusin=e=>{if(e.target.matches(':focus-visible'))setAccountOpen(true);};accountWrap.onfocusout=e=>{if(!accountWrap.contains(e.relatedTarget))setAccountOpen(false);};
  accountWrap.onkeydown=e=>{if(e.key==='Escape'){setAccountOpen(false);account.focus();}};
  document.addEventListener('click',e=>{if(!accountWrap.contains(e.target))setAccountOpen(false);});refreshAccount();
  const search=document.getElementById('search-input'),results=document.getElementById('search-results');let searchTimer;
  function hideSearch(){results.hidden=true;search.setAttribute('aria-expanded','false');searchEpoch++;}
  search.oninput=()=>{clearTimeout(searchTimer);const value=search.value.trim(),ticket=++searchEpoch;if(!value){hideSearch();return;}searchTimer=setTimeout(async()=>{try{const data=await A.feed({search:value});if(ticket!==searchEpoch)return;results.innerHTML=data.items.slice(0,8).map(p=>`<a class="search-result" href="${postURL(p.id)}"><strong>${E(p.title)}</strong><p>${E(displayName(p))} · ${E(boards[p.collection])}</p></a>`).join('')||'<p class="search-hint">没有匹配的帖子</p>';results.hidden=false;search.setAttribute('aria-expanded','true');}catch(e){if(ticket===searchEpoch){results.innerHTML='<p class="search-hint">搜索暂时不可用，请重试。</p>';results.hidden=false;}}},250);};
  document.getElementById('header-search').onsubmit=e=>{e.preventDefault();hideSearch();location.hash='#/posts?q='+enc(search.value.trim());};results.onclick=e=>{if(e.target.closest('a'))hideSearch();};
  document.addEventListener('click',e=>{if(!e.target.closest('#header-search'))hideSearch();});document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSearch();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();search.focus();}});
  addEventListener('hashchange',()=>{if(working||(dirty&&!confirm('离开编辑？尚未发布的内容会保留在设备草稿中。'))){history.replaceState(null,'',lastHash||'#/');return;}backup();editing=null;dirty=false;rememberGlobal(location.hash||'#/');lastHash=location.hash;render();scrollTo(0,0);});
  addEventListener('beforeunload',e=>{backup();if(dirty||working){e.preventDefault();e.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.hidden)backup();});
  render();
})();
