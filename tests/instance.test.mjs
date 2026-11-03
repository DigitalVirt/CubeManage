import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';

const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const detail={id:7,hostname:'web-07',kvmid:'kvm36007',node_id:3,mainip:'203.0.113.7',network_type:'normal',rootpassword:'Root-Secret-1',osuser:'root',ip_num:2,
 default_bw_group:{id:9,in_bw:300,out_bw:300,ip:[{id:71,ipaddress:'203.0.113.7',subnet_mask:'255.255.255.0',gateway:'203.0.113.1'}]},
 disk:[{id:701,type:'system',dev:'vda',size:20},{id:702,type:'data',dev:'vdb',size:50}]};

// Every detail-page operation must reach the endpoint digitalvirt-v1-api.md documents, with that method and body.
test('实例详情：网络、磁盘、救援、流量、终端等操作按文档调用平台接口',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-instance-'));const auditFile=path.join(dir,'audit.jsonl');const calls=[];
 const app=createApp({auditFile,clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');calls.push({route,method:options.method,body:options.body?new URLSearchParams(options.body):null,query:url.searchParams});
  if(route==='login')return json('TOKEN');
  if(route==='clouds/7'&&options.method==='GET')return json(detail);
  if(route==='clouds/7/ip')return json({network_type:'normal',interface:[{name:'eth0',public_ip:[{id:71,ip:'203.0.113.7',ip_name:'默认段'},{id:72,ip:'203.0.113.8'}],ipv6:[{id:75,ipv6:'2001:db8::7'}],private_ip:''}]});
  if(route==='bws'&&options.method==='GET')return json({data:[{id:15,hostid:7,in_bw:10,out_bw:10,ip:[]},{id:9,hostid:7,in_bw:300,out_bw:300,ip:[{id:71,ip:'203.0.113.7',uid:0,gateway:'203.0.113.1',subnet_mask:'255.255.255.0'},{id:72,ip:'203.0.113.8',uid:0}]},{id:4,hostid:7,in_bw:20,out_bw:20,ip:[{id:73,ip:'203.0.113.9',uid:0},{id:74,ip:'203.0.113.10',uid:5}]}],meta:{total:3,total_page:1}});
  if(route==='clouds/migrate'&&options.method==='GET')return json({data:[{id:8,hostname:'b',mainip:'203.0.113.9',migrate_status:0},{id:7,hostname:'web-07',mainip:'203.0.113.7',ipaddress:'10.0.0.7',migrate_status:1}]});
  if(route==='clouds/7/migrate')return json({data:{progress:'63',target_node:{id:4,name:'HK-2'},speed:'90 MB/s',eta_string:'2 分钟',migrate_size:'25 GB',total_size:'40 GB'}});
  if(route==='tasks')return json({data:[{id:503,type:'reinstall',status:0,progress:0,hostid:7},{id:502,type:'reboot',status:1,progress:'42',hostid:7,msg:'正在重启'},{id:501,type:'off',status:2,progress:100,hostid:7}],meta:{total:3,total_page:1}});
  if(route==='task_type')return json({type:{reboot:'重启实例',reinstall:'重装系统'}});
  if(route==='ip/free')return json([{id:1,ip_name:'默认段',ip:[{id:80,ip:'203.0.113.80'},{id:81,ip:'203.0.113.81'}]}]);
  if(route==='bws/9/change_ip_option')return json({data:[{id:1,ip_name:'默认段',ip:[{id:71,ip:'203.0.113.7',ip_type:'normal',checked:true},{id:80,ip:'203.0.113.80',ip_type:'normal',checked:false}]}],selected_ip:[71,72]});
  if(route==='clouds/7/vnc')return json({token:'VNC-TOKEN',vnc_pass:'VP',password:'Root-Secret-1'});
  if(route==='statistics')return json({data:[[1000,10,20],[2000,30,40]]});
  if(route==='clouds/7/flow_data')return json({data:[{time:'2026-11-02 14',in:1.5,out:0.1}],unit:'MB',type:1});
  if(route==='global_search')return json({host:[{id:7,hostname:'web-07',node_name:'HK-1',mainip:'203.0.113.7'}],user:[{id:3,username:'alice',email:'a@example.com',password:'nope'}]});
  if(route==='node_images')return json([{id:1,name:'Debian',image:[{id:12,name:'Debian 12'}]},{id:2,name:'Windows',image:[{id:20,name:'Windows 2022'}]}]);
  if(route==='vpc_networks')return json({data:[{id:4,name:'vpc-a',ips:'10.0.0.0/24'}],meta:{total:1}});
  return json({taskid:88});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=res.headers.get('set-cookie').split(';')[0];csrf=(await res.json()).csrf;
 const writes=()=>calls.filter(c=>c.route!=='login'&&!(c.method==='GET'));
 let r0;
 const run=async(op,body={})=>{calls.length=0;const r=await request('/clouds/7/do/'+op,'POST',body);return {status:r.status,body:await r.json(),call:writes()[0]};};
 const expect=async(op,body,method,route,fields={})=>{const r=await run(op,body);assert.equal(r.status,200,op+': '+JSON.stringify(r.body));assert.equal(r.call.method+' '+r.call.route,method+' '+route,op);for(const [k,v]of Object.entries(fields))assert.equal(r.call.body.get(k),v,op+' '+k);return r;};

 for(const op of ['on','off','reboot','hard_reboot','hardoff','suspend','unsuspend','resume'])await expect(op,{},'POST','clouds/7/'+op);
 await expect('delete',{},'DELETE','clouds/7',{force:'0'});
 await expect('rescue',{type:2,temp_pass:'Temp-pass-1'},'POST','clouds/7/rescue',{type:'2',temp_pass:'Temp-pass-1'});
 await expect('rescue_exit',{},'DELETE','clouds/7/rescue');
 await expect('reinstall',{os:12,password:'New-pass-1',format_data_disk:true,app_preset_id:3},'PUT','clouds/7/reinstall',{os:'12',password:'New-pass-1',password_type:'0',format_data_disk:'1',app_preset_id:'3'});
 await expect('reinstall',{os:12,password_type:1,ssh_key:5},'PUT','clouds/7/reinstall',{password_type:'1',ssh_key:'5'});
 await expect('password',{password:'New-pass-1',reset_type:true},'PUT','clouds/7/password',{password:'New-pass-1',reset_type:'1',password_type:'0'});
 await expect('config',{cpu:4,memory:8192},'PUT','clouds/7',{cpu:'4',memory:'8192'});
 r0=await run('config',{cpu:0,memory:8192});assert.equal(r0.status,400);
 await expect('bw',{in_bw:300,out_bw:200},'PUT','clouds/7/bw',{in_bw:'300',out_bw:'200'});
 await expect('flow_setting',{flow_strategy:'cycle',traffic_quota:1000,traffic_type:3,flow_reset_cycle:'month',reset_flow_day:15},'PUT','clouds/7/flow_setting',{flow_strategy:'cycle',traffic_quota:'1000',traffic_type:'3',flow_reset_cycle:'month',reset_flow_day:'15'});
 await expect('reset_traffic',{},'POST','clouds/7/reset_traffic',{resume:'1'});
 await expect('network_type',{vpc:4},'PUT','clouds/7/network_type',{vpc:'4'});
 await expect('network_type',{vpc_ips:'192.168.10.0/24'},'PUT','clouds/7/network_type',{vpc_ips:'192.168.10.0/24'});
 await expect('vpc',{vpc:4},'PUT','clouds/7/vpc_networks',{vpc:'4'});
 await expect('ip_num',{num:3,ip_group:2},'PUT','clouds/7/ip',{num:'3',ip_group:'2'});
 await expect('mainip',{ip:72,version:'v4'},'POST','clouds/7/mainip',{ip:'72',version:'v4'});
 await expect('ipv6_add',{num:2},'POST','clouds/7/ipv6',{num:'2'});
 await expect('ipv6_delete',{ipv6:[75]},'DELETE','clouds/7/ipv6',{'ipv6[0]':'75',type:'id'});
 await expect('disconnect',{lock:true},'POST','clouds/7/disconnect',{lock:'1'});
 await expect('internet',{},'PUT','clouds/7/internet');
 const disk=await expect('disk_delete',{disk:702},'DELETE','disks/702',{force:'0'});assert.equal(disk.body.task,88);
 // IP 组（限速组）: 列表 / 可选IP / 按组增加 IP / 修改限速组带宽 / 按带宽组修改IP地址; 删除实例IP（主 IP 不可删）.
 calls.length=0;let rg=await request('/clouds/7/ip_groups');let gb=await rg.json();assert.equal(calls.find(c=>c.route==='bws').query.get('cloud'),'7');
 assert.deepEqual(gb.groups.map(g=>g.id),[9,4,15],'default group first, then by id');assert.equal(calls.find(c=>c.route==='bws').query.get('sort'),'asc');assert.equal(gb.groups[0].ips.find(x=>x.id===71).main,true);assert.equal(gb.ipv6[0].ip,'2001:db8::7');
 rg=await request('/clouds/7/ip_groups/9/options');gb=await rg.json();assert.equal(gb.segments[0].ips.length,2);
 assert.equal((await request('/clouds/7/ip_groups/99/options')).status,404);
 rg=await request('/clouds/7/free_ips');gb=await rg.json();assert.deepEqual(gb.segments[0].ips.map(x=>x.id),[80,81]);assert.equal(calls.filter(c=>c.route==='ip/free').at(-1).query.get('hostid'),'7');
 await expect('ip_add',{group:9,ip:[80,81]},'POST','clouds/7/floatip',{bw_group:'9','ip[0]':'80','ip[1]':'81'});
 await expect('group_add',{ip:[80],in_bw:100,out_bw:50},'POST','clouds/7/floatip',{'ip[0]':'80',in_bw:'100',out_bw:'50'});
 r0=await run('group_add',{ip:[80],in_bw:100,out_bw:50});assert.equal(r0.call.body.has('bw_group'),false,'a new group: no bw_group');
 r0=await run('ip_add',{group:9,ip:[999]});assert.equal(r0.status,409);assert.equal(r0.call,undefined);
 r0=await run('ip_add',{group:9,ip:[]});assert.equal(r0.status,400);
 await expect('group_bw',{group:9,in_bw:500,out_bw:200},'PUT','bws/9',{in_bw:'500',out_bw:'200'});
 await expect('group_ip',{group:9,ip:[71,80]},'PUT','clouds/7/bw_group_ip',{bw_group:'9','ip[0]':'71','ip[1]':'80'});
 r0=await run('group_bw',{group:99,in_bw:1,out_bw:1});assert.equal(r0.status,404);assert.equal(r0.call,undefined);
 r0=await run('group_ip',{group:9,ip:[]});assert.equal(r0.status,400);
 await expect('ip_delete',{ip:72},'DELETE','clouds/7/floatip',{'ip[0]':'72',type:'id'});
 r0=await run('ip_delete',{ip:71});assert.equal(r0.status,400);assert.equal(r0.call,undefined);
 r0=await run('ip_delete',{ip:999});assert.equal(r0.status,404);
 // 迁移队列: running first, with progress from 获取实例冷迁移进度; waiting rows are not queried.
 {const rm=await request('/clouds/migrate_queue');const bm=await rm.json();assert.equal(rm.status,200);assert.deepEqual(bm.data.map(x=>[x.id,x.status,x.progress,x.target]),[[7,1,63,'HK-2'],[8,0,undefined,undefined]]);assert.equal(bm.running,1);assert.equal(calls.some(c=>c.route==='clouds/8/migrate'),false);}
 // 当前任务: the running task wins over a waiting one; its name comes from 获取任务类型.
 {const rt=await request('/clouds/7/active_task');const bt=await rt.json();assert.deepEqual([bt.task.id,bt.task.name,bt.task.progress,bt.task.status],[502,'重启实例',42,1]);
  const q=calls.findLast(c=>c.route==='tasks').query;assert.equal(q.get('cloud'),'7');assert.equal(q.get('rel_type'),'cloud');}
 // 删除 IP 组 = 删除组内全部 IP; the default group, a group holding the main IP, an empty or foreign group are refused.
 await expect('group_delete',{group:4},'DELETE','clouds/7/floatip',{'ip[0]':'73','ip[1]':'74',type:'id'});
 for(const [g,st] of [[9,400],[15,400],[99,404]]){r0=await run('group_delete',{group:g});assert.equal(r0.status,st,'group '+g);assert.equal(r0.call,undefined);}
 // 磁盘: 添加磁盘并挂载 / 修改磁盘配置（只能扩容）/ 磁盘压缩.
 await expect('disk_add',{size:100,store:3,driver:'virtio'},'POST','clouds/7/disks',{size:'100',store:'3',driver:'virtio'});
 await expect('disk_edit',{disk:702,size:80,cache:'none'},'PUT','disks/702',{cache:'none',size:'80'});
 await expect('disk_compress',{disk_ids:[702]},'POST','clouds/7/compress_disk',{'disk_ids[0]':'702'});
 r0=await run('disk_edit',{disk:702,size:30});assert.equal(r0.status,400);assert.equal(r0.call,undefined);
 r0=await run('disk_edit',{disk:702,size:50});assert.equal(r0.status,400);
 r0=await run('disk_add',{size:100,store:3,driver:'floppy'});assert.equal(r0.status,400);
 r0=await run('disk_compress',{disk_ids:[999]});assert.equal(r0.status,400);

 // Guards: the system disk, someone else's disk, bad input, unknown op, missing CSRF.
 let r=await run('disk_delete',{disk:701});assert.equal(r.status,400);assert.equal(r.call,undefined);
 r=await run('disk_delete',{disk:999});assert.equal(r.status,404);assert.equal(r.call,undefined);
 r=await run('password',{password:'123'});assert.equal(r.status,400);
 r=await run('network_type',{vpc_ips:'8.8.8.0/24'});assert.equal(r.status,400);
 r=await run('nope');assert.equal(r.status,404);
 res=await fetch(base+'/api/clouds/7/do/reboot',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:'{}'});assert.equal(res.status,403);

 // Reads.
 res=await request('/clouds/7/network');let body=await res.json();assert.equal(body.network_type,'normal');
 assert.deepEqual(body.rows.map(x=>[x.address,x.version,x.main]),[['203.0.113.7','v4',true],['203.0.113.8','v4',false],['2001:db8::7','v6',false]]);assert.equal(body.rows[0].gateway,'203.0.113.1');
 res=await request('/resources/clouds/7');body=await res.json();assert.equal(body.rootpassword,undefined,'detail stays scrubbed');
 res=await request('/clouds/7/password');body=await res.json();assert.equal(body.password,'Root-Secret-1');
 calls.length=0;res=await request('/clouds/7/console','POST',{});body=await res.json();assert.equal(calls.find(c=>c.route==='clouds/7/vnc').method,'POST');
 const url=new URL(body.url);assert.equal(url.pathname,'/admin/v1/novnc');assert.equal(url.searchParams.get('token'),'VNC-TOKEN');
 calls.length=0;res=await request('/clouds/7/charts?range=1d');body=await res.json();assert.equal(body.range,'1d');
 const stat=calls.filter(c=>c.route==='statistics');assert.deepEqual(stat.map(c=>c.query.get('type')).sort(),['disk_io','kvm_info','net_adapter']);assert.equal(stat.find(c=>c.query.get('type')==='disk_io').query.get('dev_name'),'vda');assert.equal(body.disk.dev,'vda');assert.equal(stat.find(c=>c.query.get('type')==='net_adapter').query.get('kvm_ifname'),'kvm360070');
 const st=Number(stat[0].query.get('st')),et=Number(stat[0].query.get('et'));assert.equal(et-st,24*3600000);
 assert.equal(body.network.points.length,2);assert.equal(body.flow.points[0][1],1.5);assert.equal(calls.find(c=>c.route==='clouds/7/flow_data').query.get('unit'),'MB');
 calls.length=0;res=await request('/clouds/7/charts?range=30d&disk=vdb');body=await res.json();assert.equal(body.range,'30d');assert.equal(body.end-body.start,720*3600000);assert.equal(calls.find(c=>c.query.get('type')==='disk_io').query.get('dev_name'),'vdb');
 res=await request('/clouds/7/vpc_options');body=await res.json();assert.deepEqual(body.data,[{id:4,name:'vpc-a · 10.0.0.0/24'}]);


 // Images: only those available on the node(s) — node_images, one node or all of several (id_relation=and).
 calls.length=0;res=await request('/images/available?nodes=3');body=await res.json();
 assert.deepEqual(body.data.map(i=>[i.id,i.name,i.group]),[[12,'Debian 12','Debian'],[20,'Windows 2022','Windows']]);
 let q=calls.find(c=>c.route==='node_images').query;assert.equal(q.get('id'),'3');assert.equal(q.get('type'),'node');assert.equal(q.get('id_relation'),'and');
 calls.length=0;await request('/images/available?nodes=3,9,3');q=calls.find(c=>c.route==='node_images').query;assert.deepEqual(q.getAll('id[]'),['3','9']);
 res=await request('/images/available');assert.equal(res.status,400);


 // 全局搜索
 calls.length=0;res=await request('/search?q='+encodeURIComponent('web'));body=await res.json();
 assert.equal(calls.find(c=>c.route==='global_search').query.get('search'),'web');
 assert.deepEqual(body.hosts,[{id:7,hostname:'web-07',node_name:'HK-1',mainip:'203.0.113.7'}]);assert.deepEqual(body.users,[{id:3,username:'alice',email:'a@example.com'}]);
 res=await request('/search?q=');assert.equal(res.status,400);

});

// 图表数据: the doc only says data[].0 is a time string; every shape must land on the chart's ms timeline.
test('图表数据：兼容毫秒 / 秒 / 数字字符串 / 日期文本时间，以及数组或对象点、有无 data 外层',async()=>{
 const {chartPoints}=await import('../server/instance.mjs');const now=Date.now();
 assert.deepEqual(chartPoints({data:[[String(now),'12.5','40']]})[0],[now,12.5,40],'ms as a numeric string');
 assert.equal(chartPoints({data:[[Math.floor(now/1000),1,2]]})[0][0],Math.floor(now/1000)*1000,'seconds');
 assert.equal(chartPoints([[now,1,2]]).length,1,'bare array');
 assert.equal(chartPoints({data:{data:[{time:'2026-11-03 01:00:00',value:3}]}})[0][1],3,'objects under data.data');
 assert.ok(Number.isFinite(chartPoints({data:[['2026-11-03 01:00:00',5,6]]})[0][0]),'date text');
 assert.deepEqual(chartPoints({data:[[now+2,1,1],[now+1,2,2]]}).map(p=>p[0]),[now+1,now+2],'sorted by time');
 assert.deepEqual(chartPoints({data:[['not a time',1,2]]}),[],'unparseable times dropped');
});
