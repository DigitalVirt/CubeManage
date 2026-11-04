import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});

test('节点详情：合并节点详情、内容页和实时数据，去掉敏感字段，实时数据失败时其余照常返回',async t=>{
 let realFails=false;const calls=[],puts=[];
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push(route);
  if(options.method==='PUT'){puts.push({route,body:Object.fromEntries(new URLSearchParams(options.body))});return json({});}
  if(route==='login')return json('TOKEN');
  if(route==='nodes/5')return json({data:{id:5,name:'HK-1',ip:'198.51.100.5',status:1,type:'host',ssh_pass:'SSH-SECRET',password:'NODE-SECRET',ssh_key:'KEY-SECRET',dns1:'1.1.1.1'}});
  if(route==='node_info/5')return json({data:{id:5,count:{host:12,ip_total:64,ip_used:20},assign_cpu:48,remark:'机房 A'}});
  if(route==='nodes/5/real_data')return realFails?json({error:'节点连接超时'}):json({data:{cpu_use_percent:23.5,cpu_info:{model_name:'Xeon',cores:32},memory:{use_percent:61.2,total_memory:'256G'},disk:[{mount_point:'/',disk_percent:'45%'}],kernel_version:'6.8',uptime:'12 天'}});
  if(route==='nodes/5/status')return json({status:1,version:'2.4.8',msg:'正常'});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 const cookie=res.headers.get('set-cookie').split(';')[0];
 const get=path=>fetch(base+path,{headers:{Cookie:cookie}});

 let r=await get('/api/nodes/5/overview');assert.equal(r.status,200);let body=await r.json();
 assert.equal(body.node.name,'HK-1');assert.equal(body.info.count.host,12);assert.equal(body.real.cpu_info.model_name,'Xeon');assert.equal(body.real.disk[0].disk_percent,'45%');
 const raw=JSON.stringify(body);for(const secret of ['SSH-SECRET','NODE-SECRET','KEY-SECRET'])assert.ok(!raw.includes(secret),secret+' 不应返回给浏览器');
 assert.deepEqual(calls.filter(x=>x!=='login').sort(),['node_info/5','nodes/5','nodes/5/real_data','nodes/5/status']);
 assert.deepEqual(body.state,{status:1,msg:'正常',version:'2.4.8'});

 realFails=true;r=await get('/api/nodes/5/overview');body=await r.json();
 assert.equal(r.status,200);assert.equal(body.real,null);assert.match(body.errors.real,/节点连接超时/);assert.equal(body.node.name,'HK-1');

 r=await get('/api/nodes/abc/overview');assert.equal(r.status,400);

 // 开关：只提交这一个字段；其他字段和非 0/1 的值被拒绝
 const csrf=(await (await fetch(base+'/api/session',{headers:{Cookie:cookie}})).json()).csrf;
 const put=b=>fetch(base+'/api/nodes/5/switch',{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},body:JSON.stringify(b)});
 r=await put({field:'maintenance_mode',value:1});assert.equal(r.status,200);
 assert.deepEqual(puts,[{route:'nodes/5',body:{maintenance_mode:'1'}}]);
 assert.equal((await put({field:'password',value:1})).status,400);
 assert.equal((await put({field:'enable',value:2})).status,400);
 assert.equal(puts.length,1);
});
