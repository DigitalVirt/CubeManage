const number=(key,label,extra={})=>({key,label,type:'number',min:0,integer:true,...extra});
const text=(key,label,extra={})=>({key,label,...extra});
const relation=(key,label,resource,extra={})=>({key,label,type:'relation',relation:resource,min:1,integer:true,...extra});
const secret=(key,label)=>({key,label,type:'password',secret:true,help:'编辑时留空表示保留原值'});
export const resources={
 areas:{title:'区域',fields:[text('name','区域名称',{required:true}),text('short_name','区域简称'),text('ip','区域被控 IP / 域名',{required:true}),number('country','国家 ID',{help:'使用平台国家编号，可留空'}),text('username','被控用户名'),secret('password','被控密码'),text('alternate_ip','备用 IP'),text('image_download_domain','镜像下载源')]},
 nodes:{title:'节点',fields:[text('name','节点名称',{required:true}),relation('area_id','所属区域','areas',{required:true}),{key:'type',label:'节点类型',type:'select',createOnly:true,default:'host',options:[{value:'host',label:'KVM 加强版'},{value:'lightHost',label:'KVM 轻量版'},{value:'hyperv',label:'Hyper-V'},{value:'adsl',label:'拨号云'}]},number('group_id','节点分组'),text('ip','节点 IP / 域名',{required:true}),number('port','鉴权端口',{min:1,max:65535}),text('username','鉴权用户名'),secret('password','鉴权密码'),secret('ssh_pass','SSH 密码'),text('dns1','首选 DNS'),text('dns2','备用 DNS'),{key:'ip_segment_id',label:'可用 IP 段',type:'ids'},text('nat_port_range','NAT 端口范围'),number('max_memory','内存限额（GB，0 不限）'),number('max_cpu','CPU 限额（核，0 不限）'),{key:'choose_store_rule',label:'本地存储使用规则',type:'select',default:'0',options:[{value:'0',label:'剩余容量最高'},{value:'1',label:'实例数量最少'}]},{key:'create_local_store',label:'默认创建本地存储',type:'boolean',createOnly:true,default:0},{key:'auto_boot_host',label:'节点启动时自动开启实例',type:'boolean',default:1},{key:'enable',label:'启用节点',type:'boolean',editOnly:true},{key:'maintenance_mode',label:'维护模式',type:'boolean',editOnly:true},text('remark','备注',{type:'textarea'})]},
 clouds:{title:'实例',fields:[text('hostname','主机名',{createOnly:true}),number('client','平台用户 ID',{createOnly:true,default:1,min:1}),relation('area','所属区域','areas',{createOnly:true}),relation('node','计算节点','nodes',{createOnly:true}),relation('os','系统镜像','images',{required:true,createOnly:true}),number('cpu','CPU（核）',{required:true,min:1,default:2}),number('memory','内存（MiB）',{required:true,min:128,default:4096,help:'1024 MiB = 1 GiB；API 使用 MiB'}),number('system_disk_size','系统盘（GiB）',{min:1,default:40,createOnly:true}),number('in_bw','入站带宽（Mbps）',{createOnly:true,default:100}),number('out_bw','出站带宽（Mbps）',{createOnly:true,default:100}),number('ip_num','IPv4 数量',{min:1,default:1,createOnly:true,required:true}),number('traffic_quota','流量限额（GB）',{default:1000}),number('reset_flow_day','每月流量重置日',{min:1,max:31,default:1}),{...secret('rootpass','系统密码'),createOnly:true,help:'留空由平台生成，可在平台中查看'},number('snap_num','快照数量（0 不限，-1 禁用）',{min:-1,editOnly:true}),number('backup_num','备份数量（0 不限，-1 禁用）',{min:-1,editOnly:true})]}
};
export const actions={on:'开机',off:'关机',reboot:'重启',hard_reboot:'强制重启',hardoff:'强制关机',suspend:'暂停',unsuspend:'恢复',resume:'解除挂起'};
export function fieldPayload(kind,input,{editing=false,descriptor:customDescriptor}={}){
 const descriptor=customDescriptor||resources[kind];if(!descriptor)throw Error('未知资源类型');const output={},errors={};
 for(const field of descriptor.fields){
  if(editing&&field.createOnly||!editing&&field.editOnly)continue;
  let value=input[field.key];
  if(field.secret&&(value==null||value==='')){if(!editing&&field.required)errors[field.key]='请填写'+field.label;continue;}
  if(value==null||value===''){if(!editing&&field.default!==undefined)value=field.default;else if(field.required&&(!editing||Object.hasOwn(input,field.key)))errors[field.key]='请填写'+field.label;else if(editing&&[undefined,'textarea'].includes(field.type)&&value===''){output[field.key]='';continue;}else continue;}
  if(field.type==='select')value=String(value);
  if(field.type==='number'||field.type==='relation'){value=Number(value);if(!Number.isFinite(value)||(field.integer&&!Number.isInteger(value))||(field.min!==undefined&&value<field.min)||(field.max!==undefined&&value>field.max))errors[field.key]='请输入有效的'+field.label;}
  else if(field.type==='ids'){if(!Array.isArray(value)||value.length>500||value.some(v=>!Number.isSafeInteger(Number(v))||Number(v)<1))errors[field.key]='请选择有效的'+field.label;value=Array.isArray(value)?[...new Set(value.map(Number))]:[];}
  else if(field.type==='boolean'){if(![true,false,0,1,'0','1'].includes(value))errors[field.key]='无效的开关值';value=[true,1,'1'].includes(value)?1:0;}
  else if(typeof value!=='string'||value.length>4096)errors[field.key]='格式或长度不正确';else {value=field.secret?value:value.trim();if(field.required&&!value)errors[field.key]='请填写'+field.label;}
  if(field.options&&!field.options.some(o=>o.value===value))errors[field.key]='请选择有效选项';output[field.key]=value;
 }
 if(kind==='clouds'&&!editing){output.password_type=0;output.network_type='normal';}
 return {output,errors};
}
