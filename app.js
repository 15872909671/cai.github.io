(() => {
  'use strict';
  const D=window.BLOG, main=document.getElementById('main');
  const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL=u=>typeof u==='string'&&(/^(https?:\/\/|#\/)/.test(u))?E(u):'#/';
  const labels={knowledge:'知识集',projects:'作品集',interviews:'面试集'};
  const tags=arr=>(arr||[]).map(t=>`<span class="tag">${E(t)}</span>`).join('');
  const badge=a=>`<span class="badge ${a.demo===true?'demo':''}">${E(a.demo===true?'示例模板':a.kind||a.status||'档案')}</span>`;
  const empty=(title='还没有匹配的内容',text='换个关键词或筛选条件试试。')=>`<div class="empty"><h2>${E(title)}</h2><p>${E(text)}</p></div>`;
  const crumb=items=>`<div class="breadcrumb"><a href="#/">首页</a>${items.map(([name,url])=>`<span>/</span>${url?`<a href="${safeURL(url)}">${E(name)}</a>`:`<span>${E(name)}</span>`}`).join('')}</div>`;
  const head=(en,title,desc)=>`<div class="page-head"><h1>${E(title)}</h1></div>`;
  const routeFor=(type,id)=>`#/${type}/${encodeURIComponent(id)}`;
  const entry=(a,type)=>`<a class="entry file-entry" href="${routeFor(type,a.id)}"><span class="file-symbol" aria-hidden="true"></span><div class="file-content"><h3>${E(a.title)}</h3><p>${E(a.summary)}</p><div class="entry-top"><span>${E(a.category||a.company||a.status||'帖子')}</span><span>${E(a.date)}</span>${a.demo===true?badge(a):''}</div></div><span class="file-open" aria-hidden="true">→</span></a>`;
  function home(){
    const descriptions=['Go、Linux、分布式与数据库','代码项目与实现记录','面试问题、资料与复盘'];
    const counts=[`${D.articles.length} 篇笔记`,`${D.projects.length} 篇帖子`,`${D.interviews.length} 份模板`];
    return `<div class="portal"><section class="portal-intro"><div class="intro-copy"><h1>内容总览</h1><p>技术研究 · 项目实践 · 职业记录</p></div><div class="research-stage"><canvas id="research-field" aria-hidden="true"></canvas></div></section><section class="portal-sections" aria-label="三个集合">${Object.keys(labels).map((k,i)=>`<a href="#/${k}"><div class="portal-section-title"><h2>${labels[k]}</h2><span aria-hidden="true">↗</span></div><p>${descriptions[i]}</p><span class="section-count">${counts[i]}</span></a>`).join('')}</section><div class="portal-content"><section class="portal-feed"><div class="section-heading"><h2>最新笔记</h2><a class="text-link" href="#/knowledge">全部笔记 ↗</a></div><div class="topic-links" aria-label="技术分类">${D.categories.filter(c=>c!=='全部').map(c=>`<a href="#/knowledge/${encodeURIComponent(c)}">${E(c)}</a>`).join('')}</div>${D.articles.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(a=>entry(a,'article')).join('')}</section><aside class="portal-aside"><section><div class="section-heading"><h2>作品集</h2><a class="text-link" href="#/projects">全部 ↗</a></div>${D.projects.map(p=>entry(p,'project')).join('')||'<p class="folder-empty">暂无帖子</p>'}</section><section class="portal-interviews"><div class="section-heading"><h2>面经资料</h2><a class="text-link" href="#/interviews">全部 ↗</a></div>${D.interviews.map(a=>`<a class="compact-record" href="${routeFor('interview',a.id)}"><span class="record-type">模板</span><span>${E(a.title)}</span></a>`).join('')}</section></aside></div></div>`;
  }
  function knowledge(category='全部'){
    if(!D.categories.includes(category))return notFound();
    const list=D.articles.filter(a=>category==='全部'||a.category===category);
    const contents=category==='全部'?D.categories.filter(c=>c!=='全部').map(c=>`<a class="folder-list-row" href="#/knowledge/${encodeURIComponent(c)}"><span class="folder-symbol" aria-hidden="true"></span><span>${E(c)}</span><span class="folder-row-count">${D.articles.filter(a=>a.category===c).length} 篇</span></a>`).join(''):list.map(a=>entry(a,'article')).join('');
    return crumb([['知识集',category==='全部'?null:'#/knowledge'],...(category==='全部'?[]:[[category]])])+head('',category==='全部'?'知识集':category,'')+`<section class="file-list"><div class="list-heading"><span>${category==='全部'?'文件夹':'帖子'}</span><span>${category==='全部'?D.categories.length-1:list.length} 项</span></div>${contents||empty()}</section>`;
  }
  const treeState=new Map();
  function fileTree(page,id){
    const selected={article:'knowledge',project:'projects',interview:'interviews'}[page]||page;
    const activeArticle=page==='article'?D.articles.find(a=>a.id===id):null;
    const file=(a,type)=>`<li><a class="tree-file ${page===type&&id===a.id?'selected':''}" href="${routeFor(type,a.id)}" ${page===type&&id===a.id?'aria-current="page"':''}><span class="file-symbol" aria-hidden="true"></span><span>${E(a.title)}</span></a></li>`;
    const branch=(key,title,url,children,reveal,defaultOpen=false)=>`<li><details data-tree-key="${E(key)}" ${reveal||(treeState.get(key)??defaultOpen)?'open':''}><summary><span class="tree-caret" aria-hidden="true"></span><span class="folder-symbol" aria-hidden="true"></span><span class="tree-folder-name">${E(title)}</span><a class="tree-open" href="${safeURL(url)}" aria-label="打开${E(title)}文件夹">↗</a></summary><ul>${children||'<li class="tree-empty">空文件夹</li>'}</ul></details></li>`;
    const categories=D.categories.filter(c=>c!=='全部').map(c=>branch('knowledge/'+c,c,'#/knowledge/'+encodeURIComponent(c),D.articles.filter(a=>a.category===c).map(a=>file(a,'article')).join(''),(page==='knowledge'&&id===c)||activeArticle?.category===c)).join('');
    return `<aside class="file-tree" id="directory"><nav aria-label="文件树"><ul class="tree-root">${branch('knowledge','知识集','#/knowledge',categories,selected==='knowledge')}${branch('projects','作品集','#/projects',D.projects.map(a=>file(a,'project')).join(''),selected==='projects')}${branch('interviews','面试集','#/interviews',D.interviews.map(a=>file(a,'interview')).join(''),selected==='interviews')}</ul></nav></aside>`;
  }
  function projects(){return crumb([['作品集']])+head('','作品集','作品说明与代码链接。')+`<div class="file-list"><div class="list-heading"><span>帖子</span><span>${D.projects.length} 篇</span></div>${D.projects.map(p=>entry(p,'project')).join('')||empty('这个文件夹还没有帖子','')}</div>`;}
  function options(values,all){return `<option value="">${E(all)}</option>`+[...new Set(values)].map(v=>`<option value="${E(v)}">${E(v)}</option>`).join('');}
  function interviews(){return crumb([['面试集']])+head('03 / INTERVIEWS','面试集','问题、回答与复盘。')+`<div class="notice">当前为面经模板，真实记录待补充。</div><div class="filter-bar"><label>企业<select id="filter-company">${options(D.interviews.map(a=>a.company),'全部企业')}</select></label><label>岗位<select id="filter-role">${options(D.interviews.map(a=>a.role),'全部岗位')}</select></label><label>来源<select id="filter-source">${options(D.interviews.map(a=>a.source),'全部来源')}</select></label></div><div class="list-heading"><span>面试记录</span><span id="interview-count"></span></div><div id="interview-list" aria-live="polite"></div>`;}
  function applyInterviewFilters(){const list=D.interviews.filter(a=>['company','role','source'].every(k=>!document.getElementById('filter-'+k).value||a[k]===document.getElementById('filter-'+k).value)).sort((a,b)=>b.date.localeCompare(a.date));document.getElementById('interview-count').textContent=`${list.length} 条`;document.getElementById('interview-list').innerHTML=list.map(a=>entry(a,'interview')).join('')||empty();}
  const facts=items=>`<dl class="facts">${items.map(([k,v])=>`<div class="fact"><dt>${E(k)}</dt><dd>${E(v||'待补充')}</dd></div>`).join('')}</dl>`;
  const allDocs=()=>[...D.articles.map(x=>({...x,type:'article',collection:'知识集'})),...D.projects.map(x=>({...x,type:'project',collection:'作品集'})),...D.interviews.map(x=>({...x,type:'interview',collection:'面试集'}))];
  function article(type,id){
    const a=allDocs().find(x=>x.id===id&&x.type===type);if(!a)return notFound();
    const parent={article:'knowledge',project:'projects',interview:'interviews'}[type];
    const sections=a.sections||[];
    const body=sections.map((s,i)=>`<section id="section-${i}"><h2>${E(s.title)}</h2>${s.text?`<p>${E(s.text)}</p>`:''}${s.list?`<ul>${s.list.map(x=>`<li>${E(x)}</li>`).join('')}</ul>`:''}${s.code?`<pre><code>${E(s.code)}</code></pre>`:''}</section>`).join('');
    const related=(a.related||[]).map(ref=>{const [type,id]=ref.split('/');return allDocs().find(x=>x.id===id&&x.type===type);}).filter(Boolean);
    return crumb([[a.collection,'#/'+parent],[a.title]])+`<div class="article-layout"><article class="article"><div class="entry-top">${badge(a)}<span>${E(a.date)}</span><span>${Math.max(1,Math.ceil(JSON.stringify(sections).length/450))} 分钟阅读</span></div><h1 style="margin-top:20px">${E(a.title)}</h1><p class="lead">${E(a.summary)}</p><div class="entry-meta">${tags(a.tags)}</div>${a.demo===true?'<div class="notice">示例内容，仅展示记录方式；不代表真实面试或个人经历。</div>':''}${type==='interview'?facts([['企业',a.company],['岗位',a.role],['轮次',a.round],['来源',a.source]]):''}${type==='project'?`<div class="hero-actions">${a.github?`<a class="button" href="${safeURL(a.github)}" target="_blank" rel="noopener noreferrer">查看 GitHub ↗</a>`:''}${typeof a.demo === 'string'?`<a class="button secondary" href="${safeURL(a.demo)}">打开演示 →</a>`:''}</div>`:''}<div class="article-body">${body}${a.links?.length?`<section id="references"><h2>参考资料</h2><ul>${a.links.map(l=>`<li><a href="${safeURL(l.url)}" target="_blank" rel="noopener noreferrer">${E(l.label)} ↗</a></li>`).join('')}</ul></section>`:''}</div>${related.length?`<div class="related"><h2>继续翻阅</h2>${related.map(r=>`<a href="${routeFor(r.type,r.id)}">${E(r.collection)} / ${E(r.title)} →</a>`).join('')}</div>`:''}<div class="related"><a href="#/${parent}">← 返回${a.collection}</a></div></article><aside class="toc"><p>目录</p>${sections.map((s,i)=>`<a href="${E(location.hash.split('?')[0])}?section=${i}" data-section="${i}">${E(s.title)}</a>`).join('')}</aside></div>`;
  }
  function resume(){const r=D.profile.resume;return `<div class="resume">${crumb([['个人简历']])}${head('ABOUT / RESUME',D.profile.name+' · '+r.headline,r.summary)}<div class="notice">当前是简历框架，未填入虚构的学历、工作经历或联系方式。</div><section><h2>教育背景</h2><p>${E(r.education)}</p></section><section><h2>技术能力</h2><p>${E(r.skills)}</p></section><section><h2>经历与贡献</h2><p>${E(r.experience)}</p></section><section><h2>项目实践</h2><a class="text-link" href="#/projects">查看作品集 →</a></section><div class="hero-actions"><a class="button" href="${safeURL(D.profile.github)}" target="_blank" rel="noopener noreferrer">GitHub ↗</a><button class="button secondary" id="print-resume">打印 / 保存为 PDF</button></div></div>`;}
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
    let html;
    if(!page)html=home();else if(page==='knowledge')html=knowledge(id);else if(page==='projects')html=projects();else if(page==='interviews')html=interviews();else if(['article','project','interview'].includes(page))html=article(page,id);else if(page==='resume')html=resume();else html=notFound();
    const collection={article:'knowledge',project:'projects',interview:'interviews'}[page]||page;
    main.setAttribute('data-page',page||'home');
    if(Object.hasOwn(labels,collection))html=`<div class="explorer"><button class="mobile-directory" aria-expanded="false" aria-controls="directory" id="directory-toggle">文件树</button>${fileTree(page,id)}<div class="file-pane">${html}</div></div>`;
    main.innerHTML=!page?html:`<div class="route-strip field-${E(Object.hasOwn(labels,collection)?collection:'neutral')}" aria-hidden="true"></div><div class="container">${html}</div>`;
    stopScene=startScene(main.querySelector('#research-field'));
    main.querySelectorAll('[data-tree-key]').forEach(el=>el.addEventListener('toggle',()=>{if(el.isConnected)treeState.set(el.dataset.treeKey,el.open);}));
    const active={article:'knowledge',project:'projects',interview:'interviews'}[page]||page;
    document.querySelectorAll('#nav a').forEach(a=>{const yes=a.hash==='#/'+active;a.classList.toggle('active',yes);if(yes)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
    document.getElementById('nav').classList.remove('open');document.getElementById('menu-toggle').setAttribute('aria-expanded','false');
    document.title=page?(main.querySelector('h1')?.textContent||'CAI')+' · CAI':'CAI';
    if(page==='interviews'){applyInterviewFilters();['company','role','source'].forEach(k=>document.getElementById('filter-'+k).addEventListener('change',applyInterviewFilters));}
    document.getElementById('directory-toggle')?.addEventListener('click',e=>{const open=document.getElementById('directory').classList.toggle('is-open');e.currentTarget.setAttribute('aria-expanded',String(open));});
    document.getElementById('print-resume')?.addEventListener('click',()=>window.print());
    main.querySelectorAll('[data-section]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();document.getElementById('section-'+a.dataset.section)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}));
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
  document.getElementById('year').textContent=new Date().getFullYear();window.addEventListener('hashchange',()=>{const update=()=>{render();main.focus({preventScroll:true});};if(document.startViewTransition&&!matchMedia('(prefers-reduced-motion: reduce)').matches){document.startViewTransition(update);}else update();});render();
})();

