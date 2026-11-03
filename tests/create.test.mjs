import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';
import {createPayload} from '../server/create.mjs';
import {fieldPayload,resources} from '../server/catalog.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('新建实例：字段校验与整理',()=>{
 assert.throws(()=>createPayload({cpu:2,memory:2048}),e=>Boolean(e.details.os&&e.details.area&&e.details.ip_num));
 const p=createPayload({type:'host',area:1,node:0,store:0,os:12,cpu:2,memory:4096,network_type:'normal',vpc:3,ip_num:1,password_type:1,rootpass:'ignored-pass',ssh_key:5,num:1,the_same_pass:1,port:'auto'});
 assert.equal(p.node,undefined);assert.equal(p.store,undefined);assert.equal(p.vpc,undefined,'经典网络不带 VPC');assert.equal(p.rootpass,undefined,'密钥登录不带密码');assert.equal(p.ssh_key,5);assert.equal(p.the_same_pass,undefined);assert.equal(p.port,'auto');
 assert.throws(()=>createPayload({area:1,os:1,cpu:1,memory:1024,ip_num:1,port:'80'}),e=>Boolean(e.details.port));
 assert.throws(()=>createPayload({area:1,os:1,cpu:1,memory:1024,ip_num:1,network_type:'vpc',vpc_ips:'8.8.8.0/24'}),e=>Boolean(e.details.vpc_ips));
 assert.throws(()=>createPayload({area:1,os:1,cpu:1,memory:1024,ip_num:1,password_type:1}),e=>Boolean(e.details.ssh_key));
});

test('节点表单：可用 IP 段为 ID 列表，默认开启自动开机',()=>{
 const r=fieldPayload('nodes',{name:'n',area_id:1,ip:'192.0.2.1',ip_segment_id:[3,'4',3]});
 assert.deepEqual(r.errors,{});assert.deepEqual(r.output.ip_segment_id,[3,4]);assert.equal(r.output.auto_boot_host,1);assert.equal(r.output.choose_store_rule,'0');
 assert.ok(fieldPayload('nodes',{name:'n',area_id:1,ip:'x',ip_segment_id:['a']}).errors.ip_segment_id);
 assert.ok(resources.nodes.fields.some(f=>f.key==='group_id'));
});

test('新建实例：按文档调用 create_page、node_images 和 POST v1/clouds',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-create-'));const calls=[];
 const app=createApp({auditFile:path.join(dir,'audit.jsonl'),clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/create_page')return json({data:[{id:1,name:'香港',country_code:'HK',store:[{id:7,show_name:'ceph',status:1,free:900}],node:[{id:3,name:'HK-1',status:1,store:[]}]}],node_type:['host','lightHost']});
  if(route==='node_images')return json([{id:1,name:'Ubuntu',svg:2,image:[{id:12,name:'Ubuntu 24.04',min_disk_size:10}]}]);
  if(route==='clouds'&&options.method==='POST')return json({num:1,id:[901],taskid:55});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;

 let r=await request('/clouds/create_page?type=lightHost');assert.equal(calls.at(-1).query.get('type'),'lightHost');assert.equal(r.body.areas[0].node[0].name,'HK-1');assert.equal(r.body.areas[0].store[0].name,'ceph');assert.deepEqual(r.body.node_type,['host','lightHost']);
 r=await request('/images/available?area=1');let q=calls.at(-1).query;assert.equal(q.get('type'),'area');assert.equal(q.get('id'),'1');assert.equal(r.body.data[0].name,'Ubuntu 24.04');
 r=await request('/clouds/create','POST',{area:1,os:12,cpu:2,memory:4096,ip_num:1,network_type:'normal',rootpass:'Secret-123',hostname:'web',evil:'x'});
 assert.equal(r.status,200);assert.deepEqual(r.body.ids,[901]);assert.equal(r.body.taskid,55);
 const c=calls.at(-1);assert.equal(c.route,'clouds');assert.equal(c.method,'POST');assert.equal(c.body.get('memory'),'4096');assert.equal(c.body.get('rootpass'),'Secret-123');assert.equal(c.body.get('evil'),null);
 r=await request('/clouds/create','POST',{area:1,cpu:2,memory:4096,ip_num:1});assert.equal(r.status,400);assert.ok(r.body.fields.os);
});
