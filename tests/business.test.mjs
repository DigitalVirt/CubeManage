import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

test('业务管理：VPC、磁盘、安全组与规则、实例模板、SSH 密钥按文档调用',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-biz-'));const auditFile=path.join(dir,'audit.jsonl');const calls=[];
 const app=createApp({auditFile,clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='vpc_networks'&&options.method==='GET')return json({data:[{id:4,name:'vpc-a',ips:'10.0.0.0/24',host:[{id:9,hostname:'web'}]}],meta:{total:1,total_page:1}});
  if(route==='security_groups/3/rules'&&options.method==='GET')return json({data:[{id:31,direction:'in',protocol:'tcp',port:'22',ip:'0.0.0.0/0'}],meta:{total:1,total_page:1,direction_in_num:1,direction_out_num:0}});
  if(route==='ssh_keys'&&options.method==='POST')return json({id:77,key:'-----BEGIN OPENSSH PRIVATE KEY-----\nPRIVATE\n-----END OPENSSH PRIVATE KEY-----'});
  if(route==='ssh_keys/77/clouds')return json({num:2});
  if(route==='clouds/9/templates')return json({taskid:501});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 const last=()=>calls.at(-1);

 // VPC：列表按区域筛选，改名 PUT v1/vpc_networks/:id，删除逐个 DELETE
 let r=await request('/net/vpcs?area=2&search=vpc');assert.equal(r.body.data[0].ips,'10.0.0.0/24');assert.equal(last().query.get('area'),'2');assert.equal(last().query.get('search'),'vpc');
 r=await request('/net/vpcs/4','PUT',{name:'vpc-b'});assert.equal(last().route,'vpc_networks/4');assert.equal(last().body.get('name'),'vpc-b');
 r=await request('/net/vpcs','DELETE',{ids:[4],count:1});assert.equal(r.body.success,1);assert.equal(last().route,'vpc_networks/4');assert.equal(last().method,'DELETE');
 r=await request('/net/vpcs','POST',{name:'x'});assert.equal(r.status,405,'VPC 不能在这里新建');

 // 磁盘：筛选映射、新建独立磁盘、编辑驱动只接受文档里的值、挂载 / 卸载 / 恢复
 await request('/net/disks?type=data&status=5&independent=0');let q=last().query;assert.equal(q.get('type'),'data');assert.equal(q.get('status'),'5');assert.equal(q.get('create_with_host'),'0');
 r=await request('/net/disks','POST',{uid:'3',size:'50',remarks:'数据盘'});assert.equal(r.status,200);assert.equal(last().route,'disks');assert.equal(last().body.get('size'),'50');
 r=await request('/net/disks/8','PUT',{driver:'floppy'});assert.equal(r.status,400);
 r=await request('/net/disks/8','PUT',{driver:'virtio',remarks:'改名'});assert.equal(last().route,'disks/8');assert.equal(last().body.get('driver'),'virtio');
 await request('/biz/disks/8/mount','POST',{cloud:9,driver:'scsi'});assert.equal(last().route,'disks/8/mount');assert.equal(last().body.get('cloud'),'9');
 await request('/biz/disks/8/unmount','POST',{cloud:9,force:1});assert.equal(last().route,'clouds/9/disks/8');assert.equal(last().method,'DELETE');assert.equal(last().body.get('force'),'1');
 await request('/biz/disks/restore','POST',{ids:[8,10],count:2});assert.equal(last().route,'disks/recycle_bin');assert.equal(last().body.get('id[1]'),'10');

 // 安全组与规则
 r=await request('/net/security-groups','POST',{name:'web',uid:'3',type:'host'});assert.equal(last().route,'security_groups');assert.equal(last().body.get('create_default_rule'),'1');
 r=await request('/biz/security-groups/3/rules?direction=in');assert.equal(r.body.data[0].port,'22');assert.equal(r.body.counts.in,1);assert.equal(last().query.get('direction'),'in');
 r=await request('/biz/security-groups/3/rules','POST',{direction:'in',protocol:'smtp',port:'25',ip:'0.0.0.0/0'});assert.equal(r.status,400,'协议必须是文档列出的值');
 r=await request('/biz/security-groups/3/rules','POST',{direction:'in',protocol:'tcp',port:'8080',ip:'0.0.0.0/0',lock:1});assert.equal(last().route,'security_groups/3/rules');assert.equal(last().body.get('lock'),'1');
 await request('/biz/security-group-rules/31','PUT',{port:'2222'});assert.equal(last().route,'security_group_rules/31');assert.equal(last().method,'PUT');
 await request('/biz/security-group-rules','DELETE',{ids:[31,32],count:2});assert.equal(last().route,'security_group_rules');assert.equal(last().body.get('id[0]'),'31');

 // 实例模板
 r=await request('/biz/templates','POST',{hostid:9,name:'base'});assert.equal(last().route,'clouds/9/templates');assert.equal(r.body.result.taskid,501);
 r=await request('/biz/templates','POST',{hostid:9,name:''});assert.equal(r.status,400);
 await request('/net/templates','DELETE',{ids:[5],count:1});assert.equal(last().route,'templates/5');

 // SSH 密钥：自动生成时私钥只返回给这一次请求；导入时校验公钥；绑定 / 解除
 r=await request('/biz/ssh-keys','POST',{type:0,uid:3,name:'ops'});assert.equal(r.body.id,77);assert.match(r.body.key,/PRIVATE KEY/);assert.equal(last().body.get('public_key'),null);
 r=await request('/biz/ssh-keys','POST',{type:1,uid:3,name:'ops',public_key:'not-a-key'});assert.equal(r.status,400);assert.ok(r.body.fields.public_key);
 r=await request('/biz/ssh-keys/77/clouds','POST',{hostid:[9,10]});assert.equal(r.body.num,2);assert.equal(last().body.get('hostid[1]'),'10');
 await request('/biz/ssh-keys/77/clouds','DELETE',{hostid:[9]});assert.equal(last().method,'DELETE');

});
