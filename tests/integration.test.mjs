import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApp} from '../server/index.mjs';
import {CubeClient,listResult,scrub} from '../server/cube-client.mjs';
import {normalizeBase} from '../server/config.mjs';
import {fieldPayload} from '../server/catalog.mjs';
const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test('地址、分页、敏感字段和文档单位处理',()=>{
 assert.equal(normalizeBase('https://cube.example/admin/v1/'),'https://cube.example/admin');
 assert.throws(()=>normalizeBase('file:///etc/passwd'));assert.throws(()=>normalizeBase('https://user:pass@cube.example/'));
 assert.equal(listResult({data:[],meta:{total:120,total_page:6,page:2,per_page:20}}).meta.total_pages,6);
 assert.deepEqual(scrub({id:1,password:'x',rootpassword:'x',ssh_pass:'x',ssh_key:'x',vncpass:'x',key:'x',nested:{access_token:'x',name:'ok'}}),{id:1,nested:{name:'ok'}});
 const p=fieldPayload('clouds',{cpu:2,memory:4096,os:1,ip_num:1});assert.deepEqual(p.errors,{});assert.equal(p.output.memory,4096);assert.equal(p.output.password_type,0);
 const edit=fieldPayload('clouds',{cpu:2,memory:8192,hostname:'ignored',rootpass:'ignored',os:3},{editing:true});assert.equal(edit.output.memory,8192);assert.equal(edit.output.hostname,undefined);assert.equal(edit.output.os,undefined);
 assert.ok(fieldPayload('nodes',{name:'n',area:1,ip:'1.2.3.4'}).errors.area_id);
 assert.equal(fieldPayload('areas',{name:'a',ip:'x',short_name:''},{editing:true}).output.short_name,'');
});
test('密码只用于登录一次；令牌过期即结束会话，非鉴权错误不重试并脱敏',async()=>{
 let logins=0,reads=0;const client=new CubeClient({baseUrl:'https://cube.example/admin',username:'admin',password:'SECRET'},{transport:async(url,options)=>{if(url.pathname.endsWith('/login'))return response('TOKEN'+(++logins));reads++;if(reads===1){assert.equal(options.headers['access-token'],'TOKEN1');return response({data:[]});}return response({error:'expired'},401);}});
 await client.request('GET','areas');assert.equal(client.config.password,undefined,'password forgotten after login');
 await assert.rejects(client.request('GET','areas'),e=>e.status===401);assert.equal(logins,1,'no silent re-login');
 const tokenOnly=new CubeClient({baseUrl:'https://cube.example/admin'},{transport:async()=>response({data:[]})});await assert.rejects(tokenOnly.request('GET','areas'),e=>e.status===401);
 let tries=0;const invalid=new CubeClient({baseUrl:'https://cube.example',username:'admin',password:'SECRET'},{transport:async(url)=>url.pathname.endsWith('/login')?response('TOKEN'): (tries++,response({error:'TOKEN refused'},422))});
 await assert.rejects(invalid.request('POST','areas',{body:{name:'x'}}),e=>e.message==='*** refused');assert.equal(tries,1);
});
test('真实代理链路：登录、CSRF、路由、表单编码、增删改',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'cubereact-test-')),calls=[];const auditFile=path.join(dir,'audit.jsonl');
 const app=createApp({auditFile,clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{calls.push({url:String(url),method:options.method,headers:options.headers,body:options.body});if(url.pathname.endsWith('/login'))return response('UPSTREAM-PRIVATE-TOKEN');if(options.method==='GET')return response({data:[{id:1,name:'example',password:'hidden',vncpass:'hidden'}],meta:{total:57,total_page:3,page:1,per_page:20}});return response({taskid:987});}})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const base='http://127.0.0.1:'+server.address().port;
 t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 let cookie='',csrf='';async function request(route,method='GET',body,extra={}){return fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf,...extra},...(body!==undefined?{body:JSON.stringify(body)}:{})});}
 assert.equal((await request('/resources/areas')).status,401);
 assert.equal((await request('/login','POST',{},{Origin:'https://evil.example'})).status,403);
 assert.equal((await request('/login','POST',{baseUrl:'file:///etc/passwd',username:'admin',password:'SECRET'})).status,400);
 let res=await request('/login','POST',{baseUrl:'https://cube.example/admin/v1',username:'admin',password:'SECRET'});assert.equal(res.status,200);cookie=res.headers.get('set-cookie').split(';')[0];
 // The session is a sealed cookie: nothing readable in it, no password, no file written by the login.
 {const sc=res.headers.get('set-cookie');assert.ok(!/SECRET|UPSTREAM-PRIVATE|cube\.example|admin/.test(decodeURIComponent(sc)));assert.match(sc,/Max-Age=86\d{3}/);assert.equal(calls.filter(c=>c.url.endsWith('/login')).length,1);
  const tampered=cookie.slice(0,-4)+(cookie.endsWith('AAAA')?'BBBB':'AAAA');assert.equal((await fetch(base+'/api/session',{headers:{Cookie:tampered}})).status,401);}const session=await res.json();csrf=session.csrf;assert.equal(session.baseUrl,'https://cube.example/admin');assert.ok(!JSON.stringify(session).includes('SECRET'));assert.ok(!JSON.stringify(session).includes('UPSTREAM-PRIVATE'));assert.match(res.headers.get('set-cookie'),/HttpOnly; SameSite=Strict/);
 res=await request('/overview');assert.equal(res.status,200);assert.ok(calls.some(c=>/\/v1\/index$/.test(c.url)&&c.method==='GET'));const overview=await res.json();assert.equal(overview.data.resources.areas.meta.total,57);assert.equal(overview.data.resources.areas.data[0].password,undefined);
 res=await request('/resources/clouds?status=on&area=2');const list=await res.json();assert.equal(list.meta.total_pages,3);assert.equal(list.data[0].password,undefined);assert.equal(list.data[0].vncpass,undefined);const url=new URL(calls.at(-1).url);assert.equal(url.searchParams.get('status[]'),'on');assert.equal(url.searchParams.get('area_id'),'2');
 res=await request('/resources/clouds?user=3');assert.equal(res.status,200);assert.equal(new URL(calls.at(-1).url).searchParams.get('user'),'3');
 res=await request('/resources/clouds?user=abc');assert.equal(new URL(calls.at(-1).url).searchParams.get('user'),null);
 res=await request('/nodes/1/metrics');assert.equal(res.status,200);assert.match(calls.at(-1).url,/\/v1\/nodes\/1\/status$/);assert.equal((await res.json()).data[0].password,undefined);
 assert.equal((await request('/nodes/invalid/metrics')).status,400);
 res=await request('/resources/nodes/1','PUT',{enable:0});assert.equal(res.status,200);assert.deepEqual([...new URLSearchParams(calls.at(-1).body)],[['enable','0']]);
 const before=calls.length;assert.equal((await request('/resources/nodes','POST',{name:'node',ip:'192.0.2.10',area_id:2},{'x-csrf-token':''})).status,403);assert.equal(calls.length,before);
 assert.equal((await request('/resources/nodes','POST',{name:'node',ip:'192.0.2.10',area:2})).status,400);
 res=await request('/resources/nodes','POST',{name:'node',ip:'192.0.2.10',area_id:2,ssh_pass:'NODE-SECRET',arbitrary:'discard'});assert.equal(res.status,200);const body=new URLSearchParams(calls.at(-1).body);assert.equal(body.get('area_id'),'2');assert.equal(body.get('arbitrary'),null);assert.equal(body.get('ssh_pass'),'NODE-SECRET');
 res=await request('/resources/clouds','POST',{cpu:2,memory:4096,os:3,ip_num:1});assert.equal(res.status,200);assert.equal(new URLSearchParams(calls.at(-1).body).get('memory'),'4096');
 res=await request('/resources/clouds/1','PUT',{cpu:4,memory:8192,hostname:'ignore',os:4});assert.equal(res.status,200);assert.equal(new URLSearchParams(calls.at(-1).body).get('hostname'),null);
 const count=calls.length;assert.equal((await request('/resources/clouds/1','DELETE',{confirm:'wrong'})).status,400);assert.equal(calls.length,count);
 res=await request('/resources/clouds/1','DELETE',{confirm:'1',force:1});assert.equal(res.status,200);assert.equal(new URLSearchParams(calls.at(-1).body).get('force'),'0');
 res=await request('/clouds/1/actions/reboot','POST',{confirm:'1'});assert.equal(res.status,200);assert.match(calls.at(-1).url,/\/v1\/clouds\/1\/reboot$/);
 assert.equal((await request('/clouds/1/actions/unknown','POST',{confirm:'1'})).status,400);
 res=await request('/clouds/1/settings/reinstall','PUT',{confirm:'1',os:2,format_data_disk:1});assert.equal(res.status,200);assert.equal(new URLSearchParams(calls.at(-1).body).get('format_data_disk'),'0');
 assert.equal((await request('/resources/users')).status,404);
 // 不在本机记录操作日志：写操作之后也不会生成任何日志文件。
 await assert.rejects(readFile(auditFile,'utf8'),{code:'ENOENT'});
 const copied=cookie;
 res=await request('/logout','POST',{});assert.equal(res.status,200);assert.match(res.headers.get('set-cookie'),/Max-Age=0/);assert.ok(calls.some(c=>/\/v1\/logout$/.test(c.url)&&c.method==='POST'),'platform token ended');
 assert.equal((await request('/session')).status,401,'a copy of the logged-out cookie no longer works');assert.equal(copied,cookie);
});
/** A small stand-in for the platform: answers the documented routes from memory and records every call. */
async function platformApp(t,handle){
 const calls=[];const dir=await mkdtemp(path.join(os.tmpdir(),'cubemanage-platform-'));
 const app=createApp({auditFile:path.join(dir,'audit.jsonl'),clientFactory:config=>new CubeClient(config,{transport:async(url,options)=>{
  const route=url.pathname.replace(/^\/admin\/v1\//,'');const body=options.body?Object.fromEntries(new URLSearchParams(options.body)):{};calls.push({route,method:options.method,body,query:url.searchParams});
  if(route==='login')return response('TOKEN');const out=handle(options.method,route,body,url.searchParams);return out instanceof Response?out:response(out??{});
 }})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(async()=>{await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});});
 const base='http://127.0.0.1:'+server.address().port;let cookie='',csrf='';
 const request=(route,method='GET',body)=>fetch(base+'/api'+route,{method,headers:{Cookie:cookie,'Content-Type':'application/json','x-csrf-token':csrf},...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const login=await request('/login','POST',{baseUrl:'https://cube.example/admin',username:'admin',password:'pw'});cookie=login.headers.get('set-cookie').split(';')[0];csrf=(await login.json()).csrf;
 return {request,calls};
}
test('节点按 order 排序并通过拖动接口保存，拒绝无效排序',async t=>{
 let nodes=[1,2,3,4,5,6,7,8].map(id=>({id,name:'N'+id,order:id}));
 const {request,calls}=await platformApp(t,(method,route,body)=>{
  if(method==='GET'&&route==='nodes')return {data:[...nodes].sort((a,b)=>a.order-b.order),meta:{total:nodes.length,total_page:1}};
  const m=route.match(/^nodes\/(\d+)\/drag$/);if(method==='POST'&&m){const id=Number(m[1]),prev=Number(body.prev_id);const list=[...nodes].sort((a,b)=>a.order-b.order).filter(n=>n.id!==id);list.splice(prev===0?0:list.findIndex(n=>n.id===prev)+1,0,nodes.find(n=>n.id===id));list.forEach((n,i)=>n.order=i+1);return {};}
 });
 let result=await (await request('/resources/nodes')).json();assert.deepEqual(result.data.map(n=>n.id),[1,2,3,4,5,6,7,8]);assert.equal(calls.at(-1).query.get('orderby'),'order');
 assert.equal((await request('/nodes/8/drag','POST',{target_id:1,position:'before'})).status,200);assert.equal(calls.at(-1).body.prev_id,'0');
 result=await (await request('/resources/nodes')).json();assert.deepEqual(result.data.map(n=>n.id),[8,1,2,3,4,5,6,7]);
 assert.equal((await request('/nodes/8/drag','POST',{target_id:3,position:'after'})).status,200);assert.equal(calls.at(-1).body.prev_id,'3');
 result=await (await request('/resources/nodes')).json();assert.deepEqual(result.data.map(n=>n.id),[1,2,3,8,4,5,6,7]);
 assert.equal((await request('/nodes/8/drag','POST',{target_id:8,position:'after'})).status,400);
 assert.equal((await request('/nodes/8/drag','POST',{target_id:999,position:'before'})).status,404);
});
test('管理功能：镜像 / ISO / 用户增改查、只读日志与清理校验',async t=>{
 const store={image:[],iso:[],user:[]};let seq=10;const meta={total:0,total_page:1,page:1,per_page:20};
 const {request,calls}=await platformApp(t,(method,route,body)=>{
  const lists={'images/new_list':'image','isos/new_list':'iso',user:'user'};
  if(method==='GET'&&lists[route])return {data:store[lists[route]],meta:{...meta,total:store[lists[route]].length}};
  if(method==='GET'&&['aLog','tasks','adsl/log','blacklists'].includes(route))return {data:[],meta};
  const [kind,id]=route.split('/');const rows=store[kind];
  if(rows&&method==='POST'&&!id){const row={...body,id:++seq};rows.push(row);return row;}
  const row=rows&&id&&rows.find(r=>r.id===Number(id));
  if(row&&method==='GET')return row;if(row&&method==='PUT'){Object.assign(row,body);return row;}if(row&&method==='DELETE'){rows.splice(rows.indexOf(row),1);return {};}
  if(route==='clouds/real_data')return [{id:1001,cpu_usage:3}];
  if(route==='clouds/1001/status')return {status:'on'};
  if(route==='log_num')return {num:4};
  if(method==='DELETE'&&route==='log')return {num:4};
 });
 for(const kind of ['images','isos','users','system-logs','login-logs','task-logs','adsl-logs','blacklists']){const result=await request('/manage/'+kind);assert.equal(result.status,200,kind);const body=await result.json();assert.ok(Array.isArray(body.data));assert.ok(body.meta.total_pages>=1);}
 assert.equal(calls.find(c=>c.route==='aLog'&&c.query.get('type[]')==null)?.route,'aLog');
 let result=await request('/manage/images','POST',{name:'Test image',filename:'test.qcow2',status:1});assert.equal(result.status,200);const image=(await result.json()).result;assert.ok(image.id);assert.equal(calls.at(-1).route,'image');
 assert.equal((await request('/manage/images/'+image.id,'PUT',{name:'Updated',status:2})).status,200);assert.equal((await (await request('/manage/images/'+image.id)).json()).name,'Updated');
 result=await request('/manage/isos','POST',{name:'Test ISO',filename:'test.iso'});assert.equal(result.status,200);assert.equal(calls.at(-1).route,'iso');
 assert.equal((await request('/manage/users','POST',{username:'missing-password'})).status,400);
 result=await request('/manage/users','POST',{username:'new-user',password:'PRIVATE-PASSWORD',arbitrary:'discard'});assert.equal(result.status,200);const user=(await result.json()).result;assert.equal(user.password,undefined);assert.equal(user.arbitrary,undefined);
 assert.equal(calls.at(-1).body.password,'PRIVATE-PASSWORD');assert.equal(calls.at(-1).body.arbitrary,undefined);
 assert.equal((await request('/manage/users/'+user.id,'PUT',{username:'renamed',state:0})).status,200);
 assert.equal((await request('/manage/users/'+user.id,'DELETE',{confirm:'wrong'})).status,400);assert.equal((await request('/manage/users/'+user.id,'DELETE',{confirm:String(user.id)})).status,200);
 assert.equal((await request('/manage/system-logs','POST',{name:'bad'})).status,405);
 assert.equal((await request('/manage/system-logs/1','DELETE',{confirm:'1'})).status,405);
 const metrics=await request('/clouds/metrics','POST',{id:[1001]});assert.equal(metrics.status,200);assert.equal((await metrics.json())[0].id,1001);assert.equal((await request('/clouds/metrics','POST',{id:[]})).status,400);assert.equal((await request('/clouds/metrics','POST',{id:['1001']})).status,400);assert.equal((await request('/clouds/1001/state')).status,200);
 const scope={time:Math.floor(Date.now()/1000)-86400,type:['act_log','login_log']};assert.equal((await request('/log-cleanup/preview','POST',scope)).status,200);
 assert.equal((await request('/log-cleanup/preview','POST',{...scope,type:['tasks']})).status,400);
 assert.equal((await request('/log-cleanup/execute','POST',{...scope,confirm:'wrong'})).status,400);
 assert.equal((await request('/log-cleanup/execute','POST',{...scope,confirm:'清理日志'})).status,200);assert.equal(calls.at(-1).route,'log');assert.equal(calls.at(-1).method,'DELETE');
});
test('系统日志的特殊分页响应可正常转换',async()=>{const {normalizeManagedList,managementQuery}=await import('../server/management.mjs');const result=listResult(normalizeManagedList({total:81,page:2,total_page:5,list:[{id:7,des:'登录'}]}),2,20);assert.equal(result.meta.total,81);assert.equal(result.meta.total_pages,5);assert.deepEqual(result.data,[{id:7,des:'登录'}]);assert.deepEqual(managementQuery('login-logs',{page:2}).type,['=',1]);});
test('会话随平台令牌结束：平台返回 401 时清除浏览器会话，登录不写任何本机文件',async t=>{
 const {readdir}=await import('node:fs/promises');const before=(await readdir(fileURLToPath(new URL('..',import.meta.url)))).sort().join();
 let expired=false;const app=createApp({auditFile:path.join(os.tmpdir(),'cubemanage-expire-audit.jsonl'),clientFactory:config=>new CubeClient(config,{transport:async url=>url.pathname.endsWith('/login')?response('T-1'):expired?response({error:'token expired'},401):response({data:[],meta:{total:0}})})});
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));const base='http://127.0.0.1:'+server.address().port;
 let res=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({baseUrl:'https://cube.example/admin',username:'admin',password:'pw'})});const cookie=res.headers.get('set-cookie').split(';')[0];
 assert.equal((await fetch(base+'/api/resources/areas',{headers:{Cookie:cookie}})).status,200);
 expired=true;res=await fetch(base+'/api/resources/areas',{headers:{Cookie:cookie}});assert.equal(res.status,401);assert.match(res.headers.get('set-cookie')||'',/cubemanage=;.*Max-Age=0/);
 assert.equal((await readdir(fileURLToPath(new URL('..',import.meta.url)))).sort().join(),before,'no file created by logging in');
});
