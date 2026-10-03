/* Paged, owner-scoped API. Never preload the full post database. */
(() => {
  const C=window.BlogCloud;
  const encode=encodeURIComponent;
  const rpc=(name,body,auth=!!C.currentUser())=>C.request('/rest/v1/rpc/'+name,{method:'POST',body,auth});
  const initializing=new Map();
  function initializeSpace(){
    const id=C.currentUser()?.id;if(!id)return Promise.resolve();
    if(initializing.has(id))return initializing.get(id);
    const run=(async()=>{
      const user=await C.request('/auth/v1/user',{auth:true});
      if(user.id!==id||!user.email_confirmed_at||user.is_anonymous)throw Error('请先验证邮箱并登录。');
      if(user.user_metadata?.cai_space_initialized_v1)return;
      const [existingFolders,existingPosts]=await Promise.all([
        C.request('/rest/v1/blog_folders?select=id&owner_id=eq.'+encode(id)+'&limit=1',{auth:true}),
        C.request('/rest/v1/blog_posts?select=id&owner_id=eq.'+encode(id)+'&limit=1',{auth:true})
      ]);
      if(C.currentUser()?.id!==id)throw Error('账号已切换，请重新打开空间。');
      if(!existingFolders.length&&!existingPosts.length){
        const body=[['knowledge','技术'],['projects','作品集'],['interviews','面试经历'],['essays','随笔']].map(([collection,name])=>({id:'default:'+id+':'+collection,owner_id:id,collection,name,parent_id:null}));
        // One transaction; stable IDs make concurrent first logins idempotent.
        try{await C.request('/rest/v1/blog_folders',{method:'POST',auth:true,body,headers:{Prefer:'return=minimal'}});}catch(error){
          if(error.status!==409)throw error;
          const rows=await C.request('/rest/v1/blog_folders?select=id&owner_id=eq.'+encode(id),{auth:true});
          if(!body.every(f=>rows.some(row=>row.id===f.id)))throw error;
        }
      }
      if(C.currentUser()?.id!==id)throw Error('账号已切换，请重新打开空间。');
      await C.request('/auth/v1/user',{method:'PUT',auth:true,body:{data:{cai_space_initialized_v1:true}}});
    })();initializing.set(id,run);run.catch(()=>initializing.delete(id));return run;
  }
  async function profile(id,by='username'){
    const rows=await C.request('/rest/v1/blog_profiles?select=*&'+by+'=eq.'+encode(id)+'&limit=1',{auth:!!C.currentUser()});return rows[0]||null;
  }
  async function ownProfile(){
    const user=C.currentUser();if(!user)return null;
    let item=await profile(user.id,'user_id');
    if(!item){await C.claimUsername(user.user_metadata?.username||('u_'+user.id.replaceAll('-','').slice(0,20)));item=await profile(user.id,'user_id');}
    return item;
  }
  async function post(id){
    const rows=await C.request('/rest/v1/blog_posts?select=*&id=eq.'+encode(id)+'&limit=1',{auth:!!C.currentUser()});
    if(!rows[0])return null;const author=await profile(rows[0].owner_id,'user_id');return {...rows[0],author};
  }
  const feed=params=>rpc('blog_feed',{who:null,board:null,folder:null,search:'',drafts:false,page_number:1,...params});
  async function forum({section='',search='',page_number=1}={}){
    if(['engineering','general'].includes(section))section='language';
    const sections=['frontend','backend','ai','language','engineering','general'];if(section&&!sections.includes(section))throw Error('论坛分区不存在。');
    const query=new URLSearchParams({select:'id,owner_id,collection,folder_id,title,summary,metadata,published,created_at,updated_at',published:'eq.true','metadata->>forum_sync':'eq.true','metadata->>forum_section':section==='language'?'in.(language,engineering,general)':section?'eq.'+section:'in.('+sections.join(',')+')',order:'created_at.desc,id.desc',limit:'20',offset:String((Math.max(1,Math.min(Number(page_number)||1,10000))-1)*20)});
    if(search.trim()){const pattern='*'+search.trim().slice(0,120).replace(/["\\*%_]/g,' ')+'*';query.set('or','(title.ilike."'+pattern+'",summary.ilike."'+pattern+'",body.ilike."'+pattern+'")');}
    const result=await C.request('/rest/v1/blog_posts?'+query,{headers:{Prefer:'count=exact'},withCount:true});
    const ids=[...new Set(result.data.map(p=>p.owner_id))],profiles=ids.length?await C.request('/rest/v1/blog_profiles?select=user_id,username,display_name&user_id=in.('+ids.map(encode).join(',')+')'):[];
    return {total:result.total,items:result.data.map(p=>({...p,metadata:{...p.metadata,forum_section:['engineering','general'].includes(p.metadata.forum_section)?'language':p.metadata.forum_section},author:profiles.find(a=>a.user_id===p.owner_id)}))};
  }
  const folders=(owner,board)=>C.request('/rest/v1/blog_folders?select=*&owner_id=eq.'+encode(owner)+(board?'&collection=eq.'+encode(board):'')+'&order=name.asc&limit=100',{auth:!!C.currentUser()});
  const titles=(owner,board)=>C.request('/rest/v1/blog_posts?select=id,title,folder_id,published,collection&owner_id=eq.'+encode(owner)+(board?'&collection=eq.'+encode(board):'')+(C.currentUser()?.id===owner?'':'&published=eq.true')+'&order=title.asc&limit=100',{auth:!!C.currentUser()});
  async function moments(page=1,owner=null){
    const rows=await C.request('/rest/v1/blog_posts?select=id,title,body,owner_id,created_at,metadata,published&published=eq.true&metadata->>kind=eq.moment&order=created_at.desc,id.desc&limit=21&offset='+((page-1)*20)+(owner?'&owner_id=eq.'+encode(owner):''));
    const ids=[...new Set(rows.slice(0,20).map(p=>p.owner_id))];
    const profiles=ids.length?await C.request('/rest/v1/blog_profiles?select=user_id,username,display_name&user_id=in.('+ids.map(encode).join(',')+')'):[];
    return {more:rows.length>20,items:rows.slice(0,20).map(p=>({...p,author:profiles.find(a=>a.user_id===p.owner_id)}))};
  }
  async function commentPage({postId=null,spaceId=null,page=1}){
    const query='post_id='+(postId?'eq.'+encode(postId):'is.null')+'&space_id='+(spaceId?'eq.'+encode(spaceId):'is.null');
    const rows=await C.request('/rest/v1/blog_comments?select=*&'+query+'&deleted=eq.false&order=created_at.desc,id.desc&limit=21&offset='+((page-1)*20),{auth:!!C.currentUser()});
    const visible=rows.slice(0,20),ids=[...new Set(visible.map(x=>x.author_id))];
    const authors=ids.length?await C.request('/rest/v1/blog_profiles?select=user_id,username,display_name&user_id=in.('+ids.map(encode).join(',')+')'):[];
    return {items:visible.map(c=>({...c,author:authors.find(a=>a.user_id===c.author_id)})),more:rows.length>20};
  }
  async function compressImage(file){
    if(!['image/png','image/jpeg','image/webp','image/gif'].includes(file.type)||file.size>20*1024*1024)throw Error('请选择不超过 20 MB 的图片。');
    const bitmap=await createImageBitmap(file);try{
      let scale=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
      const canvas=document.createElement('canvas'),context=canvas.getContext('2d');let blob;
      for(let i=0;i<5;i++){
        canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));context.drawImage(bitmap,0,0,canvas.width,canvas.height);
        blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.82-i*.08));
        if(blob&&blob.type==='image/webp'&&blob.size<=1048576)return blob;scale*=.75;
      }
      throw Error('图片压缩后仍过大，请换一张较小的图片。');
    }finally{bitmap.close();}
  }
  async function upload(file){
    const blob=await compressImage(file),path=await rpc('blog_reserve_image',{file_bytes:blob.size},true);
    try{await C.request('/storage/v1/object/blog-images/'+path,{method:'POST',auth:true,binary:true,body:blob,headers:{'Content-Type':'image/webp','x-upsert':'false'}});try{await rpc('blog_settle_images',{},true);}catch{/* Uploaded file stays usable; usage refresh retries settlement. */}return path;}
    catch(e){try{await rpc('blog_release_image',{target:path},true);}catch{}throw e;}
  }
  async function removeImage(path){
    if(await rpc('blog_image_used',{target:path},true))throw Error('这张图片仍被帖子使用，请先从正文中移除。');
    await C.request('/storage/v1/object/blog-images',{method:'DELETE',auth:true,body:{prefixes:[path]}});
    await rpc('blog_release_image',{target:path},true);
  }
  async function saveProfile(data){return C.request('/rest/v1/blog_profiles?user_id=eq.'+encode(C.currentUser().id),{method:'PATCH',auth:true,body:data,headers:{Prefer:'return=representation'}});}
  async function comment(data){return C.request('/rest/v1/blog_comments',{method:'POST',auth:true,body:data,headers:{Prefer:'return=representation'}});}
  window.CommunityAPI={rpc,profile,ownProfile,initializeSpace,moments,post,feed,forum,publicLibrary:owner=>C.request('/rest/v1/blog_posts?select=id,title,summary,collection&owner_id=eq.'+encode(owner)+'&published=eq.true&order=created_at.desc,id.desc&limit=100'),interactions:ids=>rpc('blog_post_interactions',{post_ids:ids}),react:(id,value)=>rpc('blog_react',{target:id,reaction:value},true),folders,titles,commentPage,comment,compressImage,upload,removeImage,saveProfile,
    usage:async()=>{try{await rpc('blog_settle_images',{},true);}catch{}return rpc('blog_usage',{},true);},
    media:()=>C.request('/rest/v1/blog_media?select=*&order=created_at.desc&limit=1000',{auth:true})};
})();
