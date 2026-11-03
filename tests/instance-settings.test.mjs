import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const detail={id:7,hostname:'web-07',acpi:1,apic:1,vnc:1,vncport:29567,vncpass:'VNC-SECRET',bootorder:'c',cpumodel:2,pae:0,clock:0,console:0,queues:1,gpu:0,skip_cold_backup:0,qemu:'6.2.0',qemu_version:['6.2.0','8.2.0'],simulate_physical_machine:0,cpu_limit:'0',
 iso:[{id:31,name:'virtio.iso'}],disk:[{id:701,type:'system',dev:'vda',size:20,name:'kvm7-system'},{id:702,type:'data',dev:'vdb',size:50,name:'kvm7-data'}]};

// 设置、快照 / 备份、计划任务按 digitalvirt-v1-api.md 调用平台；设置只提交改动的字段，控制台密码不随设置下发。
test('实例设置、快照备份与计划任务按文档调用平台接口',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-settings-'));const calls=[];
 const app=createApp({auditFile:path.join(dir,'audit.jsonl'),clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/7'&&options.method==='GET')return json(detail);
  if(route==='clouds/7/snapshots')return json({data:[{id:91,name:'s1',type:'snap',status:1}],meta:{total:1,total_page:1}});
  if(route==='clouds/7/cron_snap'&&options.method==='GET')return json({data:[{id:5,type:'snap',frequency:1,cycle:'day',point:'03:00',disk:[{id:701}]}]});
  if(route==='clouds/7/xml')return json({data:{xml:'<domain/>'}});
  return json({taskid:88});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;

 res=await request('/clouds/7/settings');const s=await res.json();
 assert.equal(s.vncpass,undefined);assert.equal(s.vncpass_set,true);assert.equal(s.boot_disk,701);assert.deepEqual(s.qemu_versions,['6.2.0','8.2.0']);

 calls.length=0;res=await request('/clouds/7/settings','PUT',{acpi:0,bootorder:'dc',cpu_limit:50,boot_disk:702});assert.equal(res.status,200);
 const put=calls.find(c=>c.route==='clouds/7'&&c.method==='PUT');assert.equal(put.body.get('acpi'),'0');assert.equal(put.body.get('bootorder'),'dc');assert.equal(put.body.get('cpu_limit'),null);
 assert.equal(calls.find(c=>c.route==='clouds/7/cpu_limit').body.get('cpu_limit'),'50');assert.ok(calls.some(c=>c.route==='disks/702/boot'&&c.method==='POST'));
 assert.equal((await request('/clouds/7/settings','PUT',{bootorder:'x'})).status,400);
 assert.equal((await request('/clouds/7/settings','PUT',{qemu:'1.0'})).status,400);
 assert.equal((await request('/clouds/7/settings','PUT',{boot_disk:999})).status,404);
 assert.equal((await request('/clouds/7/settings','PUT',{})).status,400);

 res=await request('/clouds/7/vncpass');assert.equal((await res.json()).vncpass,'VNC-SECRET');
 res=await request('/clouds/7/xml');assert.equal((await res.json()).xml,'<domain/>');
 calls.length=0;assert.equal((await request('/clouds/7/iso','DELETE',{iso:31})).status,200);assert.equal(calls.find(c=>c.route==='clouds/7/iso').body.get('iso'),'31');
 assert.equal((await request('/clouds/7/iso','DELETE',{iso:99})).status,404);

 res=await request('/clouds/7/snapshots?type=backup');assert.equal((await res.json()).data.length,1);assert.equal(calls.at(-1).query.get('type')??calls.find(c=>c.route==='clouds/7/snapshots').query.get('type'),'backup');
 calls.length=0;assert.equal((await request('/clouds/7/snapshots','POST',{type:'snap',disk:701,name:'before'})).status,200);
 const create=calls.find(c=>c.route==='disks/701/snapshots');assert.equal(create.query.get('hostid'),'7');assert.equal(create.body.get('type'),'snap');
 assert.equal((await request('/clouds/7/snapshots','POST',{type:'snap',disk:999})).status,404);
 calls.length=0;await request('/clouds/7/snapshots/91/restore','POST',{});assert.equal(calls.find(c=>c.route==='snapshots/91/restore').query.get('hostid'),'7');
 calls.length=0;await request('/clouds/7/snapshots/91','DELETE',{});assert.ok(calls.some(c=>c.route==='snapshots/91'&&c.method==='DELETE'));

 res=await request('/clouds/7/cron');assert.equal((await res.json()).data.length,1);
 calls.length=0;assert.equal((await request('/clouds/7/cron','POST',{type:'backup',frequency:1,cycle:'day',point:'03:00',disk:[701]})).status,200);
 const cron=calls.find(c=>c.route==='clouds/7/cron_snap'&&c.method==='POST');assert.equal(cron.body.get('cycle'),'day');assert.equal(cron.body.get('point'),'03:00');
 assert.equal((await request('/clouds/7/cron','POST',{type:'snap',frequency:1,cycle:'day',disk:[999]})).status,404);
 assert.equal((await request('/clouds/7/cron','POST',{type:'snap',frequency:1,cycle:'day',point:'25:00',disk:[701]})).status,400);
 calls.length=0;await request('/clouds/7/cron/5','DELETE',{});assert.ok(calls.some(c=>c.route==='clouds/7/cron_snap/5'&&c.method==='DELETE'));
});
