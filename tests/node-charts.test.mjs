import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {CubeClient} from '../server/cube-client.mjs';
import {nodePoints,devNames} from '../server/node-charts.mjs';

const json=v=>new Response(JSON.stringify(v),{status:200,headers:{'Content-Type':'application/json'}});

test('节点图表：解析数据点和设备名',()=>{
 assert.deepEqual(nodePoints({data:[['2026-11-04 10:00',12.5,40,[]],['2026-11-04 09:00','10','30']]}),[[Date.parse('2026-11-04T09:00'),10,30],[Date.parse('2026-11-04T10:00'),12.5,40]]);
 assert.deepEqual(nodePoints([[1762221600,1,2,3]]),[[1762221600000,1,2,3]]);
 assert.deepEqual(devNames(['sda','sdb','sda']),['sda','sdb']);
 assert.deepEqual(devNames([{dev:'vda'},{name:'eth0'},{dev_name:'nvme0n1'}]),['vda','eth0','nvme0n1']);
 assert.deepEqual(devNames({a:'eth0',b:'eth1'}),['eth0','eth1']);
});

test('节点图表：按类型调用图表数据接口，默认 3 天、选中第一块磁盘 / 网卡；流量排行按本月流量取前 10',async t=>{
 const calls=[];
 const app=createApp({clientFactory:c=>new CubeClient(c,{transport:async url=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');const q=Object.fromEntries(url.searchParams);calls.push({route,q});
  if(route==='login')return json('TOKEN');
  if(route==='node_statistics')return json({data:{dev:['sda','sdb'],net:['eth0'],disk:['sda']}});
  if(route==='statistics'){if(q.type==='pps')return json({error:'该节点不支持'});return json({data:[['2026-11-04 10:00',1,2]]});}
  if(route==='clouds')return json({data:Array.from({length:12},(_,i)=>({id:i+1,hostname:'vm-'+(i+1),traffic_used:String(i*10),traffic_percent:'5%'})),meta:{total:12,total_page:1}});
  return json({});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base='http://127.0.0.1:'+server.address().port;
 const res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});
 const cookie=res.headers.get('set-cookie').split(';')[0];const get=p=>fetch(base+p,{headers:{Cookie:cookie}}).then(r=>r.json());

 let b=await get('/api/nodes/5/charts?disk=sdb');
 const stats=calls.filter(c=>c.route==='statistics');
 assert.deepEqual(stats.map(c=>c.q.type).sort(),['main_disk','main_info','main_net_info','node_disk_io','pps']);
 assert.ok(stats.every(c=>c.q.node_id==='5'));
 const span=Number(stats[0].q.et)-Number(stats[0].q.st);assert.ok(Math.abs(span-3*86400000)<5000,'默认 3 天');
 assert.equal(stats.find(c=>c.q.type==='main_disk').q.dev_name,'sdb','按选择的磁盘');
 assert.equal(stats.find(c=>c.q.type==='main_net_info').q.dev_name,'eth0');
 assert.equal(stats.find(c=>c.q.type==='node_disk_io').q.dev_name,'sda');
 assert.deepEqual(b.devs,{disk:['sda','sdb'],net:['eth0'],io:['sda']});
 assert.equal(b.cpu.points.length,1);assert.match(b.pps.error,/不支持/);assert.deepEqual(b.pps.points,[]);

 b=await get('/api/nodes/5/traffic_rank');
 assert.equal(b.data.length,10);assert.equal(b.data[0].hostname,'vm-12');assert.equal(b.data[0].used,110);assert.equal(b.data[0].percent,5);
 assert.ok(!b.data.some(r=>r.used===0),'没有流量的实例不进排行');
 assert.equal(calls.find(c=>c.route==='clouds').q.node,'5');
});
