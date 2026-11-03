import {HttpError,listResult,scrub} from './cube-client.mjs';

/**
 * Single-instance management for the instance detail page. Every route maps to an endpoint in
 * digitalvirt-v1-api.md (section 实例 / 磁盘管理 / 图表数据 / vpc网络管理); the doc heading is noted beside each.
 * Writes go through mutate(), which forwards them to the platform and scrubs secrets from the response.
 */
const int=(v,name,{min=0,max=Number.MAX_SAFE_INTEGER,optional=false}={})=>{if(optional&&(v===undefined||v===null||v===''))return undefined;const n=Number(v);if(!Number.isSafeInteger(n)||n<min||n>max)throw new HttpError(400,`${name}必须是 ${min}～${max===Number.MAX_SAFE_INTEGER?'∞':max} 的整数`);return n;};
const password=(v,name='密码')=>{if(typeof v!=='string'||v.length<6||v.length>128)throw new HttpError(400,`${name}长度应为 6～128 位`);return v;};
const pick=(v,options,name)=>{if(v===undefined||v===null||v==='')return undefined;if(!options.includes(String(v)))throw new HttpError(400,`${name}不是允许的选项`);return String(v);};
const diskOptions=b=>{const out={};const d=pick(b.driver,['ide','virtio','sata','scsi'],'驱动');if(d)out.driver=d;const c=pick(b.cache,['none','writethrough','writeback','directsync'],'缓存');if(c)out.cache=c;const io=pick(b.io,['native','threads'],'IO 模式');if(io)out.io=io;return out;};
const power={on:'开机',off:'关机',reboot:'重启',hard_reboot:'硬重启',hardoff:'硬关机',suspend:'暂停',unsuspend:'解除暂停',resume:'解除挂起'};
/** Chart ranges offered by the page, in hours. */
export const chartRanges={'1h':1,'6h':6,'12h':12,'1d':24,'7d':168,'15d':360,'30d':720};

/** op → [title, build(body, ctx) → {method, route, body}] */
const ops={
 ...Object.fromEntries(Object.entries(power).map(([op,title])=>[op,[title,(b,{id})=>({method:'POST',route:`clouds/${id}/${op}`,body:{}})]])), // 开机 / 关机 / 重启 / 硬重启 / 硬关机 / 暂停 / 解除暂停 / 解除挂起
 delete:['删除实例',(b,{id})=>({method:'DELETE',route:`clouds/${id}`,body:{force:0}})], // 删除实例（进入回收站）
 rescue:['进入救援系统',(b,{id})=>({method:'POST',route:`clouds/${id}/rescue`,body:{type:int(b.type??0,'救援系统类型',{max:3}),...(b.temp_pass?{temp_pass:password(b.temp_pass,'临时密码')}:{})}})], // 进入救援系统
 rescue_exit:['退出救援系统',(b,{id})=>({method:'DELETE',route:`clouds/${id}/rescue`,body:{}})], // 退出救援系统
 reinstall:['重装系统',(b,{id})=>{const login=b.password_type===1||b.password_type==='1'?1:0;const body={os:int(b.os,'镜像',{min:1}),format_data_disk:b.format_data_disk?1:0,password_type:login};if(login)body.ssh_key=int(b.ssh_key,'SSH 密钥',{min:1});else if(b.password)body.password=password(b.password);const preset=int(b.app_preset_id,'应用预设',{optional:true});if(preset)body.app_preset_id=preset;return {method:'PUT',route:`clouds/${id}/reinstall`,body};}], // 重装
 password:['修改密码',(b,{id})=>({method:'PUT',route:`clouds/${id}/password`,body:{password:password(b.password),password_type:0,reset_type:b.reset_type?1:0}})], // 重置密码
 bw:['修改带宽',(b,{id})=>({method:'PUT',route:`clouds/${id}/bw`,body:{in_bw:int(b.in_bw,'进带宽'),out_bw:int(b.out_bw,'出带宽')}})], // 修改实例带宽
 flow_setting:['流量设置',(b,{id})=>{const strategy=b.flow_strategy==='statistics'?'statistics':'cycle';const body={flow_strategy:strategy,traffic_quota:int(b.traffic_quota,'流量限额'),traffic_type:int(b.traffic_type??3,'统计方向',{min:1,max:3})};if(strategy==='cycle'){body.flow_reset_cycle=b.flow_reset_cycle==='day'?'day':'month';if(body.flow_reset_cycle==='day')body.flow_reset_cycle_num=int(b.flow_reset_cycle_num,'重置周期天数',{min:1,max:3650});else body.reset_flow_day=int(b.reset_flow_day,'流量重置日',{min:1,max:31});}return {method:'PUT',route:`clouds/${id}/flow_setting`,body};}], // 修改流量计费设置
 config:['修改配置',(b,{id})=>({method:'PUT',route:`clouds/${id}`,body:{cpu:int(b.cpu,'CPU 核心数',{min:1,max:512}),memory:int(b.memory,'内存（MB）',{min:128,max:4194304})}})], // 修改实例（cpu, memory: MB, as 创建实例）
 reset_traffic:['重置流量',(b,{id})=>({method:'POST',route:`clouds/${id}/reset_traffic`,body:{resume:1}})], // 流量计费重置
 network_type:['切换网络类型',(b,{id})=>{const body={};const vpc=int(b.vpc,'VPC 网络',{min:1,optional:true});if(vpc)body.vpc=vpc;else if(b.vpc_ips){if(typeof b.vpc_ips!=='string'||!/^(10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\/(1[6-9]|2[0-8])$/.test(b.vpc_ips))throw new HttpError(400,'VPC 网段格式应为 192.168.0.0/24 这类私有网段，掩码 /16～/28');body.vpc_ips=b.vpc_ips;}return {method:'PUT',route:`clouds/${id}/network_type`,body};}], // 切换网络类型
 vpc:['切换 VPC 网络',(b,{id})=>{const vpc=int(b.vpc,'VPC 网络',{min:1,optional:true});if(!vpc&&typeof b.vpc_ips!=='string')throw new HttpError(400,'请选择 VPC 网络或填写新网段');return {method:'PUT',route:`clouds/${id}/vpc_networks`,body:vpc?{vpc}:{vpc_ips:b.vpc_ips}};}], // 切换到其他VPC网络
 ip_num:['修改 IPv4 数量',(b,{id})=>{const body={num:int(b.num,'IPv4 数量',{min:1,max:1000})};const group=int(b.ip_group,'IP 分组',{min:1,optional:true});if(group)body.ip_group=group;return {method:'PUT',route:`clouds/${id}/ip`,body};}], // 修改实例IP数量
 mainip:['设为主 IP',(b,{id})=>({method:'POST',route:`clouds/${id}/mainip`,body:{ip:int(b.ip,'IP',{min:1}),version:b.version==='v6'?'v6':'v4'}})], // 设置主IP
 ipv6_add:['添加 IPv6',(b,{id})=>({method:'POST',route:`clouds/${id}/ipv6`,body:{num:int(b.num,'IPv6 数量',{min:1,max:1000})}})], // 添加实例IPv6
 ipv6_delete:['删除 IPv6',(b,{id})=>{const list=b.ipv6;if(!Array.isArray(list)||!list.length||list.length>1000)throw new HttpError(400,'请选择要删除的 IPv6');return {method:'DELETE',route:`clouds/${id}/ipv6`,body:{ipv6:list.map(v=>int(v,'IPv6',{min:1})),type:'id'}};}], // 删除实例IPv6
 disconnect:['断网',(b,{id})=>({method:'POST',route:`clouds/${id}/disconnect`,body:{lock:b.lock?1:0}})], // 断网
 internet:['恢复网络',(b,{id})=>({method:'PUT',route:`clouds/${id}/internet`,body:{}})], // 恢复网络
 disk_delete:['删除磁盘',(b,{disk})=>({method:'DELETE',route:`disks/${disk.id}`,body:{force:0}})], // 删除磁盘
 ip_add:['增加 IP',(b,{id,group,picked})=>({method:'POST',route:`clouds/${id}/floatip`,body:{ip:picked,bw_group:group.id}})], // 添加IP地址：选中的空闲 IP 加入这个 IP 组（第一个网卡）
 group_add:['增加 IP 组',(b,{id,picked})=>({method:'POST',route:`clouds/${id}/floatip`,body:{ip:picked,in_bw:int(b.in_bw,'下行带宽',{max:1000000}),out_bw:int(b.out_bw,'上行带宽',{max:1000000})}})], // 添加IP地址：不传 bw_group，用选中的 IP 新建限速组
 group_bw:['修改带宽',(b,{group})=>({method:'PUT',route:`bws/${group.id}`,body:{in_bw:int(b.in_bw,'下行带宽',{max:1000000}),out_bw:int(b.out_bw,'上行带宽',{max:1000000})}})], // 修改限速组带宽
 group_ip:['更换 IP',(b,{id,group})=>{const list=Array.isArray(b.ip)?[...new Set(b.ip.map(v=>int(v,'IP',{min:1})))]:[];if(!list.length||list.length>256)throw new HttpError(400,'请至少选择一个 IP');return {method:'PUT',route:`clouds/${id}/bw_group_ip`,body:{bw_group:group.id,ip:list}};}], // 按带宽组修改IP地址（ip 为修改后的最终 IP）
 group_delete:['删除 IP 组',(b,{id,group})=>({method:'DELETE',route:`clouds/${id}/floatip`,body:{ip:(group.ip||[]).map(x=>Number(x.id)),type:'id'}})], // 删除 IP 组：平台没有单独的删除限速组接口，删除组内全部 IP（删除实例IP）后组随之移除
 ip_delete:['删除 IP',(b,{id,ip})=>({method:'DELETE',route:`clouds/${id}/floatip`,body:{ip:[ip.id],type:'id'}})], // 删除实例IP（第一个网卡）
 disk_add:['添加磁盘',(b,{id})=>({method:'POST',route:`clouds/${id}/disks`,body:{size:int(b.size,'磁盘容量（GB）',{min:1,max:1048576}),store:int(b.store,'存储',{min:1}),...diskOptions(b)}})], // 添加磁盘并挂载
 disk_edit:['修改磁盘',(b,{disk})=>{const body=diskOptions(b);const size=int(b.size,'磁盘容量（GB）',{min:1,max:1048576,optional:true});
  if(size!==undefined&&size!==Number(disk.size)){if(size<Number(disk.size))throw new HttpError(400,`磁盘容量只能扩大，当前为 ${disk.size} GB`);body.size=size;}
  if(!Object.keys(body).length)throw new HttpError(400,'没有需要修改的项目');return {method:'PUT',route:`disks/${disk.id}`,body};}], // 修改磁盘配置（开机时修改后平台会自动重启）
 disk_compress:['磁盘压缩',(b,{id,info})=>{const own=new Set((info?.disk||[]).map(d=>Number(d.id)));const list=Array.isArray(b.disk_ids)?[...new Set(b.disk_ids.map(v=>int(v,'磁盘',{min:1})))]:[];
  if(list.some(d=>!own.has(d)))throw new HttpError(400,'所选磁盘不属于该实例');return {method:'POST',route:`clouds/${id}/compress_disk`,body:list.length&&list.length<own.size?{disk_ids:list}:{}};}] // 磁盘压缩（不传 disk_ids 时压缩全部本地和 CEPH 磁盘）
};

/**
 * 图表数据 points as [ms, value1, value2]. The doc only says data[].0 is a time string, so accept every shape seen
 * in practice: the list bare or under data / data.data; [time, a, b] arrays or {time, value / in, out} objects;
 * times as millisecond or second timestamps (number or numeric string) or date text ("2026-11-03 01:00:00").
 */
export function chartPoints(r){
 const rows=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:Array.isArray(r?.data?.data)?r.data.data:Array.isArray(r?.data?.list)?r.data.list:Array.isArray(r?.list)?r.list:[];
 const toMs=v=>{if(v==null||v==='')return NaN;if(typeof v==='number'||/^\d+(\.\d+)?$/.test(String(v).trim())){const n=Number(v);return n>1e12?n:n>1e9?n*1000:n;}const t=Date.parse(String(v).trim().replace(' ','T'));return Number.isFinite(t)?t:NaN;};
 return rows.map(p=>Array.isArray(p)?p:p&&typeof p==='object'?[p.time??p.date??p[0],p.value??p.in??p.accept??p[1],p.out??p.send??p[2]]:null)
  .filter(p=>p&&p.length>=2).map(p=>[toMs(p[0]),Number(p[1])||0,Number(p[2])||0]).filter(p=>Number.isFinite(p[0])).sort((a,b)=>a[0]-b[0]);
}

const taskTypeCache=new Map();
export function registerInstance(app,{asyncRoute,mutate}){
 const cloudId=req=>{if(!/^\d+$/.test(req.params.id))throw new HttpError(400,'实例编号无效');return Number(req.params.id);};
 const freeIps=async(req,id)=>{const r=await req.session.client.request('GET','ip/free',{query:{hostid:id,type:'cloud'}});const list=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];return list.map(s=>({id:s.id,name:s.ip_name||'#'+s.id,ips:(s.ip||[]).map(x=>({id:x.id,ip:x.ip}))})).filter(s=>s.ips.length);};
 const bwGroups=async(req,id)=>{const r=await req.session.client.request('GET','bws',{query:{cloud:id,per_page:100,page:1,orderby:'id',sort:'asc'}});return listResult(r,1,100).data.filter(g=>g.hostid==null||Number(g.hostid)===id);};
 const detail=async(req,id)=>{const r=await req.session.client.request('GET',`clouds/${id}`);return r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r;};

 // 获取实例IP + 实例详情（主 IP、网络类型、VPC 名称、带宽组的掩码/网关）
 app.get('/api/clouds/:id/network',asyncRoute(async(req,res)=>{
  const id=cloudId(req),client=req.session.client;
  const [ips,info]=await Promise.all([client.request('GET',`clouds/${id}/ip`),detail(req,id)]);const data=ips?.data&&!Array.isArray(ips.data)?ips.data:ips||{};
  const gateways=new Map((info?.default_bw_group?.ip||[]).map(ip=>[String(ip.ipaddress),ip]));
  const rows=[];
  for(const nic of data.interface||[]){
   for(const ip of nic.public_ip||[]){const g=gateways.get(String(ip.ip));rows.push({id:ip.id,address:ip.ip,version:'v4',nic:nic.name,segment:ip.ip_name||'',subnet_mask:g?.subnet_mask||'',gateway:g?.gateway||'',main:String(ip.ip)===String(info?.mainip)});}
   for(const ip of nic.ipv6||[])rows.push({id:ip.id,address:ip.ipv6,version:'v6',nic:nic.name,main:String(ip.ipv6)===String(info?.mainip)});
   if(nic.private_ip)rows.push({id:null,address:nic.private_ip,version:'private',nic:nic.name,main:false});
  }
  if(!rows.length)for(const ip of data.public_ip||[])rows.push({id:ip.id,address:ip.ip,version:'v4',nic:'',main:String(ip.ip)===String(info?.mainip)});
  res.json({network_type:data.network_type||info?.network_type||'normal',vpc_name:info?.vpc_name||'',internet:info?.internet??1,ip_num:info?.ip_num,ipv6_num:info?.ipv6_num,rows});
 }));

 // 实例详情 → rootpassword. Only on an explicit request from the page.
 app.get('/api/clouds/:id/password',asyncRoute(async(req,res)=>{const id=cloudId(req);const info=await detail(req,id);res.json({password:info?.rootpassword??'',user:info?.osuser??''});}));

 // VNC → a console URL the browser can open. The noVNC page on the platform takes the credentials as query parameters.
 app.post('/api/clouds/:id/console',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const r=await mutate(req,'POST',`clouds/${id}/vnc`,{id},'clouds',id,'vnc',{raw:true});const v=r?.data&&!Array.isArray(r.data)?r.data:r||{};
  const external=v.vnc_url_https||v.vnc_url_http;
  if(external)return res.json({url:external});
  if(!v.token)throw new HttpError(502,'平台没有返回 VNC 凭证');
  const base=req.session.baseUrl.replace(/\/$/,'');const q=new URLSearchParams({token:v.token,...(v.vnc_pass?{vnc_token:v.vnc_pass}:{}),...(v.password?{host_token:v.password}:{})});
  res.json({url:`${base}/v1/novnc?${q}`});
 }));

 // 图表数据 (statistics): kvm_info → CPU and memory, net_adapter → network rate, disk_io → disk read/write
 // (dev_name = the disk's dev, the system disk unless ?disk= names another of this instance's disks);
 // 实例流量数据 (flow_data) → traffic per period.
 app.get('/api/clouds/:id/charts',asyncRoute(async(req,res)=>{
  const id=cloudId(req),range=String(req.query.range) in chartRanges?String(req.query.range):'12h',client=req.session.client;const et=Date.now(),st=et-chartRanges[range]*3600000;
  const info=await detail(req,id);const kvm=info?.kvmid;if(!kvm)throw new HttpError(502,'平台没有返回实例的 kvmid，无法读取监控数据');
  const disks=(info?.disk||[]).filter(d=>d.dev);const disk=disks.find(d=>d.dev===req.query.disk)||disks.find(d=>d.type==='system'||d.dev==='vda')||disks[0];
  const series=r=>chartPoints(r);
  const stat=async(type,extra={})=>series(await client.request('GET','statistics',{query:{type,kvm,st,et,...extra}}));
  const settled=await Promise.allSettled([
   (async()=>{let points=await stat('net_adapter',{kvm_ifname:`${kvm}0`});if(!points.length)points=await stat('net_adapter',{kvm_ifname:`${kvm}.0`});return points;})(),
   stat('kvm_info'),
   disk?stat('disk_io',{dev_name:disk.dev}):Promise.resolve([]),
   client.request('GET',`clouds/${id}/flow_data`,{query:{start_time:st,end_time:et,unit:'MB'}})
  ]);
  const value=(i,fallback)=>settled[i].status==='fulfilled'?settled[i].value:fallback;const error=i=>settled[i].status==='rejected'?settled[i].reason.message:undefined;
  const flow=value(3,null);const flowData=flow?.data&&!Array.isArray(flow.data)?flow.data:flow;
  res.json({range,start:st,end:et,
   network:{points:value(0,[]),error:error(0)},
   cpu:{points:value(1,[]),error:error(1)},
   disk:{points:value(2,[]),error:error(2),dev:disk?.dev||null,disks:disks.map(d=>({dev:d.dev,type:d.type,size:d.size}))},
   flow:{points:(Array.isArray(flowData?.data)?flowData.data:Array.isArray(flowData)?flowData:[]).map(p=>[p.time,Number(p.in)||0,Number(p.out)||0]),unit:flowData?.unit||'MB',type:flowData?.type,error:error(3)}});
 }));

 // 通过区域id或者节点id获取可用镜像 — images actually present on the node(s); for several nodes only those on every one (id_relation=and).
 app.get('/api/images/available',asyncRoute(async(req,res)=>{
  // 新建实例时可按区域查询（type=area）：区域内任一节点有该镜像即可。
  const area=req.query.area!==undefined&&req.query.area!==''?int(req.query.area,'区域',{min:1}):null;
  const nodes=[...new Set(String(req.query.nodes||'').split(',').filter(Boolean).map(v=>int(v,'节点',{min:1})))];
  if(!area&&(!nodes.length||nodes.length>100))throw new HttpError(400,'请指定 1～100 个节点');
  const r=await req.session.client.request('GET','node_images',{query:area&&!nodes.length?{id:area,type:'area'}:{id:nodes.length===1?nodes[0]:nodes,type:'node',id_relation:'and'}});
  const groups=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];
  res.json({data:groups.flatMap(g=>(g.image||[]).map(i=>({id:i.id,name:i.name,group:g.name,group_svg:g.svg,min_disk_size:i.min_disk_size})))});
 }));

 // 全局搜索 — instances (host[]) and users (user[]) matching a keyword.
 app.get('/api/search',asyncRoute(async(req,res)=>{
  const q=String(req.query.q||'').trim();if(!q||q.length>100)throw new HttpError(400,'请输入 1～100 个字符的关键字');
  const r=await req.session.client.request('GET','global_search',{query:{search:q}});const d=r?.data&&!Array.isArray(r.data)?r.data:r||{};
  res.json({hosts:(Array.isArray(d.host)?d.host:[]).slice(0,20).map(h=>({id:h.id,hostname:h.hostname??h.name??'',node_name:h.node_name??'',mainip:h.mainip??''})),users:(Array.isArray(d.user)?d.user:[]).slice(0,20).map(u=>({id:u.id,username:u.username??'',email:u.email??''}))});
 }));

 // 限速组列表 (cloud=id): the instance's IP groups with their IPs, plus IPv6 from 获取实例IP.
 // 当前任务: 任务列表 (v1/tasks?cloud=:id&rel_type=cloud) → the newest task still waiting (0) or running (1);
 // its name comes from 获取任务类型 (v1/task_type), cached per platform (type names only).
 app.get('/api/clouds/:id/active_task',asyncRoute(async(req,res)=>{
  const id=cloudId(req),client=req.session.client;
  const r=await client.request('GET','tasks',{query:{cloud:id,rel_type:'cloud',page:1,per_page:10,orderby:'id',sort:'desc'}});
  const live=listResult(r,1,10).data.filter(t=>(t.hostid==null||Number(t.hostid)===id)&&[0,1].includes(Number(t.status)));
  const t=live.find(x=>Number(x.status)===1)||live[0];if(!t)return res.json({task:null});
  let names=taskTypeCache.get(req.session.baseUrl);if(!names){try{const tt=await client.request('GET','task_type');const map=tt?.type??tt?.data?.type??tt?.data??tt;names=map&&typeof map==='object'&&!Array.isArray(map)?map:{};}catch(e){if(e.status===401)throw e;names={};}taskTypeCache.set(req.session.baseUrl,names);}
  const progress=Math.max(0,Math.min(100,Math.round(Number(t.progress)||0)));
  res.json({task:{id:t.id,type:t.type,name:names[t.type]||t.type_desc||t.type||'任务',status:Number(t.status),progress,msg:t.msg||'',start_time:t.start_time||t.create_time||''}});
 }));
 app.get('/api/clouds/:id/ip_groups',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const [groups,info,ips]=await Promise.all([bwGroups(req,id),detail(req,id),req.session.client.request('GET',`clouds/${id}/ip`)]);
  const data=ips?.data&&!Array.isArray(ips.data)?ips.data:ips||{};const main=String(info?.mainip??'');
  const ipv6=[...(data.interface||[]).flatMap(n=>(n.ipv6||[]).map(x=>({id:x.id,ip:x.ipv6,nic:n.name}))),...(data.ipv6||[]).map(x=>({id:x.id,ip:x.ipv6??x.ip}))].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).map(x=>({...x,main:String(x.ip)===main}));
  const def=Number(info?.default_bw_group?.id);const ordered=[...groups].sort((a,b)=>(Number(b.id)===def)-(Number(a.id)===def)||Number(a.id)-Number(b.id));
  res.json({mainip:main,default_group:info?.default_bw_group?.id??null,groups:ordered.map(g=>({id:g.id,in_bw:g.in_bw,out_bw:g.out_bw,temp_expire:g.temp_bw_expire_time||'',ips:(g.ip||[]).map(x=>({id:x.id,ip:x.ip,gateway:x.gateway||'',subnet_mask:x.subnet_mask||'',elastic:Number(x.uid)>0,main:String(x.ip)===main}))})),ipv6});
 }));
 // 带宽组修改IP可选列表: IP segments with the group's current IPs checked.
 app.get('/api/clouds/:id/ip_groups/:gid/options',asyncRoute(async(req,res)=>{
  const id=cloudId(req);const gid=int(req.params.gid,'IP 组',{min:1});if(!(await bwGroups(req,id)).some(g=>Number(g.id)===gid))throw new HttpError(404,'这个 IP 组不属于该实例');
  const r=await req.session.client.request('GET',`bws/${gid}/change_ip_option`);const list=Array.isArray(r?.data)?r.data:Array.isArray(r)?r:[];
  res.json({segments:list.map(s=>({id:s.id,name:s.ip_name||'#'+s.id,ips:(s.ip||[]).map(x=>({id:x.id,ip:x.ip,elastic:x.ip_type==='elastic',checked:Boolean(x.checked)}))})),selected:(r?.selected_ip||[]).map(x=>typeof x==='object'?Number(x.id):Number(x))});
 }));

 // 获取节点所有可用IP (hostid = this instance): free IPv4 by segment, for 增加 IP / 增加 IP 组.
 app.get('/api/clouds/:id/free_ips',asyncRoute(async(req,res)=>{res.json({segments:await freeIps(req,cloudId(req))});}));

 // 获取实例可用存储 — the stores a new disk for this instance can be created on.
 app.get('/api/clouds/:id/stores',asyncRoute(async(req,res)=>{const id=cloudId(req);const r=await req.session.client.request('GET',`clouds/${id}/stores`);const list=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];res.json({data:list.map(s=>({id:s.id,name:s.name||'#'+s.id,type:s.type,dir:s.dir}))});}));

 // 实例日志
 app.get('/api/clouds/:id/logs',asyncRoute(async(req,res)=>{const id=cloudId(req);const page=int(req.query.page??1,'页码',{min:1});res.json(scrub(listResult(await req.session.client.request('GET',`clouds/${id}/log`,{query:{page,per_page:20,sort:'desc'}}),page,20)));}));

 // vpc网络列表 — switching only accepts VPCs on the instance's own node.
 app.get('/api/clouds/:id/vpc_options',asyncRoute(async(req,res)=>{const id=cloudId(req);const info=await detail(req,id);const r=await req.session.client.request('GET','vpc_networks',{query:{node:info?.node_id,list_type:'all'}});res.json({data:listResult(r).data.map(v=>({id:v.id,name:v.name+(v.ips?' · '+v.ips:'')}))});}));

 app.post('/api/clouds/:id/do/:op',asyncRoute(async(req,res)=>{
  const id=cloudId(req),op=ops[req.params.op];if(!op)throw new HttpError(404,'操作不存在');
  const ctx={id};
  const name=req.params.op,onDisk=['disk_delete','disk_edit'].includes(name);
  if(onDisk||name==='disk_compress')ctx.info=await detail(req,id);
  // IPv4 on the instance: it must be one of its addresses; the main IP cannot be deleted; a change needs the IP's bandwidth group.
  // IP groups (限速组): the group must belong to this instance.
  // Adding IPs: every chosen IP must still be free for this instance (获取节点所有可用IP, hostid = the instance).
  if(name==='ip_add'||name==='group_add'){
   const list=Array.isArray(req.body.ip)?[...new Set(req.body.ip.map(v=>int(v,'IP',{min:1})))]:[];if(!list.length||list.length>256)throw new HttpError(400,'请至少选择一个 IP');
   const free=new Set((await freeIps(req,id)).flatMap(s=>s.ips.map(x=>Number(x.id))));const gone=list.filter(x=>!free.has(x));
   if(gone.length)throw new HttpError(409,'所选 IP 中有 '+gone.length+' 个已不可用，请刷新可选列表后重试');ctx.picked=list;
  }
  if(['ip_add','group_bw','group_ip','group_delete'].includes(name)){
   const gid=int(req.body.group,'IP 组',{min:1});const groups=await bwGroups(req,id);const group=groups.find(g=>Number(g.id)===gid);
   if(!group)throw new HttpError(404,'这个 IP 组不属于该实例');ctx.group=group;
  }
  // Deleting a group removes all its IPs: never the default group or the group holding the main IP, and only one with IPs.
  if(name==='group_delete'){
   const info=ctx.info=await detail(req,id);
   if(Number(ctx.group.id)===Number(info?.default_bw_group?.id))throw new HttpError(400,'默认 IP 组不能删除');
   if((ctx.group.ip||[]).some(x=>String(x.ip)===String(info?.mainip)))throw new HttpError(400,'这个 IP 组里有主 IP，请先把其他组的 IP 设为主 IP');
   if(!(ctx.group.ip||[]).length)throw new HttpError(400,'这个 IP 组里没有 IP');
  }
  if(name==='ip_delete'){
   const ipId=int(req.body.ip,'IP',{min:1});const info=ctx.info=await detail(req,id);
   const ipsRes=await req.session.client.request('GET',`clouds/${id}/ip`);const ipData=ipsRes?.data&&!Array.isArray(ipsRes.data)?ipsRes.data:ipsRes||{};
   const all=[...(ipData.interface||[]).flatMap(n=>n.public_ip||[]),...(ipData.public_ip||[]),...(info?.default_bw_group?.ip||[]).map(x=>({id:x.id,ip:x.ipaddress}))];
   const ip=all.find(x=>Number(x.id)===ipId);if(!ip)throw new HttpError(404,'这个 IP 不属于该实例');ctx.ip={id:ipId,address:ip.ip??ip.ipaddress};
   if(name==='ip_delete'&&String(ctx.ip.address)===String(info?.mainip))throw new HttpError(400,'主 IP 不能删除，请先把其他 IP 设为主 IP');
  }
  if(onDisk){
   const diskId=int(req.body.disk,'磁盘',{min:1});const disk=(ctx.info?.disk||[]).find(d=>Number(d.id)===diskId);
   if(!disk)throw new HttpError(404,'这块磁盘不属于该实例');if(name==='disk_delete'&&(disk.type==='system'||disk.dev==='vda'))throw new HttpError(400,'系统盘不能单独删除');ctx.disk=disk;
  }
  const call=op[1](req.body||{},ctx);
  const result=await mutate(req,call.method,call.route,call.body,onDisk?'disks':ctx.group&&name==='group_bw'?'bws':'clouds',onDisk?ctx.disk.id:ctx.group&&name==='group_bw'?ctx.group.id:id,name);
  const r=result?.data&&!Array.isArray(result.data)?result.data:result||{};
  res.json({ok:true,op:req.params.op,title:op[0],task:r.taskid??r.task_id??null,added_ipv6:r.added_ipv6,traffic_quota:r.traffic_quota});
 }));
}
export const instanceOps=Object.fromEntries(Object.entries(ops).map(([k,v])=>[k,v[0]]));
