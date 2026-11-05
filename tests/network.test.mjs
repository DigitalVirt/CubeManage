import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';
import {adslLine,checkFields,freeIpsByNode,networkKinds} from '../server/network.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});

async function start(t,{transport}={}){
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-net-'));const auditFile=path.join(dir,'audit.jsonl');
 const app=createApp({auditFile,clientFactory:c=>new CubeClient(c,{transport})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=async(route,method='GET',body)=>{const res=await fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});return {status:res.status,body:await res.json()};};
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;
 return {request,auditFile};
}

test('网络管理：按文档调用 IP 段、IP、分组、IPv6 与 ADSL 接口，',async t=>{
 const calls=[];
 const {request,auditFile}=await start(t,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='ipSegment'&&options.method==='GET')return json({data:[{id:3,ip_name:'HK',count:{total:10,used:2,free:8,lock:0},node:[{id:1,name:'n1'}]}],mate:{page:1,per_page:20,total:41,total_page:3}});
  if(route==='ip'&&options.method==='GET')return json({data:{data:[{id:9,ip:'203.0.113.9'}],meta:{page:1,per_page:20,total:1,total_page:1}}});
  if(route==='ip'&&options.method==='DELETE')return json({data:{ip_del_num:1,ip_not_del_num:1},msg:'1 个 IP 正在使用'});
  if(route==='ipSegment/3/change_network/need_reboot_host')return json({host:[{id:7,hostname:'web-07',rootpassword:'x'}]});
  if(route==='common/ipsegment')return json([{id:3,name:'HK'}]);
  if(route==='ip_groups'&&options.method==='GET')return json({data:[{id:1,name:'默认'}]});
  if(route==='ip_groups/5'&&options.method==='DELETE')return json({error:'分组下还有 IP 段'});
  if(route==='adsl'&&options.method==='GET')return json({data:[{id:1,username:'u1',password:'SECRET-PW',node:[],host:[]}],meta:{total:1,total_page:1,page:1,per_page:20}});
  if(route==='adsls')return json({num:2});
  return json({});
 }});

 // List: filters map to the documented parameter names; the "mate" key still gives paging.
 let r=await request('/net/ip-segments?search=HK&status=1&node=4&group=2&page=2&per_page=20');
 assert.equal(r.status,200);assert.equal(r.body.meta.total,41);assert.equal(r.body.meta.total_pages,3);
 let q=calls.at(-1).query;assert.equal(q.get('ip_name'),'HK');assert.equal(q.get('status'),'1');assert.equal(q.get('node'),'4');assert.equal(q.get('ip_group'),'2');
 r=await request('/net/ips?segment=3&search=203.0&lock=1');assert.equal(r.body.data[0].ip,'203.0.113.9');
 q=calls.at(-1).query;assert.equal(q.get('ip_segment_id'),'3');assert.equal(q.get('ip'),'203.0');assert.equal(q.get('lock'),'1');assert.equal(q.get('orderby'),'ip_int');
 r=await request('/net/ips');assert.equal(r.status,400,'IP 列表必须指定 IP 段');

 // ADSL passwords never reach the browser.
 r=await request('/net/adsl?used=0');assert.equal(r.body.data[0].password,undefined);assert.equal(calls.at(-1).query.get('used'),'0');

 // Options come from v1/common/ipsegment and v1/ip_groups?list_type=all.
 r=await request('/net/options?family=4');assert.deepEqual(r.body.segments,[{id:3,name:'HK'}]);assert.deepEqual(r.body.groups,[{id:1,name:'默认'}]);
 assert.equal(calls.find(c=>c.route==='ip_groups').query.get('list_type'),'all');

 // Create IP range: POST v1/ip; bad IPs are refused before reaching the platform.
 const before=calls.length;
 r=await request('/net/ips','POST',{ip_segment_id:3,first_ip:'203.0.113.300',end_ip:'203.0.113.20'});assert.equal(r.status,400);assert.ok(r.body.fields.first_ip);assert.equal(calls.length,before);
 r=await request('/net/ips','POST',{ip_segment_id:3,first_ip:'203.0.113.10',end_ip:'203.0.113.20',vlanid:12,remark:'新段'});assert.equal(r.status,200);
 let c=calls.at(-1);assert.equal(c.route,'ip');assert.equal(c.method,'POST');assert.equal(c.body.get('first_ip'),'203.0.113.10');assert.equal(c.body.get('vlanid'),'12');

 // Segment edit with gateway confirmation; the reboot list is read first.
 r=await request('/net/ip-segments/3/reboot-hosts');assert.deepEqual(r.body.data,[{id:7,hostname:'web-07'}]);
 r=await request('/net/ip-segments/3','PUT',{ip_name:'HK-2',gateway:'203.0.113.1',node_ids:[1,2],confirm_change_gateway:2});
 c=calls.at(-1);assert.equal(c.route,'ipSegment/3');assert.equal(c.method,'PUT');assert.equal(c.body.get('confirm_change_gateway'),'2');assert.equal(c.body.get('node_ids[1]'),'2');
 r=await request('/net/ip-segments/3','PUT',{confirm_change_gateway:5});assert.equal(r.status,400);

 // Batch update: PUT v1/ip with id[]; the selected count is checked.
 r=await request('/net/ips','PUT',{ids:[9,10],count:3,lock:1});assert.equal(r.status,400);
 r=await request('/net/ips','PUT',{ids:[9,10],count:2});assert.equal(r.status,400,'没有修改项时拒绝');
 r=await request('/net/ips','PUT',{ids:[9,10],count:2,lock:1,remark:''});assert.equal(r.status,200);
 c=calls.at(-1);assert.equal(c.route,'ip');assert.equal(c.method,'PUT');assert.equal(c.body.get('id[0]'),'9');assert.equal(c.body.get('lock'),'1');assert.equal(c.body.get('remark'),'');

 // Bulk delete reports the platform's own counts.
 r=await request('/net/ips','DELETE',{ids:[9,10],count:2});assert.deepEqual([r.body.success,r.body.failed,r.body.message],[1,1,'1 个 IP 正在使用']);
 c=calls.at(-1);assert.equal(c.method,'DELETE');assert.equal(c.body.get('id[1]'),'10');

 // Groups delete one by one: DELETE v1/ip_groups/:id, failures listed per record.
 r=await request('/net/ip-groups','DELETE',{ids:[4,5],count:2});assert.equal(r.body.success,1);assert.equal(r.body.failed,1);assert.match(r.body.results.find(x=>x.id===5).error,/分组下还有/);
 assert.ok(calls.some(x=>x.route==='ip_groups/4'&&x.method==='DELETE'));

 // IPv6 segment needs a block or a start/end range.
 r=await request('/net/ipv6-segments','POST',{name:'v6',prefix:64,gateway:'2001:db8::1',dns1:'a',dns2:'b'});assert.equal(r.status,400);assert.ok(r.body.fields.ipv6);
 r=await request('/net/ipv6-segments','POST',{name:'v6',ipv6:'2001:db8::',prefix:64,gateway:'2001:db8::1',dns1:'2001:4860:4860::8888',dns2:'2606:4700:4700::1111',node_id:[3]});
 c=calls.at(-1);assert.equal(c.route,'ipv6_segments');assert.equal(c.body.get('node_id[0]'),'3');
 r=await request('/net/ipv6','POST',{});assert.equal(r.status,405,'IPv6 地址只读');

 // ADSL: edit without password keeps it; import sends "vlan,账号,密码,节点…" lines to v1/adsls.
 r=await request('/net/adsl/1','PUT',{vlan:20,password:'',node:[1]});c=calls.at(-1);assert.equal(c.route,'adsl/1');assert.equal(c.body.get('password'),null);assert.equal(c.body.get('vlan'),'20');
 r=await request('/net/adsl/import','POST',{lines:['100, a@isp , pw1 ,1,2','','101，b@isp，pw2']});assert.equal(r.status,200);assert.equal(r.body.num,2);
 c=calls.at(-1);assert.equal(c.route,'adsls');assert.equal(c.body.get('data[0]'),'100,a@isp,pw1,1,2');assert.equal(c.body.get('data[1]'),'101,b@isp,pw2');
 r=await request('/net/adsl/import','POST',{lines:['abc']});assert.equal(r.status,400);

});

test('网络管理：字段校验',()=>{
 let r=checkFields(networkKinds.adsl.create,{vlan:5000,username:'u'});assert.ok(r.errors.vlan);assert.ok(r.errors.password);
 r=checkFields(networkKinds.adsl.create,{vlan:1,username:' u ',password:' p '});assert.deepEqual(r.output,{vlan:1,username:'u',password:' p ',times:1,lock:0});
 r=checkFields(networkKinds.ips.edit,{mac:'zz',lock:'1'},{editing:true});assert.ok(r.errors.mac);assert.equal(r.output.lock,1);
 assert.throws(()=>adslLine('1,u',0),/第 1 行/);assert.equal(adslLine('7，u，p，3',0),'7,u,p,3');
});

test('页头网站名称：读取网站配置的 company_name，只返回名称',async t=>{
 const {request}=await start(t,{transport:async url=>{const route=url.pathname.replace(/^\/admin\/v1\//,'');if(route==='login')return json('TOKEN');if(route==='config')return json({data:{company_name:'  星河云  ',email:'a@b.c',admin_path:'secret-admin'}});return json({});}});
 const r=await request('/site-name');assert.deepEqual(r.body,{name:'星河云'});
});

test('节点列表可用 IP：按节点合计启用 IP 段的空闲数，共用的段每个节点都算',()=>{
 assert.deepEqual(freeIpsByNode([
  {id:1,status:1,count:{free:48},node:[{id:11},{id:12}]},
  {id:2,status:'1',count:{free:'12'},node:[{id:11}]},
  {id:3,status:0,count:{free:100},node:[{id:13}]},
  {id:4,count:{free:5},node:[{id:13}]},
  {id:5,status:1,count:{},node:[{id:14}]}
 ]),{11:60,12:48,13:5,14:0});
});

test('节点列表可用 IP：分页读取全部 IP 段（每页 500，取满一页才继续）',async t=>{
 const pages=[];
 const {request}=await start(t,{transport:async url=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');
  if(route==='login')return json('TOKEN');
  if(route==='ipSegment'){const page=Number(url.searchParams.get('page'));pages.push([page,url.searchParams.get('per_page')]);
   const rows=page===1?Array.from({length:500},(_,i)=>({id:i+1,status:1,count:{free:1},node:[{id:7}]})):[{id:999,status:1,count:{free:3},node:[{id:8}]}];
   return json({data:rows,mate:{page,total:501}});}
  return json({});
 }});
 const r=await request('/nodes-free-ips');
 assert.equal(r.status,200);assert.deepEqual(r.body.data,{7:500,8:3});assert.deepEqual(pages,[[1,'500'],[2,'500']]);
});
