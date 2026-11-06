import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';
import {nodeBatchFields} from '../server/node-batch.mjs';

const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});

test('节点批量修改：只保留填写的字段并校验',()=>{
 assert.deepEqual(nodeBatchFields({ssh_pass:' new-pass ',port:'2222',dns1:'8.8.8.8',dns2:'',ssh_key:'',group_id:''}),{ssh_pass:'new-pass',port:2222,dns1:'8.8.8.8'});
 assert.deepEqual(nodeBatchFields({group_id:'0'}),{group_id:0},'0 = 无分组');
 assert.deepEqual(nodeBatchFields({dns2:'2001:4860:4860::8888'}),{dns2:'2001:4860:4860::8888'});
 assert.throws(()=>nodeBatchFields({}),/至少填写一项/);
 assert.throws(()=>nodeBatchFields({port:'70000'}),/1～65535/);
 assert.throws(()=>nodeBatchFields({dns1:'dns.google'}),/有效的 IP/);
 assert.throws(()=>nodeBatchFields({group_id:'abc'}),/分组无效/);
 assert.deepEqual(nodeBatchFields({clear_ssh_key:true}),{clear_ssh_key:true},'只删除 SSH 密钥');
 assert.deepEqual(nodeBatchFields({clear_ssh_key:true,port:'22'}),{port:22,clear_ssh_key:true});
 assert.throws(()=>nodeBatchFields({clear_ssh_key:true,ssh_key:'KEY'}),/不能同时填写新密钥/);
});

test('节点批量修改：逐台调用修改节点，只提交填写的字段，单台失败不影响其他',async t=>{
 const puts=[],deletes=[];
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');
  if(route==='login')return json('TOKEN');
  if(options.method==='GET'&&/^nodes\/\d+$/.test(route))return json({data:{id:Number(route.split('/')[1]),input_ssh_key:route!=='nodes/6'}});
 if(options.method==='DELETE'){deletes.push(route);if(route==='nodes/8/ssh_key')return json({error:'default_error_message'},400);return json({});}
  if(options.method==='PUT'){const body=Object.fromEntries(new URLSearchParams(options.body));puts.push({route,body});
   if(route==='nodes/7')return json({error:'节点连接失败'},400);return json({});}
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 const cookie=res.headers.get('set-cookie').split(';')[0];
 const csrf=(await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json()).csrf;
 const post=b=>fetch(base+'/api/nodes/batch_update',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(b)});

 let r=await post({ids:[5,7,9],fields:{ssh_pass:'S3cret!',port:'2222',group_id:'3'}});assert.equal(r.status,200);let b=await r.json();
 assert.deepEqual(puts.map(p=>p.route),['nodes/5','nodes/7','nodes/9']);
 assert.deepEqual(puts[0].body,{ssh_pass:'S3cret!',port:'2222',group_id:'3'},'只提交填写的字段');
 assert.equal(b.success,2);assert.equal(b.failed,1);assert.match(b.results.find(x=>x.id===7).error,/节点连接失败/);
 assert.ok(!JSON.stringify(b).includes('S3cret!'),'返回结果里不带密码');

 assert.equal((await post({ids:[5],fields:{}})).status,400);
 assert.equal((await post({ids:[],fields:{port:'22'}})).status,400);
 assert.equal((await post({ids:Array.from({length:101},(_,i)=>i+1),fields:{port:'22'}})).status,400);
 assert.equal(puts.length,3);

 // 删除 SSH 密钥：逐台 DELETE nodes/:id/ssh_key；同时改了其他项时先清空再 PUT，清空失败的节点不再 PUT
 r=await post({ids:[5,8],fields:{clear_ssh_key:true}});b=await r.json();
 assert.deepEqual(deletes,['nodes/5/ssh_key','nodes/8/ssh_key']);assert.equal(puts.length,3,'只删除密钥时不调用修改节点');
 assert.equal(b.success,1);assert.match(b.results.find(x=>x.id===8).error,/平台未能清空 SSH 密钥/);
 r=await post({ids:[6],fields:{clear_ssh_key:true}});b=await r.json();
 assert.equal(b.success,1);assert.equal(b.skipped,1);assert.equal(deletes.length,2,'没有密钥的节点不调用清空接口');
 r=await post({ids:[9,8],fields:{clear_ssh_key:true,port:'2200'}});b=await r.json();
 assert.deepEqual(deletes.slice(2),['nodes/9/ssh_key','nodes/8/ssh_key']);
 assert.deepEqual(puts.slice(3).map(p=>p.route),['nodes/9']);assert.deepEqual(puts[3].body,{port:'2200'});
 assert.equal((await post({ids:[5],fields:{clear_ssh_key:true,ssh_key:'KEY'}})).status,400);
});
