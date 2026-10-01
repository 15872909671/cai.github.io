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
  const entry=(a,type)=>`<a class="entry file-entry" href="${routeFor(type,a.id)}"><span class="file-symbol" aria-hidden="true"></span><div class="file-content"><h3>${E(a.title)}</h3><p>${E(a.summary)}</p><div class="entry-top"><span>${E(a.category||a.company||a.status||'帖子')}</span><span>${E(a.date)}</span>${a.demo===true?badge(a):''}</div></div><span class="file-open" aria-hidden="true">→</span></a>`;
  const navNodes=nodes=>nodes.flatMap(n=>[n,...navNodes(n.children||[])]);
  const containsSection=(node,key)=>node.id===key||(node.children||[]).some(n=>containsSection(n,key));
  function navigationMarkup(nodes,selected){return nodes.map(n=>`<div class="nav-item"><a href="${safeURL(n.href)}" ${containsSection(n,selected)?'class="active"':''} ${n.id===selected?'aria-current="page"':''}>${E(n.title)}</a>${n.children?.length?`<details class="nav-disclosure"><summary aria-label="展开${E(n.title)}子栏目">⌄</summary><div class="nav-submenu">${navigationMarkup(n.children,selected)}</div></details>`:''}</div>`).join('');}
  function folderPage(node){return crumb([[node.title]])+head('',node.title,'')+`<section class="file-list"><div class="list-heading"><span>文件夹</span><span>${node.children.length} 项</span></div>${node.children.map(n=>`<a class="folder-list-row" href="${safeURL(n.href)}"><span class="folder-symbol" aria-hidden="true"></span><span>${E(n.title)}</span><span class="folder-row-count">›</span></a>`).join('')}</section>`;}
  function home(){
    const homeKeys=['knowledge','career','essays'];
    const counts=[`${D.articles.length} 篇帖子`,'2 个文件夹',`${D.essays.length} 篇帖子`];
    return `<div class="portal"><section class="portal-intro"><div class="intro-copy"><h1>内容总览</h1></div><div class="research-stage"><canvas id="research-field" aria-hidden="true"></canvas></div></section><section class="portal-sections" aria-label="三个集合">${homeKeys.map((k,i)=>`<a href="#/${k}"><div class="portal-section-title"><h2>${labels[k]}</h2><span aria-hidden="true">↗</span></div><span class="section-count">${counts[i]}</span></a>`).join('')}</section><div class="portal-content"><section class="portal-feed"><div class="section-heading"><h2>最新帖子</h2><a class="text-link" href="#/knowledge">全部帖子 ↗</a></div><div class="topic-links" aria-label="技术分类">${D.categories.filter(c=>c!=='全部').map(c=>`<a href="#/knowledge/${encodeURIComponent(c)}">${E(c)}</a>`).join('')}</div>${D.articles.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(a=>entry(a,'article')).join('')}</section><aside class="portal-aside"><section><div class="section-heading"><h2>作品集合</h2><a class="text-link" href="#/projects">全部 ↗</a></div>${D.projects.map(p=>entry(p,'project')).join('')||'<p class="folder-empty">暂无帖子</p>'}</section><section class="portal-interviews"><div class="section-heading"><h2>面经资料</h2><a class="text-link" href="#/interviews">全部 ↗</a></div>${D.interviews.map(a=>`<a class="compact-record" href="${routeFor('interview',a.id)}"><span class="record-type">${a.demo===true?'示例模板':'帖子'}</span><span>${E(a.title)}</span></a>`).join('')}</section></aside></div></div>`;
  }
  const folderURL=f=>'#/folder/'+encodeURIComponent(f.id);
  function directory(collection,id=null){
    if(!F.keys[collection])return notFound();
    const current=id?D.folders.find(f=>f.id===id&&f.collection===collection):null;
    if(id&&!current)return notFound();
    const folders=F.children(D,collection,id),posts=F.posts(D,collection,id);
    const trail=F.ancestors(D,id).map(f=>[f.name,f.id===id?null:folderURL(f)]);
    return crumb([[labels[collection],id?'#/'+collection:null],...trail])+head('',current?.name||labels[collection],'')+`<section class="file-list"><div class="list-heading"><span>文件夹与帖子</span><span>${folders.length+posts.length} 项</span></div>${folders.map(f=>`<a class="folder-list-row" href="${folderURL(f)}"><span class="folder-symbol" aria-hidden="true"></span><span>${E(f.name)}</span><span class="folder-row-count">›</span></a>`).join('')}${posts.map(p=>entry(p,F.types[collection])).join('')}${!folders.length&&!posts.length?empty('这个文件夹还没有帖子',''):''}</section>`;
  }
  function knowledge(category='全部'){
    if(category==='全部')return directory('knowledge');
    const folder=D.folders.find(f=>f.collection==='knowledge'&&!f.parent_id&&f.name===category);
    return folder?directory('knowledge',folder.id):notFound();
  }
  const treeState=new Map();
  function fileTree(page,id){
    const selected=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    const activePost=allDocs().find(a=>a.type===page&&a.id===id);
    const activeFolder=page==='folder'?id:activePost?.folder_id||(page==='knowledge'&&id?'knowledge/'+id:null);
    const ancestry=F.ancestors(D,activeFolder).map(f=>f.id);
    const file=(a,type)=>`<li><a class="tree-file ${page===type&&id===a.id?'selected':''}" href="${routeFor(type,a.id)}" ${page===type&&id===a.id?'aria-current="page"':''}><span class="file-symbol" aria-hidden="true"></span><span>${E(a.title)}${a.published===false?'<small class="draft-mark">草稿</small>':''}</span></a></li>`;
    const branch=(key,title,url,children,reveal,defaultOpen=false)=>`<li><details data-tree-key="${E(key)}" ${treeState.get(key)??(reveal||defaultOpen)?'open':''}><summary><span class="tree-caret" aria-hidden="true">›</span><span class="folder-symbol" aria-hidden="true"></span><span class="tree-folder-name">${E(title)}</span><a class="tree-open" href="${safeURL(url)}" aria-label="打开${E(title)}文件夹">↗</a></summary><ul>${children||'<li class="tree-empty">空文件夹</li>'}</ul></details></li>`;
    const folderNodes=(collection,parent=null)=>F.children(D,collection,parent).map(f=>branch(f.id,f.name,folderURL(f),folderNodes(collection,f.id),ancestry.includes(f.id),page===collection&&!id)).join('')+F.posts(D,collection,parent).map(p=>file(p,F.types[collection])).join('');
    const treeNodes=nodes=>nodes.map(n=>{
      let children=n.children?.length?treeNodes(n.children):F.keys[n.id]?folderNodes(n.id):'';
      return branch(n.id,n.title,n.href,children,containsSection(n,selected));
    }).join('');
    return `<aside class="file-tree" id="directory"><div class="tree-toolbar"><span>文件树</span><div><button type="button" id="tree-expand">全部展开</button><button type="button" id="tree-collapse">全部收起</button></div></div><nav aria-label="文件树"><ul class="tree-root">${treeNodes(navNodes(D.navigation).filter(n=>n.id===selected))}</ul></nav></aside>`;
  }
  const essays=()=>directory('essays'),projects=()=>directory('projects');
  function options(values,all){return `<option value="">${E(all)}</option>`+[...new Set(values.filter(Boolean))].map(v=>`<option value="${E(v)}">${E(v)}</option>`).join('');}
  function interviews(){return crumb([['职业合集','#/career'],['面试经历']])+head('03 / INTERVIEWS','面试经历','问题、回答与复盘。')+`<div class="file-list">${F.children(D,'interviews').map(f=>`<a class="folder-list-row" href="${folderURL(f)}"><span class="folder-symbol" aria-hidden="true"></span><span>${E(f.name)}</span><span>›</span></a>`).join('')}</div><div class="filter-bar"><label>企业<select id="filter-company">${options(D.interviews.map(a=>a.company),'全部企业')}</select></label><label>岗位<select id="filter-role">${options(D.interviews.map(a=>a.role),'全部岗位')}</select></label><label>来源<select id="filter-source">${options(D.interviews.map(a=>a.source),'全部来源')}</select></label></div><div class="list-heading"><span>面试记录</span><span id="interview-count"></span></div><div id="interview-list" aria-live="polite"></div>`;}
  function applyInterviewFilters(){const list=D.interviews.filter(a=>!a.folder_id).filter(a=>['company','role','source'].every(k=>!document.getElementById('filter-'+k).value||a[k]===document.getElementById('filter-'+k).value)).sort((a,b)=>b.date.localeCompare(a.date));document.getElementById('interview-count').textContent=`${list.length} 条`;document.getElementById('interview-list').innerHTML=list.map(a=>entry(a,'interview')).join('')||empty();}
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
    const [page,id,...groups]=parts;
    const navFolder=navNodes(D.navigation).find(n=>n.href==='#/'+page&&n.children?.length);
    let html;
    if(!page)html=home();else if(page==='knowledge')html=knowledge(id);else if(page==='projects')html=projects();else if(page==='interviews')html=interviews();else if(page==='essays')html=essays();else if(page==='folder')html=directory(D.folders.find(f=>f.id===id)?.collection,id);else if(navFolder)html=folderPage(navFolder);else if(['article','project','interview','essay'].includes(page))html=article(page,id);else if(page==='resume')html=resume();else html=notFound();
    const collection=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    main.setAttribute('data-page',page||'home');
    if(Object.hasOwn(labels,collection)||navFolder)html=`<div class="explorer"><button class="mobile-directory" aria-expanded="false" aria-controls="directory" id="directory-toggle">文件树</button>${fileTree(page,id)}<div class="file-pane">${html}</div></div>`;
    main.innerHTML=!page?html:`<div class="route-strip field-${E(Object.hasOwn(labels,collection)?collection:'neutral')}" aria-hidden="true"></div><div class="container">${html}</div>`;
    stopScene=startScene(main.querySelector('#research-field'));
    const setTreeOpen=open=>{main.querySelectorAll('[data-tree-key]').forEach(el=>{el.open=open;treeState.set(el.dataset.treeKey,open);});};
    document.getElementById('tree-expand')?.addEventListener('click',()=>setTreeOpen(true));
    document.getElementById('tree-collapse')?.addEventListener('click',()=>setTreeOpen(false));
    main.querySelectorAll('[data-tree-key]').forEach(el=>el.addEventListener('toggle',()=>{if(el.isConnected)treeState.set(el.dataset.treeKey,el.open);}));
    const active=page==='folder'?D.folders.find(f=>f.id===id)?.collection:{article:'knowledge',project:'projects',interview:'interviews',essay:'essays'}[page]||page;
    document.getElementById('nav').innerHTML=navigationMarkup(D.navigation,active||'home');
    document.querySelectorAll('#nav .nav-item').forEach(item=>{
      const menu=item.querySelector(':scope > .nav-disclosure');if(!menu)return;
      item.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse')menu.open=true;});
      item.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!item.contains(document.activeElement))menu.open=false;});
      item.addEventListener('focusout',e=>{if(!item.contains(e.relatedTarget))menu.open=false;});
    });
    document.getElementById('nav').classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
    document.title=page?(main.querySelector('h1')?.textContent||'CAI')+' · CAI':'CAI';
    if(page==='interviews'){applyInterviewFilters();['company','role','source'].forEach(k=>document.getElementById('filter-'+k).addEventListener('change',applyInterviewFilters));}
    document.getElementById('directory-toggle')?.addEventListener('click',e=>{const open=document.getElementById('directory').classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',String(open));});
    document.getElementById('print-resume')?.addEventListener('click',()=>window.print());
    main.querySelectorAll('[data-section]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.getElementById('section-'+a.dataset.section)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}));
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
  document.addEventListener('click',e=>{if(!e.target.closest('#nav'))document.querySelectorAll('#nav details[open]').forEach(n=>n.open=false);});
  document.getElementById('year').textContent=new Date().getFullYear();window.addEventListener('hashchange',()=>{if(window.InlineWriter?.allowNavigation()===false)return;const update=()=>{render();main.focus({preventScroll:true});};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.startViewTransition(update);}else update();});window.refreshBlog=render;render();
})();

