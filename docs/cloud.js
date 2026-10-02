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
    if(!response.ok){
      const messages={otp_expired:'验证码无效或已过期，请重新获取。',signup_disabled:'注册暂未开放。',email_not_confirmed:'请先到邮箱完成验证。',email_address_not_authorized:'验证邮件暂时无法发送，请稍后重试。',over_email_send_rate_limit:'验证邮件发送过于频繁，请稍后重试。',over_request_rate_limit:'操作过于频繁，请稍后重试。',weak_password:'密码强度不足，请使用更长的密码。',user_already_exists:'该账号已存在，请直接登录。'};
      const details=result?.message||result?.msg||result?.error_description||'';
      const rules=[[/wait 5 seconds/i,'请间隔 5 秒后再发表评论。'],[/Daily comment limit/i,'今天的评论次数已用完，请明天再来。'],[/Comment quota/i,'评论数量已达到账号上限。'],[/Image quota/i,'图片空间已用完，请先清理未使用的图片。'],[/Post quota|Text quota/i,'帖子或文字容量已达到上限，请先整理已有内容。'],[/Folder quota/i,'合集数量已达到上限。'],[/changed or permission denied/i,'内容已被修改或当前账号无权操作，请重新加载。'],[/Cannot move folder into descendant/i,'不能把合集移入它自己的子目录。'],[/Invalid destination/i,'目标合集不可用，请重新选择。'],[/still stored or referenced/i,'图片仍在使用中，请先移除引用。'],[/Verified sign-in required|Verify email first/i,'请先验证邮箱并登录。']];
      const translated=rules.find(([pattern])=>pattern.test(details))?.[1];
      const e=Error(messages[result?.code]||translated||(result?.code==='PGRST205'?'服务暂时不可用，请稍后重试。':response.status===401?'登录失败或已过期，请检查邮箱和密码。':response.status===403?'当前账号无权执行此操作。':result?.code==='23505'?'名称或 ID 已被使用，请换一个。':result?.code==='23503'?'该内容仍有关联的帖子或子目录，请先移出后重试。':details||'请求失败'));e.status=response.status;throw e;
    }
    return result;
  }
  function setSession(data){session={...data,expires_at:Date.now()+(data.expires_in-60)*1000};return session;}
  async function login(email,password){
    setSession(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));
    try{
      const id=encodeURIComponent(session.user.id);
      const results=await Promise.allSettled([
        request('/rest/v1/blog_authors?select=user_id&user_id=eq.'+id,{auth:true}),
        request('/rest/v1/blog_profiles?select=username&user_id=eq.'+id,{auth:true}).catch(e=>{if(e.status===404)return [];throw e;})
      ]);
      const failed=results.find(r=>r.status==='rejected');if(failed)throw failed.reason;
      return {...session.user,isAuthor:results[0].value.length>0,username:results[1].value[0]?.username||''};
    }catch(e){session=null;throw e;}
  }
  const confirmationURL=()=>location.origin+location.pathname;
  async function checkRegistration(email,username){
    const status=await request('/rest/v1/rpc/blog_registration_status',{method:'POST',body:{email_address:email,public_name:username}});
    if(status.registered)throw Error('该邮箱已注册，请直接登录。');
    if(status.nameTaken)throw Error('这个公开 ID 已被使用，请换一个。');
  }
  async function signup(email,password,username,displayName){
    await checkRegistration(email,username);
    const result=await request('/auth/v1/signup?redirect_to='+encodeURIComponent(confirmationURL()),{method:'POST',body:{email,password,data:{username,...(displayName?{display_name:displayName}:{})}}});
    if(result?.user?.identities?.length===0)throw Error('该邮箱已注册，请直接登录。');
    if(result?.access_token){setSession(result);return {needsConfirmation:false};}
    return {needsConfirmation:true};
  }
  async function verifyRegistration(email,token){setSession(await request('/auth/v1/verify',{method:'POST',body:{email,token,type:'signup'}}));}
  async function setRegistrationPassword(password,displayName){return request('/auth/v1/user',{method:'PUT',auth:true,body:{...(password?{password}:{}),...(displayName?{data:{display_name:displayName}}:{})}});}
  async function claimUsername(username){return request('/rest/v1/rpc/blog_claim_username',{method:'POST',body:{public_name:username},auth:true});}
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
  async function createFolder(folder){
    // The recursive visibility function uses the statement snapshot: a new
    // folder is not visible to INSERT RETURNING until the next statement.
    await request('/rest/v1/blog_folders',{method:'POST',auth:true,body:folder,headers:{Prefer:'return=minimal'}});
    return request('/rest/v1/blog_folders?select=*&id=eq.'+encodeURIComponent(folder.id),{auth:true});
  }
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
  window.BlogCloud={currentUser:()=>session?.user||null,request,login,signup,checkRegistration,setRegistrationPassword,verifyRegistration,claimUsername,resendConfirmation,logout,load,save,createFolder,apply,uploadImage,hydrateImages};
})();
