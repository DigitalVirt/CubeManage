import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});

// 冷迁移进度有真实数据时用它；热迁移时它只给 0、没有速度和大小，改用任务列表里迁移任务的进度；任务还没开始的算排队中。
test('迁移队列：冷迁移进度为空时用任务进度，任务未开始的显示排队中',async t=>{
 const calls=[];
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async url=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/migrate')return json({data:[{id:1,hostname:'cold',migrate_status:1},{id:2,hostname:'hot',migrate_status:1},{id:3,hostname:'queued',migrate_status:1},{id:4,hostname:'waiting',migrate_status:0}]});
  if(route==='clouds/1/migrate')return json({data:{taskid:11,progress:'35%',speed:'85MB/s',migrate_size:'14G',total_size:'40G',eta_string:'5分钟',target_node:{id:3,name:'HK-2'}}});
  if(route==='clouds/2/migrate')return json({data:{taskid:12,progress:0,target_node:{id:3,name:'HK-2'}}});
  if(route==='clouds/3/migrate')return json({data:{progress:0}});
  if(route==='tasks'&&url.searchParams.get('status')==='1')return json({data:[{id:12,type:'hot_migrate',status:1,progress:60,hostid:2,msg:'正在热迁移'},{id:99,type:'reboot',status:1,progress:10,hostid:3}],meta:{total:2}});
  if(route==='tasks'&&url.searchParams.get('status')==='0')return json({data:[{id:13,type:'migrate',status:0,progress:0,hostid:3,msg:'等待执行'}],meta:{total:1}});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 const cookie=res.headers.get('set-cookie').split(';')[0];
 const q=await (await fetch(base+'/api/clouds/migrate_queue',{headers:{Cookie:cookie}})).json();
 const by=Object.fromEntries(q.data.map(x=>[x.id,x]));
 assert.deepEqual([by[1].status,by[1].progress,by[1].speed,by[1].source,by[1].target],[1,35,'85MB/s','migrate','HK-2']);
 assert.deepEqual([by[2].status,by[2].progress,by[2].msg,by[2].source,by[2].target],[1,60,'正在热迁移','task','HK-2']);
 assert.deepEqual([by[3].status,by[3].msg],[0,'等待执行'],'迁移任务还没开始：排队中（同一实例的其他任务不算）');
 assert.equal(by[4].status,0);
 assert.equal(q.running,2);
 assert.deepEqual(q.data.map(x=>x.id),[2,1,3,4],'有进度的在上面，进度高的在前，排队中的在后');
 const taskCalls=calls.filter(c=>c.route==='tasks');
 assert.deepEqual(taskCalls.map(c=>c.query.get('status')),['1','0']);
 assert.ok(taskCalls.every(c=>c.query.get('rel_type')==='cloud'));
});
