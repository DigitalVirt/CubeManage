import {HttpError,listResult,scrub} from './cube-client.mjs';

/**
 * 实例详情“设置”“快照”“备份”“计划任务”（digitalvirt-v1-api.md）：
 * - 设置：读取 GET v1/clouds/:id（实例详情）；保存 PUT v1/clouds/:id（修改实例，只提交改动的字段）、PUT v1/clouds/:id/cpu_limit（修改CPU限制）、
 *   POST v1/disks/:id/boot（设为启动盘）；ISO 挂载 POST / 卸载 DELETE v1/clouds/:id/iso；GET v1/clouds/:id/xml（获取实例xml）；ISO 列表 GET v1/iso。
 *   APIC 只在详情里返回，修改接口没有这个参数，所以只读。控制台密码不随设置下发，只在明确点“显示”时读取。
 * - 快照 / 备份：GET v1/clouds/:id/snapshots（实例备份列表，type=snap|backup）、POST v1/disks/:id/snapshots（创建备份）、
 *   DELETE v1/snapshots/:id（删除备份/快照）、POST v1/snapshots/:id/restore（备份还原）、POST v1/snapshots/:id/cancel（取消创建），均带 hostid 校验归属。
 * - 计划任务：GET / POST v1/clouds/:id/cron_snap、DELETE v1/clouds/:cloud/cron_snap/:id（定时快照/备份）。
 */
const int=(v,name,{min=0,max=Number.MAX_SAFE_INTEGER}={})=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new HttpError(400,`${name}必须是 ${min}～${max} 的整数`);return n;};
const flag=(v,name)=>{if(![0,1,'0','1',true,false].includes(v))throw new HttpError(400,name+'只能是开或关');return v===true||Number(v)===1?1:0;};
const pick=(v,options,name)=>{if(!options.includes(String(v)))throw new HttpError(400,name+'不是允许的选项');return String(v);};
const str=(v,name,max)=>{if(typeof v!=='string'||v.length>max)throw new HttpError(400,`${name}最多 ${max} 个字符`);return v;};
const VRAM=['16','32','64','128','256','512','1024','2048'];
/** PUT v1/clouds/:id 允许的字段：key → 校验函数 */
const FIELDS={
 acpi:v=>flag(v,'ACPI'),vnc:v=>flag(v,'VNC 控制台'),console:v=>flag(v,'串口 Console'),pae:v=>flag(v,'PAE'),gpu:v=>flag(v,'VirtIO-GPU'),
 skip_cold_backup:v=>flag(v,'跳过冷备份'),simulate_physical_machine:v=>flag(v,'模拟物理机运行'),
 cputopcheck:v=>flag(v,'CPU 拓扑'),cputunecheck:v=>flag(v,'CPUTune'),cpunumacheck:v=>flag(v,'NUMA 拓扑'),
 vncport:v=>int(v,'控制台端口',{min:1,max:65535}),
 vncpass:v=>{const s=str(v,'控制台密码',16);if(s.length<1)throw new HttpError(400,'控制台密码不能为空');return s;},
 bootorder:v=>pick(v,['c','d','cd','dc'],'启动顺序'),cpumodel:v=>Number(pick(v,['1','2','3'],'CPU 模式')),clock:v=>Number(pick(v,['0','1','2'],'时钟')),
 queues:v=>int(v,'网卡多队列',{min:1,max:64}),vram:v=>Number(pick(v,VRAM,'显存大小')),
 cpusockets:v=>int(v,'CPU sockets',{min:1,max:512}),cpucores:v=>int(v,'CPU cores',{min:1,max:512}),cputhreads:v=>int(v,'CPU threads',{min:1,max:512}),
 cputune:v=>str(v,'CPUTune',4000),cpunumatop:v=>str(v,'NUMA 拓扑',4000),qemu:v=>str(v,'QEMU 版本',32)
};
const unwrap=r=>r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r;

export function registerInstanceSettings(app,{asyncRoute,mutate}){
 const cloudId=req=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'实例编号无效');return Number(req.params.id);};
 const detail=async(req,id)=>unwrap(await req.session.client.request('GET',`clouds/${id}`));
 const disksOf=info=>(Array.isArray(info?.disk)?info.disk:[]).map(d=>({id:Number(d.id),name:d.remarks||d.name||'#'+d.id,file:d.name||'',dev:d.dev||'',type:d.type,size:d.size}));

 // 设置：当前值（不含控制台密码）
 app.get('/api/clouds/:id/settings',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const d=await detail(req,id);const disks=disksOf(d);
  const keys=['acpi','apic','vnc','vncport','bootorder','cpumodel','pae','clock','console','queues','gpu','vram','skip_cold_backup','qemu','simulate_physical_machine','cputopcheck','cputunecheck','cpunumacheck','cpusockets','cpucores','cputhreads','cputune','cpunumatop'];
  const out=Object.fromEntries(keys.map(k=>[k,d?.[k]??null]));
  const limit=Number(String(d?.cpu_limit??'').replace('%',''));
  res.json({...out,cpu_limit:Number.isFinite(limit)?limit:0,vncpass_set:Boolean(d?.vncpass),qemu_versions:Array.isArray(d?.qemu_version)?d.qemu_version.map(String):[],default_qemu:d?.default_qemu_version_show??'',
   disks,boot_disk:disks.find(x=>x.dev==='vda')?.id??null,iso:(Array.isArray(d?.iso)?d.iso:[]).map(x=>({id:x.id,name:x.name||'#'+x.id})),status:d?.status??''});
 }));
 // 控制台密码：明确点“显示”时才读取
 app.get('/api/clouds/:id/vncpass',asyncRoute(async(req,res)=>{const id=cloudId(req);const d=await detail(req,id);res.json({vncpass:d?.vncpass??''});}));
 // 保存：只提交改动的字段
 app.put('/api/clouds/:id/settings',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const b=req.body||{};const body={};
  for(const [k,check] of Object.entries(FIELDS))if(b[k]!==undefined&&b[k]!==null&&b[k]!=='')body[k]=check(b[k]);
  if(body.qemu){const d=await detail(req,id);const allowed=(d?.qemu_version||[]).map(String);if(allowed.length&&!allowed.includes(body.qemu))throw new HttpError(400,'QEMU 版本不在可选列表中');}
  let cpuLimit;if(b.cpu_limit!==undefined&&b.cpu_limit!==null&&b.cpu_limit!=='')cpuLimit=int(b.cpu_limit,'CPU 限制',{min:0,max:100});
  let bootDisk;if(b.boot_disk){bootDisk=int(b.boot_disk,'启动盘',{min:1});const d=await detail(req,id);if(!disksOf(d).some(x=>x.id===bootDisk))throw new HttpError(404,'这块磁盘不属于该实例');}
  if(!Object.keys(body).length&&cpuLimit===undefined&&!bootDisk)throw new HttpError(400,'没有需要保存的修改');
  const done=[];
  if(Object.keys(body).length){await mutate(req,'PUT',`clouds/${id}`,body,'clouds',id,'settings');done.push('实例设置');}
  if(cpuLimit!==undefined){await mutate(req,'PUT',`clouds/${id}/cpu_limit`,{cpu_limit:String(cpuLimit)},'clouds',id,'cpu_limit');done.push('CPU 限制');}
  if(bootDisk){await mutate(req,'POST',`disks/${bootDisk}/boot`,{},'disks',bootDisk,'boot');done.push('启动盘');}
  res.json({ok:true,done});
 }));
 // ISO：可选列表（启用的）、挂载、卸载
 app.get('/api/clouds/:id/iso_options',asyncRoute(async(req,res)=>{cloudId(req);const r=await req.session.client.request('GET','iso',{query:{page:1,per_page:200}});res.json({data:listResult(r,1,200).data.filter(x=>Number(x.status??1)===1).map(x=>({id:x.id,name:x.name||x.filename||'#'+x.id}))});}));
 app.post('/api/clouds/:id/iso',asyncRoute(async(req,res)=>{const id=cloudId(req);const iso=int(req.body?.iso,'ISO',{min:1});await mutate(req,'POST',`clouds/${id}/iso`,{iso},'clouds',id,'iso_mount');res.json({ok:true});}));
 app.delete('/api/clouds/:id/iso',asyncRoute(async(req,res)=>{const id=cloudId(req);const mount=int(req.body?.iso,'挂载',{min:1});const d=await detail(req,id);if(!(d?.iso||[]).some(x=>Number(x.id)===mount))throw new HttpError(404,'这个 ISO 没有挂载在该实例上');await mutate(req,'DELETE',`clouds/${id}/iso`,{iso:mount},'clouds',id,'iso_unmount');res.json({ok:true});}));
 // XML
 app.get('/api/clouds/:id/xml',asyncRoute(async(req,res)=>{const id=cloudId(req);const r=await req.session.client.request('GET',`clouds/${id}/xml`);const v=r?.data?.xml??r?.xml??r?.data??r;res.json({xml:typeof v==='string'?v:JSON.stringify(v,null,2)});}));

 // 快照 / 备份
 const kind=v=>v==='backup'?'backup':'snap';
 app.get('/api/clouds/:id/snapshots',asyncRoute(async(req,res)=>{
  const id=cloudId(req),type=kind(req.query.type),page=int(req.query.page??1,'页码',{min:1});
  const [r,d]=await Promise.all([req.session.client.request('GET',`clouds/${id}/snapshots`,{query:{type,page,per_page:20,orderby:'id',sort:'desc'}}),detail(req,id)]);
  res.json({...scrub(listResult(r,page,20)),disks:disksOf(d)});
 }));
 app.post('/api/clouds/:id/snapshots',asyncRoute(async(req,res)=>{
  const id=cloudId(req),type=kind(req.body?.type);const disk=int(req.body?.disk,'磁盘',{min:1});const d=await detail(req,id);
  if(!disksOf(d).some(x=>x.id===disk))throw new HttpError(404,'这块磁盘不属于该实例');
  const name=req.body?.name?str(String(req.body.name),'备注名',64):undefined;
  const r=unwrap(await mutate(req,'POST',`disks/${disk}/snapshots`,{type,...(name?{name}:{})},'snapshots',disk,type==='backup'?'backup_create':'snap_create',{query:{hostid:id}}));
  res.json({ok:true,task:r?.taskid??null});
 }));
 const onSnap=(method,suffix,operation)=>asyncRoute(async(req,res)=>{
  const id=cloudId(req);const sid=int(req.params.sid,'快照 / 备份',{min:1});
  const r=unwrap(await mutate(req,method,`snapshots/${sid}${suffix}`,suffix==='/cancel'?{id:sid}:{},'snapshots',sid,operation,{query:{hostid:id}}));
  res.json({ok:true,task:r?.taskid??null});
 });
 app.delete('/api/clouds/:id/snapshots/:sid',onSnap('DELETE','','snap_delete'));
 app.post('/api/clouds/:id/snapshots/:sid/restore',onSnap('POST','/restore','snap_restore'));
 app.post('/api/clouds/:id/snapshots/:sid/cancel',onSnap('POST','/cancel','snap_cancel'));

 // 计划任务（定时快照 / 备份）
 app.get('/api/clouds/:id/cron',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const [r,d]=await Promise.all([req.session.client.request('GET',`clouds/${id}/cron_snap`),detail(req,id)]);
  const list=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];res.json({data:list,disks:disksOf(d)});
 }));
 app.post('/api/clouds/:id/cron',asyncRoute(async(req,res)=>{
  const id=cloudId(req),b=req.body||{};const type=kind(b.type);const cycle=pick(b.cycle,['hour','day','week','month'],'周期');const frequency=int(b.frequency,'频率',{min:1,max:1000});
  const d=await detail(req,id);const own=new Set(disksOf(d).map(x=>x.id));const disk=Array.isArray(b.disk)?[...new Set(b.disk.map(v=>int(v,'磁盘',{min:1})))]:[];
  if(!disk.length)throw new HttpError(400,'请至少选择一块磁盘');if(disk.some(x=>!own.has(x)))throw new HttpError(404,'所选磁盘不属于该实例');
  const body={type,cycle,frequency,disk};if(b.point){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b.point)))throw new HttpError(400,'时间点格式应为 00:00～23:59');body.point=String(b.point);}
  await mutate(req,'POST',`clouds/${id}/cron_snap`,body,'clouds',id,'cron_create');res.json({ok:true});
 }));
 app.delete('/api/clouds/:id/cron/:cid',asyncRoute(async(req,res)=>{const id=cloudId(req);const cid=int(req.params.cid,'计划任务',{min:1});await mutate(req,'DELETE',`clouds/${id}/cron_snap/${cid}`,{},'clouds',id,'cron_delete');res.json({ok:true});}));
}
