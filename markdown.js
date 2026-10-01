/* A deliberately small, escaped Markdown subset. Raw HTML is always text. */
(() => {
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function inline(source){
    const tokens=[];let text=escape(source);
    text=text.replace(/`([^`]+)`/g,(_,code)=>{tokens.push('<code>'+code+'</code>');return '\u0000'+(tokens.length-1)+'\u0000';});
    text=text.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s)]+|media:[a-zA-Z0-9_-]+\/[a-zA-Z0-9_.-]+)\)/g,(_,label,url)=>{
      tokens.push(`<img ${url.startsWith('media:')?'data-media="'+url.slice(6)+'"':'src="'+url+'"'} alt="${label}" loading="lazy" referrerpolicy="no-referrer">`);return '\u0000'+(tokens.length-1)+'\u0000';
    });
    text=text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`);
    text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>');
    return text.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[i]||'');
  }
  function render(source){
    const lines=String(source||'').replace(/\r/g,'').replace(/\u0000/g,'').split('\n');let result='',paragraph=[],list=[],listType='',code=null;
    const flush=()=>{if(paragraph.length){result+='<p>'+inline(paragraph.join('\n')).replace(/\n/g,'<br>')+'</p>';paragraph=[];}if(list.length){result+='<'+listType+'>'+list.map(s=>'<li>'+inline(s)+'</li>').join('')+'</'+listType+'>';list=[];listType='';}};
    for(const line of lines){
      if(/^```/.test(line)){flush();if(code!==null){result+='<pre><code>'+escape(code.join('\n'))+'</code></pre>';code=null;}else code=[];continue;}
      if(code!==null){code.push(line);continue;}
      const heading=line.match(/^(#{1,6})\s+(.+)$/),bullet=line.match(/^\s*([-*]|\d+\.)\s+(.+)$/);
      if(heading){flush();const level=Math.min(6,heading[1].length+1);result+='<h'+level+'>'+inline(heading[2])+'</h'+level+'>';}
      else if(bullet){const type=/\d/.test(bullet[1])?'ol':'ul';if(paragraph.length||(listType&&listType!==type))flush();listType=type;list.push(bullet[2]);}
      else if(!line.trim())flush();else{if(list.length)flush();paragraph.push(line);}
    }
    flush();if(code!==null)result+='<pre><code>'+escape(code.join('\n'))+'</code></pre>';return result;
  }
  window.BlogMarkdown={render,escape};
})();
