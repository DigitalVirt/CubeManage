import {HttpError,listResult,scrub} from './cube-client.mjs';
import {checkFields} from './network.mjs';

/**
 * 业务管理里通用增删改之外的操作（digitalvirt-v1-api.md）：
 * - 安全组规则管理：GET/POST v1/security_groups/:id/rules，PUT v1/security_group_rules/:id，DELETE v1/security_group_rules（id[]）
 * - 磁盘管理：挂载 POST v1/disks/:id/mount，卸载 DELETE v1/clouds/:cloud/disks/:id，从回收站恢复 DELETE v1/disks/recycle_bin
 * - 实例模板：创建 POST v1/clouds/:id/templates
 * - 安全组关联实例：列表 GET v1/clouds?security=:id，关联 POST / 解除 DELETE v1/security_groups/:id/links
 * - SSH密钥管理：创建 POST v1/ssh_keys（自动生成时私钥只返回这一次），绑定 / 解除 POST|DELETE v1/ssh_keys/:id/clouds
 * - 选择实例时的搜索：v1/clouds（只返回编号、主机名、主 IP）
 */
const PROTOCOLS=['all','all_tcp','all_udp','tcp','udp','icmp','ssh','telnet','http','https','mssql','oracle','mysql','rdp','postgresql','redis','gre'];
const ruleFields=[
 {key:'direction',label:'方向',type:'choice',values:['in','out'],required:true},
 {key:'protocol',label:'协议',type:'choice',values:PROTOCOLS,required:true},
 {key:'port',label:'端口范围',type:'str',max:64,required:true},
 {key:'ip',label:'授权 IP',type:'str',max:128,required:true},
 {key:'description',label:'描述',type:'str',max:255},
 {key:'lock',label:'锁定',type:'flag'}
];
const id=(v,label='编号')=>{const n=Number(v);if(!Number.isSafeInteger(n)||n<1)throw new HttpError(400,label+'无效');return n;};
const idList=body=>{const list=body.ids;if(!Array.isArray(list)||!list.length||list.length>500||list.some(v=>!Number.isSafeInteger(v)||v<1))throw new HttpError(400,'请选择要操作的记录');if(new Set(list).size!==list.length||Number(body.count)!==list.length)throw new HttpError(400,'所选数量与提交的数量不一致，请刷新后重试');return list;};
const fail=errors=>{if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);};
const choiceOf=(v,values,label)=>{if(v===undefined||v==='')return undefined;if(!values.includes(String(v)))throw new HttpError(400,'请选择有效的'+label);return String(v);};

export function registerBusiness(app,{asyncRoute,mutate}){
 // 选择实例：按主机名 / IP 搜索
 app.get('/api/biz/clouds',asyncRoute(async(req,res)=>{
  const q={page:1,per_page:30,orderby:'id',sort:'desc'};const s=String(req.query.search||'').slice(0,100);if(s){q.search=s;q.searchtype=0;}
  const r=await req.session.client.request('GET','clouds',{query:q});
  res.json({data:listResult(r).data.filter(c=>c.status!=='recycle').map(c=>({id:c.id,hostname:c.hostname,mainip:c.mainip,username:c.user?.username??c.username??''}))});
 }));

 // ---- 安全组规则
 app.get('/api/biz/security-groups/:gid/rules',asyncRoute(async(req,res)=>{
  const gid=id(req.params.gid,'安全组编号');const q={page:Math.max(1,parseInt(req.query.page)||1),per_page:Math.min(100,Math.max(1,parseInt(req.query.per_page)||20)),orderby:'id',sort:'desc'};
  if(req.query.search)q.search=String(req.query.search).slice(0,100);const d=choiceOf(req.query.direction,['in','out'],'方向');if(d)q.direction=d;
  const r=await req.session.client.request('GET',`security_groups/${gid}/rules`,{query:q});const out=listResult(r,q.page,q.per_page);
  const m=r?.meta||{};res.json({...out,counts:{in:m.direction_in_num??null,out:m.direction_out_num??null}});
 }));
 app.post('/api/biz/security-groups/:gid/rules',asyncRoute(async(req,res)=>{
  const gid=id(req.params.gid,'安全组编号');const {output,errors}=checkFields(ruleFields,req.body);fail(errors);
  res.json({ok:true,result:await mutate(req,'POST',`security_groups/${gid}/rules`,output,'security-group-rules',gid,'create')});
 }));
 app.put('/api/biz/security-group-rules/:id',asyncRoute(async(req,res)=>{
  const rid=id(req.params.id,'规则编号');const {output,errors}=checkFields(ruleFields,req.body,{editing:true});fail(errors);
  if(!Object.keys(output).length)throw new HttpError(400,'没有可提交的修改');
  res.json({ok:true,result:await mutate(req,'PUT',`security_group_rules/${rid}`,output,'security-group-rules',rid,'update')});
 }));
 app.delete('/api/biz/security-group-rules',asyncRoute(async(req,res)=>{
  const list=idList(req.body);await mutate(req,'DELETE','security_group_rules',{id:list},'security-group-rules',list.join(','),'delete');
  res.json({ok:true,total:list.length,success:list.length,failed:0});
 }));
 app.get('/api/biz/security-groups/:gid',asyncRoute(async(req,res)=>{const gid=id(req.params.gid,'安全组编号');const r=await req.session.client.request('GET',`security_groups/${gid}`);const d=r?.data&&!Array.isArray(r.data)?r.data:r||{};res.json(scrub({id:d.id,name:d.name,description:d.description,type:d.type,username:d.username,cloud_num:d.cloud_num}));}));

 // ---- 磁盘
 app.post('/api/biz/disks/:id/mount',asyncRoute(async(req,res)=>{
  const did=id(req.params.id,'磁盘编号');const b=req.body;const body={cloud:id(b.cloud,'实例编号')};
  const driver=choiceOf(b.driver,['ide','virtio','sata','scsi'],'驱动'),cache=choiceOf(b.cache,['none','writethrough','writeback','directsync'],'缓存'),io=choiceOf(b.io,['native','threads'],'IO 模式');
  if(driver)body.driver=driver;if(cache)body.cache=cache;if(io)body.io=io;
  res.json({ok:true,result:await mutate(req,'POST',`disks/${did}/mount`,body,'disks',did,'mount')});
 }));
 app.post('/api/biz/disks/:id/unmount',asyncRoute(async(req,res)=>{
  const did=id(req.params.id,'磁盘编号'),cloud=id(req.body.cloud,'实例编号');
  res.json({ok:true,result:await mutate(req,'DELETE',`clouds/${cloud}/disks/${did}`,{force:Number(req.body.force)===1?1:0},'disks',did,'unmount')});
 }));
 app.post('/api/biz/disks/restore',asyncRoute(async(req,res)=>{
  const list=idList(req.body);await mutate(req,'DELETE','disks/recycle_bin',{id:list},'disks',list.join(','),'restore');
  res.json({ok:true,total:list.length,success:list.length,failed:0});
 }));

 // ---- 实例模板
 app.post('/api/biz/templates',asyncRoute(async(req,res)=>{
  const host=id(req.body.hostid,'源实例');const name=String(req.body.name??'').trim();if(!name||name.length>64)throw new HttpError(400,'请检查表单字段',{name:'请填写 1～64 个字符的模板名称'});
  res.json({ok:true,result:await mutate(req,'POST',`clouds/${host}/templates`,{name},'templates',host,'create')});
 }));

 // ---- SSH 密钥
 app.post('/api/biz/ssh-keys',asyncRoute(async(req,res)=>{
  const b=req.body;const errors={};const type=Number(b.type)===1?1:0;const name=String(b.name??'').trim();const uid=Number(b.uid);const pub=String(b.public_key??'').trim();
  if(!name||name.length>64)errors.name='请填写 1～64 个字符的名称';if(!Number.isSafeInteger(uid)||uid<1)errors.uid='请选择所属用户';
  if(type===1&&(!/^(ssh-(rsa|ed25519|dss)|ecdsa-sha2-\S+|sk-\S+)\s+[A-Za-z0-9+/=]+/.test(pub)||pub.length>16384))errors.public_key='请粘贴有效的 OpenSSH 公钥（ssh-rsa / ssh-ed25519 …）';
  fail(errors);
  // 自动生成时平台只在这次响应里返回私钥：原样转给浏览器显示一次，不写入日志或本机文件。
  const r=await mutate(req,'POST','ssh_keys',{type,uid,name,...(type===1?{public_key:pub}:{})},'ssh-keys',null,'create',{raw:true});
  const d=r?.data&&!Array.isArray(r.data)?r.data:r||{};
  res.json({ok:true,id:d.id??null,key:type===0&&typeof d.key==='string'?d.key:null});
 }));
 const bind=method=>asyncRoute(async(req,res)=>{
  const kid=id(req.params.id,'密钥编号');const hosts=req.body.hostid;
  if(!Array.isArray(hosts)||!hosts.length||hosts.length>200||hosts.some(h=>!Number.isSafeInteger(h)||h<1))throw new HttpError(400,'请选择实例');
  const r=await mutate(req,method,`ssh_keys/${kid}/clouds`,{hostid:[...new Set(hosts)]},'ssh-keys',kid,method==='POST'?'bind':'unbind');
  res.json({ok:true,num:Number((r?.data??r)?.num)||null});
 });

 // ---- 安全组关联的实例：列表用 v1/clouds 的 security 参数；关联 POST v1/security_groups/:id/links（type=1 不影响已关联实例），解除 DELETE v1/security_groups/:id/links
 app.get('/api/biz/security-groups/:gid/clouds',asyncRoute(async(req,res)=>{
  const gid=id(req.params.gid,'安全组编号');const r=await req.session.client.request('GET','clouds',{query:{page:1,per_page:100,orderby:'id',sort:'desc',security:gid}});const out=listResult(r);
  res.json({data:out.data.filter(c=>c.status!=='recycle').map(c=>({id:c.id,hostname:c.hostname,mainip:c.mainip})),total:out.meta?.total??out.data.length});
 }));
 const link=method=>asyncRoute(async(req,res)=>{
  const gid=id(req.params.gid,'安全组编号');const list=req.body.cloud;
  if(!Array.isArray(list)||!list.length||list.length>200||list.some(h=>!Number.isSafeInteger(h)||h<1))throw new HttpError(400,'请选择实例');
  await mutate(req,method,`security_groups/${gid}/links`,method==='POST'?{cloud:[...new Set(list)],type:1}:{cloud:[...new Set(list)]},'security-groups',gid,method==='POST'?'link':'unlink');
  res.json({ok:true});
 });
 app.post('/api/biz/security-groups/:gid/links',link('POST'));
 app.delete('/api/biz/security-groups/:gid/links',link('DELETE'));
 app.post('/api/biz/ssh-keys/:id/clouds',bind('POST'));
 app.delete('/api/biz/ssh-keys/:id/clouds',bind('DELETE'));
}
export {PROTOCOLS};
