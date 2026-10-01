(() => {
  'use strict';
  const D=window.Folders.prepare(window.BLOG), F=window.Folders, main=document.getElementById('main');
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=u=>typeof u==='string'&&(/^(https?:\/\/|#\/)/.test(u))?E(u):'#/';
  const labels={knowledge:'技术博客',projects:'作品集合',interviews:'面试经历',career:'职业合集',essays:'随笔'};
  const tags=arr=>(arr||[]).map(t=>`<span class="tag">${E(t)}</span>`).join('');
  const badge=a=>a.published===false?'<span class="badge demo">草稿</span>':`<span class="badge ${a.demo===true?'demo':''}">${E(a.demo===true?'示例模板':a.kind||a.status||'帖子')}</span>`;
  const empty=(title='还没有匹配的内容',text='换个关键词或筛选条件试试。')=>`<div class="empty"><h2>${E(title)}</h2><p>${E(text)}</p></div>`;
  const crumb=items=>`<div class="breadcrumb"><a href="#/">首页</a>${items.map(([name,url])=>`<span>/</span>${url?`<a href="${safeURL(url)}">${E(name)}</a>`:`<span>${E(name)}</span>`}`).join('')}</div>`;
  const head=(en,title,desc)=>`<div class="page-head"><h1>${E(title)}</h1></div>`;
  const routeFor=(type,id)=>`#/${type}/${encodeURIComponent(id)}`;
  const entry=(a,type)=>`<a class="entry file-entry" href="${routeFor(type,a.id)}"><span class="file-symbol" aria-hidden="true"></span><div class="file-content"><h3>${E(a.title)}</h3><p>${E(a.summary)}</p><div class="entry-top"><span>${E(a.category||a.company||a.status||'帖子')}</span><span>${E(a.date)}</span>${a.demo===true||a.published===false?badge(a):''}</div></div><span class="file-open" aria-hidden="true">→</span></a>`;
  const navNodes=nodes=>nodes.flatMap(n=>[n,...navNodes(n.children||[])]);
  const containsSection=(node,key)=>node.id===key||(node.children||[]).some(n=>containsSection(n,key));
  function navigationTree(nodes){return nodes.map(n=>{
    const collection=n.collection,seen=new Set();
    function branch(parent=null){return [...F.children(D,collection,parent).filter(f=>!seen.has(f.id)).map(f=>{seen.add(f.id);return {id:f.id,title:f.name,href:folderURL(f),children:branch(f.id)};}),...F.posts(D,collection,parent).filter(p=>p.published!==false).map(p=>({id:p.id,title:p.title,href:routeFor(F.types[collection],p.id)}))];}
    return {...n,children:[...navigationTree(n.children||[]),...(F.keys[collection]?branch():[])]};
  });}
  function navigationMarkup(nodes,selected){
    const tree=navigationTree(nodes);
    const leaves=items=>`<ul class="mega-tree">${items.map(n=>`<li>${n.children?.length?`<details open><summary><span aria-hidden="true">▱</span><a href="${safeURL(n.href)}">${E(n.title)}</a></summary>${leaves(n.children)}</details>`:`<a href="${safeURL(n.href)}"><span aria-hidden="true">·</span>${E(n.title)}</a>`}</li>`).join('')}</ul>`;
    return `<div class="mega-tabs">${tree.map(n=>`<a class="mega-tab ${containsSection(n,selected)?'active':''}" href="${safeURL(n.href)}" ${n.id===selected?'aria-current="page"':''}>${E(n.title)}</a>`).join('')}<button type="button" id="mega-toggle" aria-label="展开全部栏目" aria-controls="mega-panel" aria-expanded="false">⌄</button></div><div id="mega-panel" class="mega-panel" hidden><div class="mega-grid">${tree.map(n=>`<section class="mega-column"><h2><a href="${safeURL(n.href)}">${E(n.title)}</a></h2>${n.children.length?leaves(n.children):'<p class="mega-empty">暂无子项</p>'}</section>`).join('')}</div></div>`;
  }
  function setupNavigation(){
    const nav=document.getElementById('nav'),panel=document.getElementById('mega-panel'),toggle=document.getElementById('mega-toggle');
    const set=open=>{panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));nav.classList.toggle('mega-open',open);};
    nav.onpointerenter=e=>{if(e.pointerType==='mouse')set(true);};
    nav.onpointerleave=e=>{if(e.pointerType==='mouse')set(false);};
    nav.megaSet=set;
    if(!nav.megaFocusBound){
      nav.addEventListener('focusin',e=>{if(e.target.id!=='mega-toggle')nav.megaSet(true);});
      nav.addEventListener('focusout',e=>{if(!nav.contains(e.relatedTarget))nav.megaSet(false);});
      nav.megaFocusBound=true;
    }
    toggle.onpointerdown=e=>e.preventDefault();
    toggle.onclick=()=>set(panel.hidden);
    nav.onkeydown=e=>{if(e.key==='Escape'){set(false);e.stopPropagation();}};
    nav.onclick=e=>{if(e.target.closest('a'))set(false);};
  }
  function sectionPlaceholder(title,text){return crumb([[title]])+head('',title,'')+empty(text,'');}
  function folderPage(node){return crumb([[node.title]])+head('',node.title,'')+`<section class="file-list"><div class="list-heading"><span>版块</span><span>${node.children.length} 项</span></div>${node.children.map(n=>`<a class="folder-list-row" href="${safeURL(n.href)}"><span class="folder-symbol" aria-hidden="true"></span><span>${E(n.title)}</span><span class="folder-row-count">›</span></a>`).join('')}</section>`;}
  const publicDocs=()=>allDocs().filter(p=>p.published!==false).sort((a,b)=>b.date.localeCompare(a.date));
  function profileCard(){return `<section class="profile-card"><div class="profile-cover"></div><div class="profile-avatar" aria-hidden="true">C</div><h2>${E(D.profile.name)}</h2><div class="profile-stats"><a href="#/knowledge"><strong>${publicDocs().length}</strong><span>帖子</span></a><a href="#/albums"><strong>${D.folders.length}</strong><span>合集</span></a><a href="#/resume"><strong>↗</strong><span>简历</span></a></div><a class="profile-github" href="${safeURL(D.profile.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a></section>`;}
  function home(){
    const posts=publicDocs();
    return `<section class="reference-hero"><div class="hero-heading"><h1>CAI</h1><div class="hero-links"><a href="#/knowledge">技术博客</a><a href="#/career">职业合集</a><a href="#/essays">随笔</a></div></div><button type="button" class="hero-scroll" id="browse-posts" aria-label="浏览帖子">⌄</button><svg class="hero-wave" viewBox="0 0 1440 100" preserveAspectRatio="none" aria-hidden="true"><path d="M0 35 Q360 100 720 40 T1440 45 V100 H0Z" fill="currentColor" opacity=".3"/><path d="M0 55 Q360 10 720 65 T1440 35 V100 H0Z" fill="currentColor" opacity=".5"/><path d="M0 70 Q360 35 720 72 T1440 65 V100 H0Z" fill="currentColor"/></svg></section><div class="reference-layout" id="home-posts"><section class="reference-feed"><div class="feed-heading"><h2>最新帖子</h2><a href="#/knowledge">查看全部 →</a></div>${posts.map((p,i)=>`<a class="picture-post ${i%2?'picture-reverse':''}" href="${routeFor(p.type,p.id)}"><div class="post-cover cover-${i%4}" aria-hidden="true"><span>${E(p.category||p.collection)}</span></div><div class="picture-copy"><h2>${E(p.title)}</h2><div class="picture-meta">${E(p.date)} · ${E(p.collection)}${p.demo===true?' · 示例模板':''}</div><p>${E(p.summary)}</p><span class="continue-reading">阅读全文 →</span></div></a>`).join('')||empty('还没有帖子','')}</section><aside class="reference-sidebar">${profileCard()}<section class="side-card"><h2>版块</h2>${['knowledge','projects','interviews','essays'].map(k=>`<a href="#/${k}">${E(labels[k])}<span>›</span></a>`).join('')}</section><section class="side-card"><h2>合集</h2>${D.folders.filter(f=>!f.parent_id).map(f=>`<a href="${folderURL(f)}">${E(f.name)}<span>›</span></a>`).join('')||'<p>暂无合集</p>'}</section></aside></div>`;
  }
  const folderURL=f=>'#/folder/'+encodeURIComponent(f.id);
  function directory(collection,id=null){
    if(!F.keys[collection])return notFound();
    const current=id?D.folders.find(f=>f.id===id&&f.collection===collection):null;
    if(id&&!current)return notFound();
    const params=new URLSearchParams(location.hash.split('?')[1]||''),author=window.InlineWriter?.isAuthor()===true;
    const view=params.get('view')==='albums'?'albums':params.get('view')==='drafts'&&author?'drafts':'posts';
    const query=(params.get('q')||'').trim(),base=id?folderURL(current):'#/'+collection;
    const folders=F.children(D,collection,id),all=D[F.keys[collection]];
    const publicPosts=all.filter(p=>p.published!==false);
    let posts=all.filter(p=>(!id||p.folder_id===id)&&(view==='drafts'?p.published===false:p.published!==false)&&(!query||(p.title+' '+(p.summary||'')).toLowerCase().includes(query.toLowerCase()))).sort((a,b)=>b.date.localeCompare(a.date)||a.title.localeCompare(b.title));
    const pages=Math.max(1,Math.ceil(posts.length/20)),page=Math.min(pages,Math.max(1,Number(params.get('page'))||1));
    const trail=F.ancestors(D,id).map(f=>[f.name,f.id===id?null:folderURL(f)]);
    const albumCards=folders.map(f=>`<a class="album-card" href="${folderURL(f)}"><span class="album-icon" aria-hidden="true">▤</span><strong>${E(f.name)}</strong><span>${publicPosts.filter(p=>p.folder_id===f.id).length} 篇帖子</span></a>`).join('');
    return crumb([[labels[collection],id?'#/'+collection:null],...trail])+`<section class="board-head"><div><span class="board-kicker">${id?'帖子合集':'讨论版块'}</span><h1>${E(current?.name||labels[collection])}</h1><p>${id?publicPosts.filter(p=>p.folder_id===id).length:publicPosts.length} 篇帖子</p></div><button type="button" class="forum-primary" data-compose>发帖</button></section><nav class="board-tabs" aria-label="帖子筛选"><a href="${base}" ${view==='posts'?'aria-current="page"':''}>${id?'合集帖子':'全部帖子'}</a><a href="${base}?view=albums" ${view==='albums'?'aria-current="page"':''}>${id?'子合集':'合集'}</a>${author?`<a href="${base}?view=drafts" ${view==='drafts'?'aria-current="page"':''}>草稿</a>`:''}</nav>${view==='albums'?`<section class="album-panel"><div class="album-heading"><h2>${id?'子合集':'全部合集'}</h2>${author?'<button type="button" class="forum-secondary" data-new-album>新建合集</button>':''}</div><div class="album-grid">${albumCards||'<p class="folder-empty">还没有合集</p>'}</div></section>`:`<section class="forum-feed"><form id="board-search" class="board-search"><label class="sr-only" for="board-query">搜索当前版块</label><input id="board-query" name="q" value="${E(query)}" placeholder="搜索帖子标题"><button type="submit">搜索</button><span>最新发布 · ${posts.length} 篇</span></form>${posts.slice((page-1)*20,page*20).map(p=>entry(p,F.types[collection])).join('')||empty(view==='drafts'?'还没有草稿':'还没有帖子','')}${pages>1?`<nav class="forum-pagination" aria-label="分页">${Array.from({length:pages},(_,i)=>`<a href="${base}?view=${view}&q=${encodeURIComponent(query)}&page=${i+1}" ${i+1===page?'aria-current="page"':''}>${i+1}</a>`).join('')}</nav>`:''}</section>`}`;
  }
  function albumIndex(){return crumb([['合集']])+head('','合集','')+`<div class="album-grid">${D.folders.filter(f=>!f.parent_id).map(f=>`<a class="album-card" href="${folderURL(f)}"><span class="album-icon" aria-hidden="true">▤</span><strong>${E(f.name)}</strong><span>${E(labels[f.collection])} · ${(D[F.keys[f.collection]]||[]).filter(p=>p.folder_id===f.id&&p.published!==false).length} 篇帖子</span></a>`).join('')||empty('还没有合集','')}</div>`;}
  function knowledge(category='全部'){
    if(category==='全部')return directory('knowledge');
    const folder=D.folders.find(f=>f.collection==='knowledge'&&!f.parent_id&&f.name===category);
    return folder?directory('knowledge',folder.id):notFound();
  }
  function fileTree(page,id){
    const selected=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    const activePost=allDocs().find(a=>a.type===page&&a.id===id),activeFolder=page==='folder'?id:activePost?.folder_id;
    const albums=(parent=null,depth=0)=>F.children(D,selected,parent).map(f=>`<li style="--album-depth:${depth}"><a href="${folderURL(f)}" ${f.id===activeFolder?'aria-current="page"':''}><span>▤</span>${E(f.name)}</a>${F.children(D,selected,f.id).length?`<ul>${albums(f.id,depth+1)}</ul>`:''}</li>`).join('');
    return `<aside class="file-tree board-sidebar" id="directory">${profileCard()}<nav aria-label="版块导航"><h2>版块</h2>${['knowledge','projects','interviews','essays'].map(k=>`<a class="board-link" href="#/${k}" ${k===selected?'aria-current="page"':''}>${E(labels[k])}</a>`).join('')}</nav>${F.keys[selected]?`<nav class="album-navigation" aria-label="合集导航"><div class="album-heading"><h2>合集</h2></div><ul>${albums()||'<li class="folder-empty">暂无合集</li>'}</ul><a class="all-albums" href="#/${selected}?view=albums">查看全部合集 →</a></nav>`:''}</aside>`;
  }
  const essays=()=>directory('essays'),projects=()=>directory('projects');
  function options(values,all){return `<option value="">${E(all)}</option>`+[...new Set(values.filter(Boolean))].map(v=>`<option value="${E(v)}">${E(v)}</option>`).join('');}
  const interviews=()=>directory('interviews');
  const facts=items=>`<dl class="facts">${items.map(([k,v])=>`<div class="fact"><dt>${E(k)}</dt><dd>${E(v||'待补充')}</dd></div>`).join('')}</dl>`;
  const allDocs=()=>[...D.articles.map(x=>({...x,type:'article',collection:'技术博客'})),...D.projects.map(x=>({...x,type:'project',collection:'作品集合'})),...D.interviews.map(x=>({...x,type:'interview',collection:'面试经历'})),...D.essays.map(x=>({...x,type:'essay',collection:'随笔'}))];
  function article(type,id){
    const a=allDocs().find(x=>x.id===id&&x.type===type);if(!a)return notFound();
    const parent={article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[type];
    const sections=a.sections||[];
    const body=typeof a.markdown==='string'?window.BlogMarkdown.render(a.markdown):sections.map((s,i)=>`<section id="section-${i}"><h2>${E(s.title)}</h2>${s.text?`<p>${E(s.text)}</p>`:''}${s.list?`<ul>${s.list.map(x=>`<li>${E(x)}</li>`).join('')}</ul>`:''}${s.code?`<pre><code>${E(s.code)}</code></pre>`:''}</section>`).join('');
    const related=(a.related||[]).map(ref=>{const [type,id]=ref.split('/');return allDocs().find(x=>x.id===id&&x.type===type);}).filter(Boolean);
    return crumb([[a.collection,'#/'+parent],...F.ancestors(D,a.folder_id).map(f=>[f.name,folderURL(f)]),[a.title]])+`<div class="article-layout"><article class="article"><div class="entry-top">${badge(a)}<span>${E(a.date)}</span><span>${Math.max(1,Math.ceil((a.markdown?.length||JSON.stringify(sections).length)/450))} 分钟阅读</span></div><h1 style="margin-top:20px">${E(a.title)}</h1><p class="lead">${E(a.summary)}</p><div class="entry-meta">${tags(a.tags)}</div>${a.demo===true?'<div class="notice">示例内容，仅展示记录方式；不代表真实面试或个人经历。</div>':''}${type==='interview'?facts([['企业',a.company],['岗位',a.role],['轮次',a.round],['来源',a.source]]):''}${type==='project'?`<div class="hero-actions">${a.github?`<a class="button" href="${safeURL(a.github)}" target="_blank" rel="noopener noreferrer">查看 GitHub ↗</a>`:''}${typeof a.demo === 'string'?`<a class="button secondary" href="${safeURL(a.demo)}">打开演示 →</a>`:''}</div>`:''}<div class="article-body">${body}${a.links?.length?`<section id="references"><h2>参考资料</h2><ul>${a.links.map(l=>`<li><a href="${safeURL(l.url)}" target="_blank" rel="noopener noreferrer">${E(l.label)} ↗</a></li>`).join('')}</ul></section>`:''}</div>${related.length?`<div class="related"><h2>继续翻阅</h2>${related.map(r=>`<a href="${routeFor(r.type,r.id)}">${E(r.collection)} / ${E(r.title)} →</a>`).join('')}</div>`:''}<div class="related"><a href="#/${parent}">← 返回${a.collection}</a></div></article><aside class="toc"><p>目录</p>${sections.map((s,i)=>`<a href="${E(location.hash.split('?')[0])}?section=${i}" data-section="${i}">${E(s.title)}</a>`).join('')}</aside></div>`;
  }
  function resume(){const r=D.profile.resume;return `<div class="resume">${crumb([['个人简历']])}${head('ABOUT / RESUME',D.profile.name+' · '+r.headline,r.summary)}<div class="notice">当前是简历框架，未填入虚构的学历、工作经历或联系方式。</div><section><h2>教育背景</h2><p>${E(r.education)}</p></section><section><h2>技术能力</h2><p>${E(r.skills)}</p></section><section><h2>经历与贡献</h2><p>${E(r.experience)}</p></section><section><h2>项目实践</h2><a class="text-link" href="#/projects">查看作品集合 →</a></section><div class="hero-actions"><a class="button" href="${safeURL(D.profile.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><button class="button secondary" id="print-resume">打印 / 保存为 PDF</button></div></div>`;}
  function notFound(){return head('404 / LOST PAGE','这一页还没有写下','链接可能已更改，或者内容尚未收录。')+'<a class="button" href="#/">回到首页 →</a>';}
  // The canvas is decorative; all navigation remains ordinary, keyboard-accessible links.
  let stopScene=()=>{};
  function startScene(canvas){
    if(!canvas?.getContext)return ()=>{};
    const ctx=canvas.getContext('2d');if(!ctx)return ()=>{};
    const stage=canvas.parentElement;
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let paused=reduced.matches,frame=0,width=1,height=1,time=0,last=0,dead=false;
    const pointer={x:0,y:0,active:false},smoothed={x:0,y:0};
    const trails=[];
    stage.classList.add('has-canvas');
    function draw(){
      ctx.clearRect(0,0,width,height);
      smoothed.x+=(pointer.x-smoothed.x)*.055;smoothed.y+=(pointer.y-smoothed.y)*.055;
      for(let row=0;row<9;row++){
        ctx.beginPath();
        for(let i=0;i<=65;i++){
          const x=i/65*width,y=height*.5+(row-4)*9+Math.sin(i*.085+time*.25+row*.16)*18+Math.sin(i*.04-time*.15)*10+smoothed.y*5;
          i?ctx.lineTo(x,y):ctx.moveTo(x,y);
          if(i%13===0&&row%3===0){ctx.fillStyle='rgba(61,111,190,.4)';ctx.fillRect(x-1,y-1,2,2);}
        }
        ctx.strokeStyle=`rgba(66,111,181,${.08+row*.009})`;ctx.lineWidth=.7;ctx.stroke();
      }
      if(!paused){for(let i=trails.length-1;i>=0;i--){const p=trails[i];p.life-=.025;if(p.life<=0){trails.splice(i,1);continue;}ctx.beginPath();ctx.arc(p.x,p.y,1.5*p.life,0,Math.PI*2);ctx.fillStyle=`rgba(60,108,195,${p.life*.5})`;ctx.fill();if(i>0){ctx.beginPath();ctx.moveTo(trails[i-1].x,trails[i-1].y);ctx.lineTo(p.x,p.y);ctx.strokeStyle=`rgba(60,108,195,${p.life*.22})`;ctx.stroke();}}}
    }
    function tick(now){frame=0;if(dead||paused||document.hidden)return;const dt=last?Math.min((now-last)/1000,.05):0;last=now;time+=dt;draw();frame=requestAnimationFrame(tick);}
    function schedule(){cancelAnimationFrame(frame);frame=0;last=0;if(!paused&&!document.hidden&&!dead)frame=requestAnimationFrame(tick);else draw();}
    function resize(){const r=stage.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);const dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
    function move(e){if(paused||e.pointerType==='touch')return;const r=stage.getBoundingClientRect();pointer.x=(e.clientX-r.left)/width*2-1;pointer.y=(e.clientY-r.top)/height*2-1;pointer.active=true;trails.push({x:e.clientX-r.left,y:e.clientY-r.top,life:1});if(trails.length>28)trails.shift();}
    function leave(){pointer.active=false;pointer.x=pointer.y=0;}
    function preference(){paused=reduced.matches;schedule();}
    const observer=new ResizeObserver(resize);observer.observe(stage);
    stage.addEventListener('pointermove',move,{passive:true});stage.addEventListener('pointerleave',leave);document.addEventListener('visibilitychange',schedule);reduced.addEventListener('change',preference);
    resize();schedule();
    return ()=>{dead=true;cancelAnimationFrame(frame);observer.disconnect();stage.removeEventListener('pointermove',move);stage.removeEventListener('pointerleave',leave);document.removeEventListener('visibilitychange',schedule);reduced.removeEventListener('change',preference);};
  }
  function render(){
    stopScene();
    let parts;try{parts=(location.hash.slice(1).split('?')[0]||'/').split('/').filter(Boolean).map(decodeURIComponent);}catch{parts=['404'];}
    const [rawPage,id,...groups]=parts;const page=rawPage==='home'?undefined:rawPage;
    const navFolder=navNodes(D.navigation).find(n=>n.href==='#/'+page&&n.children?.length);
    let html;
    if(!page)html=home();else if(page==='knowledge')html=knowledge(id);else if(page==='albums')html=albumIndex();else if(page==='projects')html=projects();else if(page==='interviews')html=interviews();else if(page==='essays')html=essays();else if(page==='folder')html=directory(D.folders.find(f=>f.id===id)?.collection,id);else if(page==='photos')html=sectionPlaceholder('相册','还没有照片');else if(page==='guestbook')html=sectionPlaceholder('留言','留言功能尚未开放');else if(page==='career')html=folderPage({title:'职业合集',children:[{title:'作品集合',href:'#/projects'},{title:'面试经历',href:'#/interviews'}]});else if(navFolder)html=folderPage(navFolder);else if(['article','project','interview','essay'].includes(page))html=article(page,id);else if(page==='resume')html=resume();else html=notFound();
    const collection=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    main.setAttribute('data-page',page||'home');
    if(Object.hasOwn(labels,collection)||navFolder)html=`<div class="explorer"><button class="mobile-directory" aria-expanded="false" aria-controls="directory" id="directory-toggle">版块与合集</button>${fileTree(page,id)}<div class="file-pane">${html}</div></div>`;
    main.innerHTML=!page?html:`<div class="route-strip field-${E(Object.hasOwn(labels,collection)?collection:'neutral')}" aria-hidden="true"><span>${E(labels[collection]||({albums:'合集',resume:'关于',tools:'工具',photos:'相册',guestbook:'留言'}[page])||'CAI')}</span></div><div class="container">${html}</div>`;
    stopScene=startScene(main.querySelector('#research-field'));
    document.body.classList.toggle('is-home',!page);
    document.getElementById('browse-posts')?.addEventListener('click',()=>document.getElementById('home-posts').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
    const active=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    document.getElementById('nav').innerHTML=navigationMarkup(D.navigation,active||'home');
    setupNavigation();
    document.getElementById('nav').classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
    document.title=page?(main.querySelector('h1')?.textContent||'CAI')+' · CAI':'CAI';

    document.getElementById('directory-toggle')?.addEventListener('click',e=>{const open=document.getElementById('directory').classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',String(open));});
    document.getElementById('print-resume')?.addEventListener('click',()=>window.print());
    main.querySelectorAll('[data-section]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.getElementById('section-'+a.dataset.section)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}));
    document.getElementById('board-search')?.addEventListener('submit',e=>{e.preventDefault();const params=new URLSearchParams(location.hash.split('?')[1]||'');params.set('q',document.getElementById('board-query').value.trim());params.delete('page');location.hash=location.hash.split('?')[0]+'?'+params.toString();});
    window.InlineWriter?.mount();
    const section=new URLSearchParams(location.hash.split('?')[1]||'').get('section');
    if(section!==null)document.getElementById('section-'+section)?.scrollIntoView();else window.scrollTo(0,0);
  }
  const dialog=document.getElementById('search-dialog'),input=document.getElementById('search-input'),results=document.getElementById('search-results');
  function searchIndex(){return allDocs();}
  function search(){const q=input.value.trim().toLowerCase();if(!q){results.innerHTML='<div class="empty">输入关键词搜索。</div>';return;}const words=q.split(/\s+/);const found=searchIndex().filter(a=>words.every(w=>JSON.stringify(a).toLowerCase().includes(w)));results.innerHTML=found.length?`<p class="search-hint">找到 ${found.length} 条内容</p>`+found.map(a=>`<a class="search-result" href="${routeFor(a.type,a.id)}"><span class="entry-top">${E(a.collection)}${a.demo===true?' · 示例模板':''}</span><strong>${E(a.title)}</strong><p>${E(a.summary)}</p></a>`).join(''):empty('没有找到相关内容','试试更短的词，或搜索 Go、Linux。');}
  function openSearch(){if(!dialog.open)dialog.showModal();input.value='';search();input.focus();}
  document.getElementById('search-open').addEventListener('click',openSearch);document.getElementById('search-close').addEventListener('click',()=>dialog.close());input.addEventListener('input',search);
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
  results.addEventListener('click',e=>{if(e.target.closest('a'))dialog.close();});
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}});
  document.getElementById('menu-toggle').addEventListener('click',e=>{const open=document.getElementById('nav').classList.toggle('open');e.currentTarget.setAttribute('aria-expanded',String(open));});
  document.querySelector('.skip')?.addEventListener('click',e=>{e.preventDefault();main.focus();main.scrollIntoView();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')document.querySelectorAll('#nav details[open]').forEach(n=>n.open=false);});
  document.addEventListener('click',e=>{if(!e.target.closest('#nav')){const p=document.getElementById('mega-panel');if(p)p.hidden=true;document.getElementById('mega-toggle')?.setAttribute('aria-expanded','false');}});
  document.getElementById('year').textContent=new Date().getFullYear();window.addEventListener('hashchange',()=>{if(window.InlineWriter?.allowNavigation()===false)return;const update=()=>{render();main.focus({preventScroll:true});};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.startViewTransition(update);}else update();});window.refreshBlog=render;render();
})();

