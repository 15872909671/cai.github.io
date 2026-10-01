/* Shared folder model. IDs stay stable when a post title changes. */
(() => {
  const keys={knowledge:'articles',projects:'projects',interviews:'interviews',essays:'essays'};
  const types={knowledge:'article',projects:'project',interviews:'interview',essays:'essay'};
  function prepare(data){
    if(!data.folders){
      data.folders=data.categories.filter(c=>c!=='全部').map(name=>({id:'knowledge/'+name,name,collection:'knowledge',parent_id:null}));
      data.articles.forEach(a=>{a.folder_id='knowledge/'+a.category;});
    }
    return data;
  }
  const children=(data,collection,parent=null)=>data.folders.filter(f=>f.collection===collection&&(f.parent_id||null)===parent).sort((a,b)=>a.name.localeCompare(b.name,'zh-CN'));
  const posts=(data,collection,parent=null)=>(data[keys[collection]]||[]).filter(p=>(p.folder_id||null)===parent);
  function ancestors(data,id){const result=[],seen=new Set();while(id){if(seen.has(id))break;seen.add(id);const f=data.folders.find(f=>f.id===id);if(!f)break;result.unshift(f);id=f.parent_id;}return result;}
  window.Folders={keys,types,prepare,children,posts,ancestors};
})();
