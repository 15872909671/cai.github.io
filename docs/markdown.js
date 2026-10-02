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
  if(window.marked&&window.DOMPurify){
    const renderer=new window.marked.Renderer();
    renderer.html=({text})=>escape(text);
    renderer.heading=function({tokens,depth}){const level=Math.min(6,depth+1);return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;};
    renderer.image=({href,text})=>/^media:[\w-]+\/[\w.-]+$/.test(href)?`<img data-media="${escape(href.slice(6))}" alt="${escape(text)}" loading="lazy">`:/^https?:\/\//i.test(href)?`<img src="${escape(href)}" alt="${escape(text)}" loading="lazy" referrerpolicy="no-referrer">`:escape(text);
    renderer.link=function({href,tokens}){const label=this.parser.parseInline(tokens);return /^(https?:\/\/|mailto:|#)/i.test(href)?`<a href="${escape(href)}"${href.startsWith('#')?'':' target="_blank" rel="noopener noreferrer"'}>${label}</a>`:label;};
    const parser=new window.marked.Marked({renderer,gfm:true,breaks:true});
    const fullRender=source=>window.DOMPurify.sanitize(parser.parse(String(source||'').replace(/^\uFEFF/,'').replace(/\u0000/g,'')),{USE_PROFILES:{html:true},ADD_ATTR:['target','data-media'],ALLOW_DATA_ATTR:false,FORBID_TAGS:['style','form','iframe','object','embed']});
    window.BlogMarkdown={render:fullRender,escape};
  }else window.BlogMarkdown={render,escape};
  window.BlogMarkdown.readFile=async file=>{
    if(!file||! /\.(md|markdown)$/i.test(file.name))throw Error('请选择 .md 或 .markdown 文件。');
    if(file.size>2*1024*1024)throw Error('Markdown 文件不能超过 2 MB。');
    const text=(await file.text()).replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n');
    const heading=text.match(/^#\s+([^\n]+)\n*/);const body=heading?text.slice(heading[0].length):text;
    if(body.length>200000)throw Error('正文不能超过 200000 个字符。');
    return {title:(heading?heading[1]:file.name.replace(/\.(md|markdown)$/i,'')).trim().slice(0,200),body};
  };
})();
