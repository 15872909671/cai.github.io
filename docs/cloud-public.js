(() => {
  if(!window.CLOUD_CONFIG.enabled)return;
  const D=window.BLOG;
  // The database is authoritative once enabled. Never fall back to old withdrawn posts.
  for(const key of Object.values(window.Folders.keys))D[key]=[];
  D.folders=[];D.categories=['全部'];window.refreshBlog();
  const message=document.createElement('p');message.className='notice';message.setAttribute('role','status');message.textContent='正在载入帖子……';document.getElementById('main').before(message);
  window.BlogCloud.load().then(remote=>{window.BlogCloud.apply(D,remote);window.refreshBlog();message.remove();}).catch(()=>{message.textContent='在线内容暂时无法载入，请稍后刷新重试。';});
})();
