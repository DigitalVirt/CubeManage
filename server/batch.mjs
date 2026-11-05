import {HttpError,listResult} from './cube-client.mjs';

/**
 * Batch instance operations, mapped to the platform API (v1 doc). Native batch endpoints are used
 * where the platform has one; the rest run per instance, in order, and report each result.
 * Every request carries the instance ids and their count; the count must match (a guard against a
 * stale selection, not a typed confirmation).
 */
const perInstance={on:'on',off:'off',reboot:'reboot',hard_reboot:'hard_reboot',hardoff:'hardoff',suspend:'suspend',unsuspend:'unsuspend',resume:'resume'};
const titles={on:'开机',off:'关机',reboot:'重启',hard_reboot:'硬重启',hardoff:'硬关机',suspend:'暂停',unsuspend:'取消暂停',resume:'解除挂起',password:'重置密码',force_delete:'强制删除',delete:'删除',settings:'实例设置',migrate:'迁移',cancel_migrate:'取消迁移',reinstall:'重装',rules:'规则应用',ipv6:'添加IPV6',replace_ip:'替换IP',rebuild:'一键重建实例',restore:'从回收站恢复',purge:'彻底删除'};
const settingFields=['in_bw','out_bw','cpu_limit','read_bytes_sec','write_bytes_sec','read_iops_sec','write_iops_sec','read_bytes_sec_max','write_bytes_sec_max','read_iops_sec_max','write_iops_sec_max'];

const int=(v,name,{min=0,max=Number.MAX_SAFE_INTEGER,optional=false}={})=>{if(optional&&(v===undefined||v===null||v===''))return undefined;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new HttpError(400,`${name}必须是 ${min}～${max===Number.MAX_SAFE_INTEGER?'∞':max} 的整数`);return n;};
const flag=v=>v===true||v===1||v==='1'?1:0;
const password=(v,name='密码')=>{if(typeof v!=='string'||v.length<6||v.length>128)throw new HttpError(400,`${name}长度应为 6～128 位`);return v;};

/** Turn a native batch response into per-instance results. */
function nativeResults(ids,result){
 const failed=new Map();
 for(const f of result?.failed_list||result?.data?.failed_list||[])failed.set(Number(f.id??f.host_id),String(f.reason||f.error||'平台返回失败'));
 return ids.map(id=>failed.has(id)?{id,ok:false,error:failed.get(id)}:{id,ok:true});
}

// 一次最多选择的实例数；平台批量接口每次最多 100 个，超过时按 100 个一批依次提交。
const MAX_IDS=1000,CHUNK=100;

/**
 * Run a native batch call in chunks of CHUNK ids and merge the per-instance results.
 * A single chunk behaves exactly like one call (errors propagate). With several chunks a failed chunk
 * marks its own instances failed and the rest continue; an expired platform session (401) still stops everything.
 */
async function inChunks(ids,call){
 if(ids.length<=CHUNK){const r=await call(ids);return {results:nativeResults(ids,r),raw:[r]};}
 const results=[],raw=[];
 for(let i=0;i<ids.length;i+=CHUNK){
  const part=ids.slice(i,i+CHUNK);
  try{const r=await call(part);raw.push(r);results.push(...nativeResults(part,r));}
  catch(e){if(e?.status===401)throw e;results.push(...part.map(id=>({id,ok:false,error:e.message})));}
 }
 return {results,raw};
}
/** Promise.all with at most `limit` calls running at once, results in input order. */
async function mapLimit(items,limit,fn){
 const out=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));
 return out;
}
/** 进度：0–100 的整数；“42%”、“42.5”也认；没有或不是数字时为 null。 */
const percent=v=>{if(v==null||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):null;};
/** 平台上正在执行和还没开始的实例任务，按任务 ID 和实例 ID 索引；同一实例优先取迁移类任务。失败时返回空表。 */
async function migrateTasks(client){
 const byId=new Map(),byHost=new Map();
 for(const status of [1,0]){
  try{
   const r=await client.request('GET','tasks',{query:{status,rel_type:'cloud',per_page:100,orderby:'id',sort:'desc'}});
   for(const t of listResult(r,1,100).data){
    const host=Number(t.hostid);if(t.id!=null)byId.set(Number(t.id),t);if(!host)continue;
    const mig=/migrat/i.test(String(t.type||''))||/迁移/.test(String(t.msg||''));const prev=byHost.get(host);
    if(!prev||(mig&&!prev.mig))byHost.set(host,{...t,mig});
   }
  }catch{/* 读不到任务列表时只用冷迁移进度 */}
 }
 return {byId,byHost};
}
const listOf=(r,key)=>Array.isArray(r?.[key])?r[key]:Array.isArray(r?.data?.[key])?r.data[key]:[];
const sumNum=raw=>{const n=raw.map(r=>r?.num??r?.data?.num).filter(x=>x!==undefined&&x!==null);return n.length?n.reduce((a,b)=>a+Number(b||0),0):undefined;};

export function registerBatch(app,{asyncRoute}){
 // 迁移队列: 获取迁移实例列表 (v1/clouds/migrate); instances being migrated also get 获取实例冷迁移进度 (v1/clouds/:id/migrate).
 // 冷迁移进度接口在热迁移（或平台低于 v2.2.7）时不返回真实进度：这时改用任务列表（v1/tasks）里该实例迁移任务的进度和描述；
 // 任务还没开始执行（status=0）的实例算作排队中。
 app.get('/api/clouds/migrate_queue',asyncRoute(async(req,res)=>{
  const client=req.session.client;const r=await client.request('GET','clouds/migrate');
  const rows=(Array.isArray(r)?r:Array.isArray(r?.data)?r.data:listResult(r,1,100).data).filter(x=>x&&x.id!=null);
  const pick=v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.data&&typeof v.data==='object'?v.data:v||{};
  const tasks=rows.some(x=>Number(x.migrate_status)===1)?await migrateTasks(client):{byId:new Map(),byHost:new Map()};
  // 进度逐台查询，最多同时 6 个请求，避免队列很长时一次性压垮平台。
  const data=await mapLimit(rows,6,async x=>{
   const row={id:Number(x.id),hostname:x.hostname||'',mainip:x.mainip||'',ipaddress:x.ipaddress||'',status:Number(x.migrate_status)===1?1:0};
   if(row.status!==1)return row;
   let m={};try{m=pick(await client.request('GET',`clouds/${row.id}/migrate`));}catch{/* 没有冷迁移进度，下面用任务进度 */}
   const task=(m.taskid!=null&&tasks.byId.get(Number(m.taskid)))||tasks.byHost.get(row.id);
   const cold={progress:percent(m.progress),target:m.target_node?.name||'',speed:m.speed||'',eta:m.eta_string||'',migrated:m.migrate_size||'',total:m.total_size||'',msg:m.msg||''};
   if((cold.progress||0)>0||cold.speed||cold.migrated)return {...row,...cold,progress:cold.progress??0,source:'migrate'};
   if(task&&Number(task.status)===0)return {...row,status:0,target:cold.target,msg:task.msg||''};
   if(task)return {...row,...cold,progress:percent(task.progress)??0,msg:task.msg||cold.msg,source:'task'};
   return {...row,...cold,progress:cold.progress,source:cold.progress==null?undefined:'migrate'};
  });
  // 排序：有实际进度（百分比大于 0 或有速度 / 大小）的在最上面，进度高的在前；然后是正在迁移但还没进度的，最后是排队中的。
  const rank=x=>x.status!==1?0:(x.progress||0)>0||x.speed||x.migrated?2:1;
  data.sort((a,b)=>rank(b)-rank(a)||(b.progress||0)-(a.progress||0)||a.id-b.id);
  res.json({data,total:data.length,running:data.filter(x=>x.status===1).length});
 }));
 app.post('/api/clouds/batch/:op',asyncRoute(async(req,res)=>{
  const op=req.params.op,b=req.body,client=req.session.client;
  if(!titles[op])throw new HttpError(404,'批量操作不存在');
  const ids=b.ids;
  if(!Array.isArray(ids)||!ids.length||ids.length>MAX_IDS||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw new HttpError(400,`请选择 1～${MAX_IDS} 个有效实例`);
  if(Number(b.count)!==ids.length)throw new HttpError(400,'所选实例数量与提交的不一致，请刷新列表后重试');
  const done=async(results,extra={})=>{const success=results.filter(r=>r.ok).length;res.json({ok:true,op,title:titles[op],total:results.length,success,failed:results.length-success,results,...extra});};
  // Native batch endpoint, sent CHUNK ids at a time; bodyFor(part) builds the body for each chunk.
  const native=(method,route,bodyFor)=>inChunks(ids,part=>client.request(method,route,{body:bodyFor(part)}));

  if(perInstance[op]){
   const results=[];
   for(const id of ids){try{const r=await client.request('POST',`clouds/${id}/${perInstance[op]}`,{body:{}});results.push({id,ok:true,task:r?.taskid??r?.task_id??r?.data?.taskid});}catch(e){results.push({id,ok:false,error:e.message});}}
   return done(results);
  }
  if(op==='delete'||op==='force_delete'){const {results}=await native('DELETE','clouds',part=>({id:part,force:op==='force_delete'?1:0}));return done(results);}
  // 回收站: 从回收站恢复 (DELETE v1/recycle_bin) and 回收站彻底删除实例 (DELETE v1/clouds/recycle_bin).
  if(op==='restore'){const {results}=await native('DELETE','recycle_bin',part=>({id:part}));return done(results);}
  if(op==='purge'){const {results}=await native('DELETE','clouds/recycle_bin',part=>({id:part}));return done(results);}
  if(op==='rebuild'){const {results,raw}=await native('PUT','clouds/rebuild',part=>({id:part}));return done(results,{submitted:sumNum(raw)});}
  if(op==='cancel_migrate'){const {results}=await native('DELETE','clouds/migrate',part=>({id:part}));return done(results);}
  if(op==='password'){
   const same=flag(b.same);const pass=password(b.password,'新密码');
   const {results,raw}=await native('PUT','clouds/password',part=>({id:part,password:pass,this_same_pass:same}));const rows=raw.flatMap(r=>Array.isArray(r?.data)?r.data:Array.isArray(r)?r:[]);
   // Random passwords are shown once so the operator can hand them over; the old ones never leave the BFF.
   const passwords=same?[]:rows.map(x=>({id:Number(x.id),password:String(x.new_pass??'')})).filter(x=>x.password);
   return done(results,{passwords});
  }
  if(op==='reinstall'){
   const type=flag(b.password_type);const body={os:int(b.os,'系统镜像',{min:1}),format_data_disk:flag(b.format_data_disk),password_type:type};
   if(type===1)body.ssh_key=int(b.ssh_key,'SSH 密钥',{min:1});else if(b.password)body.password=password(b.password,'新密码');
   const preset=int(b.app_preset_id,'应用预设',{optional:true});if(preset!==undefined)body.app_preset_id=preset;
   const {results,raw}=await native('PUT','clouds/reinstall',part=>({id:part,...body}));return done(results,{submitted:sumNum(raw)});
  }
  // 迁移: one 迁移实例 call per instance (POST v1/clouds/:id/migrate), in order — not the batch migrate queue.
  // hot_migrate is only sent when chosen (the platform defaults to hot migration first).
  if(op==='migrate'){
   const node=int(b.node,'目标节点',{min:1}),mode=b.mode===undefined||b.mode===''?undefined:int(b.mode,'迁移方式',{min:0,max:1});
   const body={node,force:0,...(mode===undefined?{}:{hot_migrate:mode})};const results=[];
   // 重新分配 IP: 迁移实例 takes the new IPs as `ip` (IP ids). Each instance gets as many free IPv4 addresses on the target
   // node (获取节点所有可用IP, v1/ip/free?node=) as it has now (获取实例IP), none shared; without the option the platform decides.
   // The dialog submits one instance per request to show progress, passing the IPs already handed out as exclude_ip.
   let pool=null;
   if(flag(b.assign_ip)){const free=await client.request('GET','ip/free',{query:{node}});const segs=Array.isArray(free)?free:Array.isArray(free?.data)?free.data:[];const taken=new Set((Array.isArray(b.exclude_ip)?b.exclude_ip:[]).map(Number));pool=segs.flatMap(sg=>(sg.ip||[]).map(x=>Number(x.id))).filter(x=>Number.isSafeInteger(x)&&!taken.has(x));}
   for(const id of ids){
    try{
     const one={...body};
     if(pool){const r=await client.request('GET',`clouds/${id}/ip`);const d=r?.data&&!Array.isArray(r.data)?r.data:r||{};const count=Math.max(1,[...(d.interface||[]).flatMap(n=>n.public_ip||[]),...(d.public_ip||[])].length);
      if(pool.length<count){results.push({id,ok:false,error:`目标节点空闲 IP 不足（需要 ${count} 个，剩余 ${pool.length} 个）`});continue;}one.ip=pool.splice(0,count);}
     const r=await client.request('POST',`clouds/${id}/migrate`,{body:one});results.push({id,ok:true,task:r?.taskid??r?.data?.taskid,...(one.ip?{ip:one.ip}:{})});
    }catch(e){results.push({id,ok:false,error:e.message});}
   }
   return done(results);
  }
  if(op==='rules'){const body={};const bw=int(b.advanced_bw,'智能带宽规则',{min:1,optional:true}),cpu=int(b.advanced_cpu,'智能 CPU 规则',{min:1,optional:true});if(bw===undefined&&cpu===undefined)throw new HttpError(400,'请至少选择一条规则');if(bw!==undefined)body.advanced_bw=bw;if(cpu!==undefined)body.advanced_cpu=cpu;const {results}=await native('PUT','clouds/advanced_rule',part=>({id:part,...body}));return done(results);}
  if(op==='ipv6'){const num=int(b.num,'IPv6 数量',{min:1,max:1000});const {results,raw}=await native('POST','clouds/ipv6',part=>({ids:part,num}));const added=raw.flatMap(r=>listOf(r,'success_list')).map(x=>({id:Number(x.host_id),ipv6:x.added_ipv6||[]}));return done(results,{ipv6:added});}
  if(op==='replace_ip'){const body={num:int(b.num,'IPv4 数量',{min:1,max:256})};const group=int(b.ip_group,'IP 分组',{min:1,optional:true});if(group!==undefined)body.ip_group=group;const {results}=await native('PUT','clouds/ip/change',part=>({ids:part,...body}));return done(results);}
  if(op==='settings'){const body={};for(const k of settingFields){const v=int(b[k],k,{optional:true});if(v!==undefined)body[k]=v;}if(!Object.keys(body).length)throw new HttpError(400,'请至少填写一项设置');const {results}=await native('PUT','clouds',part=>({id:part,...body}));return done(results);}
  throw new HttpError(404,'批量操作不存在');
 }));

 // CSV export of the selected instances, streamed back as a download.
 app.get('/api/clouds/export',asyncRoute(async(req,res)=>{
  const ids=String(req.query.ids||'').split(',').filter(Boolean).map(Number);
  if(!ids.length||ids.length>500||ids.some(id=>!Number.isSafeInteger(id)||id<1))throw new HttpError(400,'请选择要导出的实例');
  const text=await req.session.client.requestText('GET','clouds/export_csv',{query:{id:ids}});
  res.set('Content-Type','text/csv; charset=utf-8').attachment(`instances-${new Date().toISOString().slice(0,10)}.csv`).send(text);
 }));

 // 迁移目标节点: 获取所有每个区域可选迁移节点 (v1/common/enable_migrate_node). The doc gives {area:[{name,node:[]}]}, but
 // platforms answer it bare, under data, as an object keyed by id, or with nodes/children — read them all. If that endpoint
 // fails or lists nothing, fall back to 节点列表 (v1/nodes), so the dialog always has nodes to choose from.
 async function migrateNodes(client){
  const arr=v=>Array.isArray(v)?v:v&&typeof v==='object'?Object.values(v):[];
  let areas=[];
  try{const r=await client.request('GET','common/enable_migrate_node',{query:{include_node:'enable'}});
   const root=r?.data!==undefined&&!Array.isArray(r)?r.data:r;areas=arr(root?.area??root?.areas??root);}catch(e){areas=[];}
  const out=areas.flatMap(a=>arr(a?.node??a?.nodes??a?.children).map(n=>({id:Number(n.id),name:String(n.name??n.node_name??'#'+n.id),group:String(a.name??a.area_name??'')}))).filter(n=>Number.isSafeInteger(n.id)&&n.id>0);
  if(out.length)return out;
  const r=await client.request('GET','nodes',{query:{page:1,per_page:100,orderby:'order',sort:'asc'}});
  return listResult(r,1,100).data.filter(n=>n.status===undefined||Number(n.status)===1||n.status==='1').map(n=>({id:Number(n.id),name:String(n.name),group:String(n.area_name??n.area?.name??'')}));
 }

 // Options for the batch forms. Each maps to one documented list endpoint.
 const lookups={
  migrate_nodes:['common/enable_migrate_node',{include_node:'enable'}],
  ip_groups:['ip_groups/select',{page:1,per_page:100}],
  ssh_keys:['ssh_keys',{page:1,per_page:100}],
  bw_rules:['advanced_bw_rules',{page:1,per_page:100,status:1}],
  cpu_rules:['advanced_cpu_rules',{page:1,per_page:100,status:1}],
  app_presets:['app_presets',{page:1,per_page:100,status:1}],
 node_groups:['node_groups',{list_type:'all'}],
 countries:['countries',{}],
 ip_segments:['common/ipsegment',{}]
 };
 app.get('/api/lookups/:name',asyncRoute(async(req,res)=>{
  const entry=lookups[req.params.name];if(!entry)throw new HttpError(404,'选项不存在');
  if(req.params.name==='migrate_nodes')return res.json({data:await migrateNodes(req.session.client)});
  // SSH 密钥可按用户筛选（v1/ssh_keys 的 uid）：新建实例只列出所属用户的密钥。
  const uid=req.params.name==='ssh_keys'&&/^\d+$/.test(String(req.query.uid||''))?{uid:Number(req.query.uid)}:{};
  const result=await req.session.client.request('GET',entry[0],{query:{...entry[1],...uid}});
  res.json({data:listResult(result).data.map(r=>({id:r.id,name:r.name}))});
 }));
}
export {titles as batchTitles};
