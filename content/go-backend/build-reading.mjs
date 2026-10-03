import {readFile,writeFile,mkdir,copyFile,readdir} from 'node:fs/promises';
import {JSDOM} from '../../.test-runtime/node_modules/jsdom/lib/api.js';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const dom=new JSDOM('',{runScripts:'outside-only'}),w=dom.window;
for(const f of ['vendor/marked.umd.js','vendor/purify.min.js','markdown.js'])w.eval(await readFile(path.join(root,f),'utf8'));
const files=['01-before-gin.md','02-read-netpoll.md'];let toc='',sections='';
for(let i=0;i<files.length;i++){
 const source=await readFile(path.join(root,'content/go-backend',files[i]),'utf8');
 const body=w.document.createElement('div');body.innerHTML=w.BlogMarkdown.render(source);
 const heading=body.querySelector('h2');heading.id='part-'+(i+1);
 toc+=`<a href="#${heading.id}">${heading.textContent}</a>`;
 body.querySelectorAll('h3').forEach((h,k)=>{h.id=`p${i+1}-s${k+1}`;});
 sections+=`<article>${body.innerHTML}</article>`;
}
const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Go 后端：从请求到内核 · CAI</title><style>
*{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:38px}body{margin:0;background:#fffefa;color:#29343d;font:17px/1.95 system-ui,"Microsoft YaHei",sans-serif}header{border-bottom:1px solid #d9dfe2;padding:22px max(24px,calc((100vw - 850px)/2));font-size:14px;display:flex;gap:24px}header a{text-decoration:none}main{max-width:850px;margin:58px auto;padding:0 26px}h1{font-size:36px;line-height:1.4;letter-spacing:-1px;margin:16px 0 24px}h2{font-size:29px;line-height:1.55;margin:0 0 32px}h3{font-size:23px;line-height:1.6;margin:54px 0 18px}h4{font-size:19px;margin:40px 0 16px}a{color:#326e95;text-underline-offset:4px}nav{padding:22px 0 30px;border-bottom:1px solid #d9dfe2;margin-bottom:70px}nav a{display:block;margin:10px 0}article+article{border-top:2px solid #a6b7c4;padding-top:80px;margin-top:90px}p{margin:22px 0}img{display:block;width:100%;height:auto;margin:34px 0}pre{background:#f0f3f6;border:1px solid #dce2e7;border-radius:4px;padding:20px;overflow:auto;font:14px/1.8 Consolas,monospace}code{font-family:Consolas,monospace;font-size:.9em}p code,li code,td code{background:#edf1f4;padding:2px 4px}table{width:100%;border-collapse:collapse;font-size:15px;margin:28px 0}th,td{text-align:left;border-bottom:1px solid #dce2e7;padding:12px 10px;vertical-align:top}th{background:#f0f3f6}footer{margin:80px 0 40px;color:#65717a;font-size:14px}::selection{background:#dcebf6}@media(max-width:620px){body{font-size:16px}main{margin-top:32px;padding:0 18px}h1{font-size:28px}h2{font-size:24px}h3{font-size:21px}table{font-size:13px}pre{padding:14px}header{padding:16px 18px}}
</style><header><a href="../../">CAI</a><span>Go 后端 · 图解系列</span></header><main><h1>从请求到内核</h1><p>先分清数据在哪里、谁在执行、谁在等待，再回头看框架。</p><nav aria-label="章节">${toc}</nav>${sections}<footer>版本固定与实验状态见各篇说明。图为可编辑矢量示意，支持放大。</footer></main></html>`;
for(const base of ['', 'docs']){
 const dir=path.join(root,base,'reading/go-backend');await mkdir(dir,{recursive:true});await writeFile(path.join(dir,'index.html'),html);
 const assets=path.join(root,base,'assets/go-backend');await mkdir(assets,{recursive:true});
 if(base)for(const file of await readdir(path.join(root,'assets/go-backend')))if(file.endsWith('.svg'))await copyFile(path.join(root,'assets/go-backend',file),path.join(assets,file));
}
dom.window.close();console.log('Built illustrated reading page and docs assets');
