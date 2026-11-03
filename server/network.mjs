import {HttpError,listResult,scrub} from './cube-client.mjs';

/**
 * 网络管理（digitalvirt-v1-api.md）：
 * - IPv4：IP段管理 v1/ipSegment、Ip管理 v1/ip、IP分组管理 v1/ip_groups，以及 v1/common/ipsegment（所有 IP 段）。
 * - IPv6：IPv6段管理 v1/ipv6_segments、IPv6管理 v1/ipv6（只读）、IPv6分组管理 v1/ipv6_groups。
 * - ADSL：ADSL管理 v1/adsl、v1/adsls（批量添加）。
 * 浏览器只访问 /api/net/:kind，服务端按白名单把查询和表单字段映射到文档里的参数名。
 */

const IPV4=/^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6=/^(?=.*:)[0-9A-Fa-f:.]{2,45}$/;
const MAC=/^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/;

const str=(key,label,o={})=>({key,label,type:'str',max:255,...o});
const int=(key,label,o={})=>({key,label,type:'int',min:0,...o});
const ids=(key,label,o={})=>({key,label,type:'ids',...o});
const flag=(key,label,o={})=>({key,label,type:'flag',...o});
const pick=(key,label,values,o={})=>({key,label,type:'enum',values,...o});
const choice=(key,label,values,o={})=>({key,label,type:'choice',values,...o});
const optional=fields=>fields.map(({required,default:_,...f})=>f);

const segmentFields=[str('ip_name','名称',{required:true}),str('gateway','网关',{required:true,format:'ipv4'}),str('subnet_mask','子网掩码',{required:true,format:'ipv4'}),flag('status','状态',{default:1}),str('dns1','DNS 1',{format:'ipv4'}),str('dns2','DNS 2',{format:'ipv4'}),int('group_id','IP 分组',{min:1}),ids('node_ids','可用节点'),flag('onlink','onlink',{default:0})];
const ipEditFields=[int('vlanid','VLAN',{max:4095}),str('remark','备注',{max:1000}),flag('lock','锁定'),str('mac','MAC 地址',{format:'mac'})];
const groupFields=[str('name','名称',{required:true}),str('description','描述',{max:1000}),ids('ip_segment','IP 段')];
const v6SegmentFields=[str('name','名称',{required:true}),str('ipv6','IPv6 地址块',{format:'ipv6'}),int('prefix','前缀长度',{required:true,min:1,max:128}),str('start_ipv6','起始 IPv6',{format:'ipv6'}),str('end_ipv6','结束 IPv6',{format:'ipv6'}),str('gateway','网关',{required:true,format:'ipv6'}),str('dns1','DNS 1',{required:true}),str('dns2','DNS 2',{required:true}),int('group_id','IPv6 分组',{min:1}),ids('node_id','可用节点')];
const adslFields=[int('vlan','VLAN',{required:true,max:4096}),str('username','账号',{required:true}),str('password','密码',{required:true,secret:true}),ids('node','可用节点'),int('times','可使用次数',{min:1,max:9999,default:1}),flag('lock','锁定',{default:0})];

// query: browser filter name → [platform parameter, kind of value]
export const networkKinds={
 'ip-segments':{title:'IP 段',route:'ipSegment',detail:true,query:{search:['ip_name','text'],status:['status','flag'],area:['area','id'],node:['node','id'],group:['ip_group','id']},create:segmentFields,edit:[...optional(segmentFields),pick('confirm_change_gateway','网关变更确认',[1,2])],batch:[int('group_id','IP 分组',{min:1}),ids('node_ids','可用节点'),flag('onlink','onlink')],bulkDelete:true,deleted:d=>[d?.ip_seg_del_num,d?.ip_not_seg_del_num]},
 ips:{title:'IP 地址',route:'ip',detail:true,order:{orderby:'ip_int',sort:'asc'},query:{search:['ip','text'],segment:['ip_segment_id','id'],lock:['lock','flag'],type:['type',['cloud','load_balance']]},requires:['segment'],create:[int('ip_segment_id','IP 段',{required:true,min:1}),str('first_ip','起始 IP',{required:true,format:'ipv4'}),str('end_ip','结束 IP',{required:true,format:'ipv4'}),...ipEditFields.filter(f=>f.key!=='lock')],edit:ipEditFields,batch:ipEditFields,bulkDelete:true,deleted:d=>[d?.ip_del_num,d?.ip_not_del_num]},
 'ip-groups':{title:'IP 分组',route:'ip_groups',detail:true,query:{search:['search','text'],area:['area','id'],node:['node','id']},create:groupFields,edit:groupFields},
 'ipv6-segments':{title:'IPv6 段',route:'ipv6_segments',query:{search:['search','text'],area:['area','id'],node:['node','id'],group:['group_id','id']},create:v6SegmentFields,edit:optional(v6SegmentFields).filter(f=>!['ipv6','prefix','start_ipv6','end_ipv6'].includes(f.key)),bulkDelete:true,deleted:d=>[d?.num]},
 ipv6:{title:'IPv6 地址',route:'ipv6',query:{search:['search','text'],segment:['ip_segment_id','id'],hostid:['hostid','id']}},
 'ipv6-groups':{title:'IPv6 分组',route:'ipv6_groups',detail:true,query:{search:['search','text'],area:['area','id'],node:['node','id']},create:groupFields,edit:groupFields},
 adsl:{title:'ADSL 账号',route:'adsl',query:{search:['search','text'],area:['area','id'],node:['node','id'],used:['used','flag'],lock:['lock','flag']},create:adslFields,edit:optional(adslFields),batch:optional(adslFields).filter(f=>f.key!=='username'),bulkDelete:true,deleted:d=>[d?.num]},
 // 业务管理（digitalvirt-v1-api.md：vpc网络管理、磁盘管理、安全组管理、实例模板、SSH密钥管理）。专用操作见 server/business.mjs。
 vpcs:{title:'VPC 网络',route:'vpc_networks',query:{search:['search','text'],area:['area','id'],node:['node','id'],user:['user','id']},edit:[str('name','名称',{required:true,max:64})],remove:true},
 disks:{title:'磁盘',route:'disks',query:{search:['search','text'],type:['type',['system','data']],status:['status',['0','1','2','5']],independent:['create_with_host',['0','1']],user:['uid','id']},create:[int('uid','所属用户',{required:true,min:1}),int('size','容量（GB）',{required:true,min:1,max:1048576}),str('remarks','磁盘名称',{required:true,max:64}),int('store','存储',{min:0})],edit:[str('remarks','磁盘名称',{max:64}),int('size','容量（GB）',{min:1,max:1048576}),choice('driver','驱动',['ide','virtio','sata','scsi']),choice('cache','缓存',['none','writethrough','writeback','directsync']),choice('io','IO 模式',['native','threads'])],remove:true},
 'security-groups':{title:'安全组',route:'security_groups',query:{search:['search','text'],type:['type',['host','lightHost','hyperv','adsl']],user:['user','id']},create:[str('name','名称',{required:true,max:64}),str('description','描述',{max:255}),int('uid','所属用户',{required:true,min:1}),choice('type','安全组类型',['host','lightHost','hyperv','adsl'],{default:'host'}),flag('create_default_rule','创建默认规则',{default:1})],edit:[str('name','名称',{required:true,max:64}),str('description','描述',{max:255})],remove:true},
 templates:{title:'实例模板',route:'templates',query:{search:['search','text'],area:['area','id'],node:['node','id'],status:['status','flag'],user:['user','id']},remove:true},
 'ssh-keys':{title:'SSH 密钥',route:'ssh_keys',query:{search:['search','text'],user:['uid','id']},remove:true},
};

/** Checks a form against its field list. Editing: absent fields are left alone, blank secrets keep the stored value. */
export function checkFields(fields,input,{editing=false}={}){
 const output={},errors={};
 for(const f of fields){
  let v=input?.[f.key];
  const blank=v==null||v===''||(Array.isArray(v)&&!v.length);
  if(blank){
   if(!editing&&f.default!==undefined)v=f.default;
   else{if(f.required&&!editing)errors[f.key]='请填写'+f.label;else if(editing&&f.type==='str'&&!f.secret&&!f.format&&v==='')output[f.key]='';continue;}
  }
  if(f.type==='str'){
   if(typeof v!=='string'&&typeof v!=='number'){errors[f.key]=f.label+'格式不正确';continue;}
   v=f.secret?String(v):String(v).trim();
   if(v.length>(f.max||255)){errors[f.key]=f.label+'过长';continue;}
   if(!v){if(f.required&&!editing)errors[f.key]='请填写'+f.label;continue;}
   if(f.format==='ipv4'&&!IPV4.test(v)||f.format==='ipv6'&&!IPV6.test(v)||f.format==='mac'&&!MAC.test(v)){errors[f.key]='请输入有效的'+f.label;continue;}
  }else if(f.type==='int'){
   v=Number(v);if(!Number.isInteger(v)||v<(f.min??0)||(f.max!==undefined&&v>f.max)){errors[f.key]=`${f.label}应为 ${f.min??0}${f.max!==undefined?'～'+f.max:' 以上'}的整数`;continue;}
  }else if(f.type==='flag'){
   if(![0,1,'0','1',true,false].includes(v)){errors[f.key]=f.label+'只能是开或关';continue;}v=[1,'1',true].includes(v)?1:0;
  }else if(f.type==='choice'){
   v=String(v);if(!f.values.includes(v)){errors[f.key]='请选择有效的'+f.label;continue;}
  }else if(f.type==='enum'){
   v=Number(v);if(!f.values.includes(v)){errors[f.key]='请选择有效的'+f.label;continue;}
  }else if(f.type==='ids'){
   if(!Array.isArray(v)||v.length>1000){errors[f.key]=f.label+'格式不正确';continue;}
   v=[...new Set(v.map(Number))];if(v.some(n=>!Number.isSafeInteger(n)||n<1)){errors[f.key]=f.label+'包含无效编号';continue;}
  }
  output[f.key]=v;
 }
 return {output,errors};
}

/** Browser filters → documented query parameters of the list endpoint. */
export function networkQuery(kind,params){
 const entry=networkKinds[kind];
 const q={page:Math.max(1,parseInt(params.page)||1),per_page:Math.min(100,Math.max(1,parseInt(params.per_page)||20)),orderby:'id',sort:'desc',...entry.order};
 for(const [name,[param,type]]of Object.entries(entry.query)){
  const raw=params[name];if(raw===undefined||raw==='')continue;const v=String(raw);
  if(type==='text')q[param]=v.slice(0,256);
  else if(type==='flag'){if(v==='0'||v==='1')q[param]=Number(v);}
  else if(type==='id'){const n=Number(v);if(Number.isSafeInteger(n)&&n>0)q[param]=n;}
  else if(Array.isArray(type)&&type.includes(v))q[param]=v;
 }
 for(const need of entry.requires||[])if(q[entry.query[need][0]]===undefined)throw new HttpError(400,'请先选择 IP 段');
 return q;
}

/** Lists come as {data,meta}, {data:{data,meta}} or with the documented "mate" key; all end up as {data,meta}. */
function netList(result,page,perPage){
 const fix=v=>v&&typeof v==='object'&&!Array.isArray(v)&&v.mate&&!v.meta?{...v,meta:v.mate}:v;
 let value=fix(result);if(value?.data&&!Array.isArray(value.data))value={...value,data:fix(value.data)};
 return listResult(value,page,perPage);
}
const rows=r=>{const v=r?.data??r;return Array.isArray(v)?v:Array.isArray(v?.data)?v.data:Array.isArray(v?.list)?v.list:[];};
const named=list=>list.map(r=>({id:Number(r.id),name:String(r.name??r.ip_name??r.ipv6??('#'+r.id))})).filter(r=>Number.isSafeInteger(r.id));

function idList(body){
 const list=body.ids;
 if(!Array.isArray(list)||!list.length||list.length>500||list.some(id=>!Number.isSafeInteger(id)||id<1))throw new HttpError(400,'请选择要操作的记录');
 if(new Set(list).size!==list.length||Number(body.count)!==list.length)throw new HttpError(400,'所选数量与提交的数量不一致，请刷新后重试');
 return list;
}
const fail=errors=>{if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);};

/** One line of 批量添加ADSL账号: "vlan,账号,密码,节点ID,节点ID...". */
export function adslLine(text,index){
 const parts=String(text).split(/[,，]/).map(s=>s.trim());
 const [vlan,username,password,...nodes]=parts;const n=Number(vlan);
 if(parts.length<3||!Number.isInteger(n)||n<0||n>4096||!username||!password||username.length>255||password.length>255)throw new HttpError(400,`第 ${index+1} 行格式不正确，应为：VLAN,账号,密码,节点ID…`);
 const nodeIds=nodes.filter(Boolean).map(Number);
 if(nodeIds.some(v=>!Number.isSafeInteger(v)||v<1))throw new HttpError(400,`第 ${index+1} 行的节点 ID 无效`);
 return [n,username,password,...nodeIds].join(',');
}

export function registerNetwork(app,{asyncRoute,mutate}){
 const entryOf=kind=>{const e=networkKinds[kind];if(!e)throw new HttpError(404,'网络功能不存在');return e;};
 const validId=id=>{if(!/^\d+$/.test(id))throw new HttpError(400,'编号无效');return id;};

 // Choices for filters and forms: all IP segments and groups of one family.
 app.get('/api/net/options',asyncRoute(async(req,res)=>{
  const client=req.session.client,v6=req.query.family==='6';
  const [segments,groups]=await Promise.allSettled(v6
   ?[client.request('GET','ipv6_segments',{query:{page:1,per_page:500,orderby:'id',sort:'asc'}}),client.request('GET','ipv6_groups',{query:{list_type:'all'}})]
   :[client.request('GET','common/ipsegment'),client.request('GET','ip_groups',{query:{list_type:'all'}})]);
  const out=r=>r.status==='fulfilled'?named(rows(r.value)):[];
  res.json({segments:out(segments),groups:out(groups),errors:[segments,groups].filter(r=>r.status==='rejected').map(r=>r.reason.message)});
 }));

 app.get('/api/net/:kind',asyncRoute(async(req,res)=>{const kind=req.params.kind,entry=entryOf(kind),q=networkQuery(kind,req.query);res.json(netList(await req.session.client.request('GET',entry.route,{query:q}),q.page,q.per_page));}));

 app.get('/api/net/ip-segments/:id/reboot-hosts',asyncRoute(async(req,res)=>{
  // 获取IP段变更网关需要重启的实例
  const r=await req.session.client.request('GET',`ipSegment/${validId(req.params.id)}/change_network/need_reboot_host`);
  const d=r?.data??r;const host=Array.isArray(d)?d:Array.isArray(d?.host)?d.host:d?.host?[d.host]:[];
  res.json({data:scrub(host).map(h=>({id:h.id,hostname:h.hostname}))});
 }));

 app.get('/api/net/:kind/:id',asyncRoute(async(req,res)=>{const entry=entryOf(req.params.kind);if(!entry.detail)throw new HttpError(404,'此资源没有详情接口');res.json(scrub(await req.session.client.request('GET',`${entry.route}/${validId(req.params.id)}`)));}));

 app.post('/api/net/adsl/import',asyncRoute(async(req,res)=>{
  // 批量添加ADSL账号 POST v1/adsls
  const lines=Array.isArray(req.body.lines)?req.body.lines.map(String).map(s=>s.trim()).filter(Boolean):[];
  if(!lines.length||lines.length>1000)throw new HttpError(400,'请粘贴 1～1000 行账号');
  const data=lines.map(adslLine);
  const result=await mutate(req,'POST','adsls',{data},'adsl',null,'import');
  const n=Number((result?.data??result)?.num);
  res.json({ok:true,total:data.length,num:Number.isFinite(n)?n:null});
 }));

 app.post('/api/net/:kind',asyncRoute(async(req,res)=>{
  const kind=req.params.kind,entry=entryOf(kind);if(!entry.create)throw new HttpError(405,'此资源不支持新建');
  const {output,errors}=checkFields(entry.create,req.body);
  if(kind==='ipv6-segments'&&!output.ipv6&&!(output.start_ipv6&&output.end_ipv6))errors.ipv6='请填写地址块，或同时填写起始和结束 IPv6';
  fail(errors);
  res.json({ok:true,result:await mutate(req,'POST',entry.route,output,kind,null,'create')});
 }));

 // 批量修改: ADSL账号、Ip、IP段 (PUT on the collection with id[])
 app.put('/api/net/:kind',asyncRoute(async(req,res)=>{
  const kind=req.params.kind,entry=entryOf(kind);if(!entry.batch)throw new HttpError(405,'此资源不支持批量修改');
  const list=idList(req.body);const {output,errors}=checkFields(entry.batch,req.body,{editing:true});fail(errors);
  if(!Object.keys(output).length)throw new HttpError(400,'请至少修改一项');
  res.json({ok:true,result:await mutate(req,'PUT',entry.route,{id:list,...output},kind,list.join(','),'batch-update')});
 }));

 app.put('/api/net/:kind/:id',asyncRoute(async(req,res)=>{
  const kind=req.params.kind,entry=entryOf(kind),id=validId(req.params.id);if(!entry.edit)throw new HttpError(405,'此资源不支持修改');
  const {output,errors}=checkFields(entry.edit,req.body,{editing:true});fail(errors);
  if(['ip-groups','ipv6-groups'].includes(kind)&&!output.name)throw new HttpError(400,'请检查表单字段',{name:'请填写名称'});
  if(!Object.keys(output).length)throw new HttpError(400,'没有可提交的修改');
  res.json({ok:true,result:await mutate(req,'PUT',`${entry.route}/${id}`,output,kind,id,'update')});
 }));

 // 删除: one call with id[] where the platform has a batch endpoint, otherwise one call per record.
 app.delete('/api/net/:kind',asyncRoute(async(req,res)=>{
  const kind=req.params.kind,entry=entryOf(kind);if(!entry.create&&!entry.remove)throw new HttpError(405,'此资源不支持删除');
  const list=idList(req.body);
  if(entry.bulkDelete){
   const result=await mutate(req,'DELETE',entry.route,{id:list},kind,list.join(','),'delete',{raw:true});
   const d=result?.data??result;const [ok,bad]=entry.deleted(d).map(v=>v==null||!Number.isFinite(Number(v))?null:Number(v));
   return res.json({ok:true,total:list.length,success:ok??(bad!=null?list.length-bad:list.length),failed:bad??(ok!=null?list.length-ok:0),message:typeof result?.msg==='string'?result.msg:''});
  }
  const results=[];
  for(const id of list){try{await mutate(req,'DELETE',`${entry.route}/${id}`,undefined,kind,id,'delete');results.push({id,ok:true});}catch(e){if(e.status===401)throw e;results.push({id,ok:false,error:e.message});}}
  res.json({ok:true,total:list.length,success:results.filter(r=>r.ok).length,failed:results.filter(r=>!r.ok).length,results});
 }));
}
