import {HttpError,listResult} from './cube-client.mjs';

/**
 * 网站配置 (platform API doc, section "网站配置"). Each settings tab maps to one GET and one PUT endpoint
 * and a whitelist of the fields that PUT documents. Saving reads the current values first and submits the
 * whole whitelist with the changes applied, so fields the form does not show are never cleared.
 * Secrets (passwords, keys, tokens) never reach the browser: GET blanks them and reports whether one is set;
 * an empty secret on save keeps the current value.
 */
const sw='switch',int='int',str='str',text='text',list='list',secret='secret',secretList='secretList',ids='ids';
const diskLimits=Object.fromEntries(['read_bytes_sec','write_bytes_sec','read_iops_sec','write_iops_sec','read_bytes_sec_max','write_bytes_sec_max','read_iops_sec_max','write_iops_sec_max'].map(k=>[k,int]));
export const siteSections={
 basic:{get:'config',put:'config',fields:{system_domain:str,company_name:str,email:str,registration_number:str,alternate_master_ip:str,maintenance_mode:sw,maintenance_information:text,hide_copyright:sw,custom_user_copyright:sw,hide_cloud_password:sw,pick_limit:int},
  extra:['system_version_number','system_version','edition','client_version','client_update_date','apidoc']},
 instance:{get:'config',put:'config',fields:{recycle_bin:int,recycle_bin_unit:['day','hour'],disk_recycle_bin:int,disk_recycle_bin_unit:['day','hour'],nat_gateway_recycle_bin:int,system_disk_size_for_windows:int,system_disk_size_for_other:int,image_min_disk_size_check_switch:sw,data_disk_oversold:sw,mtu_switch:sw,cpu_limit_switch:sw,cpu_limit_percent:int,disk_config_switch:sw,...diskLimits}},
 security:{get:'config',put:'config/security',fields:{http_port_switch:sw,http_port:int,https_port_switch:sw,https_port:int,admin_path:str,proxy_server_list:text,request_header_get_ip:list}},
 vnc:{get:'config/vnc',put:'config/vnc',fields:{vnc_switch:sw,vnc_ip:str,vnc_domain:list,vnc_ssl_crt:list,vnc_ssl_key:secretList},extra:['enable_vnc_ip']},
 ip:{get:'config/ip',put:'config/ip',fields:{ip_assign_rule:[1,2,3],client_show_ip_remark:sw,mac_prefix:str,ipv6_enable:sw}},
 ddns:{get:'config/ddns',put:'config/ddns',fields:{ddns_switch:sw,ddns_supplier:['dnspod'],ddns_key:str,ddns_token:secret,ddns_domain_enable_main:sw,ddns_domain_enable:ids},extra:['main_control','area']},
 traffic:{get:'config/traffic',put:'config/traffic',fields:{over_flow_suspend:[0,1,2,3],over_flow_bw_limit:str}},
 notify:{get:'config/notify',put:'config/notify',fields:{email_switch:sw,email_type:['smtp'],email_encoding:['8bit','7bit','binary','base64','quoted-printable'],email_smtp_host:str,email_smtp_port:str,email_smtp_ssl:['','ssl','tls'],email_smtp_user:str,email_smtp_pwd:secret,email_system_name:str,email_system_email:str,sms_appid:str,sms_key:secret}},
 function_switch:{get:'config/function_switch',put:'config/function_switch',fields:Object.fromEntries(['fs_elastic_ip_product','fs_disk_product','fs_vpn_gateway','fs_nat_gateway','fs_snapshot','fs_backup','fs_custom_image'].map(k=>[k,sw]))},
 vgpu:{get:'config/vgpu',put:'config/vgpu',fields:{vgpu_enable:sw,vgpu_license_server:str},extra:['vgpu_host_use']},
 download:{get:'config/master_download_domain',put:'config/master_download_domain',fields:{master_download_domain:str}},
 debug:{get:'config/debug',put:'config/debug',fields:{status:sw},extra:['debug_html']},
 evacuation:{get:'config/evacuation',readonly:true,fields:{evacuation_switch:sw,monitor_frequency:int,fail_times:int,migrate_scope:str,balance_strategy:int,forbid_migrate_out:list,forbid_migrate_in:list,migrate_back:int,migrate_back_strategy:int},extra:['alarm_nodify']}
};

const unwrap=r=>r&&typeof r==='object'&&r.data&&typeof r.data==='object'&&!Array.isArray(r.data)?r.data:r||{};
const isSecret=type=>type===secret||type===secretList;
const asList=v=>Array.isArray(v)?v.map(String):typeof v==='string'?v.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean):[];

/** Validate one submitted value against its field type; returns the value to send to the platform. */
function coerce(key,type,v){
 const bad=msg=>new HttpError(400,`${key}：${msg}`);
 if(Array.isArray(type)){const hit=type.find(o=>String(o)===String(v));if(hit===undefined)throw bad('不是允许的选项');return hit;}
 switch(type){
  case sw:if([1,'1',true].includes(v))return 1;if([0,'0',false].includes(v))return 0;throw bad('只能是开启或关闭');
  case int:{const n=Number(v);if(v===''||!Number.isSafeInteger(n)||n<0)throw bad('必须是非负整数');return n;}
  case str:if(typeof v!=='string'&&typeof v!=='number')throw bad('格式不正确');if(String(v).length>2048)throw bad('过长');return String(v).trim();
  case text:case secret:if(typeof v!=='string')throw bad('格式不正确');if(v.length>20000)throw bad('过长');return v;
  case list:case secretList:{const l=asList(v);if(l.length>200||l.some(s=>s.length>20000))throw bad('条目过多或过长');return l;}
  case ids:{if(!Array.isArray(v))throw bad('格式不正确');const l=[...new Set(v.map(Number))];if(l.some(n=>!Number.isSafeInteger(n)||n<1))throw bad('节点编号无效');return l;}
 }
 throw bad('未知字段类型');
}

/** Current values of a section as the form shows them; secrets blanked. */
function present(name,raw){
 const s=siteSections[name],values={},secrets={};
 for(const [k,type] of Object.entries(s.fields)){
  let v=raw[k];
  if(name==='ddns'&&k==='ddns_domain_enable_main')v=raw.main_control?.ddns_enable;
  if(name==='ddns'&&k==='ddns_domain_enable')v=(raw.area||[]).flatMap(a=>(a.node||[]).filter(n=>Number(n.ddns_enable)===1).map(n=>Number(n.id)));
  if(isSecret(type)){secrets[k]=type===secretList?asList(v).length>0:Boolean(v);values[k]=type===secretList?[]:'';continue;}
  if(type===list)v=asList(v);
  if(type===sw&&v!=null&&v!=='')v=Number(v)?1:0;
  values[k]=v??(type===list||type===ids?[]:'');
 }
 const extra=Object.fromEntries((s.extra||[]).filter(k=>raw[k]!==undefined).map(k=>[k,raw[k]]));
 return {values,secrets,extra};
}

export function registerSiteConfig(app,{asyncRoute}){
 // 页头显示的网站名称：网站配置 → 基本信息的 company_name（GET v1/config）。只返回这一项。
 app.get('/api/site-name',asyncRoute(async(req,res)=>{const v=unwrap(await req.session.client.request('GET','config'));const name=typeof v.company_name==='string'?v.company_name.trim().slice(0,64):'';res.json({name});}));
 const section=req=>{const s=siteSections[req.params.section];if(!s)throw new HttpError(404,'配置分组不存在');return s;};
 const read=async(req,route)=>unwrap(await req.session.client.request('GET',route));
 const done=async(req,op,id,fn)=>fn();

 // 内网IP设置: nodes grouped by area, each with its private IP.
 app.get('/api/site-config/private_ip',asyncRoute(async(req,res)=>{
  const r=await req.session.client.request('GET','config/node_private_ip');const areas=Array.isArray(r)?r:Array.isArray(r?.data)?r.data:[];
  res.json({areas:areas.map(a=>({id:a.id,name:a.name,node:(a.node||[]).map(n=>({id:n.id,name:n.name,ip:n.ip,private_ip:n.private_ip??''}))}))});
 }));
 app.put('/api/site-config/private_ip',asyncRoute(async(req,res)=>{
  const input=req.body?.private_ip;if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'请提交节点内网 IP');
  const out={};for(const [id,ip] of Object.entries(input)){if(!/^\d+$/.test(id))throw new HttpError(400,'节点编号无效');const v=String(ip??'').trim();if(v&&!/^(\d{1,3})(\.\d{1,3}){3}$/.test(v))throw new HttpError(400,`节点 #${id} 的内网 IP 格式不正确`);out[id]=v;}
  if(!Object.keys(out).length)throw new HttpError(400,'没有需要保存的修改');
  await done(req,'private_ip','node_private_ip',()=>req.session.client.request('PUT','config/node_private_ip',{body:{private_ip:out}}));
  res.json({ok:true});
 }));

 // 节点流量设置: per-node overrides of the over-quota action.
 const action=v=>coerce('over_flow_suspend',[0,1,2,3],v);
 const limit=(b,a)=>{if(a!==3)return undefined;const n=Number(b.over_flow_bw_limit);if(!(n>0&&n<=100000))throw new HttpError(400,'限速时请填写 1～100000 Mbps');return String(n);};
 const nodeIds=v=>{const l=coerce('node_ids',ids,v);if(!l.length||l.length>500)throw new HttpError(400,'请选择节点');return l;};
 app.get('/api/site-config/node_traffic',asyncRoute(async(req,res)=>{
  const page=Math.max(1,parseInt(req.query.page)||1),per_page=Math.min(100,Math.max(1,parseInt(req.query.per_page)||20));const query={page,per_page};if(req.query.search)query.search=String(req.query.search).slice(0,128);
  const r=await req.session.client.request('GET','config/node_traffic',{query});const result=listResult(r,page,per_page);
  if(!result.meta.total_pages&&r?.meta?.total_page)result.meta.total_pages=r.meta.total_page;res.json(result);
 }));
 app.post('/api/site-config/node_traffic',asyncRoute(async(req,res)=>{
  const b=req.body||{},a=action(b.over_flow_suspend),node_id=coerce('node_id',int,b.node_id);if(!node_id)throw new HttpError(400,'请选择节点');
  const body={node_id,over_flow_suspend:a};const l=limit(b,a);if(l)body.over_flow_bw_limit=l;
  await done(req,'node_traffic:add',String(node_id),()=>req.session.client.request('POST','config/node_traffic',{body}));res.json({ok:true});
 }));
 app.put('/api/site-config/node_traffic',asyncRoute(async(req,res)=>{
  const b=req.body||{},a=action(b.over_flow_suspend),node_ids=nodeIds(b.node_ids);const body={node_ids,over_flow_suspend:a};const l=limit(b,a);if(l)body.over_flow_bw_limit=l;
  await done(req,'node_traffic:edit',node_ids.join(','),()=>req.session.client.request('PUT','config/node_traffic',{body}));res.json({ok:true});
 }));
 app.delete('/api/site-config/node_traffic',asyncRoute(async(req,res)=>{
  const node_ids=nodeIds(req.body?.node_ids);
  await done(req,'node_traffic:delete',node_ids.join(','),()=>req.session.client.request('DELETE','config/node_traffic',{body:{node_ids}}));res.json({ok:true});
 }));

 // vGPU测试连接
 app.post('/api/site-config/vgpu/test',asyncRoute(async(req,res)=>{
  const server=coerce('vgpu_license_server',str,req.body?.vgpu_license_server??'');if(!server)throw new HttpError(400,'请填写授权服务器地址');
  const r=await req.session.client.request('POST','config/vgpu/test_link',{body:{vgpu_license_server:server}});res.json({ok:true,message:typeof r?.msg==='string'?r.msg:'连接成功'});
 }));

 app.get('/api/site-config/:section',asyncRoute(async(req,res)=>{const s=section(req);res.json({...present(req.params.section,await read(req,s.get)),readonly:Boolean(s.readonly)});}));

 app.put('/api/site-config/:section',asyncRoute(async(req,res)=>{
  const name=req.params.section,s=section(req);if(s.readonly)throw new HttpError(405,'该配置只读');
  const changes=req.body?.values;if(!changes||typeof changes!=='object'||Array.isArray(changes))throw new HttpError(400,'请提交配置项');
  // Every tab writing to the same endpoint shares one whitelist (基本信息 and 实例与磁盘 both PUT v1/config).
  const fields=Object.assign({},...Object.values(siteSections).filter(x=>x.put===s.put&&x.get===s.get).map(x=>x.fields));
  const unknown=Object.keys(changes).filter(k=>!(k in s.fields));if(unknown.length)throw new HttpError(400,'不支持的配置项：'+unknown.join('、'));
  const raw=await read(req,s.get),current=present(name,raw).values,body={};
  for(const [k,type] of Object.entries(fields)){
   if(k in changes){const v=changes[k];if(isSecret(type)&&(v===''||(Array.isArray(v)&&!v.length)))body[k]=raw[k];else body[k]=coerce(k,type,v);continue;}
   const v=k in current?current[k]:raw[k];if(isSecret(type))body[k]=raw[k];else if(v!==undefined&&v!==null&&v!=='')body[k]=type===list?asList(v):v;else if(type===str||type===text)body[k]='';
  }
  for(const k of Object.keys(body))if(body[k]===undefined)delete body[k];
  if(name==='debug')for(const k of Object.keys(body))if(k!=='status')delete body[k];
  // An empty node list switches DDNS off for every node; form encoding drops empty arrays, so send it as ''.
  if(Array.isArray(body.ddns_domain_enable)&&!body.ddns_domain_enable.length)body.ddns_domain_enable='';
  const result=await done(req,name,s.put,()=>req.session.client.request('PUT',s.put,{body}));
  res.json({ok:true,result:name==='ddns'?unwrap(result):undefined});
 }));
}
