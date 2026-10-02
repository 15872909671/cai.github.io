import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const path='owner/image.webp',calls=[];let uploadFails=false,settleFails=false,closed=0;
const context={window:{BlogCloud:{currentUser:()=>({id:'owner'}),request:async(url,options)=>{
 calls.push({url,options});
 if(url.endsWith('blog_reserve_image'))return path;
 if(url.includes('/storage/v1/object/')&&uploadFails)throw Error('Upload failed');
 if(url.endsWith('blog_settle_images')&&settleFails)throw Error('Settlement unavailable');
 if(url.endsWith('blog_usage'))return {imageBytes:1048576};
 return null;
}}},createImageBitmap:async()=>({width:4000,height:2000,close(){closed++;}}),document:{createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}}),toBlob(cb,type){assert.ok(this.width<=1920);assert.ok(this.height<=1920);cb({type,size:1024});}})}};
vm.runInNewContext(await readFile('community-api.js','utf8'),context);
const api=context.window.CommunityAPI,file={type:'image/png',size:12000};
assert.equal(await api.upload(file),path);assert.equal(closed,1);
assert.deepEqual(calls.map(c=>c.url),['/rest/v1/rpc/blog_reserve_image','/storage/v1/object/blog-images/'+path,'/rest/v1/rpc/blog_settle_images']);
assert.equal(calls[1].options.binary,true);assert.equal(calls[1].options.headers['Content-Type'],'image/webp');
assert.equal(calls[1].options.headers['x-upsert'],'false');assert.equal(calls[1].options.body.size,1024);
calls.length=0;uploadFails=true;await assert.rejects(api.upload(file),/Upload failed/);assert.ok(calls.some(c=>c.url.endsWith('blog_release_image')));
calls.length=0;uploadFails=false;settleFails=true;assert.equal(await api.upload(file),path);assert.ok(!calls.some(c=>c.url.endsWith('blog_release_image')));
calls.length=0;assert.equal((await api.usage()).imageBytes,1048576);assert.equal(calls[0].url,'/rest/v1/rpc/blog_settle_images');
calls.length=0;await assert.rejects(api.upload({type:'image/svg+xml',size:10}));assert.equal(calls.length,0);
console.log('PASS: image upload orchestration reserves before binary upload, settles afterward, releases failed uploads, preserves successful uploads during settlement failure and retries on usage refresh. Canvas encoding itself still requires browser verification.');

