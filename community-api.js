/* Paged, owner-scoped API. Never preload the full post database. */
(() => {
  const C=window.BlogCloud;
  const encode=encodeURIComponent;
  const rpc=(name,body,auth=!!C.currentUser())=>C.request('/rest/v1/rpc/'+name,{method:'POST',body,auth});
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
  const folders=(owner,board)=>C.request('/rest/v1/blog_folders?select=*&owner_id=eq.'+encode(owner)+(board?'&collection=eq.'+encode(board):'')+'&order=name.asc&limit=100',{auth:!!C.currentUser()});
  const titles=(owner,board)=>C.request('/rest/v1/blog_posts?select=id,title,folder_id,published,collection&owner_id=eq.'+encode(owner)+(board?'&collection=eq.'+encode(board):'')+(C.currentUser()?.id===owner?'':'&published=eq.true')+'&order=title.asc&limit=100',{auth:!!C.currentUser()});
  async function commentPage({postId=null,spaceId=null,page=1}){
    const query='post_id='+(postId?'eq.'+encode(postId):'is.null')+'&space_id='+(spaceId?'eq.'+encode(spaceId):'is.null');
    const rows=await C.request('/rest/v1/blog_comments?select=*&'+query+'&order=created_at.desc,id.desc&limit=21&offset='+((page-1)*20),{auth:!!C.currentUser()});
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
  window.CommunityAPI={rpc,profile,ownProfile,post,feed,folders,titles,commentPage,comment,compressImage,upload,removeImage,saveProfile,
    usage:async()=>{try{await rpc('blog_settle_images',{},true);}catch{}return rpc('blog_usage',{},true);},
    media:()=>C.request('/rest/v1/blog_media?select=*&order=created_at.desc&limit=1000',{auth:true})};
})();
