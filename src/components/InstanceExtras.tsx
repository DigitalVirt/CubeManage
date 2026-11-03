import {useEffect,useState,type ReactNode} from 'react';
import {Button,Checkbox,Input,Label,Switch,Table,TextArea,TextField,Tooltip} from '@heroui/react';
import {Eye,EyeOff,FileCode2,Info,RotateCcw,Trash2,X,Plus,Ban} from 'lucide-react';
import {api,send,date,type Row} from '../lib/api';
import {Dialog,Empty,ErrorBox,type Notify} from './Shared';
import {Choice} from './Controls';
import {TableSkeleton} from './TableSkeleton';

/**
 * 实例详情的“设置”“快照”“备份”“计划任务”弹窗，服务端见 server/instance-settings.mjs。
 * 设置为左侧分组导航（与新建节点同一套 rd 样式），底部只有一个“保存修改”，只提交改过的项目；ISO 挂载 / 卸载立即生效。
 */
const BOOT_ORDER:[string,string][]=[['c','仅硬盘（Hard Disk Only）'],['d','仅光驱（CD-ROM Only）'],['cd','硬盘优先，其次光驱'],['dc','光驱优先，其次硬盘']];
const CPU_MODEL:[string,string][]=[['1','host-passthrough'],['2','host-model'],['3','custom']];
const CLOCK:[string,string][]=[['0','Default'],['1','UTC'],['2','Localtime']];
const VRAM=['16','32','64','128','256','512','1024','2048'];
const on=(v:unknown)=>Number(v)===1;

function Toggle({label,help,value,onChange,readOnly}:{label:ReactNode;help?:string;value:boolean;onChange?:(v:boolean)=>void;readOnly?:boolean}){
 return <div className="set-row"><span className="set-label">{label}{help&&<small>{help}</small>}</span><Switch size="sm" isSelected={value} isReadOnly={readOnly} isDisabled={readOnly} onChange={v=>onChange?.(v)} aria-label={typeof label==='string'?label:undefined}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></div>;
}
function Row_({label,help,children}:{label:ReactNode;help?:string;children:ReactNode}){return <div className="set-row"><span className="set-label">{label}{help&&<small>{help}</small>}</span><div className="set-control">{children}</div></div>;}

/* ── 设置 ─────────────────────────────────────────────────────────────── */
type Groups='boot'|'cpu'|'cpu_adv'|'console'|'hw'|'misc';
const GROUPS:[Groups,string,string][]=[['boot','启动与引导','启动盘和启动顺序重启后生效；ISO 挂载与卸载立即执行。'],['cpu','CPU','修改后需重启实例生效。'],['cpu_adv','CPU 高级','CPU 拓扑、CPUTune、NUMA，仅在了解影响时修改。'],['console','控制台','VNC 与串口控制台。'],['hw','硬件与虚拟化','修改后需重启实例生效。'],['misc','备份与诊断','']];
export function SettingsDialog({id,notify,onClose,onSaved}:{id:number|string;notify:Notify;onClose:()=>void;onSaved:()=>void}){
 const [base,setBase]=useState<Row|null>(null),[v,setV]=useState<Row>({}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[group,setGroup]=useState<Groups>('boot');
 const [isos,setIsos]=useState<Row[]>([]),[isoPick,setIsoPick]=useState(''),[isoBusy,setIsoBusy]=useState(false),[pass,setPass]=useState<string|null>(null),[xml,setXml]=useState<string|null>(null),[xmlBusy,setXmlBusy]=useState(false),[rev,setRev]=useState(0);
 useEffect(()=>{let live=true;api<Row>(`/clouds/${id}/settings`).then(r=>{if(!live)return;setBase(r);setV(x=>Object.keys(x).length?{...x,iso:r.iso}:{...r,cpu_limit_on:Number(r.cpu_limit)>0?1:0,cpu_limit:Number(r.cpu_limit)>0?String(r.cpu_limit):'',vncpass:''});}).catch(e=>{if(live)setError((e as Error).message);});
  api<Row>(`/clouds/${id}/iso_options`).then(r=>{if(live)setIsos(r.data||[]);}).catch(()=>{});return()=>{live=false;};},[id,rev]);
 const set=(k:string,x:unknown)=>setV(o=>({...o,[k]:x}));
 // 改动的字段（与读取时比较）
 const KEYS=['acpi','vnc','console','pae','gpu','vram','skip_cold_backup','simulate_physical_machine','cputopcheck','cputunecheck','cpunumacheck','cpusockets','cpucores','cputhreads','cputune','cpunumatop','vncport','bootorder','cpumodel','clock','queues','qemu','boot_disk'];
 const changes:Row={};if(base){for(const k of KEYS)if(String(v[k]??'')!==String(base[k]??''))changes[k]=v[k];if(v.vncpass)changes.vncpass=v.vncpass;
  const limit=on(v.cpu_limit_on)?Number(v.cpu_limit)||0:0;if(limit!==(Number(base.cpu_limit)||0))changes.cpu_limit=limit;}
 const count=Object.keys(changes).length;
 async function save(){
  if(on(v.cpu_limit_on)&&!(Number(v.cpu_limit)>=1&&Number(v.cpu_limit)<=100)){setGroup('cpu');setError('CPU 限制请填写 1～100 的百分比');return;}
  setBusy(true);setError('');try{const r=await api<Row>(`/clouds/${id}/settings`,send('PUT',changes));notify('已保存：'+(r.done||[]).join('、')+'，部分设置需重启实例后生效');onSaved();onClose();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 async function iso(method:'POST'|'DELETE',isoId:number){setIsoBusy(true);setError('');try{await api(`/clouds/${id}/iso`,send(method,{iso:isoId}));notify(method==='POST'?'ISO 已挂载':'ISO 已卸载');setIsoPick('');setRev(x=>x+1);}catch(e){setError((e as Error).message);}finally{setIsoBusy(false);}}
 const mounted:Row[]=v.iso||[];
 const body=():ReactNode=>{
  if(group==='boot')return <>
   <Row_ label="启动盘"><Choice aria-label="启动盘" value={String(v.boot_disk??'')} onChange={e=>set('boot_disk',e.target.value)}>{(base?.disks||[]).map((d:Row)=><option key={d.id} value={String(d.id)}>{d.name}{d.dev?' · '+d.dev:''}{d.size?' · '+d.size+'GB':''}</option>)}</Choice></Row_>
   <Row_ label="启动顺序"><Choice aria-label="启动顺序" value={String(v.bootorder??'')} onChange={e=>set('bootorder',e.target.value)}>{!BOOT_ORDER.some(([k])=>k===v.bootorder)&&<option value={String(v.bootorder??'')}>{v.bootorder||'未设置'}</option>}{BOOT_ORDER.map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice></Row_>
   {[0,1].map(i=>{const m=mounted[i];return <Row_ key={i} label={'ISO '+(i+1)}>{m?<span className="set-iso"><span title={m.name}>{m.name}</span><Button size="sm" variant="outline" isDisabled={isoBusy} onPress={()=>iso('DELETE',Number(m.id))}><X size={14}/>卸载</Button></span>
    :i===mounted.length?<span className="set-iso"><Choice aria-label={'ISO '+(i+1)} value={isoPick} onChange={e=>setIsoPick(e.target.value)}><option value="">请选择要挂载的 ISO</option>{isos.map(x=><option key={x.id} value={String(x.id)}>{x.name}</option>)}</Choice><Button size="sm" isDisabled={!isoPick||isoBusy} isPending={isoBusy&&Boolean(isoPick)} onPress={()=>iso('POST',Number(isoPick))}>挂载</Button></span>:<span className="set-muted">先挂载 ISO 1</span>}</Row_>;})}
  </>;
  if(group==='cpu')return <>
   <Row_ label="CPU 模式"><Choice aria-label="CPU 模式" value={String(v.cpumodel??'')} onChange={e=>set('cpumodel',e.target.value)}>{!v.cpumodel&&<option value="">跟随镜像</option>}{CPU_MODEL.map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice></Row_>
   <Row_ label="CPU 限制" help="限制这台实例最多使用的 CPU 百分比"><span className="set-inline"><TextField aria-label="CPU 限制百分比" value={String(v.cpu_limit??'')} onChange={x=>set('cpu_limit',x.replace(/\D/g,'').slice(0,3))} isDisabled={!on(v.cpu_limit_on)}><Input className="set-num" inputMode="numeric" placeholder="百分比"/></TextField><span className="set-muted">%</span><Switch size="sm" aria-label="开启 CPU 限制" isSelected={on(v.cpu_limit_on)} onChange={x=>set('cpu_limit_on',x?1:0)}><Switch.Content><Switch.Control><Switch.Thumb/></Switch.Control></Switch.Content></Switch></span></Row_>
   <Toggle label="PAE" value={on(v.pae)} onChange={x=>set('pae',x?1:0)}/>
   <Toggle label="模拟物理机运行" help="让系统识别为物理机" value={on(v.simulate_physical_machine)} onChange={x=>set('simulate_physical_machine',x?1:0)}/>
  </>;
  if(group==='cpu_adv')return <>
   <Toggle label="CPU 拓扑（CPUTopology）" value={on(v.cputopcheck)} onChange={x=>set('cputopcheck',x?1:0)}/>
   {on(v.cputopcheck)&&<div className="set-triple">{(['cpusockets','cpucores','cputhreads'] as const).map(k=><TextField key={k} value={String(v[k]??'')} onChange={x=>set(k,x.replace(/\D/g,'').slice(0,3))}><Label>{k.replace('cpu','')}</Label><Input inputMode="numeric"/></TextField>)}</div>}
   <Toggle label="CPUTune" value={on(v.cputunecheck)} onChange={x=>set('cputunecheck',x?1:0)}/>
   {on(v.cputunecheck)&&<TextField aria-label="CPUTune" value={String(v.cputune??'')} onChange={x=>set('cputune',x)}><TextArea className="mono" rows={4}/></TextField>}
   <Toggle label="NUMA 拓扑（NUMATopology）" value={on(v.cpunumacheck)} onChange={x=>set('cpunumacheck',x?1:0)}/>
   {on(v.cpunumacheck)&&<TextField aria-label="NUMA 拓扑" value={String(v.cpunumatop??'')} onChange={x=>set('cpunumatop',x)}><TextArea className="mono" rows={4}/></TextField>}
  </>;
  if(group==='console')return <>
   <Toggle label="VNC 控制台" value={on(v.vnc)} onChange={x=>set('vnc',x?1:0)}/>
   <Row_ label="控制台端口"><TextField aria-label="控制台端口" value={String(v.vncport??'')} onChange={x=>set('vncport',x.replace(/\D/g,'').slice(0,5))}><Input className="mono set-mid" inputMode="numeric"/></TextField></Row_>
   <Row_ label="控制台密码" help="留空保持原密码"><span className="set-inline"><TextField aria-label="新的控制台密码" value={String(v.vncpass??'')} onChange={x=>set('vncpass',x.slice(0,16))}><Input className="mono set-mid" type="text" autoComplete="off" placeholder={pass!=null?(pass||'（未设置）'):base?.vncpass_set?'••••••••':'尚未设置'}/></TextField>
    {base?.vncpass_set&&<Tooltip delay={0}><Button size="sm" variant="ghost" isIconOnly aria-label={pass!=null?'隐藏当前密码':'显示当前密码'} onPress={async()=>{if(pass!=null)return setPass(null);try{const r=await api<Row>(`/clouds/${id}/vncpass`);setPass(String(r.vncpass??''));}catch(e){setError((e as Error).message);}}}>{pass!=null?<EyeOff size={15}/>:<Eye size={15}/>}</Button><Tooltip.Content>{pass!=null?'隐藏当前密码':'显示当前密码'}</Tooltip.Content></Tooltip>}</span></Row_>
   <Toggle label="串口 Console" value={on(v.console)} onChange={x=>set('console',x?1:0)}/>
  </>;
  if(group==='hw')return <>
   <Toggle label={<>APIC<span className="set-ro">只读</span></>} help="平台不支持修改" value={on(v.apic)} readOnly/>
   <Toggle label="ACPI" value={on(v.acpi)} onChange={x=>set('acpi',x?1:0)}/>
   <Row_ label="时钟"><Choice aria-label="时钟" value={String(v.clock??'0')} onChange={e=>set('clock',e.target.value)}>{CLOCK.map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice></Row_>
   <Row_ label="QEMU 版本" help={base?.default_qemu?'默认 '+base.default_qemu:undefined}><Choice aria-label="QEMU 版本" value={String(v.qemu??'')} onChange={e=>set('qemu',e.target.value)}>{!v.qemu&&<option value="">默认</option>}{(base?.qemu_versions||[]).filter((q:string)=>q!==v.qemu).concat(v.qemu?[v.qemu]:[]).sort().map((q:string)=><option key={q} value={q}>{q}</option>)}</Choice></Row_>
   <Toggle label="VirtIO-GPU" help="虚拟显存，开启后可选大小" value={on(v.gpu)} onChange={x=>set('gpu',x?1:0)}/>
   {on(v.gpu)&&<Row_ label="显存大小"><Choice aria-label="显存大小" value={String(v.vram??'')} onChange={e=>set('vram',e.target.value)}>{!VRAM.includes(String(v.vram))&&<option value="">请选择</option>}{VRAM.map(x=><option key={x} value={x}>{x} MB</option>)}</Choice></Row_>}
   <Row_ label="网卡多队列"><TextField aria-label="网卡多队列" value={String(v.queues??'')} onChange={x=>set('queues',x.replace(/\D/g,'').slice(0,2))}><Input className="mono set-num" inputMode="numeric"/></TextField></Row_>
  </>;
  return <>
   <Toggle label="跳过冷备份" help="节点冷备份时跳过这台实例" value={on(v.skip_cold_backup)} onChange={x=>set('skip_cold_backup',x?1:0)}/>
   <Row_ label="XML 信息"><Button size="sm" variant="outline" isPending={xmlBusy} onPress={async()=>{setXmlBusy(true);try{const r=await api<Row>(`/clouds/${id}/xml`);setXml(String(r.xml??''));}catch(e){setError((e as Error).message);}finally{setXmlBusy(false);}}}><FileCode2 size={15}/>查看 XML</Button></Row_>
  </>;
 };
 const g=GROUPS.find(x=>x[0]===group)!;
 if(xml!=null)return <Dialog wide title="实例 XML" onClose={()=>setXml(null)} footer={<Button className="rd-btn" onPress={()=>setXml(null)}>返回设置</Button>}><pre className="set-xml">{xml||'（平台没有返回内容）'}</pre></Dialog>;
 return <Dialog wide title="实例设置" onClose={()=>{if(!busy)onClose();}} footer={<><span className="set-count">{count?`已修改 ${count} 项`:''}</span><Button variant="outline" className="rd-btn" isDisabled={busy} onPress={onClose}>取消</Button><Button className="rd-btn" isPending={busy} isDisabled={!count||busy} onPress={save}>保存修改</Button></>}>
  {!base&&!error?<div className="rd"><div className="set-loading">正在读取实例设置…</div></div>:
  <div className="rd">
   <nav className="rd-nav" aria-label="设置分组">{GROUPS.map(([k,t])=><button type="button" key={k} className={'rd-nav-item'+(k===group?' is-active':'')} aria-current={k===group?'step':undefined} onClick={()=>setGroup(k)}><span>{t}</span></button>)}</nav>
   <div className="rd-body">
    <div className="rd-head"><h3>{g[1]}</h3>{g[2]&&<small>{g[2]}</small>}</div>
    {error&&<ErrorBox message={error}/>}
    <div className="set-list">{base&&body()}</div>
    <div className="rd-note"><Info size={15}/><span>只提交改动过的项目；启动、CPU、硬件类设置在实例重启后生效。</span></div>
   </div>
  </div>}
 </Dialog>;
}

/* ── 快照 / 备份 ──────────────────────────────────────────────────────── */
export function SnapshotDialog({id,type,notify,onClose}:{id:number|string;type:'snap'|'backup';notify:Notify;onClose:()=>void}){
 const noun=type==='snap'?'快照':'备份';
 const [list,setList]=useState<Row[]|null>(null),[disks,setDisks]=useState<Row[]>([]),[disk,setDisk]=useState(''),[name,setName]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[rev,setRev]=useState(0),[confirm,setConfirm]=useState<{op:'restore'|'delete';row:Row}|null>(null);
 useEffect(()=>{let live=true;api<Row>(`/clouds/${id}/snapshots?type=${type}`).then(r=>{if(!live)return;setList(r.data||[]);setDisks(r.disks||[]);setDisk(d=>d||String((r.disks||[]).find((x:Row)=>x.dev==='vda')?.id??r.disks?.[0]?.id??''));}).catch(e=>{if(live){setList([]);setError((e as Error).message);}});return()=>{live=false;};},[id,type,rev]);
 useEffect(()=>{if(!list?.some(r=>Number(r.status)===0))return;const t=setTimeout(()=>setRev(x=>x+1),5000);return()=>clearTimeout(t);},[list]);
 async function run(fn:()=>Promise<Row>,msg:string){setBusy(true);setError('');try{const r=await fn();notify(msg+(r?.task?'，任务 #'+r.task:''));setConfirm(null);setRev(x=>x+1);return true;}catch(e){setError((e as Error).message);return false;}finally{setBusy(false);}}
 const label=(r:Row)=>r.remarks||r.name||'#'+r.id;
 if(confirm){const restore=confirm.op==='restore';return <Dialog title={(restore?'还原':'删除')+noun} onClose={()=>{if(!busy)setConfirm(null);}} footer={<><Button className="node-switch-btn" variant="outline" isDisabled={busy} onPress={()=>setConfirm(null)}>返回</Button><Button className="node-switch-btn" variant={restore?'primary':'danger'} isPending={busy} onPress={()=>run(()=>api<Row>(`/clouds/${id}/snapshots/${confirm.row.id}${restore?'/restore':''}`,send(restore?'POST':'DELETE',{})),restore?noun+'还原已提交':noun+'已删除')}>确认</Button></>}>
  <div className="node-switch"><div className="cfg-note">{restore?`把磁盘“${confirm.row.disk_remarks||confirm.row.disk_name||''}”还原到${noun}“${label(confirm.row)}”的状态，之后写入的数据会丢失，实例可能会重启。`:`删除${noun}“${label(confirm.row)}”后无法恢复。`}</div>{error&&<ErrorBox message={error}/>}</div></Dialog>;}
 return <Dialog wide title={noun} onClose={onClose} footer={<Button className="rd-btn" onPress={onClose}>完成</Button>}>
  <div className="snap-create"><Choice aria-label="磁盘" value={disk} onChange={e=>setDisk(e.target.value)}>{disks.map(d=><option key={d.id} value={String(d.id)}>{d.name}{d.type==='system'||d.dev==='vda'?'（系统盘）':''}{d.size?' · '+d.size+'GB':''}</option>)}</Choice>
   <TextField aria-label="备注名" value={name} onChange={x=>setName(x.slice(0,64))}><Input placeholder="备注名（可选）"/></TextField>
   <Button isDisabled={!disk||busy} isPending={busy&&!confirm} onPress={async()=>{if(await run(()=>api<Row>(`/clouds/${id}/snapshots`,send('POST',{type,disk:Number(disk),name:name.trim()})),'已提交创建'+noun))setName('');}}><Plus size={15}/>创建{noun}</Button></div>
  {error&&<ErrorBox message={error}/>}
  {!list?<TableSkeleton columns={[{title:'名称',width:8},{title:'磁盘',width:6},{title:'状态',width:4},{title:'创建时间',width:7},{title:'操作',width:0}]} rows={3}/>
   :!list.length?<Empty kind="box" size="sm" title={'还没有'+noun} text={`选择磁盘后点“创建${noun}”。`}/>
   :<Table><Table.ScrollContainer><Table.Content aria-label={noun+'列表'} className="snap-table"><Table.Header><Table.Column isRowHeader>名称</Table.Column><Table.Column>磁盘</Table.Column>{type==='backup'&&<Table.Column>大小</Table.Column>}<Table.Column>状态</Table.Column><Table.Column>创建时间</Table.Column><Table.Column>操作</Table.Column></Table.Header>
    <Table.Body>{list.map(r=>{const making=Number(r.status)===0;return <Table.Row key={r.id}><Table.Cell><span title={r.name}>{label(r)}</span></Table.Cell><Table.Cell>{r.disk_remarks||r.disk_name||'—'}</Table.Cell>{type==='backup'&&<Table.Cell className="num">{r.size!=null&&r.size!==''?r.size+' GB':'—'}</Table.Cell>}<Table.Cell>{making?<span className="snap-making">创建中</span>:<span className="snap-done">已完成</span>}</Table.Cell><Table.Cell className="num nowrap">{date(r.create_time)}</Table.Cell>
     <Table.Cell><div className="row-actions">{making?<Tip label={'取消创建 '+label(r)} onPress={()=>run(()=>api<Row>(`/clouds/${id}/snapshots/${r.id}/cancel`,send('POST',{})),'已取消创建')}><Ban size={15}/></Tip>:<Tip label={'还原到 '+label(r)} onPress={()=>{setError('');setConfirm({op:'restore',row:r});}}><RotateCcw size={15}/></Tip>}<Tip danger label={'删除 '+label(r)} onPress={()=>{setError('');setConfirm({op:'delete',row:r});}}><Trash2 size={15}/></Tip></div></Table.Cell></Table.Row>;})}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
 </Dialog>;
}
function Tip({label,onPress,children,danger}:{label:string;onPress:()=>void;children:ReactNode;danger?:boolean}){return <Tooltip delay={0}><Button size="sm" variant="ghost" isIconOnly aria-label={label} className={danger?'is-danger':''} onPress={onPress}>{children}</Button><Tooltip.Content>{label}</Tooltip.Content></Tooltip>;}

/* ── 计划任务（定时快照 / 备份） ─────────────────────────────────────── */
const CYCLE:Record<string,string>={hour:'小时',day:'天',week:'周',month:'月'};
export function CronDialog({id,notify,onClose}:{id:number|string;notify:Notify;onClose:()=>void}){
 const [list,setList]=useState<Row[]|null>(null),[disks,setDisks]=useState<Row[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[rev,setRev]=useState(0);
 const [type,setType]=useState<'snap'|'backup'>('snap'),[frequency,setFrequency]=useState('1'),[cycle,setCycle]=useState('day'),[point,setPoint]=useState('03:00'),[picked,setPicked]=useState<number[]>([]);
 useEffect(()=>{let live=true;api<Row>(`/clouds/${id}/cron`).then(r=>{if(!live)return;setList(r.data||[]);setDisks(r.disks||[]);setPicked(p=>p.length?p:(r.disks||[]).filter((d:Row)=>d.dev==='vda').map((d:Row)=>Number(d.id)));}).catch(e=>{if(live){setList([]);setError((e as Error).message);}});return()=>{live=false;};},[id,rev]);
 const diskName=(did:unknown)=>disks.find(d=>Number(d.id)===Number(did))?.name||'#'+did;
 async function add(){setBusy(true);setError('');try{await api(`/clouds/${id}/cron`,send('POST',{type,frequency:Number(frequency),cycle,point:cycle==='hour'?undefined:point,disk:picked}));notify('已添加计划任务');setRev(x=>x+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function remove(r:Row){setBusy(true);setError('');try{await api(`/clouds/${id}/cron/${r.id}`,send('DELETE',{}));notify('已删除计划任务');setRev(x=>x+1);}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <Dialog wide title="计划任务" onClose={onClose} footer={<Button className="rd-btn" onPress={onClose}>完成</Button>}>
  <div className="cron-form">
   <div className="rd-seg" role="radiogroup" aria-label="类型">{([['snap','定时快照'],['backup','定时备份']] as const).map(([k,t])=><button type="button" key={k} role="radio" aria-checked={type===k} className={type===k?'is-on':''} onClick={()=>setType(k)}>{t}</button>)}</div>
   <span className="set-inline"><span className="set-muted">每</span><TextField aria-label="频率" value={frequency} onChange={x=>setFrequency(x.replace(/\D/g,'').slice(0,4))}><Input className="set-num" inputMode="numeric"/></TextField><Choice aria-label="周期" value={cycle} onChange={e=>setCycle(e.target.value)}>{Object.entries(CYCLE).map(([k,t])=><option key={k} value={k}>{t}</option>)}</Choice>
    {cycle!=='hour'&&<><span className="set-muted">的</span><TextField aria-label="时间点" value={point} onChange={setPoint}><Input className="mono set-num" type="time"/></TextField></>}</span>
   <div className="cron-disks">{disks.map(d=><Checkbox key={d.id} isSelected={picked.includes(Number(d.id))} onChange={x=>setPicked(p=>x?[...p,Number(d.id)]:p.filter(y=>y!==Number(d.id)))}><Checkbox.Content><Checkbox.Control><Checkbox.Indicator/></Checkbox.Control><Label>{d.name}{d.type==='system'||d.dev==='vda'?'（系统盘）':''}</Label></Checkbox.Content></Checkbox>)}</div>
   <Button isDisabled={busy||!picked.length||!(Number(frequency)>=1)} isPending={busy} onPress={add}><Plus size={15}/>添加</Button>
  </div>
  {error&&<ErrorBox message={error}/>}
  {!list?<TableSkeleton columns={[{title:'类型',width:4},{title:'周期',width:6},{title:'磁盘',width:7},{title:'创建时间',width:7},{title:'操作',width:0}]} rows={2}/>
   :!list.length?<Empty kind="task" size="sm" title="还没有计划任务" text="添加后，平台会按周期自动为所选磁盘创建快照或备份。"/>
   :<Table><Table.ScrollContainer><Table.Content aria-label="计划任务列表" className="snap-table"><Table.Header><Table.Column isRowHeader>类型</Table.Column><Table.Column>周期</Table.Column><Table.Column>磁盘</Table.Column><Table.Column>创建时间</Table.Column><Table.Column>操作</Table.Column></Table.Header>
    <Table.Body>{list.map(r=><Table.Row key={r.id}><Table.Cell>{r.type==='backup'?'定时备份':'定时快照'}</Table.Cell><Table.Cell>每 {r.frequency} {CYCLE[r.cycle]||r.cycle}{r.point&&r.cycle!=='hour'?' · '+r.point:''}</Table.Cell><Table.Cell>{(Array.isArray(r.disk)?r.disk:[]).map((d:Row)=>diskName(d?.id??d)).join('、')||'—'}</Table.Cell><Table.Cell className="num nowrap">{date(r.create_time)}</Table.Cell>
     <Table.Cell><Tip danger label="删除计划任务" onPress={()=>remove(r)}><Trash2 size={15}/></Tip></Table.Cell></Table.Row>)}</Table.Body></Table.Content></Table.ScrollContainer></Table>}
 </Dialog>;
}
