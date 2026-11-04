import {management,managementQuery,normalizeManagedList} from './management.mjs';
import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalizeBase,serviceConfig,root} from './config.mjs';
import {readCookie,setSessionCookie,clearSessionCookie,unseal} from './session.mjs';
import {CubeClient,HttpError,listResult,scrub} from './cube-client.mjs';
import {resources,actions,fieldPayload} from './catalog.mjs';
import {registerBatch} from './batch.mjs';
import {registerInstance} from './instance.mjs';
import {registerInstanceSettings} from './instance-settings.mjs';
import {registerSiteConfig} from './siteconfig.mjs';
import {registerNetwork} from './network.mjs';
import {registerCreate} from './create.mjs';
import {registerBusiness} from './business.mjs';
import {registerNodeCharts} from './node-charts.mjs';
export function createApp({clientFactory=c=>new CubeClient(c)}={}){
 const app=express(),attempts=new Map(),revoked=new Map();
 // 不需要任何配置：信任本机、局域网和 Docker 内网上的反向代理传来的 X-Forwarded-Proto / X-Forwarded-Host，
 // 这样走 HTTPS 代理时 req.secure 为真（会话 Cookie 自动带 Secure），来源校验也认代理传来的原始主机名。公网上伪造这些头不会被采信。
 app.set('trust proxy','loopback, linklocal, uniquelocal');
 app.disable('x-powered-by');app.use(express.json({limit:'32kb'}));
 app.use('/api',(req,res,next)=>{res.set({'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});const origin=req.get('origin');
  if(origin){let parsed;try{parsed=new URL(origin);}catch{return res.status(403).json({error:'请求来源无效'});}const hosts=[req.get('host'),...String(req.get('x-forwarded-host')||'').split(',').map(h=>h.trim())].filter(Boolean);if(!hosts.includes(parsed.host))return res.status(403).json({error:'请求来源不允许'});}
  next();
 });
 app.use('/api',(req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&(req.body===null||typeof req.body!=='object'||Array.isArray(req.body)))return res.status(400).json({error:'请求正文必须是 JSON 对象'});next();});
 const asyncRoute=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
 // Sessions are sealed cookies held by the browser (session.mjs); the server keeps no session or credential store.
 // `revoked` only remembers the ids of sessions logged out before their expiry, until that expiry.
 const sweep=setInterval(()=>{const now=Date.now();for(const [k,v]of attempts)if(now-v.start>900000)attempts.delete(k);for(const [k,v]of revoked)if(v<now)revoked.delete(k);},60000);sweep.unref();
 app.post('/api/login',asyncRoute(async(req,res)=>{
  const ip=req.socket.remoteAddress;const rate=attempts.get(ip)||{start:Date.now(),count:0};if(Date.now()-rate.start>900000){rate.count=0;rate.start=Date.now();}rate.count++;attempts.set(ip,rate);if(rate.count>20)throw new HttpError(429,'登录尝试过多，请 15 分钟后重试');
  const b=req.body||{};
  if(typeof b.baseUrl!=='string'||typeof b.username!=='string'||typeof b.password!=='string'||b.baseUrl.length>2048||b.username.length>256||b.password.length>4096)throw new HttpError(400,'登录信息格式不正确');
  let normalized;try{normalized=normalizeBase(b.baseUrl);}catch(e){throw new HttpError(400,e.message);}
  const config={baseUrl:normalized,username:b.username.trim(),password:b.password,...serviceConfig()};
  if(!config.username||!config.password)throw new HttpError(400,'请填写平台用户名和密码');
  const client=clientFactory(config);const token=await client.login(),expires=client.expiresAt; // the password goes no further than this call
  const id=crypto.randomBytes(16).toString('hex'),csrf=crypto.randomBytes(24).toString('hex');
  const session={id,b:config.baseUrl,u:config.username,t:token,e:expires,c:csrf,enc:config.bodyEncoding};
  setSessionCookie(req,res,session,(expires-Date.now())/1000);attempts.delete(ip);
  res.json({username:session.u,baseUrl:session.b,csrf,expires:new Date(expires).toISOString()});
 }));
 app.use('/api',(req,res,next)=>{
  const s=unseal(readCookie(req));
  if(!s||typeof s.e!=='number'||s.e<Date.now()||revoked.has(s.id)||!s.t){if(readCookie(req))clearSessionCookie(req,res);return res.status(401).json({error:'请登录或重新连接平台'});}
  if(!['GET','HEAD'].includes(req.method)&&req.get('x-csrf-token')!==s.c)return res.status(403).json({error:'会话校验失败，请刷新页面'});
  const client=clientFactory({baseUrl:s.b,username:s.u,bodyEncoding:s.enc||'form'});client.token=s.t;client.expiresAt=s.e;
  req.session={id:s.id,client,csrf:s.c,username:s.u,baseUrl:s.b,expires:s.e};next();
 });
 app.get('/api/session',(req,res)=>{const {username,baseUrl,csrf,expires}=req.session;res.json({username,baseUrl,csrf,expires:new Date(expires).toISOString()});});
 app.post('/api/logout',asyncRoute(async(req,res)=>{
  // 退出 (v1/logout) ends the platform token too, so the cookie is useless even if it was copied before.
  await req.session.client.request('POST','logout',{body:{}}).catch(()=>{});
  revoked.set(req.session.id,req.session.expires);clearSessionCookie(req,res);res.json({ok:true});
 }));
 app.get('/api/catalog',(req,res)=>res.json({resources,actions,management:Object.fromEntries(Object.entries(management).map(([kind,entry])=>[kind,{title:entry.title,fields:entry.fields||[]}]))}));
 // 实例列表可点击表头排序的字段（v1/clouds 的 orderby；本月流量平台不支持，只在前端对当前页排序）。
 const CLOUD_SORT=['mainip','cpu','os','cpu_usage','memory_usage','current_out_bw'];
 const queryFor=(req,kind)=>{const q={page:Math.max(1,parseInt(req.query.page)||1),per_page:Math.min(100,Math.max(1,parseInt(req.query.per_page)||20)),orderby:kind==='nodes'?'order':'id',sort:kind==='nodes'?'asc':'desc'};if(req.query.search){q[kind==='images'?'name':'search']=String(req.query.search).slice(0,256);if(kind==='clouds')q.searchtype=0;}if(req.query.status!==undefined&&req.query.status!=='')q.status=kind==='clouds'?[String(req.query.status)]:String(req.query.status);if(req.query.area)q[['clouds','images'].includes(kind)?'area_id':'area']=Number(req.query.area);if(req.query.node)q.node=Number(req.query.node);if(req.query.cloud)q.cloud=Number(req.query.cloud);if(kind==='clouds'&&CLOUD_SORT.includes(String(req.query.orderby))){q.orderby=String(req.query.orderby);q.sort=req.query.sort==='asc'?'asc':'desc';}if(kind==='clouds'&&req.query.user){const user=Number(req.query.user);if(Number.isSafeInteger(user)&&user>0)q.user=user;}return q;};
 const routeFor=kind=>kind==='images'?'images/new_list':kind;
 app.get('/api/overview',asyncRoute(async(req,res)=>{
  const client=req.session.client;
  const [home,...lists]=await Promise.allSettled([client.request('GET','index'),...['areas'].map(kind=>client.request('GET',kind,{query:{page:1,per_page:kind==='areas'?100:kind==='nodes'?6:1,orderby:'id',sort:'desc'}}))]);
  const overview=home.status==='fulfilled'?(home.value?.data??home.value):{};
  res.json({data:{...overview,...(home.status==='rejected'?{homeError:home.reason.message}:{}),resources:Object.fromEntries(['areas'].map((kind,i)=>[kind,lists[i].status==='fulfilled'?listResult(lists[i].value):{error:lists[i].reason.message}]))}});
 }));
 app.get('/api/resources/:kind',asyncRoute(async(req,res)=>{const kind=req.params.kind;if(!resources[kind]&&!['tasks','images'].includes(kind))throw new HttpError(404,'资源不存在');const q=queryFor(req,kind);res.json(listResult(await req.session.client.request('GET',routeFor(kind),{query:q}),q.page,q.per_page));}));
 app.get('/api/resources/:kind/:id',asyncRoute(async(req,res)=>{const {kind,id}=req.params;if((!resources[kind]&&kind!=='tasks')||!/^\d+$/.test(id))throw new HttpError(404,'资源不存在');res.json(scrub(await req.session.client.request('GET',`${kind}/${id}`)));}));
 app.get('/api/nodes/:id/metrics',asyncRoute(async(req,res)=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'节点编号无效');res.json(scrub(await req.session.client.request('GET',`nodes/${req.params.id}/status`)));}));
 // 节点详情页：节点详情（v1/nodes/:id）、节点内容页（v1/node_info/:id，实例数、IP 用量、已分配 CPU / 内存）、
 // 节点实时数据（v1/nodes/:id/real_data，CPU、内存、Swap、磁盘、内核与 QEMU 版本、运行时间）一起取；
 // 后两个失败时只把错误带回去，页面照常显示其余部分。scrub 去掉 SSH 密码、密钥等敏感字段。
 app.get('/api/nodes/:id/overview',asyncRoute(async(req,res)=>{
  const id=req.params.id;if(!/^\d+$/.test(id))throw new HttpError(400,'节点编号无效');const c=req.session.client;
  const [node,info,real,state]=await Promise.allSettled([c.request('GET',`nodes/${id}`),c.request('GET',`node_info/${id}`),c.request('GET',`nodes/${id}/real_data`),c.request('GET',`nodes/${id}/status`)]);
  if(node.status==='rejected')throw node.reason;
  for(const r of [info,real,state])if(r.status==='rejected'&&r.reason?.status===401)throw r.reason;
  const pick=v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.data&&typeof v.data==='object'&&!Array.isArray(v.data)?v.data:v;
  const part=r=>r.status==='fulfilled'?pick(r.value):null,fail=r=>r.status==='rejected'?String(r.reason?.message||r.reason):undefined;
  // 获取节点状态（v1/nodes/:id/status）：实时在线状态和节点程序版本
  const st=part(state);
  res.json(scrub({node:pick(node.value),info:part(info),real:part(real),state:st?{status:st.status,msg:st.msg,version:st.version}:null,errors:{info:fail(info),real:fail(real)}}));
 }));
 // 节点详情页的开关：维护模式、节点启用、开机自动启动实例。修改节点（PUT v1/nodes/:id）的字段都是可选的，只提交这一项。
 const NODE_SWITCHES=['maintenance_mode','enable','auto_boot_host'];
 app.put('/api/nodes/:id/switch',asyncRoute(async(req,res)=>{
  const id=req.params.id;if(!/^\d+$/.test(id))throw new HttpError(400,'节点编号无效');
  const {field,value}=req.body||{};if(!NODE_SWITCHES.includes(field))throw new HttpError(400,'不支持的设置');if(value!==0&&value!==1)throw new HttpError(400,'开关只能是 0 或 1');
  res.json({ok:true,result:await mutate(req,'PUT',`nodes/${id}`,{[field]:value},'nodes',id,field)});
 }));
 app.post('/api/clouds/metrics',asyncRoute(async(req,res)=>{const ids=req.body.id;if(!Array.isArray(ids)||!ids.length||ids.length>100||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new HttpError(400,'实例编号无效');res.json(scrub(await req.session.client.request('POST','clouds/real_data',{body:{id:ids}})));}));
 app.get('/api/clouds/:id/state',asyncRoute(async(req,res)=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'实例编号无效');res.json(scrub(await req.session.client.request('GET',`clouds/${req.params.id}/status`)));}));
 app.get('/api/clouds/:id/traffic',asyncRoute(async(req,res)=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'实例编号无效');res.json(scrub(await req.session.client.request('GET','net_info',{query:{host_id:req.params.id}})));}));
 // 写操作统一经过 mutate：转发到平台并去掉返回里的敏感字段。不再在本机记录操作日志（平台自己有完整的操作日志）。
 async function mutate(req,method,route,body,kind,id,operation,{raw=false,query}={}){const result=await req.session.client.request(method,route,{body,...(query?{query}:{})});return raw?result:scrub(result);}
 const managedEntry=kind=>{const entry=management[kind];if(!entry)throw new HttpError(404,'管理功能不存在');return entry;};
 app.get('/api/manage/:kind',asyncRoute(async(req,res)=>{const kind=req.params.kind,entry=managedEntry(kind),q=managementQuery(kind,req.query);const result=await req.session.client.request('GET',entry.read,{query:q});const normalized=listResult(normalizeManagedList(result),q.page,q.per_page);if(['system-logs','login-logs'].includes(kind))normalized.data=normalized.data.map(row=>Object.fromEntries(Object.entries(row).filter(([key])=>!['param','data','action','replace'].includes(key))));res.json(normalized);}));
 app.get('/api/manage/:kind/:id',asyncRoute(async(req,res)=>{const entry=managedEntry(req.params.kind);if(!entry.write||!/^\d+$/.test(req.params.id))throw new HttpError(404,'资源不存在');res.json(scrub(await req.session.client.request('GET',`${entry.write}/${req.params.id}`)));}));
 const managedPayload=(kind,body,editing)=>{const entry=managedEntry(kind);if(!entry.fields||!entry.write||editing&&entry.noEdit)throw new HttpError(405,'此资源不支持该操作');const {output,errors}=fieldPayload(kind,body,{editing,descriptor:entry});if(output.expired_time)output.expired_time=output.expired_time.replace('T',' ');if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);if(!Object.keys(output).length)throw new HttpError(400,'没有可提交的字段');return {entry,output};};
 app.post('/api/manage/:kind',asyncRoute(async(req,res)=>{const {kind}=req.params,{entry,output}=managedPayload(kind,req.body,false);res.json({ok:true,result:await mutate(req,'POST',entry.write,output,kind,null,'create')});}));
 app.put('/api/manage/:kind/:id',asyncRoute(async(req,res)=>{const {kind,id}=req.params;if(!/^\d+$/.test(id))throw new HttpError(400,'资源编号无效');const {entry,output}=managedPayload(kind,req.body,true);res.json({ok:true,result:await mutate(req,'PUT',`${entry.write}/${id}`,output,kind,id,'update')});}));
 app.delete('/api/manage/:kind/:id',asyncRoute(async(req,res)=>{const {kind,id}=req.params,entry=managedEntry(kind);if(!entry.write||!/^\d+$/.test(id))throw new HttpError(405,'不支持删除此资源');if(String(req.body.confirm)!==id)throw new HttpError(400,'请输入资源编号确认');res.json({ok:true,result:await mutate(req,'DELETE',`${entry.write}/${id}`,undefined,kind,id,'delete')});}));
 const cleanupScope=body=>{const time=Number(body.time),type=body.type;if(!Number.isInteger(time)||time<=0||time>Date.now()/1000||!Array.isArray(type)||!type.length||type.length>3||type.some(v=>!['act_log','login_log','adsl_log'].includes(v)))throw new HttpError(400,'请选择有效的日志类型和截止时间');return {time,type:[...new Set(type)]};};
 app.post('/api/log-cleanup/preview',asyncRoute(async(req,res)=>{const scope=cleanupScope(req.body);const result=await req.session.client.request('GET','log_num',{query:scope});res.json(scrub(result));}));
 app.post('/api/log-cleanup/execute',asyncRoute(async(req,res)=>{const scope=cleanupScope(req.body);if(req.body.confirm!=='清理日志')throw new HttpError(400,'请输入“清理日志”确认操作');res.json({ok:true,result:await mutate(req,'DELETE','log',scope,'logs',null,'cleanup')});}));
 app.post('/api/nodes/:id/drag',asyncRoute(async(req,res)=>{
  const id=Number(req.params.id),target=Number(req.body.target_id),position=req.body.position;
  if(!Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(target)||target<1||id===target||!['before','after'].includes(position))throw new HttpError(400,'排序参数无效');
  let prev_id=target;
  if(position==='before'){
   const result=await req.session.client.request('GET','nodes',{query:{list_type:'all',orderby:'order',sort:'asc'}});
   const rows=listResult(result).data.filter(row=>Number(row.id)!==id),index=rows.findIndex(row=>Number(row.id)===target);
   if(index<0)throw new HttpError(404,'目标节点不存在');prev_id=index?Number(rows[index-1].id):0;
  }
  res.json({ok:true,result:await mutate(req,'POST',`nodes/${id}/drag`,{prev_id},'nodes',id,'reorder')});
 }));
 app.post('/api/resources/:kind',asyncRoute(async(req,res)=>{const {kind}=req.params;if(!resources[kind])throw new HttpError(404,'资源不存在');const {output,errors}=fieldPayload(kind,req.body);if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);res.json({ok:true,result:await mutate(req,'POST',kind,output,kind,null,'create')});}));
 app.put('/api/resources/:kind/:id',asyncRoute(async(req,res)=>{const {kind,id}=req.params;if(!resources[kind]||!/^\d+$/.test(id))throw new HttpError(404,'资源不存在');const {output,errors}=fieldPayload(kind,req.body,{editing:true});if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);if(!Object.keys(output).length)throw new HttpError(400,'没有可修改的字段');res.json({ok:true,result:await mutate(req,'PUT',`${kind}/${id}`,output,kind,id,'update')});}));
 app.delete('/api/resources/:kind/:id',asyncRoute(async(req,res)=>{const {kind,id}=req.params;if(!resources[kind]||!/^\d+$/.test(id))throw new HttpError(404,'资源不存在');if(String(req.body.confirm)!==id)throw new HttpError(400,'请输入资源编号确认删除');res.json({ok:true,result:await mutate(req,'DELETE',`${kind}/${id}`,kind==='clouds'?{force:0}:undefined,kind,id,'delete')});}));
 app.post('/api/clouds/:id/actions/:action',asyncRoute(async(req,res)=>{const {id,action}=req.params;if(!/^\d+$/.test(id)||!actions[action])throw new HttpError(400,'无效的实例操作');if(String(req.body.confirm)!==id)throw new HttpError(400,'请输入实例编号确认操作');res.json({ok:true,result:await mutate(req,'POST',`clouds/${id}/${action}`,{},'clouds',id,action)});}));
 app.put('/api/clouds/:id/settings/:setting',asyncRoute(async(req,res)=>{const {id,setting}=req.params,b=req.body;if(!/^\d+$/.test(id)||String(b.confirm)!==id)throw new HttpError(400,'请输入实例编号确认');let body;
  if(setting==='remark'){if(typeof b.remark!=='string'||b.remark.length>4096)throw new HttpError(400,'备注格式无效');body={remark:b.remark};}
  else if(setting==='bw'){body={in_bw:Number(b.in_bw),out_bw:Number(b.out_bw)};if(Object.values(body).some(v=>!Number.isInteger(v)||v<0))throw new HttpError(400,'带宽必须是非负整数');}
  else if(setting==='password'){if(typeof b.password!=='string'||b.password.length<8||b.password.length>128)throw new HttpError(400,'密码长度应为 8～128 位');body={password:b.password,password_type:0,reset_type:0};}
  else if(setting==='reinstall'){if(!Number.isInteger(Number(b.os))||Number(b.os)<1)throw new HttpError(400,'请选择系统镜像');body={os:Number(b.os),format_data_disk:0};if(b.password){if(typeof b.password!=='string'||b.password.length<8||b.password.length>128)throw new HttpError(400,'密码长度应为 8～128 位');body.password=b.password;}}
  else throw new HttpError(404,'操作不存在');res.json({ok:true,result:await mutate(req,'PUT',`clouds/${id}/${setting}`,body,'clouds',id,setting)});
 }));
 registerBatch(app,{asyncRoute});
 registerInstance(app,{asyncRoute,mutate});
 registerInstanceSettings(app,{asyncRoute,mutate});
 registerSiteConfig(app,{asyncRoute});
 registerNetwork(app,{asyncRoute,mutate});
 registerCreate(app,{asyncRoute,mutate});
 registerBusiness(app,{asyncRoute,mutate});
 registerNodeCharts(app,{asyncRoute});
 app.use('/api',(req,res)=>res.status(404).json({error:'接口不存在'}));
 app.use(express.static(path.join(root,'dist'),{index:false}));app.get('/{*path}',(req,res)=>res.sendFile(path.join(root,'dist/index.html')));
 app.use((err,req,res,next)=>{if(res.headersSent)return next(err);if(err.status===401&&req.session)clearSessionCookie(req,res);res.status(err.status||500).json({error:err instanceof HttpError?err.message:err.status===400?'请求格式不正确':'服务内部错误，请检查服务配置',fields:err.details});});
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT)||5080,host=process.env.HOST||'127.0.0.1';createApp().listen(port,host,()=>console.log(`CubeManage API: http://${host}:${port}`));}
