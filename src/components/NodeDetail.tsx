import {useEffect,useState,type ReactNode} from 'react';
import {Button,Skeleton,Switch,Tooltip} from '@heroui/react';
import {useNavigate} from 'react-router-dom';
import {Clipboard,ClipboardCheck,List,RefreshCw} from 'lucide-react';
import {api,send,PAGE_TITLE_EVENT,type Row} from '../lib/api';
import {CountryFlag} from './CountryFlag';
import {StatusIcon,healthStatus} from './StatusIcon';
import {ErrorBox,type Notify} from './Shared';
import {copyText} from './CloudCells';
import {Choice} from './Controls';
import {ZoomChart} from './ZoomChart';
import {RangePicker,type Range} from './RangePicker';
import {DailyBars} from './DailyBars';

/**
 * 节点详情页（/nodes/:id）。数据来自 GET /api/nodes/:id/overview，它合并了平台的三个接口：
 * 节点详情 v1/nodes/:id、节点内容页 v1/node_info/:id、节点实时数据 v1/nodes/:id/real_data。
 * 布局：头部卡片（状态、节点 IP、信息带）→ 一行两张无标题卡片（左：系统信息；右：两列用量格，含各磁盘）→ 图表（一行两张，可缩放，时间范围可选）。节点上的实例在实例列表里看（顶部“查看节点实例”）。
 */
type Overview={node:Row;info:Row|null;real:Row|null;state?:{status?:unknown;msg?:string;version?:string}|null;errors?:{info?:string;real?:string}};
type SwitchKey='maintenance_mode'|'enable'|'auto_boot_host';
const switchTitles:Record<SwitchKey,string>={maintenance_mode:'维护模式',enable:'节点启用',auto_boot_host:'开机自启'};

const types:Record<string,string>={host:'KVM 加强版',lightHost:'KVM 轻量版',hyperv:'Hyper-V',adsl:'拨号云'};
/** 0–100 的百分比；“45%”、“45.6”都认，没有或小于 0（平台用 -1 表示未获取）时为 null。 */
const pct=(v:unknown)=>{if(v==null||v==='')return null;const n=Number(String(v).replace('%','').trim());return Number.isFinite(n)&&n>=0?Math.min(100,n):null;};
const text=(v:unknown)=>v==null||v===''?'—':String(v);

const BLUE='#2563eb',ORANGE='#f59e0b',GREEN='#16a34a';
const pctFmt=(v:number)=>+v.toFixed(v<10?1:0)+'%';
const sizeFmt=(v:number)=>{const u=['B','KB','MB','GB','TB','PB'];let i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return (i===0?Math.round(v):+v.toFixed(v<10?2:1))+' '+u[i];};
/** 网卡速率：平台给字节 / 秒，显示成 bps（和平台自己的图一致） */
const bpsFmt=(bytes:number)=>{let v=bytes*8;const u=['bps','Kbps','Mbps','Gbps','Tbps'];let i=0;while(v>=1000&&i<u.length-1){v/=1000;i++;}return (v>=100||i===0?Math.round(v):+v.toFixed(2))+' '+u[i];};
const countFmt=(unit:string)=>(v:number)=>(v>=1e6?+(v/1e6).toFixed(2)+'M':v>=1e4?+(v/1e3).toFixed(1)+'K':+v.toFixed(v<10?1:0))+(unit?' '+unit:'');
/** 同一列既可能是百分比也可能是字节：最大值不超过 100 按百分比，否则按容量 */
const autoFmt=(values:number[][])=>Math.max(0,...values.flat())>100?sizeFmt:pctFmt;
type Charts={start:number;end:number;devs:{disk:string[];net:string[];io:string[]};devError?:string}&Record<'cpu'|'disk'|'net'|'pps'|'io',{points:number[][];error?:string;dev?:string|null}>;
const col=(points:number[][],i:number)=>points.map(p=>Number(p[i])||0);

function Card({className='',title,icon,actions,children}:{className?:string;title?:ReactNode;icon?:ReactNode;actions?:ReactNode;children:ReactNode}){
 return <section className={'inst-card '+className}>{(title||actions)&&<header className="inst-card-head"><h2>{icon}{title}</h2>{actions&&<div className="inst-card-actions">{actions}</div>}</header>}{children}</section>;
}
function Copy({value,what}:{value:string;what:string}){
 const [done,setDone]=useState(false);
 return <Button variant="ghost" size="sm" isIconOnly className="inst-icon-btn" aria-label={'复制'+what} onPress={async()=>{if(await copyText(value)){setDone(true);setTimeout(()=>setDone(false),1500);}}}>{done?<ClipboardCheck size={15}/>:<Clipboard size={15}/>}</Button>;
}
/** 右侧用量格：左边标题，右边百分比和用量（如“82% · 418G / 512G”），字号与左边标题一致；有百分比时下方是用量条。 */
function Stat({title,sub,value,text:shown,amount}:{title:string;sub?:string;value?:number|null;text?:ReactNode;amount?:string}){
 const isPct=value!==undefined,level=value==null?'':value>=90?' is-critical':value>=80?' is-high':'';
 return <div className={'nd-stat'+level}>
  <div className="nd-stat-head"><span>{title}{sub&&<small> · {sub}</small>}</span><strong className="num">{isPct?(value==null?'—':+value.toFixed(value<10?1:0)+'%'):shown}{amount&&<small> · {amount}</small>}</strong></div>
  {isPct&&<span className="nd-meter-track" role="meter" aria-label={title} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value??0}><i style={{width:(value??0)+'%'}}/></span>}
 </div>;
}
function Kv({items}:{items:[string,ReactNode][]}){return <dl className="inst-kv nd-kv">{items.map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;}
const sk=(w:string)=><Skeleton className="sk-bar" style={{width:w}}/>;

export function NodeDetail({id,onClose,notify}:{id:string;onClose:()=>void;notify?:Notify}){
 const go=useNavigate();
 const [data,setData]=useState<Overview|null>(null),[error,setError]=useState(''),[rev,setRev]=useState(0),[busy,setBusy]=useState(false);
 const [area,setArea]=useState<Row|null>(null);
 // 开关：点一下就提交（PUT /api/nodes/:id/switch），成功后以新值显示，失败时恢复并提示。
 // 图表：最近 3 天；磁盘、网卡、磁盘 IO 可以切换设备
 const [charts,setCharts]=useState<Charts|null>(null),[chartsError,setChartsError]=useState(''),[devSel,setDevSel]=useState<{disk:string;net:string;io:string}>({disk:'',net:'',io:''});
 // 时间范围（所有图表共用）：null = 最近 3 天
 const [range,setRange]=useState<Range>(null);
 const [daily,setDaily]=useState<{start:number;end:number;net:string|null;nets:string[];data:{day:string;in:number;out:number}[]}|null>(null),[dailyError,setDailyError]=useState(''),[dailyNet,setDailyNet]=useState('');
 const [switches,setSwitches]=useState<Partial<Record<SwitchKey,number>>>({}),[saving,setSaving]=useState<SwitchKey|null>(null);
 useEffect(()=>{let on=true;setBusy(true);setError('');
  api<Overview>(`/nodes/${id}/overview`).then(r=>{if(on)setData(r);}).catch(e=>{if(on)setError((e as Error).message);}).finally(()=>{if(on)setBusy(false);});
  return()=>{on=false;};},[id,rev]);
 const rangeQuery:Record<string,string>=range?{st:String(Math.round(range.st)),et:String(Math.round(range.et))}:{days:'3'};
 useEffect(()=>{let on=true;setChartsError('');const q=new URLSearchParams({...rangeQuery,...Object.fromEntries(Object.entries(devSel).filter(([,v])=>v))});
  api<Charts>(`/nodes/${id}/charts?${q}`).then(r=>{if(on)setCharts(r);}).catch(e=>{if(on)setChartsError((e as Error).message);});return()=>{on=false;};},[id,rev,devSel,range]);
 useEffect(()=>{let on=true;setDailyError('');const q=new URLSearchParams({...rangeQuery,tz:String(new Date().getTimezoneOffset()),...(dailyNet?{net:dailyNet}:{})});
  api(`/nodes/${id}/daily_traffic?${q}`).then(r=>{if(on)setDaily(r);}).catch(e=>{if(on)setDailyError((e as Error).message);});return()=>{on=false;};},[id,rev,range,dailyNet]);
 const n=data?.node||{},info=data?.info||{},real=data?.real||{};
 const areaId=n.area_id??info.area?.id;
 useEffect(()=>{if(areaId==null)return;let on=true;api(`/resources/areas/${areaId}`).then(r=>{if(on)setArea(r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r);}).catch(()=>{});return()=>{on=false;};},[areaId]);
 useEffect(()=>{if(n.name)window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT,{detail:{path:window.location.pathname,title:n.name+' - 节点详情'}}));},[n.name]);

 const crumb=<div className="section-kicker inst-crumb"><Button variant="ghost" size="sm" className="crumb-link" onPress={onClose}>节点管理</Button><span>/</span><span>节点详情 #{id}</span></div>;
 if(error&&!data)return <section className="inst-page">{crumb}<ErrorBox message={error} retry={()=>setRev(v=>v+1)}/></section>;
 if(!data)return <NodeSkeleton crumb={crumb}/>;

 const spec=healthStatus(data.state?.status??n.status);
 const cpu=real.cpu_info||{},load=real.cpu_load||{},mem=real.memory||{},swap=real.swap||{};
 const disks:Row[]=Array.isArray(real.disk)?real.disk:[];
 const count=info.count||{};
 const ipUsed=Number(count.ip_used),ipTotal=Number(count.ip_total);
 const hosts=count.host??n.cloud_num;
 const maxCpu=Number(info.max_cpu??n.max_cpu),maxMem=Number(info.max_memory??n.max_memory);
 const qemu=info.default_qemu_version_show||info.default_qemu_version;

 const sw=(k:SwitchKey)=>Number(switches[k]??n[k])===1;
 async function toggle(k:SwitchKey,on:boolean){
  setSaving(k);setSwitches(v=>({...v,[k]:on?1:0}));
  try{await api(`/nodes/${id}/switch`,send('PUT',{field:k,value:on?1:0}));notify?.(`${switchTitles[k]}已${on?'开启':'关闭'}`);}
  catch(e){setSwitches(v=>({...v,[k]:on?0:1}));notify?.(`${switchTitles[k]}修改失败：${(e as Error).message}`,'danger');}
  finally{setSaving(null);}
 }
 const toggleCell=(k:SwitchKey)=><Switch size="sm" isSelected={sw(k)} isDisabled={saving!==null} onChange={v=>toggle(k,v)} aria-label={switchTitles[k]}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch>;
 const group=n.group_name||info.group_name;

 return <section className="inst-page nd-page">
  {crumb}
  <header className="inst-card nd-top">
   <div className="nd-head">
    <Tooltip delay={0}><Tooltip.Trigger tabIndex={0} aria-label={'节点状态：'+spec.title} className="nd-status"><StatusIcon spec={spec} size={36}/></Tooltip.Trigger><Tooltip.Content>{spec.title}{data.state?.msg?' · '+data.state.msg:''}</Tooltip.Content></Tooltip>
    <div className="nd-title"><h1 className="mono">{n.ip||'—'}{n.port&&Number(n.port)!==22?<small>:{n.port}</small>:null}</h1>{n.ip&&<Copy value={String(n.ip)} what="节点 IP"/>}</div>
    <div className="inst-hero-actions">
     <Button variant="outline" isDisabled={busy} onPress={()=>setRev(v=>v+1)}><RefreshCw size={16}/>刷新数据</Button>
     <Button onPress={()=>go(`/clouds?node=${id}${areaId!=null?'&area='+areaId:''}`)}><List size={16}/>查看节点实例</Button>
    </div>
   </div>
   <dl className="nd-strip">
    <div><dt>区域</dt><dd><CountryFlag code={area?.country_code} name={area?.country_name||n.area_name}/>{n.area_name||area?.name||'—'}</dd></div>
    <div><dt>节点名称</dt><dd>{text(n.name)}</dd></div>
    <div><dt>分组</dt><dd>{group?<span className="group-tag">{group}</span>:'—'}</dd></div>
    <div><dt>节点类型</dt><dd>{types[n.type]||text(n.type)}</dd></div>
    <div><dt>节点版本</dt><dd className="mono">{text(data.state?.version)}</dd></div>
    <div><dt>运行时间</dt><dd>{text(real.uptime)}</dd></div>
    <div><dt>开机自启</dt><dd>{toggleCell('auto_boot_host')}</dd></div>
    <div><dt>节点启用</dt><dd>{toggleCell('enable')}</dd></div>
    <div><dt>维护模式</dt><dd>{toggleCell('maintenance_mode')}</dd></div>
    <div><dt>实例数量</dt><dd className="num">{text(hosts)}</dd></div>
    <div><dt>IP 使用</dt><dd className="num">{Number.isFinite(ipTotal)&&ipTotal>0?<>{Number.isFinite(ipUsed)?ipUsed:'—'} / {ipTotal}</>:'—'}</dd></div>
   </dl>
  </header>

  {data.errors?.real&&<ErrorBox message={'实时数据获取失败：'+data.errors.real}/>}
  <div className="nd-pair">
   <Card className="nd-sys">
    <Kv items={[
     ['CPU 型号',<span className="nd-model">{text(cpu.model_name)}</span>],
     ['内核版本',<span className="mono">{text(real.kernel_version)}</span>],
     ['QEMU 版本',<span className="mono">{text(real.qemu_version)}{qemu&&qemu!==real.qemu_version?<small> · 默认 {qemu}</small>:null}</span>],
     ['运行时间 / 当前时间',<span className="num">{text(real.uptime)}<small> · {text(real.time)}</small></span>],
     ['使用内存 / 分配内存',<span className="num">{text(mem.use_memory)} / {text(info.assign_memory)}{mem.total_memory?<small> · 共 {mem.total_memory}{maxMem>0?'，限额 '+maxMem+' GB':''}</small>:null}</span>],
     ['分配核心数量',<span className="num">{text(info.assign_cpu)}{cpu.threads!=null||cpu.cores!=null?<small> · 共 {cpu.cores!=null?cpu.cores+' 核 ':''}{cpu.threads!=null?cpu.threads+' 线程':''}{maxCpu>0?'，限额 '+maxCpu:''}</small>:maxCpu>0?<small> · 限额 {maxCpu}</small>:null}</span>]
    ]}/>
   </Card>
   <Card className="nd-stats">
    <div className="nd-stat-grid">
     <Stat title="CPU 使用率" value={pct(real.cpu_use_percent)}/>
     <Stat title="Swap 使用率" value={pct(swap.swap_use_percent)} amount={swap.total_swap?`${text(swap.use_swap)} / ${swap.total_swap}`:undefined}/>
     <Stat title="平均负载" text={[load['1min'],load['5min'],load['15min']].map(text).join(' / ')}/>
     <Stat title="KSM 共享" text={text(mem.ksm_share_memory)}/>
     <Stat title="内存使用率" value={pct(mem.use_percent)} amount={mem.total_memory?`${text(mem.use_memory)} / ${mem.total_memory}`:undefined}/>
     <Stat title="IO 延迟" text={real.io_wait!=null&&real.io_wait!==''?real.io_wait+'%':'—'}/>
     {disks.map((d,i)=><Stat key={(d.mount_point||d.dev_name||'')+i} title={'硬盘 '+(d.mount_point||(disks.length>1?i+1:''))} value={pct(d.disk_percent)} amount={`${text(d.disk_use)} / ${text(d.disk_total)}`}/>)}
    </div>
   </Card>
  </div>

  {chartsError&&<ErrorBox message={'图表数据获取失败：'+chartsError} retry={()=>setRev(v=>v+1)}/>}
  <div className="nd-charts">
   {(()=>{const c=charts;const t=(k:keyof Charts&('cpu'|'disk'|'net'|'pps'|'io'))=>c?.[k]?.points.map(p=>p[0])||[];
    const devPick=(k:'disk'|'net'|'io',label:string)=>{const list=c?.devs?.[k]||[];return list.length>1?<Choice aria-label={'选择'+label} value={c?.[k]?.dev||''} onChange={e=>setDevSel(v=>({...v,[k]:e.target.value}))}>{list.map(d=><option key={d} value={d}>{d}</option>)}</Choice>:list.length===1?<span className="nd-dev mono">{list[0]}</span>:null;};
    const chart=(title:string,k:'cpu'|'disk'|'net'|'pps'|'io',series:{name:string;color:string;i:number}[],format:(v:number)=>string,actions?:ReactNode)=>{
     const pts=c?.[k]?.points||[];
     return <Card key={title} title={title} className="nd-chart" actions={actions}>
      {!c?<div className="nd-chart-sk">{sk('100%')}</div>:c[k]?.error?<p className="nd-empty nd-chart-msg">{c[k].error}</p>
       :<ZoomChart times={t(k)} series={series.map(s=>({name:s.name,color:s.color,values:col(pts,s.i)}))} format={format} label={title} rangeControl={picker}/>}
     </Card>;};
    const cpuPts=c?.cpu.points||[],diskPts=c?.disk.points||[];
    const picker=c?<RangePicker range={range} start={c.start} end={c.end} onChange={setRange}/>:null;
    return <>
     {chart('CPU 平均负载','cpu',[{name:'CPU',color:BLUE,i:1}],pctFmt)}
     {chart('内存用量','cpu',[{name:'内存',color:ORANGE,i:2}],autoFmt([col(cpuPts,2)]))}
     {chart('硬盘容量','disk',[{name:'已用',color:BLUE,i:1},...(diskPts.some(p=>p.length>2)?[{name:'总量',color:'#94a3b8',i:2}]:[])],autoFmt([col(diskPts,1),col(diskPts,2)]),devPick('disk','磁盘'))}
     {chart('网卡','net',[{name:'进',color:GREEN,i:1},{name:'出',color:BLUE,i:2}],bpsFmt,devPick('net','网卡'))}
     {chart('包转发率','pps',[{name:'进',color:GREEN,i:1},{name:'出',color:BLUE,i:2}],countFmt('pps'))}
     {chart('硬盘 IO','io',[{name:'读取',color:GREEN,i:1},{name:'写入',color:BLUE,i:2}],countFmt('IOPS'),devPick('io','磁盘'))}
     <Card title="用量排行" className="nd-chart nd-daily" actions={daily&&daily.nets.length>1?<Choice aria-label="选择网卡" value={daily.net||''} onChange={e=>setDailyNet(e.target.value)}>{daily.nets.map(d=><option key={d} value={d}>{d}</option>)}</Choice>:daily?.net?<span className="nd-dev mono">{daily.net}</span>:undefined}>
      {dailyError?<p className="nd-empty nd-chart-msg">{dailyError}</p>:!daily?<div className="nd-chart-sk">{sk('100%')}</div>
       :<DailyBars days={daily.data} format={sizeFmt} label="每天进出流量" rangeControl={<RangePicker range={range} start={daily.start} end={daily.end} onChange={setRange}/>}/>}
     </Card>
    </>;})()}
  </div>


 </section>;
}

function NodeSkeleton({crumb}:{crumb:ReactNode}){
 return <section className="inst-page nd-page" aria-busy="true" aria-label="正在加载节点详情">
  {crumb}
  <header className="inst-card nd-top"><div className="nd-head"><span className="nd-status">{sk('36px')}</span><div className="nd-title">{sk('12rem')}</div></div>
   <dl className="nd-strip">{['区域','节点名称','分组','节点类型','节点版本','运行时间','开机自启','节点启用','维护模式','实例数量','IP 使用'].map(t=><div key={t}><dt>{t}</dt><dd>{sk('5rem')}</dd></div>)}</dl></header>
  <div className="nd-pair"><Card className="nd-sys"><div className="nd-body nd-sk">{sk('100%')}{sk('90%')}{sk('80%')}{sk('70%')}</div></Card><Card className="nd-stats"><div className="nd-body nd-sk">{sk('100%')}{sk('100%')}{sk('100%')}</div></Card></div>
 </section>;
}
