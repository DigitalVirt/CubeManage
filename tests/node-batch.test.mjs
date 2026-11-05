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
});

test('节点批量修改：逐台调用修改节点，只提交填写的字段，单台失败不影响其他',async t=>{
 const puts=[];
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');
  if(route==='login')return json('TOKEN');
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
});
