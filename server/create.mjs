import {HttpError,listResult,scrub} from './cube-client.mjs';
import {checkFields} from './network.mjs';

/**
 * 新建实例页（/clouds/new）：
 * - GET  /api/clouds/create_page   获取创建实例页面参数 v1/clouds/create_page（区域 → 节点 → 存储，及已启用的节点类型）
 * - GET  /api/clouds/create_vpcs   vpc网络列表 v1/vpc_networks（按区域 / 用户）
 * - POST /api/clouds/create        创建实例 POST v1/clouds，字段按文档白名单校验
 */
const int=(key,label,o={})=>({key,label,type:'int',min:0,...o});
const str=(key,label,o={})=>({key,label,type:'str',max:255,...o});
const flag=(key,label,o={})=>({key,label,type:'flag',...o});
const pick=(key,label,values,o={})=>({key,label,type:'enum',values,...o});
export const createFields=[
 int('area','区域',{min:1}),int('node','计算节点'),pick('node_priority','节点选择方式',[1,2,3]),int('store','存储'),str('type','节点类型',{max:16}),
 int('os','系统镜像',{required:true,min:1}),int('app_preset_id','应用预设'),
 int('cpu','CPU',{required:true,min:1,max:512}),int('memory','内存（MB）',{required:true,min:128,max:4194304}),
 int('system_disk_size','系统盘（GB）',{min:1,max:65536}),int('data_disk_size','数据盘（GB）',{min:1,max:65536}),
 str('network_type','网络类型',{max:8}),int('vpc','VPC 网络',{min:1}),str('vpc_name','VPC 名称',{max:64}),str('vpc_ips','VPC 网段',{max:32}),
 int('ip_num','IPv4 数量',{max:256}),int('ipv6_num','IPv6 数量',{max:256}),int('ip_group','IP 分组',{min:1}),
 int('in_bw','入站带宽',{max:100000}),int('out_bw','出站带宽',{max:100000}),int('traffic_quota','流量限额',{max:10000000}),
 pick('password_type','登录方式',[0,1]),str('rootpass','密码',{secret:true,max:128}),int('ssh_key','SSH 密钥',{min:1}),str('port','SSH 端口',{max:8}),
 str('hostname','主机名',{max:64}),int('client','所属用户',{min:1}),int('num','创建数量',{min:1,max:100}),flag('the_same_pass','批量使用相同密码')
];

export function createPayload(body){
 const {output,errors}=checkFields(createFields,body);
 if(!output.area&&!output.node)errors.area='请选择区域';
 if(output.network_type!==undefined&&!['normal','vpc'].includes(output.network_type))errors.network_type='网络类型只能是经典网络或 VPC';
 if(output.type!==undefined&&!['host','lightHost','hyperv','adsl'].includes(output.type))errors.type='节点类型无效';
 if(output.port!==undefined&&!(output.port==='auto'||output.port==='22'||(/^\d+$/.test(output.port)&&Number(output.port)>=100&&Number(output.port)<=65535)))errors.port='端口只能是 22、100～65535 或 auto';
 if(output.network_type==='vpc'&&output.vpc_ips&&!/^(10|172|192)\.\d{1,3}\.\d{1,3}\.\d{1,3}\/(1[6-9]|2[0-8])$/.test(output.vpc_ips))errors.vpc_ips='VPC 网段应为 10.x / 172.16–31.x / 192.168.x 的 /16～/28 子网';
 if(output.network_type!=='vpc'){delete output.vpc;delete output.vpc_name;delete output.vpc_ips;}
 if(output.password_type===1){delete output.rootpass;if(!output.ssh_key)errors.ssh_key='请选择 SSH 密钥';}else delete output.ssh_key;
 if(output.ip_num===undefined)errors.ip_num='请填写 IPv4 数量';
 if(output.rootpass!==undefined&&(output.rootpass.length<6||output.rootpass.length>128))errors.rootpass='密码长度应为 6～128 位';
 if(!output.num||output.num===1)delete output.the_same_pass;
 for(const k of ['node','store','app_preset_id'])if(output[k]===0)delete output[k];
 if(Object.keys(errors).length)throw new HttpError(400,'请检查表单字段',errors);
 return output;
}

export function registerCreate(app,{asyncRoute,mutate}){
 app.get('/api/clouds/create_page',asyncRoute(async(req,res)=>{
  const type=['host','lightHost','hyperv','adsl'].includes(String(req.query.type))?String(req.query.type):'host';
  const r=await req.session.client.request('GET','clouds/create_page',{query:{type}});
  const list=Array.isArray(r?.data)?r.data:Array.isArray(r)?r:[];
  const store=s=>({id:Number(s.id),name:String(s.show_name??s.name??'#'+s.id),type:s.type,status:s.status==null?1:Number(s.status),free:s.free});
  res.json({type,node_type:Array.isArray(r?.node_type)?r.node_type:[],areas:scrub(list).map(a=>({id:Number(a.id),name:String(a.name??''),short_name:a.short_name??'',country_code:a.country_code??'',country_name:a.country_name??'',store:(a.store||[]).map(store),node:(a.node||[]).map(n=>({id:Number(n.id),name:String(n.name??''),status:Number(n.status??1),store:(n.store||[]).map(store)}))}))});
 }));
 app.get('/api/clouds/create_vpcs',asyncRoute(async(req,res)=>{
  const q={list_type:'all'};for(const k of ['area','user']){const n=Number(req.query[k]);if(Number.isSafeInteger(n)&&n>0)q[k]=n;}
  const r=await req.session.client.request('GET','vpc_networks',{query:q});
  res.json({data:listResult(r).data.map(v=>({id:v.id,name:v.name,ips:v.ips,username:v.username}))});
 }));
 app.post('/api/clouds/create',asyncRoute(async(req,res)=>{
  const body=createPayload(req.body);
  const result=await mutate(req,'POST','clouds',body,'clouds',null,'create',{raw:true});
  const d=result?.data&&!Array.isArray(result.data)?result.data:result||{};
  const ids=Array.isArray(d.id)?d.id:d.id!=null?[d.id]:[];
  res.json({ok:true,num:Number(d.num??ids.length)||ids.length,ids:ids.map(Number),taskid:d.taskid??null});
 }));
}
