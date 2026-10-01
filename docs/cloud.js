(() => {
  'use strict';
  let session=null,refreshing=null;
  const config=window.CLOUD_CONFIG;
  async function request(path,{method='GET',body,auth=false,headers={},binary=false}={}){
    if(auth){
      if(!session)throw Error('请先登录。');
      if(Date.now()>session.expires_at){
        refreshing??=request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:session.refresh_token}}).then(setSession).finally(()=>refreshing=null);
        try{await refreshing;}catch{session=null;throw Error('登录已过期，请重新登录。编辑内容仍保留在页面中。');}
      }
    }
    const response=await fetch(config.url+path,{method,headers:{apikey:config.key,...(body?{'Content-Type':'application/json'}:{}),...(auth?{Authorization:'Bearer '+session.access_token}:{}),...headers},body:body?(binary?body:JSON.stringify(body)):undefined,signal:AbortSignal.timeout(20000),cache:'no-store'});
    const text=await response.text();let result;try{result=text?JSON.parse(text):null;}catch{throw Error('服务返回了无法识别的响应。');}
    if(!response.ok){const messages={signup_disabled:'注册暂未开放。',email_not_confirmed:'请先到邮箱完成验证。',email_address_not_authorized:'验证邮件暂时无法发送，请稍后重试。',over_email_send_rate_limit:'验证邮件发送过于频繁，请稍后重试。',over_request_rate_limit:'操作过于频繁，请稍后重试。',weak_password:'密码强度不足，请使用更长的密码。',user_already_exists:'该账号已存在，请直接登录。'};const e=Error(messages[result?.code]|| (result?.code==='PGRST205'?'写作数据库尚未初始化，请先运行 setup.sql。':response.status===401?'登录失败或已过期，请检查邮箱和密码。':response.status===403?'当前账号没有作者权限。':result?.code==='23505'?'该文件夹名称或帖子 ID 已存在。':result?.message||result?.msg||result?.error_description||'请求失败'));e.status=response.status;throw e;}
    return result;
  }
  function setSession(data){session={...data,expires_at:Date.now()+(data.expires_in-60)*1000};return session;}
  async function login(email,password){
    setSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));
    try{const rows=await request('/rest/v1/blog_authors?select=user_id&user_id=eq.'+encodeURIComponent(session.user.id),{auth:true});return {...session.user,isAuthor:rows.length>0};}catch(e){session=null;throw e;}
  }
  const confirmationURL=()=>location.origin+location.pathname;
  async function signup(email,password){
    const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(confirmationURL()),{method:'POST',body:{email,password}});
    return {needsConfirmation:!result?.access_token};
  }
  async function resendConfirmation(email){return request('/auth/v1/resend?redirect_to='+encodeURIComponent(confirmationURL()),{method:'POST',body:{type:'signup',email}});}
  async function logout(){try{if(session)await request('/auth/v1/logout',{method:'POST',auth:true});}finally{session=null;}}
  async function rows(table,query='',auth=false){
    const all=[];let offset=0;
    while(true){const page=await request('/rest/v1/'+table+'?select=*&order=id.asc&limit=500&offset='+offset+query,{auth});all.push(...page);if(page.length<500)return all;offset+=500;}
  }
  async function load(auth=false){const [folders,posts]=await Promise.all([rows('blog_folders','',auth),rows('blog_posts',auth?'':'&published=eq.true',auth)]);return {folders,posts};}
  async function save(post,version){
    const update=version!==undefined;
    const result=await request('/rest/v1/blog_posts'+(update?'?id=eq.'+encodeURIComponent(post.id)+'&version=eq.'+version:''),{method:update?'PATCH':'POST',auth:true,body:post,headers:{Prefer:'return=representation'}});
    if(!result?.length)throw Error('此帖子已在其他窗口修改。请先下载当前内容，再重新载入帖子。');return result[0];
  }
  const createFolder=folder=>request('/rest/v1/blog_folders',{method:'POST',auth:true,body:folder,headers:{Prefer:'return=representation'}});
  function apply(data,remote,includeDrafts=false){
    data.folders=remote.folders;
    for(const key of Object.values(window.Folders.keys))data[key]=[];
    for(const p of remote.posts.filter(p=>includeDrafts||p.published)){
      const key=window.Folders.keys[p.collection];if(!key)continue;
      data[key].push({...p.metadata,id:p.id,title:p.title,published:p.published,summary:p.summary,markdown:p.body,folder_id:p.folder_id,date:p.created_at.slice(0,10),category:window.Folders.ancestors(data,p.folder_id)[0]?.name||'帖子'});
    }
    data.categories=['全部',...window.Folders.children(data,'knowledge').map(f=>f.name)];
  }
  async function uploadImage(file,postId){
    const extensions={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif'};
    if(!extensions[file.type]||!file.size||file.size>5*1024*1024)throw Error('请选择不超过 5 MB 的 PNG、JPEG、WebP 或 GIF 图片。');
    if(!/^[a-zA-Z0-9_-]+$/.test(postId))throw Error('帖子标识无效。');
    const path=postId+'/'+crypto.randomUUID()+'.'+extensions[file.type];
    await request('/storage/v1/object/blog-images/'+path,{method:'POST',body:file,binary:true,auth:true,headers:{'Content-Type':file.type,'x-upsert':'false'}});
    return path;
  }
  async function hydrateImages(root,auth=false){
    await Promise.all([...root.querySelectorAll('img[data-media]')].map(async img=>{
      const path=img.dataset.media;if(img.dataset.loading)return;img.dataset.loading='true';
      try{const result=await request('/storage/v1/object/sign/blog-images/'+path,{method:'POST',body:{expiresIn:60},auth});
        if(img.isConnected)img.src=config.url+'/storage/v1'+result.signedURL;
      }catch{img.alt=(img.alt||'图片')+'（暂时无法加载）';delete img.dataset.loading;}
    }));
  }
  window.BlogCloud={request,login,signup,resendConfirmation,logout,load,save,createFolder,apply,uploadImage,hydrateImages};
})();
