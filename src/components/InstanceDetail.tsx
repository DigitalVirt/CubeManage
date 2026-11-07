import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {Button,Dropdown,Label,Skeleton,Spinner,Table,Tooltip} from '@heroui/react';
import {TableSkeleton} from './TableSkeleton';
import {ArrowDown,ArrowUp,List,Pencil,RefreshCcw,Shrink,ArrowDownUp,ArrowLeftRight,ChevronDown,CircleCheck,CircleDashed,Clipboard,ClipboardCheck,Cpu,Disc3,Eye,EyeOff,Gauge,Globe,HardDrive,KeyRound,LifeBuoy,Monitor,Network,PlugZap,Plus,Power,RefreshCw,RotateCcw,ScrollText,SlidersHorizontal,SquareTerminal,Star,Trash2,Unplug,Settings,Camera,Archive,CalendarClock} from 'lucide-react';
import {api,send,date,osIconUrl,PAGE_TITLE_EVENT,type Row} from '../lib/api';
import {Link} from 'react-router-dom';
import {CountryFlag} from './CountryFlag';
import {osName} from './CloudCells';
import {StatusIcon,cloudStatus} from './StatusIcon';
import {ErrorBox,Loading,Empty,Dialog,type Notify} from './Shared';
import {LineChart,Legend,clock,dayClock} from './LineChart';
import {Choice} from './Controls';
import {InstanceAction,InstanceLogs,type ActionTarget} from './InstanceActions';
import {SettingsDialog,SnapshotDialog,CronDialog} from './InstanceExtras';

const unwrap=(r:Row)=>r?.data&&!Array.isArray(r.data)&&r.id==null?r.data:r;
const BLUE='#2563eb',ORANGE='#f59e0b';
const ranges:[string,string][]=[['1h','1 小时'],['6h','6 小时'],['12h','12 小时'],['1d','1 天'],['7d','一周'],['15d','半月'],['30d','一月']];
const metrics:[string,string][]=[['cpu','CPU'],['memory','内存'],['network','网络'],['disk','磁盘'],['flow','流量']];
const pctFmt=(v:number)=>+v.toFixed(v<10?2:1)+'%';
const bytesRate=(v:number)=>{const u=['B/s','KB/s','MB/s','GB/s'];let i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return (i===0?Math.round(v):+v.toFixed(2))+' '+u[i];};
const bytes=(v:number)=>{const u=['B','KB','MB','GB','TB'];let i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return (i===0?Math.round(v):+v.toFixed(2))+' '+u[i];};
const GiB=1073741824;
/** net_info 的流量（字节）→ 自动单位，如 1.2 GB、356 MB；没有数据时为“—”。 */
const flowSize=(v:unknown)=>{const n=Number(v);if(v==null||v===''||!Number.isFinite(n))return '—';if(n<=0)return '0';const u=['B','KB','MB','GB','TB'];const i=Math.min(4,Math.floor(Math.log(n)/Math.log(1024)));const x=n/1024**i;return (x<10&&i?x.toFixed(1):Math.round(x))+' '+u[i];};
/** statistics(net_adapter) reports bytes per second; shown as bits per second like the platform's own chart. */
const bps=(bytes:number)=>{const b=bytes*8;const u=['bps','Kbps','Mbps','Gbps'];let i=0,v=b;while(v>=1000&&i<u.length-1){v/=1000;i++;}return (v>=100||i===0?Math.round(v):+v.toFixed(2))+' '+u[i];};
const mb=(v:number)=>v>=1024?+(v/1024).toFixed(2)+' GB':v>=1||v===0?+v.toFixed(2)+' MB':+(v*1024).toFixed(0)+' KB';
/** flow_data times are "Y-m-d H", "Y-m-d" or "Y-m" depending on the span. */
const flowTime=(s:unknown,i:number,start:number,step:number)=>{const t=String(s);const fixed=/^\d{4}-\d{2}-\d{2} \d{2}$/.test(t)?t+':00':/^\d{4}-\d{2}$/.test(t)?t+'-01':t;const n=Date.parse(fixed.replace(' ','T'));return Number.isFinite(n)?n:start+i*step;};
const powerItems:Record<string,string[]>={on:['off','reboot','hard_reboot','hardoff','suspend'],off:['on'],suspend:['unsuspend'],paused:['resume']};
const opTitles:Record<string,string>={on:'开机',off:'关机',reboot:'重启',hard_reboot:'硬重启',hardoff:'硬关机',suspend:'暂停',unsuspend:'解除暂停',resume:'解除挂起'};

function Card({className='',title,icon,actions,children}:{className?:string;title?:ReactNode;icon?:ReactNode;actions?:ReactNode;children:ReactNode}){
 return <section className={'inst-card '+className}>{(title||actions)&&<header className="inst-card-head"><h2>{icon}{title}</h2>{actions&&<div className="inst-card-actions">{actions}</div>}</header>}{children}</section>;
}
function CopyButton({text,label}:{text:()=>Promise<string>|string;label:string}){
 const [done,setDone]=useState(false);
 return <Button variant="ghost" size="sm" isIconOnly aria-label={label} className="inst-icon-btn" onPress={async()=>{try{await navigator.clipboard.writeText(await text());setDone(true);setTimeout(()=>setDone(false),1500);}catch{/* clipboard unavailable */}}}>{done?<ClipboardCheck size={15}/>:<Clipboard size={15}/>}</Button>;
}

export function InstanceDetail({id,onClose,notify}:{id:string|number;onClose:()=>void;notify?:Notify}){
 const [data,setData]=useState<Row|null>(null),[error,setError]=useState(''),[rev,setRev]=useState(0);
 // 当前任务: polled every 3 s while one is waiting or running, every 15 s otherwise (paused while the tab is hidden);
 // when it finishes the page reloads so status, IPs and disks catch up. Submitting an operation polls at once.
 const [task,setTask]=useState<Row|null>(null),[taskTick,setTaskTick]=useState(0);
 useEffect(()=>{let on=true,timer:ReturnType<typeof setTimeout>|undefined,had=false;
  const poll=async()=>{if(!on)return;if(document.hidden){timer=setTimeout(poll,5000);return;}
   try{const r=await api(`/clouds/${id}/active_task`);if(!on)return;const t=r.task||null;setTask(t);if(had&&!t)setRev(v=>v+1);had=Boolean(t);timer=setTimeout(poll,t?3000:15000);}
   catch{if(on)timer=setTimeout(poll,20000);}};
  poll();return()=>{on=false;clearTimeout(timer);};},[id,taskTick]);
 const [area,setArea]=useState<Row|null>(null),[node,setNode]=useState<Row|null>(null),[traffic,setTraffic]=useState<Row|null>(null),[cpuNow,setCpuNow]=useState<number|null>(null);
 const [net,setNet]=useState<Row|null>(null),[netError,setNetError]=useState('');
 const [metric,setMetric]=useState('cpu'),[diskDev,setDiskDev]=useState(''),[logRows,setLogRows]=useState<Row[]|null>(null),[logError,setLogError]=useState('');
 const [range,setRange]=useState('12h'),[charts,setCharts]=useState<Row|null>(null),[chartError,setChartError]=useState('');
 const [secret,setSecret]=useState<string|null>(null),[showSecret,setShowSecret]=useState(false);
 const [action,setAction]=useState<ActionTarget|null>(null),[logs,setLogs]=useState(false);
 const [ipList,setIpList]=useState<number|'v6'|null>(null);
 const [ips,setIps]=useState<Row|null>(null),[ipError,setIpError]=useState('');

 useEffect(()=>{let on=true;setError('');api(`/resources/clouds/${id}`).then(r=>{if(on)setData(unwrap(r));}).catch(e=>{if(on)setError(e.message);});return()=>{on=false;};},[id,rev]);
 useEffect(()=>{let on=true;
  api(`/clouds/${id}/traffic`).then(r=>{if(on)setTraffic(r);}).catch(()=>{if(on)setTraffic(null);});
  api('/clouds/metrics',send('POST',{id:[Number(id)]})).then(r=>{const list=Array.isArray(r)?r:r?.data||[];const m=list.find((x:Row)=>Number(x.id)===Number(id));if(on)setCpuNow(m&&Number(m.cpu_usage)>=0?Number(m.cpu_usage):null);}).catch(()=>{});
  setNetError('');api(`/clouds/${id}/network`).then(r=>{if(on)setNet(r);}).catch(e=>{if(on)setNetError(e.message);});
  setIpError('');api(`/clouds/${id}/ip_groups`).then(r=>{if(on)setIps(r);}).catch(e=>{if(on)setIpError(e.message);});
  return()=>{on=false;};},[id,rev]);
 useEffect(()=>{let on=true;setChartError('');setCharts(null);api(`/clouds/${id}/charts?range=${range}${diskDev?'&disk='+encodeURIComponent(diskDev):''}`).then(r=>{if(on)setCharts(r);}).catch(e=>{if(on)setChartError(e.message);});return()=>{on=false;};},[id,range,diskDev,rev]);
 useEffect(()=>{let on=true;setLogError('');api(`/clouds/${id}/logs?page=1`).then(r=>{if(on)setLogRows((r.data||[]).slice(0,8));}).catch(e=>{if(on)setLogError(e.message);});return()=>{on=false;};},[id,rev]);
 const areaId=data?.area_id,nodeId=data?.node_id;
 useEffect(()=>{if(areaId==null)return;let on=true;api(`/resources/areas/${areaId}`).then(r=>{if(on)setArea(unwrap(r));}).catch(()=>{});return()=>{on=false;};},[areaId]);
 useEffect(()=>{if(nodeId==null)return;let on=true;api(`/resources/nodes/${nodeId}`).then(r=>{if(on)setNode(unwrap(r));}).catch(()=>{});return()=>{on=false;};},[nodeId]);

 const r=data||{id};
 useEffect(()=>{if(r.hostname)window.dispatchEvent(new CustomEvent(PAGE_TITLE_EVENT,{detail:{path:window.location.pathname,title:r.hostname+' - 实例详情'}}));},[r.hostname]);
 const status=String(r.status??'');const spec=cloudStatus(status);
 const rescue=Number(r.rescue)===1||status==='rescue';
 const netType=(net?.network_type||r.network_type)==='vpc'?'vpc':'normal';
 const meta=traffic?.meta||{};const usedB=traffic?.info?.['30_day']?.total;const used=usedB!=null?Number(usedB)/GiB:null;
 const quota=Number(meta.total)===-1?null:Number(meta.total)>0?Number(meta.total):Number(meta.traffic_quota??r.traffic_quota)>0?Number(meta.traffic_quota??r.traffic_quota):null;
 const pct=used!=null&&quota?used/quota*100:null;
 const os=osName(r),icon=osIconUrl(r.svg);
 const [iconFailed,setIconFailed]=useState(false);

 async function password(){if(secret!=null)return secret;const p=await api(`/clouds/${id}/password`);setSecret(p.password||'');return p.password||'';}
 async function console_(){const w=window.open('','_blank');try{const res=await api(`/clouds/${id}/console`,send('POST',{}));if(w)w.location.href=res.url;else window.open(res.url,'_blank','noopener');}catch(e){w?.close();notify?.('无法打开终端：'+(e as Error).message,'danger');}}
 const open=(op:string,row?:Row)=>{setIpList(null);setAction({op,row});};
 // 设置 / 快照 / 备份 / 计划任务（InstanceExtras.tsx）
 const [extra,setExtra]=useState<'settings'|'snap'|'backup'|'cron'|null>(null);
 // IP groups (限速组) and IPv6: the IP section lists one row per group; the dialog lists a group's addresses.
 const groups:Row[]=[...(ips?.groups||[])].sort((a:Row,b:Row)=>Number(Number(b.id)===Number(ips?.default_group))-Number(Number(a.id)===Number(ips?.default_group))||Number(a.id)-Number(b.id)).map((g:Row,i:number)=>({...g,index:i,rows:(g.ips||[]).map((x:Row)=>({...x,address:x.ip,version:'v4'}))}));
 const v6:Row[]=(ips?.ipv6||[]).map((x:Row)=>({...x,address:x.ip,version:'v6'}));
 const lead=(rows:Row[])=>rows.find(x=>x.main)||rows[0];
 const privateIps:Row[]=((net?.rows||[]) as Row[]).filter(x=>x.version==='private');

 const net_=useMemo(()=>{const p:number[][]=charts?.network?.points||[];return {times:p.map(x=>x[0]),out:p.map(x=>x[2]),in:p.map(x=>x[1])};},[charts]);
 const cpu_=useMemo(()=>{const p:number[][]=charts?.cpu?.points||[];return {times:p.map(x=>x[0]),cpu:p.map(x=>x[1]),mem:p.map(x=>x[2])};},[charts]);
 const disk_=useMemo(()=>{const p:number[][]=charts?.disk?.points||[];return {times:p.map(x=>x[0]),read:p.map(x=>x[1]),write:p.map(x=>x[2])};},[charts]);
 const flow_=useMemo(()=>{const p:unknown[][]=charts?.flow?.points||[];const step=p.length>1?(charts!.end-charts!.start)/(p.length-1):3600000;return {times:p.map((x,i)=>flowTime(x[0],i,charts!.start,step)),send:p.map(x=>Number(x[2])),recv:p.map(x=>Number(x[1]))};},[charts]);
 const long=['7d','15d','30d'].includes(range);
 /** kvm_info's memory column: a percentage when it stays within 0–100, otherwise bytes. */
 const memFmt=Math.max(0,...cpu_.mem)>100?bytes:pctFmt;

 if(error&&!data)return <section className="inst-page"><Crumb onClose={onClose} id={id}/><ErrorBox message={error} retry={()=>setRev(v=>v+1)}/></section>;
 if(!data)return <DetailSkeleton onClose={onClose} id={id}/>;
 const powerKeys=powerItems[status]||Object.keys(opTitles);

 return <section className="inst-page">
  <Crumb onClose={onClose} id={id}/>
  <header className="inst-card inst-hero">
   <div className="inst-os" aria-hidden="true">{icon&&!iconFailed?<img src={icon} alt="" onError={()=>setIconFailed(true)}/>:<Monitor size={28}/>}</div>
   <div className="inst-hero-main">
    <div className="inst-title"><h1>{r.hostname||'实例 #'+id}</h1>{r.cpu!=null&&<span className="inst-spec">{r.cpu}vCPU · {r.memory}G</span>}</div>
    <div className="inst-pills">
     <span className="inst-pill" style={{color:spec.color}}><StatusIcon spec={spec} size={16}/>{spec.title}{rescue&&status!=='rescue'?' · 救援中':''}</span>
     {task&&<Tooltip delay={0}><Tooltip.Trigger><span className="inst-pill inst-task" role="status" aria-label={'当前任务：'+task.name+(Number(task.status)===1?'，进度 '+task.progress+'%':'，等待执行')}><Spinner size="sm" color="current"/><span className="inst-task-name">{task.name}</span>{Number(task.status)===1?<><span className="inst-task-bar" aria-hidden="true"><i style={{width:Math.max(4,Number(task.progress))+'%'}}/></span><span className="num">{task.progress}%</span></>:<span className="inst-task-wait">等待执行</span>}</span></Tooltip.Trigger><Tooltip.Content>任务 #{task.id}{task.msg?' · '+task.msg:''}{task.start_time?' · 开始于 '+date(task.start_time):''}</Tooltip.Content></Tooltip>}
     {r.mainip&&<span className="inst-pill mono"><Globe size={15}/>{r.mainip}{r.port?':'+r.port:''}<CopyButton label="复制连接地址" text={()=>r.mainip+(r.port?':'+r.port:'')}/></span>}
     <span className="inst-pill"><CountryFlag code={area?.country_code} name={area?.country_name||r.area_name}/>{r.area_name||area?.name||'—'}{node?.group_name&&<span className="group-tag">{node.group_name}</span>}</span>
    </div>
   </div>
   <div className="inst-hero-actions">
    <Dropdown><Button variant="outline"><Power size={16}/>电源<ChevronDown size={14}/></Button><Dropdown.Popover placement="bottom end"><Dropdown.Menu aria-label="电源操作" onAction={k=>open(String(k))}>{powerKeys.map(k=><Dropdown.Item key={k} id={k} textValue={opTitles[k]}><Label>{opTitles[k]}</Label></Dropdown.Item>)}</Dropdown.Menu></Dropdown.Popover></Dropdown>
    <Button onPress={console_}><SquareTerminal size={16}/>启动终端</Button>
    <Button variant="danger" onPress={()=>open('delete')}><Trash2 size={16}/>删除</Button>
   </div>
  </header>

  <div className="inst-grid">
   <Card className="inst-facts">
    <dl>
     <div><dt>操作系统</dt><dd>{icon&&!iconFailed&&<img src={icon} alt="" width={18} height={18}/>}{os||'—'}</dd></div>
     <div><dt>节点</dt><dd>{r.node_name||node?.name||'—'}</dd></div>
     <div><dt>实例密码{r.osuser&&<small> · {r.osuser}</small>}</dt><dd className="inst-secret"><span className={showSecret?'mono':'inst-dots'}>{showSecret?(secret||'（未设置）'):'••••••••••••'}</span>
      <Button variant="ghost" size="sm" isIconOnly className="inst-icon-btn" aria-label={showSecret?'隐藏密码':'显示密码'} onPress={async()=>{if(!showSecret)try{await password();}catch(e){notify?.((e as Error).message,'danger');return;}setShowSecret(s=>!s);}}>{showSecret?<EyeOff size={15}/>:<Eye size={15}/>}</Button>
      <CopyButton label="复制密码" text={password}/></dd></div>
     <div><dt>实例 ID</dt><dd className="inst-secret"><span className="num">{r.id??id}</span><CopyButton label="复制实例 ID" text={()=>String(r.id??id)}/></dd></div>
     <div><dt>所属用户</dt><dd>{(r.user_id??r.uid)&&r.username?<Link className="owner-count-link" to={`/clouds?user=${r.user_id??r.uid}&username=${encodeURIComponent(String(r.username))}`}>{r.username}</Link>:(r.username||'—')}</dd></div>
     <div><dt>创建时间</dt><dd className="num">{r.create_time?date(r.create_time):'—'}</dd></div>
    </dl>
   </Card>
   {/* 流量计费统计（方案 C）：重置日至今汇总在上，下方表格为今日 / 最近 7 天 / 本月的进、出、总计与占比，数据均来自 v1/net_info 的 info。 */}
   <Card className="inst-traffic" title="流量计费统计" icon={<ArrowDownUp size={16}/>} >
    <div className="inst-traffic-row"><span>重置日至今</span><span className="num">{pct!=null?pct.toFixed(1)+'%':''}</span></div>
    <div className="inst-traffic-big num">{used!=null?used.toFixed(used<10?2:1):'—'}<small> / {quota!=null?quota+' GB':'不限'}{quota==null&&used!=null?' · GiB':''}</small></div>
    {pct!=null&&<span className={'usage-track full'+(pct>=80?' is-high':'')} role="meter" aria-label="重置日至今流量使用率" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct,100)}><i style={{width:Math.min(pct,100)+'%'}}/></span>}
    {/* 今日 / 最近 7 天 / 本月：每段一行，左侧时段和占比，右侧总计，下方进、出两项，窄栏里也不会挤出横向滚动。 */}
    <ul className="inst-traffic-periods num">{([['to_day','今日'],['7_day','最近 7 天'],['to_month','本月']] as const).map(([k,t])=>{const d=traffic?.info?.[k]||{};const f=Number(d.float);return <li key={k}>
     <div className="itp-head"><span>{t}{f>0&&<small>占比 {f.toFixed(1)}%</small>}</span><b>{flowSize(d.total)}</b></div>
     <div className="itp-sub"><span className="is-in"><ArrowDown size={12}/>进 {flowSize(d.accept)}</span><span className="is-out"><ArrowUp size={12}/>出 {flowSize(d.send)}</span></div>
    </li>;})}</ul>
    <div className="inst-traffic-foot">{meta.flow_reset_time?'下次重置 '+date(meta.flow_reset_time):meta.flow_strategy==='statistics'?'统计使用总量，不自动重置':''}</div>
   </Card>
   <Card className="inst-actions">
    <div className="inst-action-grid">
     {rescue?<ActionTile icon={<LifeBuoy size={18}/>} label="退出救援" onPress={()=>open('rescue_exit')}/>:<ActionTile icon={<LifeBuoy size={18}/>} label="救援系统" onPress={()=>open('rescue')}/>}
     <ActionTile icon={<Disc3 size={18}/>} label="重装系统" onPress={()=>open('reinstall')}/>
     <ActionTile icon={<KeyRound size={18}/>} label="修改密码" onPress={()=>open('password')}/>
     <ActionTile icon={<Cpu size={18}/>} label="修改配置" onPress={()=>open('config')}/>
     <ActionTile icon={<Gauge size={18}/>} label="修改带宽" onPress={()=>open('bw')}/>
     <ActionTile icon={<Settings size={18}/>} label="设置" onPress={()=>setExtra('settings')}/>
     <ActionTile icon={<SlidersHorizontal size={18}/>} label="流量设置" onPress={()=>open('flow_setting')}/>
     <ActionTile icon={<RotateCcw size={18}/>} label="重置流量" onPress={()=>open('reset_traffic')}/>
     <ActionTile icon={<Camera size={18}/>} label="快照" onPress={()=>setExtra('snap')}/>
     <ActionTile icon={<Archive size={18}/>} label="备份" onPress={()=>setExtra('backup')}/>
     <ActionTile icon={<CalendarClock size={18}/>} label="计划任务" onPress={()=>setExtra('cron')}/>
    </div>
   </Card>
  </div>

  <div className="inst-lower">
   <div className="inst-col">
   <Section title="IP" icon={<Globe size={16}/>} actions={<>
     <Button size="sm" variant="outline" onPress={()=>open('group_add')}><Plus size={15}/>增加 IP 组</Button>
     <Dropdown><Button size="sm" variant="outline">更多<ChevronDown size={14}/></Button><Dropdown.Popover placement="bottom end"><Dropdown.Menu aria-label="IP 管理" onAction={k=>open(String(k))}>
      <Dropdown.Item id="ip_num" textValue="修改 IPv4 数量"><SlidersHorizontal size={15}/><Label>修改 IPv4 数量</Label></Dropdown.Item>
      <Dropdown.Item id="ipv6_add" textValue="添加 IPv6"><Plus size={15}/><Label>添加 IPv6</Label></Dropdown.Item>
     </Dropdown.Menu></Dropdown.Popover></Dropdown>
    </>}>
    {ipError?<ErrorBox message={ipError}/>:!ips?<TableSkeleton className="inst-table" rows={2} columns={[{title:'IP 组',width:5,twoLine:true},{title:'地址',width:8},{title:'带宽',width:6},{title:'操作',width:4}]}/>:<Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="IP 组" className="inst-table"><Table.Header><Table.Column isRowHeader>IP 组</Table.Column><Table.Column>地址</Table.Column><Table.Column>带宽</Table.Column><Table.Column className="inst-col-actions">操作</Table.Column></Table.Header>
     <Table.Body renderEmptyState={()=><Empty kind="network" size="sm" title="暂无 IP" text="这台实例还没有分配 IP 地址。"/>}>{[...groups.map(g=>{const l=lead(g.rows);return <Table.Row key={'g'+g.id}>
      <Table.Cell><div className="inst-ip-cell"><span className="inst-group-name">{Number(g.id)===Number(ips.default_group)?'默认 IP 组':'IP 组 '+(g.index+(groups.some(x=>Number(x.id)===Number(ips.default_group))?0:1))}</span><small className="num">#{g.id}</small></div></Table.Cell>
      <Table.Cell>{l?<span className="inst-ip-line"><button type="button" className="inst-ip-link mono" onClick={()=>setIpList(Number(g.id))} aria-label={'查看 IP 组 #'+g.id+' 的全部地址'}>{l.address}</button>{l.main&&<span className="inst-main"><Star size={11}/>主 IP</span>}{g.rows.length>1&&<button type="button" className="inst-ip-more" onClick={()=>setIpList(Number(g.id))} aria-label={'另有 '+(g.rows.length-1)+' 个地址'}>+{g.rows.length-1}</button>}</span>:<span className="inst-muted">暂无 IP</span>}</Table.Cell>
      <Table.Cell><div className="inst-bw num"><span><ArrowDown size={12}/>{g.in_bw??'—'}</span><span><ArrowUp size={12}/>{g.out_bw??'—'}</span><small>Mbps</small>{g.temp_expire&&<span className="inst-extra" title={'临时带宽，'+g.temp_expire+' 失效'}>临时</span>}</div></Table.Cell>
      <Table.Cell className="inst-col-actions"><div className="inst-row-actions">
       <IconAction label="增加 IP" onPress={()=>open('ip_add',g)}><Plus size={15}/></IconAction>
       <IconAction label="修改带宽" onPress={()=>open('group_bw',g)}><Gauge size={15}/></IconAction>
       <IconAction label="更换 IP" onPress={()=>open('group_ip',g)}><RefreshCcw size={15}/></IconAction>
       {Number(g.id)===Number(ips.default_group)?<IconAction label="默认 IP 组不能删除" disabled><Trash2 size={15}/></IconAction>
        :(g.rows as Row[]).some(r=>r.main)?<IconAction label="组内有主 IP，不能删除" disabled><Trash2 size={15}/></IconAction>
        :<IconAction label="删除 IP 组" danger onPress={()=>open('group_delete',g)}><Trash2 size={15}/></IconAction>}
      </div></Table.Cell>
     </Table.Row>;}),...(v6.length?[<Table.Row key="v6">
      <Table.Cell><div className="inst-ip-cell"><span className="inst-group-name">IPv6</span><small>{v6.length} 个地址</small></div></Table.Cell>
      <Table.Cell><span className="inst-ip-line"><button type="button" className="inst-ip-link mono" onClick={()=>setIpList('v6')} aria-label="查看全部 IPv6 地址">{lead(v6).address}</button>{v6.length>1&&<button type="button" className="inst-ip-more" onClick={()=>setIpList('v6')} aria-label={'另有 '+(v6.length-1)+' 个 IPv6 地址'}>+{v6.length-1}</button>}</span></Table.Cell>
      <Table.Cell><span className="inst-muted">—</span></Table.Cell>
      <Table.Cell className="inst-col-actions"><div className="inst-row-actions"><IconAction label="添加 IPv6" onPress={()=>open('ipv6_add')}><Plus size={15}/></IconAction></div></Table.Cell>
     </Table.Row>]:[])]}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
   </Section>

   <Section title="网络" icon={<Network size={16}/>} actions={<>{Number(net?.internet??r.internet??1)===0?<Button size="sm" variant="outline" onPress={()=>open('internet')}><PlugZap size={15}/>恢复网络</Button>:<Button size="sm" variant="outline" className="is-danger-outline" onPress={()=>open('disconnect')}><Unplug size={15}/>断网</Button>}<Dropdown><Button size="sm" variant="outline">管理<ChevronDown size={14}/></Button><Dropdown.Popover placement="bottom end"><Dropdown.Menu aria-label="网络管理" onAction={k=>open(String(k))}>
      <Dropdown.Item id="network_type" textValue="切换网络类型"><ArrowLeftRight size={15}/><Label>切换网络类型</Label></Dropdown.Item>
      {netType==='vpc'?<Dropdown.Item id="vpc" textValue="切换 VPC 网络"><Network size={15}/><Label>切换 VPC 网络</Label></Dropdown.Item>:null}
     </Dropdown.Menu></Dropdown.Popover></Dropdown></>}>
    {netError?<ErrorBox message={netError}/>:!net?<KvSkeleton/>:<dl className="inst-kv">
     <div><dt>网络类型</dt><dd><span className="inst-tag">{netType==='vpc'?'VPC 网络':'经典网络'}</span></dd></div>
     {/* 没有 VPC 网络、没有内网 IP 时不显示这两行。 */}
     {netType==='vpc'&&(net.vpc_name||r.vpc_name)&&<div><dt>VPC 网络</dt><dd>{net.vpc_name||r.vpc_name}</dd></div>}
     {privateIps.length>0&&<div><dt>内网 IP</dt><dd><span className="mono">{privateIps.map(x=>x.address).join('、')}</span></dd></div>}
     <div><dt>网络状态</dt><dd>{Number(net.internet??r.internet??1)===0?<span className="inst-state is-off">已断网</span>:<span className="inst-state is-on">正常</span>}</dd></div>
    </dl>}
   </Section>

   <Section title="磁盘" icon={<HardDrive size={16}/>} actions={<><Button size="sm" variant="outline" onPress={()=>open('disk_compress')}><Shrink size={15}/>磁盘压缩</Button><Button size="sm" variant="outline" onPress={()=>open('disk_add')}><Plus size={15}/>添加磁盘</Button></>}>
    <Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="实例磁盘" className="inst-table"><Table.Header><Table.Column isRowHeader>磁盘名称</Table.Column><Table.Column>类型</Table.Column><Table.Column>容量</Table.Column><Table.Column>挂载</Table.Column><Table.Column>创建时间</Table.Column><Table.Column className="inst-col-actions">操作</Table.Column></Table.Header>
     <Table.Body renderEmptyState={()=><Empty kind="box" size="sm" title="暂无磁盘信息" text="平台没有返回这台实例的磁盘。"/>}>{((r.disk||[]) as Row[]).map(d=>{const system=d.type==='system'||d.dev==='vda';return <Table.Row key={d.id}>
      <Table.Cell><div className="inst-ip-cell"><span className="inst-disk">{d.remarks||d.name||'#'+d.id}</span><small>{[d.dev,d.store_name||d.store_type].filter(Boolean).join(' · ')||'—'}</small></div></Table.Cell>
      <Table.Cell><span className={'inst-tag '+(system?'':'is-data')}>{system?'系统盘':'数据盘'}</span></Table.Cell>
      <Table.Cell className="num nowrap">{d.size}<span className="inst-unit">GB</span></Table.Cell>
      <Table.Cell><Tooltip delay={0}><Tooltip.Trigger className="inst-mount" aria-label={['未挂载','已挂载','正在挂载'][Number(d.status)]||'未知'}>{Number(d.status)===1?<CircleCheck size={18} color="#16a34a"/>:<CircleDashed size={18} color="#a1a1aa"/>}</Tooltip.Trigger><Tooltip.Content>{['未挂载','已挂载','正在挂载'][Number(d.status)]||'未知'}</Tooltip.Content></Tooltip></Table.Cell>
      <Table.Cell className="num nowrap">{date(d.create_time)}</Table.Cell>
      <Table.Cell className="inst-col-actions"><div className="inst-row-actions"><IconAction label="修改磁盘" onPress={()=>open('disk_edit',d)}><Pencil size={15}/></IconAction>{system?<IconAction label="系统盘随实例删除，不能单独删除" disabled><Trash2 size={15}/></IconAction>:<IconAction label="删除磁盘" danger onPress={()=>open('disk_delete',d)}><Trash2 size={15}/></IconAction>}</div></Table.Cell>
     </Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>
   </Section>

   <Section title="监控" icon={<Gauge size={16}/>} actions={<Segmented label="监控指标" items={metrics} value={metric} onChange={setMetric}/>}>
    <div className="inst-panel inst-monitor">
     <div className="inst-monitor-bar"><Segmented label="时间范围" items={ranges} value={range} onChange={setRange} small/>{metric==='disk'&&(charts?.disk?.disks?.length||0)>1&&<div className="inst-disk-pick"><Choice aria-label="选择磁盘" value={charts?.disk?.dev||''} onChange={e=>setDiskDev(e.target.value)}>{charts!.disk.disks.map((d:Row)=><option key={d.dev} value={d.dev}>{d.dev}{d.type==='system'?'（系统盘）':''}</option>)}</Choice></div>}</div>
     {chartError?<ErrorBox message={chartError} retry={()=>setRev(v=>v+1)}/>:!charts?<div className="inst-chart-loading" aria-busy="true" aria-label="正在加载监控"><Skeleton animationType="pulse" className="sk-chart"/></div>:(()=>{
      const tf=long?dayClock:clock;
      const view=metric==='cpu'?{t:cpu_.times,s:[{name:'CPU 使用率',color:BLUE,values:cpu_.cpu}],f:pctFmt,e:charts.cpu?.error,area:true}
       :metric==='memory'?{t:cpu_.times,s:[{name:'内存使用',color:'#7c3aed',values:cpu_.mem}],f:memFmt,e:charts.cpu?.error,area:true}
       :metric==='network'?{t:net_.times,s:[{name:'出带宽',color:BLUE,values:net_.out},{name:'进带宽',color:ORANGE,values:net_.in}],f:bps,e:charts.network?.error}
       :metric==='disk'?{t:disk_.times,s:[{name:'读取',color:BLUE,values:disk_.read},{name:'写入',color:ORANGE,values:disk_.write}],f:bytesRate,e:charts.disk?.error||(!charts.disk?.dev?'实例没有可监控的磁盘':undefined)}
       :{t:flow_.times,s:[{name:'发送',color:BLUE,values:flow_.send},{name:'接收',color:ORANGE,values:flow_.recv}],f:mb,e:charts.flow?.error};
      return view.t.length>1?<><LineChart label={metrics.find(m=>m[0]===metric)![1]+'监控'} times={view.t} timeFormat={tf} series={view.s} format={view.f} area={view.area} height={240}/><Legend series={view.s}/></>:<Empty kind="chart" title="暂无监控数据" text={view.e||'所选时间段内平台没有返回监控数据，可切换时间范围。'}/>;
     })()}
    </div>
   </Section>
   </div>
   <div className="inst-col inst-side">
   <Section title="日志" icon={<ScrollText size={16}/>} actions={<Button size="sm" variant="outline" onPress={()=>setLogs(true)}>全部日志</Button>}>
    {/* 右侧栏较窄：外框仍是表格，只分“操作”“时间”两列；操作内容可换行（最多两行），下方灰字为操作人 · IP；时间分日期、时刻两行，不再横向滚动。 */}
    {logError?<ErrorBox message={logError}/>:!logRows?<TableSkeleton className="inst-table inst-log-table" rows={6} columns={[{title:'操作',width:9,twoLine:true},{title:'时间',width:5,twoLine:true}]}/>:<Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="实例日志" className="inst-table inst-log-table"><Table.Header><Table.Column isRowHeader>操作</Table.Column><Table.Column>时间</Table.Column></Table.Header>
     <Table.Body renderEmptyState={()=><Empty kind="log" size="sm" title="暂无日志" text="这台实例的操作记录会显示在这里。"/>}>{logRows.map(l=>{const [d,c]=date(l.create_time).split(' ');return <Table.Row key={l.id}><Table.Cell><div className="inst-log-cell"><p title={String(l.des??'')}>{l.des}</p><div className="inst-log-meta"><span>{l.username||'系统'}</span>{l.ip&&<span className="mono">{l.ip}</span>}</div></div></Table.Cell><Table.Cell><div className="inst-log-time num"><span>{d}</span>{c&&<small>{c}</small>}</div></Table.Cell></Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
   </Section>
   </div>
  </div>

  {ipList!==null&&(()=>{const isV6=ipList==='v6';const g=isV6?null:groups.find(x=>Number(x.id)===ipList);const rows:Row[]=isV6?v6:g?.rows||[];if(!isV6&&!g)return null;
   return <Dialog title={isV6?'IPv6 地址（'+rows.length+'）':(Number(g!.id)===Number(ips?.default_group)?'默认 IP 组':'IP 组')+' #'+g!.id+'（'+rows.length+'）'} wide onClose={()=>setIpList(null)} footer={<>{isV6?<Button variant="outline" onPress={()=>open('ipv6_add')}><Plus size={15}/>添加 IPv6</Button>:<><Button variant="outline" onPress={()=>open('ip_add',g!)}><Plus size={15}/>增加 IP</Button><Button variant="outline" onPress={()=>open('group_ip',g!)}><RefreshCcw size={15}/>更换 IP</Button></>}<Button onPress={()=>setIpList(null)}>关闭</Button></>}>
   {!isV6&&<p className="batch-hint inst-group-bw">带宽：下行 {g!.in_bw} Mbps · 上行 {g!.out_bw} Mbps{g!.temp_expire?'（临时，'+g!.temp_expire+' 失效）':''}</p>}
   <Table><Table.ScrollContainer className="table-scroll"><Table.Content aria-label="IP 地址" className="inst-table inst-ip-table"><Table.Header><Table.Column isRowHeader>IP 地址</Table.Column><Table.Column>网关</Table.Column><Table.Column>掩码</Table.Column><Table.Column className="inst-col-actions">操作</Table.Column></Table.Header>
    <Table.Body>{rows.map((ip:Row,i:number)=><Table.Row key={(ip.id??'p')+'-'+i}>
     <Table.Cell><span className="inst-ip-line"><span className="mono">{ip.address}</span>{ip.main?<span className="inst-main"><Star size={11}/>主 IP</span>:<span className="inst-extra">附加</span>}{ip.elastic&&<span className="inst-extra">弹性</span>}</span></Table.Cell>
     <Table.Cell><span className="mono">{ip.gateway||'—'}</span></Table.Cell>
     <Table.Cell><span className="mono">{ip.subnet_mask||'—'}</span></Table.Cell>
     <Table.Cell className="inst-col-actions"><div className="inst-row-actions">
      {!ip.main&&<IconAction label="设为主 IP" onPress={()=>open('mainip',ip)}><Star size={15}/></IconAction>}
      {ip.main?<IconAction label="主 IP 不能删除，请先把其他 IP 设为主 IP" disabled><Trash2 size={15}/></IconAction>:<IconAction label={isV6?'删除 IPv6':'删除 IP'} danger onPress={()=>open(isV6?'ipv6_delete':'ip_delete',ip)}><Trash2 size={15}/></IconAction>}
     </div></Table.Cell>
    </Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>
  </Dialog>;})()}
{action&&<InstanceAction cloud={{...r,network_type:netType,vpc_name:net?.vpc_name||r.vpc_name,ip_num:net?.ip_num??r.ip_num}} target={action} traffic={traffic} onClose={()=>setAction(null)} onDone={m=>{const op=action.op;setAction(null);notify?.(m);setTaskTick(v=>v+1);if(op==='delete'){onClose();return;}if(op==='password'||op==='reinstall'){setSecret(null);setShowSecret(false);}setRev(v=>v+1);}}/>}
  {logs&&<InstanceLogs id={id} onClose={()=>setLogs(false)}/>}
  {extra==='settings'&&<SettingsDialog id={id} notify={m=>notify?.(m)} onClose={()=>setExtra(null)} onSaved={()=>{setRev(v=>v+1);setTaskTick(v=>v+1);}}/>}
  {(extra==='snap'||extra==='backup')&&<SnapshotDialog id={id} type={extra} notify={m=>notify?.(m)} onClose={()=>{setExtra(null);setTaskTick(v=>v+1);}}/>}
  {extra==='cron'&&<CronDialog id={id} notify={m=>notify?.(m)} onClose={()=>setExtra(null)}/>}
 </section>;
}
/** Icon-only row action with a tooltip; `disabled` keeps the tooltip so the reason stays visible. */
function IconAction({label,onPress,danger=false,disabled=false,children}:{label:string;onPress?:()=>void;danger?:boolean;disabled?:boolean;children:ReactNode}){
 if(disabled)return <Tooltip delay={0}><Tooltip.Trigger className="inst-disabled-icon" aria-label={label}>{children}</Tooltip.Trigger><Tooltip.Content>{label}</Tooltip.Content></Tooltip>;
 return <Tooltip delay={300}><Button size="sm" variant="ghost" isIconOnly aria-label={label} className={danger?'is-danger':undefined} onPress={onPress}>{children}</Button><Tooltip.Content>{label}</Tooltip.Content></Tooltip>;
}
const sk=(w:string,extra='')=>(<Skeleton animationType="pulse" className={'sk-bar '+extra} style={{width:w}}/>);
/** 网络 facts while loading: the same four cells, values as bars. */
function KvSkeleton(){return <dl className="inst-kv" aria-busy="true" aria-label="正在加载网络信息">{['网络类型','VPC 网络','内网 IP','网络状态'].map((t,i)=><div key={t}><dt>{t}</dt><dd>{sk(['4.5rem','7rem','6rem','3rem'][i])}</dd></div>)}</dl>;}
/**
 * The detail page before its data arrives: the real crumb, cards, section titles and table headers,
 * with each value drawn as a bar of about its real size, so nothing moves when the data lands.
 */
function DetailSkeleton({onClose,id}:{onClose:()=>void;id:string|number}){
 const tile=<div className="inst-tile inst-tile-sk"><Skeleton animationType="pulse" className="sk-square"/>{sk('3.5rem')}</div>;
 return <section className="inst-page" aria-busy="true" aria-label="正在加载实例详情">
  <Crumb onClose={onClose} id={id}/>
  <header className="inst-card inst-hero">
   <div className="inst-os"><Skeleton animationType="pulse" className="sk-os"/></div>
   <div className="inst-hero-main"><div className="inst-title">{sk('11rem','sk-title')}{sk('3rem')}</div><div className="inst-pills">{sk('5rem','sk-pill')}{sk('8.5rem','sk-pill')}{sk('6rem','sk-pill')}</div></div>
   <div className="inst-hero-actions">{sk('5rem','sk-btn')}{sk('6rem','sk-btn')}{sk('4.5rem','sk-btn')}</div>
  </header>
  <div className="inst-grid">
   <Card className="inst-facts"><dl>{['操作系统','节点','实例密码','实例 ID','所属用户','创建时间'].map((t,i)=><div key={t}><dt>{t}</dt><dd>{sk(['9rem','5.5rem','7.5rem','3rem','5rem','9rem'][i])}</dd></div>)}</dl></Card>
   <Card className="inst-traffic" title="流量计费统计" icon={<ArrowDownUp size={16}/>}><div className="inst-traffic-row">{sk('5rem')}{sk('2.5rem')}</div>{sk('8rem','sk-title')}<Skeleton animationType="pulse" className="sk-track"/><ul className="inst-traffic-periods">{['今日','最近 7 天','本月'].map(t=><li key={t}><div className="itp-head"><span>{t}</span>{sk('3.5rem')}</div><div className="itp-sub">{sk('4.5rem')}{sk('4.5rem')}</div></li>)}</ul></Card>
   <Card className="inst-actions"><div className="inst-action-grid">{Array.from({length:11},(_,i)=><div key={i}>{tile}</div>)}</div></Card>
  </div>
  <div className="inst-lower">
   <div className="inst-col">
    <Section title="IP" icon={<Globe size={16}/>}><TableSkeleton className="inst-table" rows={2} columns={[{title:'IP 组',width:5,twoLine:true},{title:'地址',width:8},{title:'带宽',width:6},{title:'操作',width:4}]}/></Section>
    <Section title="网络" icon={<Network size={16}/>}><KvSkeleton/></Section>
    <Section title="磁盘" icon={<HardDrive size={16}/>}><TableSkeleton className="inst-table" rows={2} columns={[{title:'磁盘名称',width:6,twoLine:true},{title:'类型',width:3},{title:'容量',width:3},{title:'挂载',width:0},{title:'创建时间',width:7},{title:'操作',width:3}]}/></Section>
    <Section title="监控" icon={<Gauge size={16}/>}><div className="inst-chart-loading"><Skeleton animationType="pulse" className="sk-chart"/></div></Section>
   </div>
   <div className="inst-col inst-side">
    <Section title="日志" icon={<ScrollText size={16}/>}><TableSkeleton className="inst-table inst-log-table" rows={6} columns={[{title:'操作',width:9,twoLine:true},{title:'时间',width:5,twoLine:true}]}/></Section>
   </div>
  </div>
 </section>;
}
function Section({title,icon,actions,children}:{title:string;icon?:ReactNode;actions?:ReactNode;children:ReactNode}){return <section className="inst-section"><header className="inst-section-head"><h2>{icon}{title}</h2>{actions&&<div className="inst-card-actions">{actions}</div>}</header>{children}</section>;}
function Segmented({label,items,value,onChange,small}:{label:string;items:[string,string][];value:string;onChange:(v:string)=>void;small?:boolean}){return <div className={'inst-range'+(small?' is-small':'')} role="tablist" aria-label={label}>{items.map(([k,t])=><button key={k} type="button" role="tab" aria-selected={value===k} className={value===k?'is-active':''} onClick={()=>onChange(k)}>{t}</button>)}</div>;}
function Crumb({onClose,id}:{onClose:()=>void;id:string|number}){return <div className="section-kicker inst-crumb"><Button variant="ghost" size="sm" className="crumb-link" onPress={onClose}>实例管理</Button><span>/</span><span>实例详情 #{id}</span></div>;}
function ActionTile({icon,label,onPress,tone}:{icon:ReactNode;label:string;onPress:()=>void;tone?:'danger'}){return <Button variant="outline" className={'inst-tile'+(tone?' is-'+tone:'')} onPress={onPress}><span className="inst-tile-icon">{icon}</span><span className="inst-tile-label">{label}</span></Button>;}
