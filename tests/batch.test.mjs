import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

// Every batch operation must reach the endpoint the platform documents (v1 API doc), with that method and body.
test('批量操作：真实代理按文档调用平台接口、汇总结果',async t=>{
 let nodeShape='doc';
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-batch-'));const auditFile=path.join(dir,'audit.jsonl');const calls=[];
 const app=createApp({auditFile,clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/export_csv')return new Response('ID,主机名\n"7","web-07"\n',{headers:{'Content-Type':'text/csv'}});
  if(route==='clouds/5/off'||route==='clouds/5/migrate')return json({error:'实例正在执行任务'});
  if(route==='clouds/password')return json({data:[{id:7,old_pass:'OLD-SECRET',new_pass:'Rnd-7',taskid:1},{id:9,old_pass:'OLD-SECRET',new_pass:'Rnd-9',taskid:2}]});
  if(route==='clouds/ip/change')return json({success_count:1,failed_count:1,success_list:[{id:7}],failed_list:[{id:9,hostname:'db-09',reason:'IP 不足'}]});
  if(route==='clouds/ipv6')return json({success_count:2,failed_count:0,success_list:[{host_id:7,added_ipv6:['2001:db8::7']},{host_id:9,added_ipv6:['2001:db8::9']}],failed_list:[]});
  if(route==='ip/free')return json([{id:1,ip_name:'段 A',ip:[{id:801,ip:'198.51.100.1'},{id:802,ip:'198.51.100.2'},{id:803,ip:'198.51.100.3'}]}]);
  if(route==='clouds/7/ip')return json({interface:[{name:'eth0',public_ip:[{id:71,ip:'203.0.113.7'},{id:72,ip:'203.0.113.8'}]}]});
  if(route==='clouds/9/ip')return json({interface:[{name:'eth0',public_ip:[{id:91,ip:'203.0.113.9'}]}]});
  if(route==='common/enable_migrate_node')return nodeShape==='doc'?json({area:[{id:1,name:'香港',node:[{id:3,name:'HK-1'}]}]}):nodeShape==='data'?json({data:[{id:1,name:'香港',node:{'3':{id:3,name:'HK-1'}}}]}):json({error:'无权访问'},403);
  if(route==='nodes')return json({data:[{id:5,name:'LA-1',status:1,area_name:'洛杉矶'},{id:6,name:'LA-2',status:0}],meta:{total:2,total_page:1}});
  if(route==='ip_groups/select')return json({data:[{id:2,name:'默认'}],meta:{total:1,total_page:1}});
  return json({num:2,taskid:5});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;
 const batch=async(op,extra={},ids=[7,9])=>{calls.length=0;const r=await request('/clouds/batch/'+op,'POST',{ids,count:ids.length,...extra});return {status:r.status,body:await r.json(),calls:calls.filter(c=>c.route!=='login')};};
 const arr=(params,key)=>[...params.keys()].filter(k=>k.startsWith(key+'[')).map(k=>params.get(k));

 // Per-instance actions: one documented call each, failures reported per instance.
 for(const [op,suffix]of [['on','on'],['off','off'],['reboot','reboot'],['hard_reboot','hard_reboot'],['hardoff','hardoff'],['suspend','suspend'],['unsuspend','unsuspend'],['resume','resume']]){
  const r=await batch(op);assert.equal(r.status,200,op);assert.deepEqual(r.calls.map(c=>c.method+' '+c.route),[`POST clouds/7/${suffix}`,`POST clouds/9/${suffix}`],op);assert.equal(r.body.success,2,op);
 }
 let r=await batch('off',{},[7,5]);assert.equal(r.body.success,1);assert.equal(r.body.failed,1);assert.equal(r.body.results.find(x=>x.id===5).error,'实例正在执行任务');

 // Native batch endpoints.
 r=await batch('delete');assert.equal(r.calls[0].method+' '+r.calls[0].route,'DELETE clouds');assert.deepEqual(arr(r.calls[0].body,'id'),['7','9']);assert.equal(r.calls[0].body.get('force'),'0');
 r=await batch('force_delete');assert.equal(r.calls[0].body.get('force'),'1');
 r=await batch('rebuild');assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds/rebuild');
 r=await batch('cancel_migrate');assert.equal(r.calls[0].method+' '+r.calls[0].route,'DELETE clouds/migrate');
 // 迁移: one 迁移实例 call per instance, never the batch queue; a failed instance does not stop the rest.
 r=await batch('migrate',{node:3});assert.deepEqual(r.calls.map(c=>c.method+' '+c.route),['POST clouds/7/migrate','POST clouds/9/migrate']);assert.equal(r.calls[0].body.get('node'),'3');assert.equal(r.calls[0].body.get('hot_migrate'),null);assert.equal(r.body.success,2);
 r=await batch('migrate',{node:3,mode:'0'},[5,9]);assert.equal(r.calls[1].body.get('hot_migrate'),'0');assert.equal(r.body.failed,1);assert.equal(r.body.success,1);assert.equal(r.calls.length,2);
 // 重新分配 IP: free IPs of the target node, as many per instance as it has now, never shared; short pool → that instance fails.
 r=await batch('migrate',{node:3,assign_ip:true});{const posts=r.calls.filter(c=>c.method==='POST');assert.equal(r.calls.find(c=>c.route==='ip/free').query.get('node'),'3');
  assert.deepEqual(posts.map(c=>[c.route,arr(c.body,'ip')]),[['clouds/7/migrate',['801','802']],['clouds/9/migrate',['803']]]);}
 // One instance per request (the dialog's progress view): IPs already handed out are excluded, and the assigned ones come back.
 r=await batch('migrate',{node:3,assign_ip:true,exclude_ip:[801,802]},[9]);assert.deepEqual(arr(r.calls.find(c=>c.method==='POST').body,'ip'),['803']);assert.deepEqual(r.body.results[0].ip,[803]);
 r=await batch('rules',{advanced_bw:4});assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds/advanced_rule');assert.equal(r.calls[0].body.get('advanced_bw'),'4');assert.equal(r.calls[0].body.get('advanced_cpu'),null);
 r=await batch('ipv6',{num:2});assert.equal(r.calls[0].method+' '+r.calls[0].route,'POST clouds/ipv6');assert.deepEqual(arr(r.calls[0].body,'ids'),['7','9']);assert.deepEqual(r.body.ipv6.map(x=>x.ipv6[0]),['2001:db8::7','2001:db8::9']);
 r=await batch('replace_ip',{num:1,ip_group:2});assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds/ip/change');assert.equal(r.calls[0].body.get('ip_group'),'2');assert.equal(r.body.failed,1);assert.equal(r.body.results.find(x=>x.id===9).error,'IP 不足');
 r=await batch('settings',{in_bw:100,cpu_limit:50});assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds');assert.equal(r.calls[0].body.get('in_bw'),'100');assert.equal(r.calls[0].body.get('out_bw'),null);
 r=await batch('reinstall',{os:12,password_type:0,password:'Secret#1',format_data_disk:true,app_preset_id:0});assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds/reinstall');assert.equal(r.calls[0].body.get('os'),'12');assert.equal(r.calls[0].body.get('format_data_disk'),'1');assert.equal(r.calls[0].body.get('app_preset_id'),'0');
 r=await batch('reinstall',{os:12,password_type:1,ssh_key:3});assert.equal(r.calls[0].body.get('ssh_key'),'3');assert.equal(r.calls[0].body.get('password'),null);

 // Random passwords come back once; the old passwords never leave the BFF.
 r=await batch('password',{password:'Throwaway#1',same:false});assert.equal(r.calls[0].method+' '+r.calls[0].route,'PUT clouds/password');assert.equal(r.calls[0].body.get('this_same_pass'),'0');assert.deepEqual(r.body.passwords,[{id:7,password:'Rnd-7'},{id:9,password:'Rnd-9'}]);assert.ok(!JSON.stringify(r.body).includes('OLD-SECRET'));
 r=await batch('password',{password:'Same#Pass1',same:true});assert.equal(r.calls[0].body.get('this_same_pass'),'1');assert.deepEqual(r.body.passwords,[]);

 // Guards: stale selection, unknown operation, invalid parameters, CSRF.
 assert.equal((await request('/clouds/batch/off','POST',{ids:[7,9],count:3})).status,400);
 assert.equal((await request('/clouds/batch/format','POST',{ids:[7],count:1})).status,404);
 assert.equal((await request('/clouds/batch/ipv6','POST',{ids:[7],count:1,num:5000})).status,400);
 assert.equal((await request('/clouds/batch/rules','POST',{ids:[7],count:1})).status,400);
 assert.equal((await fetch(base+'/api/clouds/batch/off',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({ids:[7],count:1})})).status,403);

 // Export is a CSV download; lookups are trimmed to id and name.
 calls.length=0;res=await request('/clouds/export?ids=7,9');assert.equal(res.status,200);assert.match(res.headers.get('content-type'),/text\/csv/);assert.match(await res.text(),/web-07/);const exp=calls.find(c=>c.route==='clouds/export_csv');assert.deepEqual(exp.query.getAll('id[]'),['7','9']);
 res=await request('/lookups/migrate_nodes');assert.deepEqual((await res.json()).data,[{id:3,name:'HK-1',group:'香港'}]);
 // Other response shapes of 可选迁移节点 are read too; if it fails, the enabled nodes from 节点列表 are offered instead.
 nodeShape='data';res=await request('/lookups/migrate_nodes');assert.deepEqual((await res.json()).data,[{id:3,name:'HK-1',group:'香港'}]);
 nodeShape='fail';res=await request('/lookups/migrate_nodes');assert.equal(res.status,200);assert.deepEqual((await res.json()).data,[{id:5,name:'LA-1',group:'洛杉矶'}]);nodeShape='doc';
 res=await request('/lookups/ip_groups');assert.deepEqual((await res.json()).data,[{id:2,name:'默认'}]);
 assert.equal((await request('/lookups/passwords')).status,404);

});

// 回收站: 从回收站恢复实例 (DELETE v1/recycle_bin) and 回收站彻底删除实例 (DELETE v1/clouds/recycle_bin).
test('回收站：恢复与彻底删除按文档调用平台接口并汇总失败',async t=>{
 const calls=[];
 const app=createApp({auditFile:path.join(os.tmpdir(),'cubemanage-recycle-'+Date.now()+'.jsonl'),clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/recycle_bin')return json({failed_list:[{id:9,reason:'实例不在回收站中'}]});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;
 calls.length=0;res=await request('/clouds/batch/restore','POST',{ids:[7,9],count:2});let body=await res.json();
 let c=calls.find(x=>x.route==='recycle_bin');assert.equal(c.method,'DELETE');assert.deepEqual(c.body.getAll('id[0]').concat(c.body.getAll('id[1]')),['7','9']);assert.equal(body.success,2);
 calls.length=0;res=await request('/clouds/batch/purge','POST',{ids:[7,9],count:2});body=await res.json();
 c=calls.find(x=>x.route==='clouds/recycle_bin');assert.equal(c.method,'DELETE');assert.equal(body.success,1);assert.equal(body.results.find(r=>r.id===9).error,'实例不在回收站中');
 assert.equal((await request('/clouds/batch/purge','POST',{ids:[7,9],count:1})).status,400);
});
