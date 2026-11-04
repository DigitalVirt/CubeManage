import {useEffect,useState,type ReactNode} from 'react';
import {Button,Skeleton,Table,Tooltip} from '@heroui/react';
import {Link,useNavigate} from 'react-router-dom';
import {Clipboard,ClipboardCheck,Cpu,HardDrive,List,MemoryStick,RefreshCw,Server,Settings2} from 'lucide-react';
import {api,date,label,PAGE_TITLE_EVENT,type Row} from '../lib/api';
import {CountryFlag} from './CountryFlag';
import {StatusIcon,healthStatus,cloudStatus} from './StatusIcon';
import {ErrorBox,Empty} from './Shared';
import {copyText} from './CloudCells';

/**
 * 节点详情页（/nodes/:id）。数据来自 GET /api/nodes/:id/overview，它合并了平台的三个接口：
 * 节点详情 v1/nodes/:id、节点内容页 v1/node_info/:id、节点实时数据 v1/nodes/:id/real_data。
 * 下方列出这个节点上的实例（v1/clouds?node=），可跳到实例列表查看全部。
 */
type Overview={node:Row;info:Row|null;real:Row|null;errors?:{info?:string;real?:string}};

const types:Record<string,string>={host:'KVM 加强版',lightHost:'KVM 轻量版',hyperv:'Hyper-V',adsl:'拨号云'};
const licenseModes:Record<string,string>={controller_proxy:'主控代理',node_self:'节点自行授权'};
const storeRules:Record<string,string>={'0':'最高剩余容量','1':'实例数量最少'};
const ksmSpeeds:Record<string,string>={'10':'极快','30':'快','60':'一般','90':'慢','120':'非常慢'};
/** 0–100 的百分比；“45%”、“45.6”都认，没有或小于 0（平台用 -1 表示未获取）时为 null。 */
const pct=(v:unknown)=>{if(v==null||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)&&n>=0?Math.min(100,n):null;};
const onOff=(v:unknown,on='开启',off='关闭')=>v==null||v===''?'—':Number(v)===1?on:off;
const text=(v:unknown)=>v==null||v===''?'—':String(v);

function Card({className='',title,icon,actions,children}:{className?:string;title?:ReactNode;icon?:ReactNode;actions?:ReactNode;children:ReactNode}){
 return <section className={'inst-card '+className}>{(title||actions)&&<header className="inst-card-head"><h2>{icon}{title}</h2>{actions&&<div className="inst-card-actions">{actions}</div>}</header>}{children}</section>;
}
function Copy({value,what}:{value:string;what:string}){
 const [done,setDone]=useState(false);
 return <Button variant="ghost" size="sm" isIconOnly className="inst-icon-btn" aria-label={'复制'+what} onPress={async()=>{if(await copyText(value)){setDone(true);setTimeout(()=>setDone(false),1500);}}}>{done?<ClipboardCheck size={15}/>:<Clipboard size={15}/>}</Button>;
}
/** 用量条：标题、百分比，下方一行“已用 / 总量”和补充说明。 */
function Meter({title,value,used,total,note}:{title:string;value:number|null;used?:ReactNode;total?:ReactNode;note?:ReactNode}){
 const level=value==null?'':value>=90?' is-critical':value>=80?' is-high':'';
 return <div className={'nd-meter'+level}>
  <div className="nd-meter-head"><span>{title}</span><strong className="num">{value==null?'—':+value.toFixed(value<10?1:0)+'%'}</strong></div>
  <span className="nd-meter-track" role="meter" aria-label={title+'使用率'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value??0}><i style={{width:(value??0)+'%'}}/></span>
  {(used!=null||note!=null)&&<div className="nd-meter-foot num">{used!=null&&<span>{used}{total!=null&&<> / {total}</>}</span>}{note!=null&&<span>{note}</span>}</div>}
 </div>;
}
function Kv({items}:{items:[string,ReactNode][]}){return <dl className="inst-kv nd-kv">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;}
const sk=(w:string)=><Skeleton className="sk-bar" style={{width:w}}/>;

export function NodeDetail({id,onClose}:{id:string;onClose:()=>void}){
 const go=useNavigate();
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[rev,setRev]=useState(0),[busy,setBusy]=useState(false);
 const [area,setArea]=useState<Row|null>(null);
 const [clouds,setClouds]=useState<{rows:Row[];total:number}|null>(null),[cloudsError,setCloudsError]=useState('');
 useEffect(()=>{let on=true;setBusy(true);setError('');
  api<Overview>(`/nodes/${id}/overview`).then(r=>{if(on)setData(r);}).catch(e=>{if(on)setError((e as Error).message);}).finally(()=>{if(on)setBusy(false);});
  return()=>{on=false;};},[id,rev]);
 useEffect(()=>{let on=true;setCloudsError('');
  api(`/resources/clouds?node=${id}&per_page=10`).then(r=>{if(on)setClouds({rows:r.data||[],total:Number(r.meta?.total)||0});}).catch(e=>{if(on)setCloudsError((e as Error).message);});
  return()=>{on=false;};},[id,rev]);
 const n=data?.node||{},info=data?.info||{},real=data?.real||{};
 const areaId=n.area_id??info.area?.id;
 useEffect(()=>{if(areaId==null)return;let on=true;api(`/resources/areas/${areaId}`).then(r=>{if(on)setArea(r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r);}).catch(()=>{});return()=>{on=false;};},[areaId]);
 useEffect(()=>{if(n.name)window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT,{detail:{path:window.location.pathname,title:n.name+' - 节点详情'}}));},[n.name]);

 const crumb=<div className="section-kicker inst-crumb"><Button variant="ghost" size="sm" className="crumb-link" onPress={onClose}>节点管理</Button><span>/</span><span>节点详情 #{id}</span></div>;
 if(error&&!data)return <section className="inst-page">{crumb}<ErrorBox message={error} retry={()=>setRev(v=>v+1)}/></section>;
 if(!data)return <NodeSkeleton crumb={crumb}/>;

 const spec=healthStatus(n.status);
 const cpu=real.cpu_info||{},load=real.cpu_load||{},mem=real.memory||{},swap=real.swap||{};
 const disks:Row[]=Array.isArray(real.disk)?real.disk:[];
 const count=info.count||{};
 const ipUsed=Number(count.ip_used),ipTotal=Number(count.ip_total);
 const hosts=count.host??n.cloud_num;
 const maxCpu=Number(info.max_cpu??n.max_cpu),maxMem=Number(info.max_memory??n.max_memory);
 const macs:string[]=Array.isArray(n.gateway_mac)?n.gateway_mac:Array.isArray(info.gateway_mac)?info.gateway_mac:[];
 const qemu=info.default_qemu_version_show||info.default_qemu_version;

 return <section className="inst-page nd-page">
  {crumb}
  <header className="inst-card inst-hero">
   <div className="inst-os" aria-hidden="true"><Server size={28}/></div>
   <div className="inst-hero-main">
    <div className="inst-title"><h1>{n.name||'节点 #'+id}</h1>{n.type&&<span className="inst-spec">{types[n.type]||n.type}</span>}</div>
    <div className="inst-pills">
     <span className="inst-pill" style={{color:spec.color}}><StatusIcon spec={spec} size={16}/>{spec.title}</span>
     {Number(n.enable)===0&&<span className="inst-pill nd-warn">已禁用</span>}
     {Number(n.maintenance_mode)===1&&<span className="inst-pill nd-warn">维护模式</span>}
     {Number(n.evacuate??info.evacuate)===1&&<span className="inst-pill nd-warn">正在疏散</span>}
     {n.ip&&<span className="inst-pill mono">{n.ip}{n.port?':'+n.port:''}<Copy value={String(n.ip)} what="节点 IP"/></span>}
     <span className="inst-pill"><CountryFlag code={area?.country_code} name={area?.country_name||n.area_name}/>{n.area_name||area?.name||'—'}{(n.group_name||info.group_name)&&<span className="group-tag">{n.group_name||info.group_name}</span>}</span>
    </div>
   </div>
   <div className="inst-hero-actions">
    <Button variant="outline" isDisabled={busy} onPress={()=>setRev(v=>v+1)}><RefreshCw size={16}/>刷新数据</Button>
    <Button onPress={()=>go(`/clouds?node=${id}${areaId!=null?'&area='+areaId:''}`)}><List size={16}/>查看节点实例</Button>
   </div>
  </header>

  <Card className="inst-facts nd-facts">
   <dl>
    <div><dt>节点 ID</dt><dd className="inst-secret"><span className="num">{n.id??id}</span><Copy value={String(n.id??id)} what="节点 ID"/></dd></div>
    <div><dt>实例数量</dt><dd className="num">{text(hosts)}</dd></div>
    <div><dt>IP 使用</dt><dd className="num">{Number.isFinite(ipTotal)&&ipTotal>0?<>{Number.isFinite(ipUsed)?ipUsed:'—'} / {ipTotal}</>:'—'}</dd></div>
    <div><dt>运行时间</dt><dd>{text(real.uptime)}</dd></div>
    <div><dt>创建时间</dt><dd className="num">{n.create_time?date(n.create_time):'—'}</dd></div>
    <div><dt>更新时间</dt><dd className="num">{n.update_time?date(n.update_time):'—'}</dd></div>
   </dl>
  </Card>

  {data.errors?.real&&<ErrorBox message={'实时数据获取失败：'+data.errors.real}/>}
  <div className="nd-grid">
   <Card title="CPU" icon={<Cpu size={16}/>} className="nd-card">
    <div className="nd-body">
     <Meter title="CPU 使用率" value={pct(real.cpu_use_percent)} note={real.io_wait!=null?'IO 等待 '+real.io_wait+'%':undefined}/>
     <Kv items={[
      ['型号',<span className="nd-model">{text(cpu.model_name)}</span>],
      ['核心 / 线程',cpu.cores!=null||cpu.threads!=null?<span className="num">{text(cpu.cores)} 核 / {text(cpu.threads)} 线程{cpu.sockets?` · ${cpu.sockets} 路`:''}</span>:'—'],
      ['负载（1 / 5 / 15 分钟）',<span className="num">{[load['1min'],load['5min'],load['15min']].map(text).join(' / ')}</span>],
      ['已分配 vCPU',<span className="num">{text(info.assign_cpu)}{maxCpu>0?' / 限额 '+maxCpu:''}</span>]
     ]}/>
    </div>
   </Card>
   <Card title="内存" icon={<MemoryStick size={16}/>} className="nd-card">
    <div className="nd-body">
     <Meter title="内存使用率" value={pct(mem.use_percent)} used={text(mem.use_memory)} total={text(mem.total_memory)}/>
     <Meter title="Swap 使用率" value={pct(swap.swap_use_percent)} used={text(swap.use_swap)} total={text(swap.total_swap)}/>
     <Kv items={[
      ['KSM 共享',<span className="num">{text(mem.ksm_share_memory)}</span>],
      ['已分配内存',<span className="num">{text(info.assign_memory)}{maxMem>0?' / 限额 '+maxMem+' GB':''}</span>]
     ]}/>
    </div>
   </Card>
   <Card title="磁盘" icon={<HardDrive size={16}/>} className="nd-card nd-disks">
    <div className="nd-body">
     {disks.length?disks.map((d,i)=><Meter key={(d.mount_point||d.dev_name||'')+i} title={d.mount_point||d.dev_name||'磁盘 '+(i+1)} value={pct(d.disk_percent)} used={text(d.disk_use)} total={text(d.disk_total)} note={d.dev_name&&d.mount_point?d.dev_name:undefined}/>)
      :<p className="nd-empty">{data.errors?.real?'—':'平台没有返回磁盘数据'}</p>}
    </div>
   </Card>
  </div>

  <Card title="节点信息" icon={<Settings2 size={16}/>} className="nd-info">
   <Kv items={[
    ['内核版本',<span className="mono">{text(real.kernel_version)}</span>],
    ['QEMU 版本',<span className="mono">{text(real.qemu_version)}{qemu&&qemu!==real.qemu_version?' · 默认 '+qemu:''}</span>],
    ['节点时间',<span className="num">{text(real.time)}</span>],
    ['授权方式',licenseModes[n.license_mode]||text(n.license_mode)],
    ['节点启用',onOff(n.enable,'启用','禁用')],
    ['维护模式',onOff(n.maintenance_mode)],
    ['开机自动启动实例',onOff(n.auto_boot_host)],
    ['节点疏散',onOff(n.evacuate??info.evacuate,'正在疏散','未启用')],
    ['单 IP 建站',onOff(n.single_ip_nat,'支持','不支持')],
    ['NAT 端口范围',<span className="mono">{text(n.nat_port_range??info.nat_port_range)}</span>],
    ['本地存储使用',storeRules[String(n.choose_store_rule)]||text(n.choose_store_rule)],
    ['内存回收',info.ksm_recycle_speed!=null?`${ksmSpeeds[String(info.ksm_recycle_speed)]||info.ksm_recycle_speed} · 超过 ${text(info.ksm_recycle_start_percent)}% 开始`:'—'],
    ['DNS',<span className="mono">{[n.dns1,n.dns2].filter(Boolean).join('  ')||'—'}</span>],
    ['备份路径',<span className="mono">{n.backup_path||info.backup_path||'默认（存储设置）'}</span>],
    ['Trunk / VLAN',<span className="mono">{onOff(n.trunk??info.trunk,'Trunk','否')}{(n.vlan||info.vlan)?' · '+(n.vlan||info.vlan):''}</span>],
    ['GPU',<span className="num">{Number(n.gpu_num??info.gpu_num)>0?`${text(n.gpu_num_used??info.gpu_num_used)} / ${n.gpu_num??info.gpu_num} 已用`:'无'}</span>],
    ['网关 MAC',<span className="mono">{macs.length?macs.join('  '):'—'}</span>],
    ['备注',text(info.remark)]
   ]}/>
  </Card>

  <section className="inst-section">
   <header className="inst-section-head"><h2><Server size={16}/>节点上的实例{clouds?<small className="nd-count num">{clouds.total}</small>:null}</h2>
    {clouds&&clouds.total>clouds.rows.length&&<Link className="owner-count-link" to={`/clouds?node=${id}${areaId!=null?'&area='+areaId:''}`}>查看全部 {clouds.total} 台</Link>}</header>
   {cloudsError?<ErrorBox message={cloudsError} retry={()=>setRev(v=>v+1)}/>
    :!clouds?<div className="nd-sk-table">{sk('100%')}{sk('100%')}{sk('100%')}</div>
    :!clouds.rows.length?<Empty kind="instance" size="sm" title="这个节点上还没有实例" text="在这个节点上创建的实例会显示在这里。"/>
    :<Table><Table.ScrollContainer><Table.Content aria-label="节点上的实例" className="nd-clouds"><Table.Header>
      <Table.Column>状态</Table.Column><Table.Column isRowHeader>实例</Table.Column><Table.Column>主 IP</Table.Column><Table.Column>配置</Table.Column><Table.Column>创建时间</Table.Column>
     </Table.Header><Table.Body>{clouds.rows.map(c=>{const s=cloudStatus(c.status);return <Table.Row key={c.id}>
      <Table.Cell><Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={s.title} className="nd-state"><StatusIcon spec={s} size={18}/></Tooltip.Trigger><Tooltip.Content>{s.title}</Tooltip.Content></Tooltip></Table.Cell>
      <Table.Cell><div className="instance-cell"><Link className="instance-link" to={'/clouds/'+c.id}>{c.hostname||'#'+c.id}</Link><div className="instance-sub"><span className="num">#{c.id}</span>{(c.user?.username||c.username)&&<><span aria-hidden="true">·</span><span className="instance-owner">{c.user?.username||c.username}</span></>}</div></div></Table.Cell>
      <Table.Cell><span className="mono">{label(c.mainip)}</span></Table.Cell>
      <Table.Cell><span className="spec-cell">{label(c.cpu)}vCPU · {label(c.memory)}GB</span></Table.Cell>
      <Table.Cell><span className="num">{c.create_time?date(c.create_time):'—'}</span></Table.Cell>
     </Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
  </section>
 </section>;
}

function NodeSkeleton({crumb}:{crumb:ReactNode}){
 return <section className="inst-page nd-page" aria-busy="true" aria-label="正在加载节点详情">
  {crumb}
  <header className="inst-card inst-hero"><div className="inst-os"><Server size={28}/></div><div className="inst-hero-main">{sk('12rem')}{sk('20rem')}</div></header>
  <Card className="inst-facts nd-facts"><dl>{['节点 ID','实例数量','IP 使用','运行时间','创建时间','更新时间'].map(t=><div key={t}><dt>{t}</dt><dd>{sk('6rem')}</dd></div>)}</dl></Card>
  <div className="nd-grid">{['CPU','内存','磁盘'].map(t=><Card key={t} title={t} className="nd-card"><div className="nd-body">{sk('100%')}{sk('80%')}{sk('60%')}</div></Card>)}</div>
 </section>;
}
