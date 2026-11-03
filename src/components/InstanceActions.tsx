import {useEffect,useState,type ReactNode} from 'react';
import {Button,Checkbox,Input,Label,TextField,Tooltip,ListBox,Header,Select as HSelect,NumberField as HNumberField} from '@heroui/react';
import {CircleAlert,Clipboard,ClipboardCheck,Dices,TriangleAlert,X} from 'lucide-react';
import {api,send,date,type Row} from '../lib/api';
import {Dialog,ErrorBox,Empty} from './Shared';
import {FormSkeleton} from './PageSkeleton';
import {Choice} from './Controls';
import {Field,Flag,ImagePicker,NumberField,Select,useOptions,SHOW_APP_PRESETS} from './BatchOperation';

type Tone='normal'|'caution'|'danger';
/** Instance operations: title, tone and what the platform will do. Each posts to /api/clouds/:id/do/:op. */
export const instanceOps:Record<string,{title:string;tone:Tone;note:string}>={
 on:{title:'开机',tone:'normal',note:'启动实例。'},
 off:{title:'关机',tone:'caution',note:'向系统发送关机信号，运行中的服务会停止。'},
 reboot:{title:'重启',tone:'caution',note:'正常重启实例，服务会短暂中断。'},
 hard_reboot:{title:'硬重启',tone:'danger',note:'直接断电重启，未保存的数据可能丢失。'},
 hardoff:{title:'硬关机',tone:'danger',note:'直接断电关机，未保存的数据可能丢失。'},
 suspend:{title:'暂停',tone:'caution',note:'暂停后实例停止运行，直到解除暂停。'},
 unsuspend:{title:'解除暂停',tone:'normal',note:'恢复被暂停的实例。'},
 resume:{title:'解除挂起',tone:'normal',note:'恢复被挂起的实例。'},
 delete:{title:'删除实例',tone:'danger',note:'实例将进入平台回收站，服务立即中断。'},
 rescue:{title:'救援系统',tone:'caution',note:'实例会重启进入救援系统，原系统盘挂载为数据盘，可用于修复系统或找回数据。'},
 rescue_exit:{title:'退出救援系统',tone:'caution',note:'实例会重启回到原系统。'},
 reinstall:{title:'重装系统',tone:'caution',note:'系统盘会被重新安装，系统盘上的数据全部丢失。'},
 password:{title:'修改密码',tone:'caution',note:'离线重置会先关机再注入新密码；在线重置需要实例安装 GuestAgent。'},
 config:{title:'修改配置',tone:'caution',note:'修改 vCPU 和内存。实例通常需要重启后才会按新配置运行。'},
 bw:{title:'修改带宽',tone:'normal',note:'新的带宽限制立即生效。'},
 flow_setting:{title:'流量设置',tone:'normal',note:'修改流量限额和统计方式。'},
 reset_traffic:{title:'重置流量',tone:'caution',note:'本周期已用流量清零；因流量超额暂停的实例会自动解除暂停。'},
 network_type:{title:'切换网络类型',tone:'danger',note:'切换经典网络与 VPC 网络会重新配置网卡，网络会中断。'},
 vpc:{title:'切换 VPC 网络',tone:'caution',note:'只能切换到同一节点上的 VPC 网络，内网地址会变化。'},
 ip_num:{title:'修改 IPv4 数量',tone:'caution',note:'增加时从 IP 池分配新地址；减少时从末尾回收，被回收的地址立即失效。'},
 ipv6_add:{title:'添加 IPv6',tone:'normal',note:'为实例分配新的 IPv6 地址。'},
 ipv6_delete:{title:'删除 IPv6',tone:'danger',note:'这个 IPv6 地址会被回收，立即失效。'},
 mainip:{title:'设为主 IP',tone:'caution',note:'主 IP 用于连接实例和展示。'},
 disconnect:{title:'断网',tone:'danger',note:'实例的外网连接会被切断。'},
 internet:{title:'恢复网络',tone:'normal',note:'恢复实例的外网连接。'},
 disk_delete:{title:'删除磁盘',tone:'danger',note:'磁盘会从实例卸载并删除，盘上的数据无法恢复。'},
 ip_add:{title:'增加 IP',tone:'normal',note:'选中的 IP 加入这个 IP 组，共用它的带宽；分配后需要在系统内配置才能使用。'},
 group_add:{title:'增加 IP 组',tone:'normal',note:'用选中的 IP 新建一个 IP 组，并为它单独设置带宽；分配后需要在系统内配置才能使用。'},
 group_bw:{title:'修改带宽',tone:'normal',note:'修改这个 IP 组的带宽，组内所有 IP 共用，立即生效。'},
 group_ip:{title:'更换 IP',tone:'caution',note:'勾选这个 IP 组更换后要保留的全部 IP：取消勾选的会被回收，新勾选的会加入。依赖被回收 IP 的服务会中断。'},
 group_delete:{title:'删除 IP 组',tone:'danger',note:'组内全部 IP 会从实例上移除并回收，IP 组随之删除，立即失效。'},
 ip_delete:{title:'删除 IP',tone:'danger',note:'这个 IPv4 地址会从实例上移除并回收，立即失效。'},
 disk_add:{title:'添加磁盘',tone:'normal',note:'新磁盘创建后自动挂载到实例，需要在系统内分区、格式化后才能使用。'},
 disk_edit:{title:'修改磁盘',tone:'caution',note:'容量只能扩大。实例运行时修改，平台会自动重启实例。'},
 disk_compress:{title:'磁盘压缩',tone:'caution',note:'平台对所选的本地或 CEPH 磁盘执行压缩，以任务方式进行。Hyper-V 实例不支持。'}
};
const random=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';const a=new Uint32Array(14);crypto.getRandomValues(a);return Array.from(a,n=>chars[n%chars.length]).join('')+'#7';};

/** Password input with two square icon buttons at the input's height: generate, copy. */
function PasswordField({label,value,onChange,hint}:{label:string;value:string;onChange:(v:string)=>void;hint?:string}){
 const [copied,setCopied]=useState(false);
 async function copy(){if(!value)return;try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),1500);}catch{/* clipboard unavailable */}}
 return <div className="batch-field"><TextField value={value} onChange={onChange}><Label>{label}</Label><div className="password-row"><Input type="text" autoComplete="new-password" spellCheck={false} placeholder="6～128 位"/>
  <Tooltip delay={300}><Button variant="outline" isIconOnly aria-label="随机生成密码" onPress={()=>onChange(random())}><Dices size={16}/></Button><Tooltip.Content>随机生成</Tooltip.Content></Tooltip>
  <Tooltip delay={300}><Button variant="outline" isIconOnly aria-label={copied?'已复制':'复制密码'} isDisabled={!value} onPress={copy}>{copied?<ClipboardCheck size={16}/>:<Clipboard size={16}/>}</Button><Tooltip.Content>{copied?'已复制':'复制'}</Tooltip.Content></Tooltip>
 </div></TextField>{hint&&<small>{hint}</small>}</div>;
}

export type ActionTarget={op:string;row?:Row};
/** One dialog for every single-instance operation: a note, the form it needs, two buttons. No typed confirmation. */
/**
 * IPv4 multi-select: a dropdown grouped by IP segment; the field shows the chosen IPs as tags, each removable with ×.
 * `current` marks the IPs a group holds now (更换 IP).
 */
/** HeroUI NumberField with −/+ steppers; the form keeps values as strings like the other fields. */
function Stepper({label,unit,value,onChange,min,max,step}:{label:string;unit:string;value:string;onChange:(v:string)=>void;min:number;max:number;step:number}){
 return <HNumberField className="batch-field cfg-stepper" value={value===''?NaN:Number(value)} onChange={n=>onChange(n==null||Number.isNaN(n)?'':String(n))} minValue={min} maxValue={max} step={step} formatOptions={{useGrouping:false,maximumFractionDigits:0}}>
  <Label>{label}<span className="batch-unit">（{unit}）</span></Label>
  <HNumberField.Group><HNumberField.DecrementButton/><HNumberField.Input/><HNumberField.IncrementButton/></HNumberField.Group>
 </HNumberField>;
}
function IpPicker({segments,value,onChange,label}:{segments:Row[];value:number[];onChange:(v:number[])=>void;label:string}){
 const byId=new Map(segments.flatMap(sg=>(sg.ips as Row[]).map(x=>[Number(x.id),x] as const)));
 return <HSelect aria-label={label} selectionMode="multiple" value={value.map(String)} onChange={keys=>onChange([...(keys as Iterable<string|number>)].map(Number))} className="ip-select">
  <HSelect.Trigger className="ip-select-trigger"><HSelect.Value>{({isPlaceholder}:{isPlaceholder:boolean})=>isPlaceholder||!value.length?<span className="ip-select-ph">点击选择 IP，可多选</span>
   :<span className="ip-tags">{value.map(id=>{const ip=String(byId.get(id)?.ip??'#'+id);return <span key={id} className="ip-tag"><span className="mono">{ip}</span><span role="button" tabIndex={-1} aria-label={'移除 '+ip} className="ip-tag-x" onPointerDownCapture={e=>{e.stopPropagation();e.preventDefault();}} onMouseDownCapture={e=>{e.stopPropagation();e.preventDefault();}} onPointerUpCapture={e=>e.stopPropagation()} onClickCapture={e=>{e.stopPropagation();e.preventDefault();onChange(value.filter(n=>n!==id));}}><X size={11}/></span></span>;})}</span>}</HSelect.Value><HSelect.Indicator/></HSelect.Trigger>
  <HSelect.Popover className="ip-select-popover"><ListBox selectionMode="multiple" aria-label={label}>{segments.map(sg=><ListBox.Section key={sg.id} aria-label={sg.name}><Header className="ip-select-group">{sg.name} · {(sg.ips as Row[]).length} 个</Header>{(sg.ips as Row[]).map(x=><ListBox.Item key={x.id} id={String(x.id)} textValue={x.ip} className="ip-select-item">{({isSelected}:{isSelected:boolean})=><><Checkbox slot={null} isSelected={isSelected} isReadOnly excludeFromTabOrder aria-hidden="true" aria-label={x.ip} className="ip-select-check"><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control></Checkbox><span className="mono">{x.ip}</span>{x.checked&&<small className="ip-select-note">当前</small>}{x.elastic&&<small className="ip-select-note">弹性</small>}</>}</ListBox.Item>)}</ListBox.Section>)}</ListBox></HSelect.Popover>
 </HSelect>;
}
export function InstanceAction({cloud,target,traffic,onClose,onDone}:{cloud:Row;target:ActionTarget;traffic?:Row|null;onClose:()=>void;onDone:(message:string)=>void}){
 const {op,row}=target;const spec=instanceOps[op];
 const [v,setV]=useState<Row>(()=>{const m=traffic?.meta||{};return {pick_ips:[] as number[],group_ips:[] as number[],...(op==='group_bw'?{}:{}),size:op==='disk_edit'?String(row?.size??''):'',store:'',driver:'',cache:'',io:'',disk_ids:((cloud.disk||[]) as Row[]).map(d=>Number(d.id)),type:'0',temp_pass:'',os:'',password_type:'0',password:'',ssh_key:'',app_preset_id:'',format_data_disk:false,reset_type:false,in_bw:String(op==='group_add'?'':op==='group_bw'?row?.in_bw??'':cloud.default_bw_group?.in_bw??cloud.in_bw??''),out_bw:String(op==='group_add'?'':op==='group_bw'?row?.out_bw??'':cloud.default_bw_group?.out_bw??cloud.out_bw??''),flow_strategy:m.flow_strategy||'cycle',traffic_quota:String(m.traffic_quota??cloud.traffic_quota??''),traffic_type:String(m.traffic_type??3),flow_reset_cycle:m.flow_reset_cycle||'month',flow_reset_cycle_num:String(m.flow_reset_cycle_num??30),reset_flow_day:String(m.reset_flow_day??cloud.reset_flow_day??1),vpc:'',vpc_ips:'',num:op==='ip_num'?String(cloud.ip_num??1):'1',ip_group:'',lock:false,cpu:String(cloud.cpu??''),memory_mb:cloud.memory!=null&&cloud.memory!==''?String(Math.round(Number(cloud.memory)*1024)):''};});
 const set=(k:string)=>(x:unknown)=>setV(prev=>({...prev,[k]:x}));
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const images=useOptions(op==='reinstall'?'images':null,[Number(cloud.node_id??cloud.node)]),keys=useOptions(op==='reinstall'&&v.password_type==='1'?'ssh_keys':null),presets=useOptions(SHOW_APP_PRESETS&&op==='reinstall'?'app_presets':null),groups=useOptions(op==='ip_num'?'ip_groups':null);
 const [vpcs,setVpcs]=useState<{options:{id:number;name:string}[]|null;error:string}>({options:null,error:''});
 const [freeIps,setFreeIps]=useState<{segments:Row[]|null;error:string}>({segments:null,error:''});
 useEffect(()=>{if(op!=='ip_add'&&op!=='group_add')return;api(`/clouds/${cloud.id}/free_ips`).then(r=>setFreeIps({segments:r.segments,error:''})).catch(e=>setFreeIps({segments:[],error:e.message}));},[op,cloud.id]);
 const [ipOptions,setIpOptions]=useState<{segments:Row[]|null;error:string}>({segments:null,error:''});
 useEffect(()=>{if(op!=='group_ip'||!row)return;api(`/clouds/${cloud.id}/ip_groups/${row.id}/options`).then(r=>{setIpOptions({segments:r.segments,error:''});const picked=(r.segments as Row[]).flatMap(sg=>(sg.ips as Row[]).filter(x=>x.checked).map(x=>Number(x.id)));setV(prev=>({...prev,group_ips:picked.length?picked:(r.selected||[])}));}).catch(e=>setIpOptions({segments:[],error:e.message}));},[op,cloud.id,row?.id]);
 const [stores,setStores]=useState<{options:{id:number;name:string}[]|null;error:string}>({options:null,error:''});
 useEffect(()=>{if(op!=='disk_add')return;api(`/clouds/${cloud.id}/stores`).then(r=>setStores({options:r.data.map((x:Row)=>({id:x.id,name:x.name+(x.type==='ceph'?' · CEPH':x.type==='local'?' · 本地':'')})),error:''})).catch(e=>setStores({options:[],error:e.message}));},[op,cloud.id]);
 const toVpc=op==='vpc'||op==='network_type'&&cloud.network_type!=='vpc';
 useEffect(()=>{if(!toVpc)return;api(`/clouds/${cloud.id}/vpc_options`).then(r=>setVpcs({options:r.data,error:''})).catch(e=>setVpcs({options:[],error:e.message}));},[toVpc,cloud.id]);
 const addMissing=(op==='ip_add'||op==='group_add')&&!(v.pick_ips as number[]).length?'请至少选择一个 IP':op==='group_add'&&(v.in_bw===''||v.out_bw===''||!(Number(v.in_bw)>=0&&Number(v.out_bw)>=0))?'请填写新 IP 组的上下行带宽':'';
 const groupMissing=op==='group_bw'&&(v.in_bw===''||v.out_bw===''||!(Number(v.in_bw)>=0&&Number(v.out_bw)>=0))?'请填写上下行带宽':op==='group_ip'&&!(v.group_ips as number[]).length?'请至少勾选一个 IP':'';
 const diskMissing=op==='disk_add'?(!(Number(v.size)>=1&&Number.isInteger(Number(v.size)))?'请填写磁盘容量（整数 GB）':!v.store?'请选择存储':''):op==='disk_edit'?(!(Number.isInteger(Number(v.size))&&Number(v.size)>=1)?'请填写磁盘容量（整数 GB）':Number(v.size)<Number(row?.size)?`容量只能扩大，当前为 ${row?.size} GB`:Number(v.size)===Number(row?.size)&&!v.driver&&!v.cache&&!v.io?'没有需要修改的项目':''):op==='disk_compress'&&!(v.disk_ids as number[]).length?'请至少选择一块磁盘':'';
 const missing=addMissing||groupMissing||diskMissing||(op==='reinstall'&&!v.os?'请选择镜像':op==='reinstall'&&v.password_type==='1'&&!v.ssh_key?'请选择 SSH 密钥':op==='reinstall'&&v.password_type==='0'&&v.password&&v.password.length<6?'密码至少 6 位':op==='password'&&v.password.length<6?'请填写至少 6 位的新密码':op==='rescue'&&v.temp_pass&&v.temp_pass.length<6?'临时密码至少 6 位':op==='config'&&!(Number(v.cpu)>=1&&Number.isInteger(Number(v.cpu)))?'请填写有效的 vCPU 数量':op==='config'&&!(Number(v.memory_mb)>=256&&Number(v.memory_mb)%256===0)?'内存需为 256 MB 的整数倍':op==='bw'&&(v.in_bw===''||v.out_bw==='')?'请填写进、出带宽':op==='flow_setting'&&v.traffic_quota===''?'请填写流量限额':toVpc&&!v.vpc&&!v.vpc_ips?'请选择 VPC 网络或填写新网段':['ip_num','ipv6_add'].includes(op)&&!(Number(v.num)>=1)?'请填写数量':'');
 function payload():Row{
  switch(op){
   case 'rescue':return {type:Number(v.type),...(v.temp_pass?{temp_pass:v.temp_pass}:{})};
   case 'reinstall':return {os:Number(v.os),password_type:Number(v.password_type),...(v.password_type==='1'?{ssh_key:Number(v.ssh_key)}:v.password?{password:v.password}:{}),...(v.app_preset_id?{app_preset_id:Number(v.app_preset_id)}:{}),format_data_disk:v.format_data_disk};
   case 'password':return {password:v.password,reset_type:v.reset_type};
   case 'config':return {cpu:Number(v.cpu),memory:Number(v.memory_mb)};
   case 'bw':return {in_bw:Number(v.in_bw),out_bw:Number(v.out_bw)};
   case 'flow_setting':return {flow_strategy:v.flow_strategy,traffic_quota:Number(v.traffic_quota),traffic_type:Number(v.traffic_type),flow_reset_cycle:v.flow_reset_cycle,flow_reset_cycle_num:Number(v.flow_reset_cycle_num),reset_flow_day:Number(v.reset_flow_day)};
   case 'network_type':case 'vpc':return v.vpc?{vpc:Number(v.vpc)}:v.vpc_ips?{vpc_ips:v.vpc_ips}:{};
   case 'ip_num':return {num:Number(v.num),...(v.ip_group?{ip_group:Number(v.ip_group)}:{})};
   case 'ipv6_add':return {num:Number(v.num)};
   case 'ipv6_delete':return {ipv6:[row?.id]};
   case 'mainip':return {ip:row?.id,version:row?.version==='v6'?'v6':'v4'};
   case 'disconnect':return {lock:v.lock};
   case 'disk_delete':return {disk:row?.id};
   case 'ip_add':return {group:row?.id,ip:v.pick_ips};
   case 'group_add':return {ip:v.pick_ips,in_bw:Number(v.in_bw),out_bw:Number(v.out_bw)};
   case 'ip_delete':return {ip:row?.id};
   case 'group_delete':return {group:row?.id};
   case 'group_bw':return {group:row?.id,in_bw:Number(v.in_bw),out_bw:Number(v.out_bw)};
   case 'group_ip':return {group:row?.id,ip:v.group_ips};
   case 'disk_add':return {size:Number(v.size),store:Number(v.store),...(v.driver?{driver:v.driver}:{}),...(v.cache?{cache:v.cache}:{})};
   case 'disk_edit':return {disk:row?.id,...(Number(v.size)!==Number(row?.size)?{size:Number(v.size)}:{}),...(v.driver?{driver:v.driver}:{}),...(v.cache?{cache:v.cache}:{}),...(v.io?{io:v.io}:{})};
   case 'disk_compress':return {disk_ids:v.disk_ids};
   default:return {};
  }
 }
 async function run(){setBusy(true);setError('');try{const r=await api(`/clouds/${cloud.id}/do/${op}`,send('POST',payload()));onDone(r.task?`${spec.title}已提交，任务 #${r.task}`:r.added_ipv6?.length?`已添加 IPv6：${r.added_ipv6.join('、')}`:`${spec.title}已完成`);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 const vpcLookup={options:vpcs.options,error:vpcs.error};
 const subject=op==='group_delete'&&row?'IP 组 #'+row.id+' · '+((row.rows as Row[]|undefined)||[]).map(r=>r.address).join('、'):row&&!['group_bw','group_ip','ip_add','group_add'].includes(op)?(['disk_delete','disk_edit'].includes(op)?(row.name||'#'+row.id)+' · '+row.size+' GB':row.address):null;
 let form:ReactNode=null;
 if(op==='rescue')form=<><Field label="救援系统类型"><Choice aria-label="救援系统类型" value={v.type} onChange={e=>set('type')(e.target.value)}><option value="0">跟随实例系统</option><option value="2">Linux</option><option value="1">Windows 中文版</option><option value="3">Windows 英文版</option></Choice></Field><PasswordField label="临时密码（可选）" value={v.temp_pass} onChange={set('temp_pass')} hint="留空则使用实例当前密码登录救援系统。"/></>;
 if(op==='reinstall')form=<><ImagePicker value={v.os} onChange={set('os')} lookup={images} emptyText="该节点暂无可用镜像" hint="仅列出实例所在节点上可用的镜像。"/><div className="batch-grid batch-row"><Field label="登录方式"><Choice aria-label="登录方式" value={v.password_type} onChange={e=>set('password_type')(e.target.value)}><option value="0">密码</option><option value="1">SSH 密钥</option></Choice></Field>{v.password_type==='1'?<Select label="SSH 密钥" value={v.ssh_key} onChange={set('ssh_key')} empty="请选择 SSH 密钥" hint="Windows 镜像不支持密钥登录。" lookup={keys}/>:<PasswordField label="新密码（可选）" value={v.password} onChange={set('password')} hint="留空由平台生成，重装后在“实例密码”查看。"/>}</div>{SHOW_APP_PRESETS&&<Select label="应用预设" value={v.app_preset_id} onChange={set('app_preset_id')} empty="不安装" lookup={presets}/>}<Flag checked={v.format_data_disk} onChange={set('format_data_disk')}>同时格式化数据盘</Flag></>;
 if(op==='password')form=<><PasswordField label="新密码" value={v.password} onChange={set('password')}/><Flag checked={v.reset_type} onChange={set('reset_type')}>在线重置（不关机，需 GuestAgent）</Flag></>;
 if(op==='config')form=<><div className="batch-grid"><Stepper label="CPU" unit="vCPU" value={v.cpu} onChange={set('cpu')} min={1} max={512} step={1}/><Stepper label="内存" unit="MB" value={v.memory_mb} onChange={set('memory_mb')} min={256} max={4194304} step={256}/></div><small className="batch-hint">当前 {cloud.cpu} vCPU / {cloud.memory!=null?Math.round(Number(cloud.memory)*1024)+' MB':'—'}；CPU 每档 1 vCPU，内存每档 256 MB（1 GB = 1024 MB）。</small></>;
 if(op==='bw')form=<div className="batch-grid"><NumberField label="下行带宽" unit="Mbps" value={v.in_bw} onChange={set('in_bw')}/><NumberField label="上行带宽" unit="Mbps" value={v.out_bw} onChange={set('out_bw')}/></div>;
 if(op==='flow_setting')form=<><div className="batch-grid"><NumberField label="流量限额" unit="GB" value={v.traffic_quota} onChange={set('traffic_quota')} placeholder="0 表示不限"/><Field label="统计方向"><Choice aria-label="统计方向" value={v.traffic_type} onChange={e=>set('traffic_type')(e.target.value)}><option value="3">进出合计</option><option value="1">仅进流量</option><option value="2">仅出流量</option></Choice></Field></div><Field label="统计策略"><Choice aria-label="统计策略" value={v.flow_strategy} onChange={e=>set('flow_strategy')(e.target.value)}><option value="cycle">按周期重置</option><option value="statistics">统计使用总量</option></Choice></Field>{v.flow_strategy==='cycle'&&<div className="batch-grid"><Field label="重置周期"><Choice aria-label="重置周期" value={v.flow_reset_cycle} onChange={e=>set('flow_reset_cycle')(e.target.value)}><option value="month">每自然月</option><option value="day">按天数</option></Choice></Field>{v.flow_reset_cycle==='day'?<NumberField label="周期天数" unit="天" value={v.flow_reset_cycle_num} onChange={set('flow_reset_cycle_num')}/>:<NumberField label="每月重置日" value={v.reset_flow_day} onChange={set('reset_flow_day')} placeholder="1～31"/>}</div>}</>;
 if(toVpc)form=<><Select label="VPC 网络" value={v.vpc} onChange={set('vpc')} empty="新建 VPC 网络" lookup={vpcLookup}/>{!v.vpc&&<TextField value={v.vpc_ips} onChange={set('vpc_ips')} className="batch-field"><Label>新建网段</Label><Input placeholder="例如 192.168.10.0/24" spellCheck={false}/></TextField>}</>;
 if(op==='network_type'&&cloud.network_type==='vpc')form=<p className="field-help">将从 VPC 网络（{cloud.vpc_name||'当前 VPC'}）切换回经典网络。</p>;
 if(op==='ip_num')form=<div className="batch-grid"><NumberField label="IPv4 数量" value={v.num} onChange={set('num')} placeholder="目标数量"/><Select label="IP 分组" value={v.ip_group} onChange={set('ip_group')} empty="自动分配" lookup={groups}/></div>;
 if(op==='ipv6_add')form=<NumberField label="添加数量" value={v.num} onChange={set('num')} placeholder="1～1000"/>;
 if(op==='group_bw')form=<><div className="batch-grid"><NumberField label="下行带宽" unit="Mbps" value={v.in_bw} onChange={set('in_bw')}/><NumberField label="上行带宽" unit="Mbps" value={v.out_bw} onChange={set('out_bw')}/></div><small className="batch-hint">IP 组 #{row?.id}，当前下行 {row?.in_bw} / 上行 {row?.out_bw} Mbps。</small></>;
 if(op==='group_ip')form=ipOptions.error?<ErrorBox message={ipOptions.error}/>:!ipOptions.segments?<p className="batch-hint">正在读取可选 IP…</p>:<Field label={'IP 组 #'+row?.id+' 更换后的 IP（已选 '+(v.group_ips as number[]).length+' 个）'} hint="可选的是这个组当前的 IP、空闲的普通 IP 和可用的弹性 IP；标“当前”的是组里现有的 IP。"><IpPicker label="更换后的 IP" segments={ipOptions.segments} value={v.group_ips as number[]} onChange={set('group_ips')}/></Field>;
 if(op==='ip_add')form=<Field label={'选择 IP（已选 '+(v.pick_ips as number[]).length+' 个）'} hint={`加入 IP 组 #${row?.id}（现有 ${row?.ips?.length??0} 个 IP，下行 ${row?.in_bw} / 上行 ${row?.out_bw} Mbps）。`}>{freeIps.error?<ErrorBox message={freeIps.error}/>:!freeIps.segments?<p className="batch-hint">正在读取可选 IP…</p>:!freeIps.segments.length?<p className="batch-hint">实例所在节点暂无空闲 IP。</p>:<IpPicker label="选择 IP" segments={freeIps.segments||[]} value={v.pick_ips as number[]} onChange={set('pick_ips')}/>}</Field>;
 if(op==='group_add')form=<><Field label={'选择 IP（已选 '+(v.pick_ips as number[]).length+' 个）'} hint="列出实例所在节点可分配的空闲 IP。">{freeIps.error?<ErrorBox message={freeIps.error}/>:!freeIps.segments?<p className="batch-hint">正在读取可选 IP…</p>:!freeIps.segments.length?<p className="batch-hint">实例所在节点暂无空闲 IP。</p>:<IpPicker label="选择 IP" segments={freeIps.segments||[]} value={v.pick_ips as number[]} onChange={set('pick_ips')}/>}</Field><div className="batch-grid"><NumberField label="进带宽（下行）" unit="Mbps" value={v.in_bw} onChange={set('in_bw')}/><NumberField label="出带宽（上行）" unit="Mbps" value={v.out_bw} onChange={set('out_bw')}/></div><small className="batch-hint">新 IP 组内的 IP 共用这组带宽。</small></>;
 if(op==='disk_add')form=<><div className="batch-grid"><NumberField label="容量" unit="GB" value={v.size} onChange={set('size')} placeholder="1～1048576"/><Select label="存储" value={v.store} onChange={set('store')} empty="请选择存储" lookup={stores}/></div><div className="batch-grid"><Field label="驱动"><Choice aria-label="驱动" value={v.driver} onChange={e=>set('driver')(e.target.value)}><option value="">平台默认</option><option value="virtio">virtio</option><option value="scsi">scsi</option><option value="sata">sata</option><option value="ide">ide</option></Choice></Field><Field label="缓存"><Choice aria-label="缓存" value={v.cache} onChange={e=>set('cache')(e.target.value)}><option value="">平台默认</option><option value="none">none</option><option value="writethrough">writethrough</option><option value="writeback">writeback</option><option value="directsync">directsync</option></Choice></Field></div></>;
 if(op==='disk_edit')form=<><NumberField label="容量" unit="GB" value={v.size} onChange={set('size')}/><small className="batch-hint">当前 {row?.size} GB，容量只能扩大。</small><div className="batch-grid batch-grid-3"><Field label="驱动"><Choice aria-label="驱动" value={v.driver} onChange={e=>set('driver')(e.target.value)}><option value="">不修改{row?.driver?'（'+row.driver+'）':''}</option><option value="virtio">virtio</option><option value="scsi">scsi</option><option value="sata">sata</option><option value="ide">ide</option></Choice></Field><Field label="缓存"><Choice aria-label="缓存" value={v.cache} onChange={e=>set('cache')(e.target.value)}><option value="">不修改{row?.cache?'（'+row.cache+'）':''}</option><option value="none">none</option><option value="writethrough">writethrough</option><option value="writeback">writeback</option><option value="directsync">directsync</option></Choice></Field><Field label="IO 模式"><Choice aria-label="IO 模式" value={v.io} onChange={e=>set('io')(e.target.value)}><option value="">不修改{row?.io?'（'+row.io+'）':''}</option><option value="native">native</option><option value="threads">threads</option></Choice></Field></div></>;
 if(op==='disk_compress')form=<Field label="压缩的磁盘" hint="全部勾选时，由平台压缩实例的全部本地和 CEPH 磁盘。"><div className="disk-pick">{((cloud.disk||[]) as Row[]).map(d=>{const id=Number(d.id),on=(v.disk_ids as number[]).includes(id);return <Checkbox key={id} isSelected={on} onChange={x=>set('disk_ids')(x?[...(v.disk_ids as number[]),id]:(v.disk_ids as number[]).filter(n=>n!==id))}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Label>{d.remarks||d.name||'#'+id}<small> · {d.type==='system'||d.dev==='vda'?'系统盘':'数据盘'} · {d.size} GB</small></Label></Checkbox.Content></Checkbox>;})}</div></Field>;
 if(op==='disconnect')form=<Flag checked={v.lock} onChange={set('lock')}>锁定断网（只能手动恢复）</Flag>;
 const Icon=spec.tone==='normal'?CircleAlert:TriangleAlert;
 return <Dialog wide={['reinstall','flow_setting','disk_add','disk_edit','group_ip','ip_add','group_add'].includes(op)} title={spec.title} onClose={()=>{if(!busy)onClose();}} footer={<><Button variant="outline" isDisabled={busy} onPress={onClose}>取消</Button><Button variant={spec.tone==='danger'?'danger':'primary'} isPending={busy} isDisabled={busy||Boolean(missing)} onPress={run}>{busy?'正在提交…':'确认'+spec.title}</Button></>}>
  <div className="batch-dialog">
   {subject&&<div className="batch-chips"><span className="batch-chip mono">{subject}</span></div>}
   <div className={'batch-note tone-'+spec.tone}><Icon size={16}/><span>{spec.note}</span></div>
   {form&&<div className="batch-form">{form}</div>}
   {missing&&<small className="batch-hint">{missing}</small>}
   {error&&<ErrorBox message={error}/>}
  </div>
 </Dialog>;
}

/** 实例日志: the platform's per-instance operation log. */
export function InstanceLogs({id,onClose}:{id:string|number;onClose:()=>void}){
 const [page,setPage]=useState(1),[data,setData]=useState<{data:Row[];meta:Row}|null>(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setData(null);setError('');api(`/clouds/${id}/logs?page=${page}`).then(r=>{if(active)setData(r);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[id,page]);
 const pages=data?.meta?.total_pages||1;
 return <Dialog wide title="实例日志" onClose={onClose} footer={<div className="log-pager"><span>第 {page} / {pages} 页</span><Button variant="outline" size="sm" isDisabled={page<=1} onPress={()=>setPage(p=>p-1)}>上一页</Button><Button variant="outline" size="sm" isDisabled={page>=pages} onPress={()=>setPage(p=>p+1)}>下一页</Button></div>}>
  {error?<ErrorBox message={error}/>:!data?<FormSkeleton rows={5}/>:!data.data.length?<Empty kind="log" size="sm" title="暂无日志" text="这台实例的操作记录会显示在这里。"/>:<ul className="log-list">{data.data.map(l=><li key={l.id}><div><strong>{l.des}</strong><small>{l.username||'系统'}{l.ip?' · '+l.ip:''}</small></div><time>{date(l.create_time)}</time></li>)}</ul>}
 </Dialog>;
}
